import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import {
  REWARD_REPOSITORY, type IRewardRepository,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../../common/repositories';
import { MS_PER_DAY, DEFAULT_LOYALTY_TYPE } from '../../common/constants';
import { buildDateFilter } from '../../common/utils';

@Injectable()
export class MerchantDashboardService {
  private static readonly STATS_TTL = 5 * 60_000;  // 5 minutes (stats queries are expensive raw SQL)
  private static readonly TRENDS_TTL = 10 * 60_000;  // 10 minutes (historical data, can be slightly stale)

  constructor(
    @Inject(REWARD_REPOSITORY) private rewardRepo: IRewardRepository,
    @Inject(RAW_QUERY_RUNNER) private rawQuery: IRawQueryRunner,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async getDashboardStats(merchantId: string, period?: 'day' | 'week' | 'month' | 'year') {
    const cacheKey = `dashboard:stats:${merchantId}:${period || 'all'}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    let dateFilter: { gte: Date } | undefined;
    if (period) {
      dateFilter = buildDateFilter(period);
    }

    const startDate = dateFilter ? dateFilter.gte : null;

    // ── Single raw SQL instead of 9 ORM queries ──────────────────────────────
    // Scans loyalty_cards, transactions, merchants, profile_views_log in one round-trip.
    const [statsRow] = await this.rawQuery.queryRaw<{
      total_clients: number;
      total_points: number;
      total_redeemed_points: number;
      total_transactions: number;
      unknown_redemptions: number;
      profile_views: number;
      loyalty_type: string;
      all_profile_views: number;
    }>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM loyalty_cards
         WHERE merchant_id = ${merchantId}
           AND (${startDate}::timestamp IS NULL OR created_at >= ${startDate})) AS total_clients,
        (SELECT COALESCE(SUM(points), 0)::int FROM loyalty_cards
         WHERE merchant_id = ${merchantId}
           AND (${startDate}::timestamp IS NULL OR created_at >= ${startDate})) AS total_points,
        (SELECT COALESCE(SUM(t.points), 0)::int FROM transactions t
         WHERE t.merchant_id = ${merchantId} AND t.status = 'ACTIVE' AND t.type = 'REDEEM_REWARD'
           AND (${startDate}::timestamp IS NULL OR t.created_at >= ${startDate})) AS total_redeemed_points,
        (SELECT COUNT(*)::int FROM transactions t
         WHERE t.merchant_id = ${merchantId} AND t.status = 'ACTIVE'
           AND (${startDate}::timestamp IS NULL OR t.created_at >= ${startDate})) AS total_transactions,
        (SELECT COUNT(*)::int FROM transactions t
         WHERE t.merchant_id = ${merchantId} AND t.status = 'ACTIVE' AND t.type = 'REDEEM_REWARD' AND t.reward_id IS NULL
           AND (${startDate}::timestamp IS NULL OR t.created_at >= ${startDate})) AS unknown_redemptions,
        (SELECT COUNT(*)::int FROM profile_views_log
         WHERE merchant_id = ${merchantId}
           AND (${startDate}::timestamp IS NULL OR view_date >= ${startDate}::date)) AS profile_views,
        (SELECT loyalty_type FROM merchants WHERE id = ${merchantId}) AS loyalty_type,
        (SELECT profile_views FROM merchants WHERE id = ${merchantId}) AS all_profile_views
    `);

    // Reward distribution still needs the reward list + grouped counts (2 queries, not 9)
    const [rewards, rewardRedemptions] = await Promise.all([
      this.rewardRepo.findMany({
        where: { merchantId },
        select: { id: true, titre: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.rawQuery.queryRaw<{ reward_id: string; cnt: number }>(Prisma.sql`
        SELECT reward_id, COUNT(*)::int AS cnt
        FROM transactions
        WHERE merchant_id = ${merchantId} AND status = 'ACTIVE' AND type = 'REDEEM_REWARD' AND reward_id IS NOT NULL
          AND (${startDate}::timestamp IS NULL OR created_at >= ${startDate})
        GROUP BY reward_id
      `),
    ]);

    const rewardCounts = new Map<string, number>(
      rewardRedemptions.map((r: any) => [r.reward_id as string, r.cnt ?? 0]),
    );

    const rewardsDistribution: Array<{
      rewardId: string | null;
      title: string;
      count: number;
    }> = rewards.map((reward: any) => ({
      rewardId: reward.id,
      title: reward.titre,
      count: rewardCounts.get(reward.id) || 0,
    }));

    const unknownRedemptions = statsRow?.unknown_redemptions ?? 0;
    if (unknownRedemptions > 0) {
      rewardsDistribution.push({
        rewardId: null,
        title: 'Non attribue',
        count: unknownRedemptions,
      });
    }

    const result = {
      totalClients: statsRow?.total_clients ?? 0,
      totalPoints: statsRow?.total_points ?? 0,
      totalRedeemedPoints: statsRow?.total_redeemed_points ?? 0,
      totalTransactions: statsRow?.total_transactions ?? 0,
      totalRewardsGiven: Array.from(rewardCounts.values()).reduce((a: number, b: number) => a + b, 0) + unknownRedemptions,
      profileViews: dateFilter ? (statsRow?.profile_views ?? 0) : (statsRow?.all_profile_views ?? 0),
      rewardsDistribution,
      loyaltyType: statsRow?.loyalty_type || DEFAULT_LOYALTY_TYPE,
    };

    await this.cache.set(cacheKey, result, MerchantDashboardService.STATS_TTL);
    return result;
  }

  async getDashboardTrends(
    merchantId: string,
    period: 'day' | 'week' | 'month' | 'year' = 'day',
  ) {
    const cacheKey = `dashboard:trends:${merchantId}:${period}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const now = new Date();

    const startOfDay = (date: Date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const startOfWeek = (date: Date) => {
      const d = startOfDay(date);
      const day = d.getDay();
      const diff = (day + 6) % 7;
      d.setDate(d.getDate() - diff);
      return d;
    };

    const startOfMonth = (date: Date) => {
      const d = startOfDay(date);
      d.setDate(1);
      return d;
    };

    const toBucketKey = (date: Date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d.toISOString().slice(0, 10);
    };

    const config = {
      day: {
        trunc: 'day',
        steps: 7,
        start: (date: Date) => startOfDay(date),
        add: (date: Date, i: number) => new Date(date.getTime() + i * MS_PER_DAY),
      },
      week: {
        trunc: 'week',
        steps: 8,
        start: (date: Date) => startOfWeek(date),
        add: (date: Date, i: number) => new Date(date.getTime() + i * MS_PER_DAY * 7),
      },
      month: {
        trunc: 'month',
        steps: 6,
        start: (date: Date) => startOfMonth(date),
        add: (date: Date, i: number) => {
          const d = new Date(date);
          d.setMonth(d.getMonth() + i);
          return d;
        },
      },
      year: {
        trunc: 'month',
        steps: 12,
        start: (date: Date) => startOfMonth(date),
        add: (date: Date, i: number) => {
          const d = new Date(date);
          d.setMonth(d.getMonth() + i);
          return d;
        },
      },
    } as const;

    const safePeriod = period in config ? period : 'day';
    const { trunc, steps, start, add } = config[safePeriod];

    // Whitelist validation — trunc can only be 'day', 'week', or 'month'
    const ALLOWED_TRUNC: readonly string[] = ['day', 'week', 'month'];
    if (!ALLOWED_TRUNC.includes(trunc)) {
      throw new BadRequestException(`Valeur de période invalide : ${trunc}`);
    }

    const startDate = start(add(start(now), -(steps - 1)));


    // Parameterised query — merchantId and startDate are bound via $1/$2,
    // only the whitelist-validated trunc identifier is interpolated via Prisma.raw.
    // Single-pass over transactions using FILTER — avoids 4 separate scans.
    const interval = '1 ' + trunc;
    const rows = await this.rawQuery.queryRaw<{
        bucket: Date;
        tx_count: number;
        new_clients: number;
        rewards_given: number;
      }>(Prisma.sql`SELECT
         b.bucket,
         COALESCE(t.tx_count, 0)::int        AS tx_count,
         COALESCE(c.new_clients, 0)::int      AS new_clients,
         COALESCE(t.rewards_given, 0)::int    AS rewards_given
       FROM generate_series(
         date_trunc(${trunc}, ${startDate}::timestamp),
         date_trunc(${trunc}, now()),
         ${interval}::interval
       ) AS b(bucket)
       LEFT JOIN (
         SELECT date_trunc(${trunc}, created_at) AS bucket,
                COUNT(*)::int AS tx_count,
                COUNT(*) FILTER (WHERE type = 'REDEEM_REWARD')::int AS rewards_given
         FROM transactions
         WHERE merchant_id = ${merchantId} AND status = 'ACTIVE' AND created_at >= ${startDate}
         GROUP BY 1
       ) t USING (bucket)
       LEFT JOIN (
         SELECT date_trunc(${trunc}, created_at) AS bucket, COUNT(*)::int AS new_clients
         FROM loyalty_cards
         WHERE merchant_id = ${merchantId} AND created_at >= ${startDate}
         GROUP BY 1
       ) c USING (bucket)
       ORDER BY b.bucket`);

    const transactionsRows = rows.map((r) => ({ bucket: r.bucket, count: r.tx_count }));
    const newClientsRows = rows.map((r) => ({ bucket: r.bucket, count: r.new_clients }));
    const rewardsGivenRows = rows.map((r) => ({ bucket: r.bucket, count: r.rewards_given }));

    const buildCountSeries = (rows: Array<{ bucket: Date; count: number }>) => {
      const map = new Map(rows.map((r) => [toBucketKey(r.bucket), r.count || 0]));
      return Array.from({ length: steps }).map((_, i) => {
        const bucketDate = start(add(startDate, i));
        const bucket = toBucketKey(bucketDate);
        return { bucket, count: map.get(bucket) || 0 };
      });
    };

    const result = {
      period: safePeriod,
      transactions: buildCountSeries(transactionsRows),
      newClients: buildCountSeries(newClientsRows),
      rewardsGiven: buildCountSeries(rewardsGivenRows),
    };

    await this.cache.set(cacheKey, result, MerchantDashboardService.TRENDS_TTL);
    return result;
  }
}
