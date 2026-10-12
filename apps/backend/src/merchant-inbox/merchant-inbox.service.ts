import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_INBOX_REPOSITORY, type IMerchantInboxRepository,
  MERCHANT_NOTIFICATION_READ_REPOSITORY, type IMerchantNotificationReadRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  NOTIFICATION_REPOSITORY, type INotificationRepository,
} from '../common/repositories';
import { buildPagination, PaginationResult } from '../common/utils';
import { isCronEnabled } from '../common/tasks/cron-utils';

/** Kind of automatic notification, drives the icon/colour in the Pro app. */
export type MerchantInboxCategory =
  | 'SECURITY'
  | 'PLAN'
  | 'ACTIVITY'
  | 'TIP'
  | 'SETUP'
  | 'QUOTA'
  | 'OFFER';

export interface MerchantInboxEntry {
  category: MerchantInboxCategory;
  title: string;
  body: string;
  /** Deep-link key understood by the Pro app (same values as the push `action`). */
  action?: string;
}

export interface MerchantInboxItem {
  id: string;
  title: string;
  body: string;
  /** Kept for older app versions that pick the icon from the blast channel. */
  channel: string | null;
  createdAt: Date;
  isRead: boolean;
  /** 'ADMIN' = broadcast written in the admin dashboard. */
  category: MerchantInboxCategory | 'ADMIN';
  action: string | null;
}

const RETENTION_DAYS = 180;
// Both sources are merged in memory, so each one is read up to page × limit
// rows. This cap bounds that cost; older items stay reachable for 25 pages.
const MAX_MERGE_WINDOW = 500;

/**
 * Merchant inbox = admin broadcasts (`notifications` table, shared by every
 * merchant) + automatic pushes recorded per merchant
 * (`merchant_inbox_notifications`), exposed as one feed to the Pro app.
 */
@Injectable()
export class MerchantInboxService {
  private readonly logger = new Logger(MerchantInboxService.name);

  constructor(
    @Inject(MERCHANT_INBOX_REPOSITORY) private readonly inboxRepo: IMerchantInboxRepository,
    @Inject(NOTIFICATION_REPOSITORY) private readonly notificationRepo: INotificationRepository,
    @Inject(MERCHANT_NOTIFICATION_READ_REPOSITORY) private readonly readRepo: IMerchantNotificationReadRepository,
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
  ) {}

