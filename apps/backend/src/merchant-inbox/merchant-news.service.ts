import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { MerchantCategory, MerchantPlan } from '@prisma/client';
import { MERCHANT_REPOSITORY, type IMerchantRepository } from '../common/repositories';
import { MerchantNotifierService, NOTIFY_TARGET_SELECT, type NotifyResult } from './merchant-notifier.service';
import { mapLimit, MERCHANT_PUSH_CONCURRENCY } from '../common/tasks/cron-utils';
import { MS_PER_DAY } from '../common/constants';

export interface MerchantNewsAudience {
  plan?: MerchantPlan;
  ville?: string;
  categorie?: MerchantCategory;
  /** Only merchants who signed up at least this many days ago. */
  minAccountAgeDays?: number;
}

export interface MerchantNewsInput extends MerchantNewsAudience {
  title: string;
  body: string;
  action?: string;
}

const BATCH = 500;

/**
 * "Nouveautés" announcements written in the admin dashboard and targeted by
 * plan / city / category. Unlike the legacy ALL_MERCHANTS broadcast, each
 * recipient gets a NEWS inbox item, so the merchant's "news" switch, quiet
 * hours and open tracking apply.
 */
@Injectable()
export class MerchantNewsService {
  private readonly logger = new Logger(MerchantNewsService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    private readonly notifier: MerchantNotifierService,
  ) {}

  private where(input: MerchantNewsAudience) {
    return {
      isActive: true,
      deletedAt: null,
      ...(input.plan ? { plan: input.plan } : {}),
      ...(input.ville ? { ville: { equals: input.ville, mode: 'insensitive' as const } } : {}),
      ...(input.categorie ? { categorie: input.categorie } : {}),
      ...(input.minAccountAgeDays
        ? { createdAt: { lte: new Date(Date.now() - input.minAccountAgeDays * MS_PER_DAY) } }
        : {}),
    };
  }

  /** Audience size before sending (admin preview). */
  async countAudience(input: MerchantNewsAudience): Promise<number> {
    return this.merchantRepo.count({ where: this.where(input) });
  }

  async send(input: MerchantNewsInput): Promise<{ newsId: string; recipientCount: number; results: Partial<Record<NotifyResult, number>> }> {
    const newsId = randomUUID();
    const results: Partial<Record<NotifyResult, number>> = {};
    let recipientCount = 0;
    let cursor: string | undefined;

    for (;;) {
      const batch = await this.merchantRepo.findMany({
        where: this.where(input),
        select: NOTIFY_TARGET_SELECT,
        take: BATCH,
        orderBy: { id: 'asc' },
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;
      recipientCount += batch.length;
      const sent = await mapLimit(batch, MERCHANT_PUSH_CONCURRENCY, (m) => this.notifier.notify(m, {
        category: 'NEWS',
        title: input.title,
        body: input.body,
        action: input.action,
        event: 'merchant_news',
        data: { newsId },
        campaignId: `merchant_news_${newsId}`,
        bypassCap: true,
      }));
      for (const r of sent) results[r] = (results[r] ?? 0) + 1;
      cursor = batch[batch.length - 1].id;
      if (batch.length < BATCH) break;
    }

    this.logger.log(`Merchant news ${newsId} → ${recipientCount} merchants ${JSON.stringify(results)}`);
    return { newsId, recipientCount, results };
  }
}
