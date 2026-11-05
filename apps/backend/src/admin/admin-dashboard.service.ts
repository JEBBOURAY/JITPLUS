import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  REWARD_REPOSITORY, type IRewardRepository,
  NOTIFICATION_REPOSITORY, type INotificationRepository,
  AUDIT_LOG_REPOSITORY, type IAuditLogRepository,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../common/repositories';
import { ADMIN_STATS_CACHE_TTL } from '../common/constants';
import { AdminDetailsService } from './admin-details.service';

/**
 * Platform-wide admin views: global dashboard statistics and the
 * cross-merchant notification log.
 */
@Injectable()
export class AdminDashboardService {
  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(REWARD_REPOSITORY) private readonly rewardRepo: IRewardRepository,
    @Inject(NOTIFICATION_REPOSITORY) private readonly notificationRepo: INotificationRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogRepo: IAuditLogRepository,
    @Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly details: AdminDetailsService,
  ) {}

  /**
   * Global platform statistics — comprehensive data for the admin dashboard.
   */
  async getGlobalStats() {
    const cacheKey = 'admin:global-stats';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Last 6 calendar months (oldest → newest)
    const monthBuckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        start: new Date(d.getFullYear(), d.getMonth(), 1),
        end: new Date(d.getFullYear(), d.getMonth() + 1, 1),
        label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      };
    });

    const [
      merchantStats,
      clientStats,
      transactionStats,
      totalRewards,
      totalNotifications,
      recentMerchants,
      recentAuditLogs,
      notifAgg,
    ] = await Promise.all([
      // Single raw query replaces 5 separate merchant count() calls
      this.rawQuery.queryRaw<{ total: bigint; active: bigint; banned: bigint; free: bigint; premium: bigint }>`
        SELECT
          COUNT(*)                              AS total,
          COUNT(*) FILTER (WHERE is_active)     AS active,
          COUNT(*) FILTER (WHERE NOT is_active) AS banned,
          COUNT(*) FILTER (WHERE plan = 'FREE') AS free,
          COUNT(*) FILTER (WHERE plan = 'PREMIUM') AS premium
        FROM merchants
        WHERE deleted_at IS NULL
      `,
      // Single raw query replaces 2 separate client count() calls
      this.rawQuery.queryRaw<{ total: bigint; new_this_month: bigint }>`
        SELECT
          COUNT(*)                                         AS total,
          COUNT(*) FILTER (WHERE created_at >= ${startOfMonth}) AS new_this_month
        FROM clients
        WHERE deleted_at IS NULL
      `,
      // Single raw query replaces 5 separate transaction count() calls
      this.rawQuery.queryRaw<{ total: bigint; this_month: bigint; earn: bigint; redeem: bigint; adjust: bigint }>`
        SELECT
          COUNT(*) FILTER (WHERE status = 'ACTIVE')                                    AS total,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${startOfMonth})  AS this_month,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND type = 'EARN_STAMPS')           AS earn,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND type = 'REDEEM_REWARD')         AS redeem,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND type = 'ADJUST_STAMPS')         AS adjust
        FROM transactions
      `,
      this.rewardRepo.count(),
      this.notificationRepo.count(),
      this.merchantRepo.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, nom: true, email: true, plan: true, createdAt: true, isActive: true },
      }),
      this.auditLogRepo.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          adminEmail: true,
          action: true,
          targetType: true,
          targetLabel: true,
          createdAt: true,
          ipAddress: true,
        },
      }),
      this.notificationRepo.aggregate({
        _sum: { recipientCount: true, successCount: true },
      }),
    ]);

    const merchantRow = merchantStats[0];
    const clientRow = clientStats[0];
    const txRow = transactionStats[0];

    const totalMerchants = Number(merchantRow?.total ?? 0);
    const activeMerchants = Number(merchantRow?.active ?? 0);
    const bannedMerchants = Number(merchantRow?.banned ?? 0);
    const freeMerchants = Number(merchantRow?.free ?? 0);
    const premiumMerchants = Number(merchantRow?.premium ?? 0);
    const totalClients = Number(clientRow?.total ?? 0);
    const newClientsThisMonth = Number(clientRow?.new_this_month ?? 0);
    const totalTransactions = Number(txRow?.total ?? 0);
    const transactionsThisMonth = Number(txRow?.this_month ?? 0);
    const earnStampsCount = Number(txRow?.earn ?? 0);
    const redeemRewardCount = Number(txRow?.redeem ?? 0);
    const adjustStampsCount = Number(txRow?.adjust ?? 0);

    // Per-channel notification counts + monthly trends in 2 raw queries instead of 15 individual counts
    const sixMonthsAgo = monthBuckets[0].start;

    const [channelCounts, merchantTrendRaw, transactionTrendRaw] = await Promise.all([
      this.notificationRepo.groupBy({
        by: ['channel'],
        _count: { id: true },
      }),
      this.rawQuery.queryRaw<{ month: string; count: bigint }>`
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS count
        FROM merchants
        WHERE deleted_at IS NULL AND created_at >= ${sixMonthsAgo}
        GROUP BY date_trunc('month', created_at)
        ORDER BY month
      `,
      this.rawQuery.queryRaw<{ month: string; count: bigint }>`
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS count
        FROM transactions
        WHERE status = 'ACTIVE' AND created_at >= ${sixMonthsAgo}
        GROUP BY date_trunc('month', created_at)
        ORDER BY month
      `,
    ]);

    const channelMap: Record<string, number> = Object.fromEntries(
      // Legacy null channels key as "null", exactly like Object.fromEntries does
      channelCounts.map((c) => [String(c.channel), c._count.id]),
    );
    const pushCount = channelMap['PUSH'] ?? 0;
    const whatsappCount = channelMap['WHATSAPP'] ?? 0;
    const emailCount = channelMap['EMAIL'] ?? 0;

    // Map raw trend rows into month buckets
    const merchantTrendMap: Record<string, number> = Object.fromEntries(
      merchantTrendRaw.map((r) => [r.month, Number(r.count)]),
    );
    const transactionTrendMap: Record<string, number> = Object.fromEntries(
      transactionTrendRaw.map((r) => [r.month, Number(r.count)]),
    );
    const trends = monthBuckets.map(({ label, start }) => {
      const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      return {
        label,
        merchants: merchantTrendMap[key] ?? 0,
        transactions: transactionTrendMap[key] ?? 0,
      };
    });

    const totalSent = notifAgg._sum.recipientCount ?? 0;
    const totalSuccess = notifAgg._sum.successCount ?? 0;

    const result = {
      merchants: {
        total: totalMerchants,
        active: activeMerchants,
        banned: bannedMerchants,
        free: freeMerchants,
        premium: premiumMerchants,
      },
      clients: { total: totalClients, newThisMonth: newClientsThisMonth },
      transactions: {
        total: totalTransactions,
        thisMonth: transactionsThisMonth,
        earnStamps: earnStampsCount,
        redeemReward: redeemRewardCount,
        adjustStamps: adjustStampsCount,
      },
      rewards: { total: totalRewards },
      notifications: {
        total: totalNotifications,
        totalSent,
        totalSuccess,
        successRate: totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : 0,
        pushCount,
        whatsappCount,
        emailCount,
      },
      trends,
      recentMerchants,
      recentAuditLogs,
    };

    await this.cache.set(cacheKey, result, ADMIN_STATS_CACHE_TTL);
    return result;
  }

  /**
   * List all notifications across all merchants (for admin dashboard tracking).
   */
  async listNotifications(
    page = 1,
    limit = 20,
    channel?: string,
    search?: string,
    opts: { sender?: 'admin' | 'merchant'; merchantId?: string } = {},
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {};
    const and: Prisma.NotificationWhereInput[] = [];

    if (channel) {
      // Treat null channel as 'PUSH' (legacy records before channel was set)
      if (channel === 'PUSH') {
        and.push({ OR: [{ channel: 'PUSH' }, { channel: null }] });
      } else {
        where.channel = channel;
      }
    }

    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { body: { contains: search, mode: 'insensitive' } },
          { merchant: { nom: { contains: search, mode: 'insensitive' } } },
          { merchant: { email: { contains: search, mode: 'insensitive' } } },
          { audience: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (opts.merchantId) where.merchantId = opts.merchantId;
    else if (opts.sender === 'admin') where.merchantId = null;
    else if (opts.sender === 'merchant') where.merchantId = { not: null };

    if (and.length) where.AND = and;

    const [notifications, total] = await Promise.all([
      this.notificationRepo.findMany({
        where,
        select: {
          id: true,
          title: true,
          body: true,
          channel: true,
          audience: true,
          recipientCount: true,
          successCount: true,
          failureCount: true,
          isBroadcast: true,
          createdAt: true,
          merchant: {
            select: { id: true, nom: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.notificationRepo.count({ where }),
    ]);

    const reads = await this.details.notificationReadsByIds(notifications.map((n) => n.id));

    return {
      notifications: notifications.map((n) => ({
        ...n,
        inboxDelivered: reads.get(n.id)?.delivered ?? 0,
        inboxRead: reads.get(n.id)?.read ?? 0,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
