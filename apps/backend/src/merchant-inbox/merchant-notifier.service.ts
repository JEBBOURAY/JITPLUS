import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CAMPAIGN_SENT_TRACKER_REPOSITORY, type ICampaignSentTrackerRepository,
  MERCHANT_INBOX_REPOSITORY, type IMerchantInboxRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
} from '../common/repositories';
import { IPushProvider, PUSH_PROVIDER } from '../common/interfaces';
import { isQuietHours, merchantAlreadySent, merchantClaimSend } from '../common/tasks/cron-utils';
import { MerchantInboxService, type MerchantInboxCategory } from './merchant-inbox.service';
import {
  CATEGORY_CHANNEL,
  MARKETING_CATEGORIES,
  MARKETING_DAILY_CAP,
  MARKETING_WEEKLY_CAP,
  isCategoryEnabled,
  isMarketing,
} from './merchant-notif-policy';
import { MS_PER_DAY } from '../common/constants';

/** Merchant fields the notifier needs; crons select exactly these. */
export interface NotifyTarget {
  id: string;
  pushToken: string | null;
  notifPush?: boolean | null;
  notifPrefs?: unknown;
}


export const NOTIFY_TARGET_SELECT = { id: true, pushToken: true, notifPush: true, notifPrefs: true } as const;

export interface MerchantNotification {
  category: MerchantInboxCategory;
  title: string;
  body: string;
  /** Deep-link key understood by the Pro app (see utils/notificationRoutes.ts). */
  action?: string;
  /** Analytics / routing key sent as `data.event`. */
  event?: string;
  data?: Record<string, string>;
  /** Dedup key: a campaignId is delivered at most once per merchant. */
  campaignId?: string;
  /** Admin news are sent on purpose: they skip the marketing frequency cap. */
  bypassCap?: boolean;
}

export type NotifyResult =
  | 'sent'          // inbox + push delivered
  | 'inbox_only'    // recorded, but no reachable device (transactional only)
  | 'duplicate'     // campaignId already delivered
  | 'opted_out'     // merchant turned this group off
  | 'capped'        // marketing frequency cap reached
  | 'quiet_hours'   // marketing push during night / Jumu'ah
  | 'no_device'     // marketing push without a reachable device
  | 'stale_token'   // device token rejected, cleared
  | 'error';        // unexpected failure (logged)

/**
 * Single entry point for every push sent to a merchant (JitPlus Pro):
 * dedup → preferences → quiet hours & frequency cap (marketing only) →
 * campaign claim → inbox record → push on the category's Android channel → stale token cleanup.
 */
@Injectable()
export class MerchantNotifierService {
  private readonly logger = new Logger(MerchantNotifierService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(MERCHANT_INBOX_REPOSITORY) private readonly inboxRepo: IMerchantInboxRepository,
    @Inject(CAMPAIGN_SENT_TRACKER_REPOSITORY) private readonly trackerRepo: ICampaignSentTrackerRepository,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
    private readonly inbox: MerchantInboxService,
  ) {}

  async notify(target: NotifyTarget, n: MerchantNotification, now: Date = new Date()): Promise<NotifyResult> {
    try {
      return await this.deliver(target, n, now);
    } catch (err) {
      // A notification must never break the cron or the request that triggered it.
      this.logger.warn(`Notify ${n.category} failed for merchant ${target.id}: ${err instanceof Error ? err.message : String(err)}`);
      return 'error';
    }
  }

  private async deliver(target: NotifyTarget, n: MerchantNotification, now: Date): Promise<NotifyResult> {
    // Cheap read first; the claim below is what actually prevents duplicates.
    if (n.campaignId && await merchantAlreadySent(this.trackerRepo, target.id, n.campaignId, 'PUSH')) {
      return 'duplicate';
    }
    if (!isCategoryEnabled(target.notifPrefs, n.category)) return 'opted_out';

    // The master switch only silences the device; security alerts always ring.
    const reachable = !!target.pushToken && (target.notifPush !== false || n.category === 'SECURITY');
    const marketing = isMarketing(n.category);
    if (marketing) {
      if (!reachable) return 'no_device';
      if (isQuietHours(now)) return 'quiet_hours';
      if (!n.bypassCap && await this.isCapped(target.id, now)) return 'capped';
    }

    // Claim only once every filter passed (a quiet-hours / capped skip must
    // stay retryable), and before recording / pushing so that two instances
    // cannot both deliver the same campaign.
    if (n.campaignId && !(await merchantClaimSend(this.trackerRepo, target.id, n.campaignId, 'PUSH'))) {
      return 'duplicate';
    }

    const inboxId = await this.inbox.record(target.id, {
      category: n.category,
      title: n.title,
      body: n.body,
      action: n.action,
    });
    if (!reachable) return 'inbox_only';

    const data: Record<string, string> = {
      ...(n.data ?? {}),
      category: n.category,
      ...(n.event ? { event: n.event } : {}),
      ...(n.action ? { action: n.action } : {}),
      ...(inboxId ? { inboxId } : {}),
    };
    const { invalidToken } = await this.pushProvider.sendToMerchant(
      target.pushToken as string,
      n.title,
      n.body,
      data,
      CATEGORY_CHANNEL[n.category],
    );
    if (invalidToken) {
      await this.merchantRepo
        .updateMany({ where: { id: target.id, pushToken: target.pushToken }, data: { pushToken: null } })
        .catch((e: unknown) => this.logger.warn(`Failed to clear stale token of ${target.id}: ${e}`));
      return 'stale_token';
    }
    return 'sent';
  }

  /**
   * Marketing items already received in the last 24 h / 7 days (inbox = source
   * of truth). One query, served by the (merchant_id, created_at) index: only
   * the most recent WEEKLY_CAP rows are read.
   */
  async isCapped(merchantId: string, now: Date = new Date()): Promise<boolean> {
    const recent = await this.inboxRepo.findMany({
      where: {
        merchantId,
        category: { in: [...MARKETING_CATEGORIES] },
        createdAt: { gte: new Date(now.getTime() - 7 * MS_PER_DAY) },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: MARKETING_WEEKLY_CAP,
    });
    if (recent.length >= MARKETING_WEEKLY_CAP) return true;
    const dayStart = now.getTime() - MS_PER_DAY;
    return recent.filter((r) => r.createdAt.getTime() >= dayStart).length >= MARKETING_DAILY_CAP;
  }
}

/** Tally of notify() outcomes for cron logs. */
export function tally(results: NotifyResult[]): string {
  const counts = new Map<NotifyResult, number>();
  for (const r of results) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.entries()].map(([k, v]) => `${k}:${v}`).join(' ') || 'none';
}