  /**
   * Store an automatic notification in the merchant's inbox. Never throws:
   * the inbox is a history, it must not break the push that triggered it.
   */
  async record(merchantId: string, entry: MerchantInboxEntry): Promise<void> {
    try {
      await this.inboxRepo.create({
        data: {
          merchantId,
          category: entry.category,
          title: entry.title.slice(0, 255),
          body: entry.body.slice(0, 2000),
          action: entry.action ? entry.action.slice(0, 40) : null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Inbox record failed for merchant ${merchantId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Broadcasts sent before the account existed are hidden (recreated accounts start fresh). */
  private async broadcastWhere(merchantId: string) {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { createdAt: true },
    });
    return {
      audience: 'ALL_MERCHANTS',
      isBroadcast: true,
      ...(merchant?.createdAt ? { createdAt: { gte: merchant.createdAt } } : {}),
    };
  }

  async list(merchantId: string, page = 1, limit = 20): Promise<{
    notifications: MerchantInboxItem[];
    pagination: PaginationResult;
  }> {
    const where = await this.broadcastWhere(merchantId);
    const skip = (page - 1) * limit;
    const window = Math.min(page * limit, MAX_MERGE_WINDOW);

    const [broadcasts, personal, broadcastTotal, personalTotal] = await Promise.all([
      this.notificationRepo.findMany({
        where,
        select: { id: true, title: true, body: true, channel: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: window,
      }),
      this.inboxRepo.findMany({
        where: { merchantId },
        select: { id: true, title: true, body: true, category: true, action: true, readAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: window,
      }),
      this.notificationRepo.count({ where }),
      this.inboxRepo.count({ where: { merchantId } }),
    ]);

    const merged = [
      ...broadcasts.map((n) => ({ kind: 'admin' as const, createdAt: n.createdAt, n })),
      ...personal.map((p) => ({ kind: 'personal' as const, createdAt: p.createdAt, p })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(skip, skip + limit);

    const adminIds = merged.flatMap((m) => (m.kind === 'admin' ? [m.n.id] : []));
    const reads = adminIds.length > 0
      ? await this.readRepo.findMany({
          where: { merchantId, notificationId: { in: adminIds } },
          select: { notificationId: true },
        })
      : [];
    const readSet = new Set(reads.map((r) => r.notificationId));

    const notifications: MerchantInboxItem[] = merged.map((m) =>
      m.kind === 'admin'
        ? {
            id: m.n.id,
            title: m.n.title,
            body: m.n.body,
            channel: m.n.channel,
            createdAt: m.n.createdAt,
            isRead: readSet.has(m.n.id),
            category: 'ADMIN',
            action: null,
          }
        : {
            id: m.p.id,
            title: m.p.title,
            body: m.p.body,
            channel: null,
            createdAt: m.p.createdAt,
            isRead: m.p.readAt !== null,
            category: m.p.category as MerchantInboxCategory,
            action: m.p.action,
          },
    );

    const total = Math.min(broadcastTotal + personalTotal, MAX_MERGE_WINDOW);
    return { notifications, pagination: buildPagination(total, page, limit) };
  }

  async countUnread(merchantId: string): Promise<number> {
    const where = await this.broadcastWhere(merchantId);
    const [broadcastTotal, broadcastRead, personalUnread] = await Promise.all([
      this.notificationRepo.count({ where }),
      this.readRepo.count({ where: { merchantId, notification: where } }),
      this.inboxRepo.count({ where: { merchantId, readAt: null } }),
    ]);
    return Math.max(0, broadcastTotal - broadcastRead) + personalUnread;
  }

  async markAllRead(merchantId: string): Promise<void> {
    const where = await this.broadcastWhere(merchantId);
    const [allBroadcasts, existingReads] = await Promise.all([
      this.notificationRepo.findMany({ where, select: { id: true } }),
      this.readRepo.findMany({ where: { merchantId, notification: where }, select: { notificationId: true } }),
    ]);
    const readSet = new Set(existingReads.map((r) => r.notificationId));
    const unreadIds = allBroadcasts.map((n) => n.id).filter((id) => !readSet.has(id));

    await Promise.all([
      unreadIds.length > 0
        ? this.readRepo.createMany({
            data: unreadIds.map((notificationId) => ({ merchantId, notificationId })),
            skipDuplicates: true,
          })
        : Promise.resolve(),
      this.inboxRepo.updateMany({
        where: { merchantId, readAt: null },
        data: { readAt: new Date() },
      }),
    ]);
  }

  /** `id` may come from either source; unknown ids are ignored. */
  async markRead(merchantId: string, id: string): Promise<void> {
    const own = await this.inboxRepo.findFirst({
      where: { id, merchantId },
      select: { readAt: true },
    });
    if (own) {
      if (!own.readAt) {
        await this.inboxRepo.updateMany({
          where: { id, merchantId, readAt: null },
          data: { readAt: new Date() },
        });
      }
      return;
    }

    const broadcast = await this.notificationRepo.findFirst({
      where: { id, audience: 'ALL_MERCHANTS', isBroadcast: true },
      select: { id: true },
    });
    if (!broadcast) return;

    await this.readRepo.upsert({
      where: { merchantId_notificationId: { merchantId, notificationId: id } },
      create: { merchantId, notificationId: id },
      update: {},
    });
  }

  // 03:20 UTC daily — off-peak, away from the morning push crons.
  @Cron('20 3 * * *')
  async purgeOld(): Promise<void> {
    if (!isCronEnabled(this.logger, 'MerchantInbox.purgeOld')) return;
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    try {
      const { count } = await this.inboxRepo.deleteMany({ where: { createdAt: { lt: cutoff } } });
      if (count > 0) this.logger.log(`Purged ${count} inbox notification(s) older than ${RETENTION_DAYS} days`);
    } catch (err) {
      this.logger.error('Inbox purge failed', err);
    }
  }
}
