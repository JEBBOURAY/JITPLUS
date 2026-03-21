import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import {
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  REWARD_REPOSITORY, type IRewardRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  PROFILE_VIEW_REPOSITORY, type IProfileViewRepository,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../../common/repositories';
import { MS_PER_DAY, DEFAULT_LOYALTY_TYPE } from '../../common/constants';
import { buildDateFilter } from '../../common/utils';

@Injectable()
export class MerchantDashboardService {
  private static readonly STATS_TTL = 60_000;  // 1 minute
  private static readonly TRENDS_TTL = 120_000; // 2 minutes

  constructor(
    @Inject(LOYALTY_CARD_REPOSITORY) private loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private transactionRepo: ITransactionRepository,
    @Inject(REWARD_REPOSITORY) private rewardRepo: IRewardRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(PROFILE_VIEW_REPOSITORY) private profileViewRepo: IProfileViewRepository,
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

    const txWhere = {
      merchantId,
      status: 'ACTIVE' as const,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    };

    const [
      totalClients,
      pointsSum,
      redeemedSum,
      totalTransactions,
      rewards,
      rewardRedemptions,
      merchant,
      unknownRedemptions,
      profileViewCount,
    ] = await Promise.all([
      this.loyaltyCardRepo.count({
        where: { merchantId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
      }),
      this.loyaltyCardRepo.aggregate({
        where: { merchantId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
        _sum: { points: true },
      }),
      this.transactionRepo.aggregate({
        where: { ...txWhere, type: 'REDEEM_REWARD' },
        _sum: { points: true },
      }),
      this.transactionRepo.count({ where: txWhere }),
      this.rewardRepo.findMany({
        where: { merchantId },
        select: { id: true, titre: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.transactionRepo.groupBy({
        by: ['rewardId'],
        where: { ...txWhere, type: 'REDEEM_REWARD', rewardId: { not: null } },
        _count: { _all: true },
      }),
      this.merchantRepo.findUnique({
        where: { id: merchantId },
        select: { loyaltyType: true, profileViews: true },
      }),
      this.transactionRepo.count({
        where: { ...txWhere, type: 'REDEEM_REWARD', rewardId: null },
      }),
      this.profileViewRepo.count({
        where: { merchantId, ...(dateFilter ? { viewDate: dateFilter } : {}) },
      }),
    ]);

    const rewardCounts = new Map(
      rewardRedemptions.map((entry) => [entry.rewardId as string, entry._count?._all ?? 0]),
    );

    const rewardsDistribution: Array<{
      rewardId: string | null;
      title: string;
      count: number;
    }> = rewards.map((reward) => ({
      rewardId: reward.id,
      title: reward.titre,
      count: rewardCounts.get(reward.id) || 0,
    }));

    if (unknownRedemptions > 0) {
      rewardsDistribution.push({
        rewardId: null,
        title: 'Non attribue',
        count: unknownRedemptions,
      });
    }

    const result = {
      totalClients,
      totalPoints: pointsSum._sum.points ?? 0,
      totalRedeemedPoints: redeemedSum._sum.points ?? 0,
      totalTransactions,
      totalRewardsGiven: Array.from(rewardCounts.values()).reduce((a, b) => a + b, 0) + unknownRedemptions,
      profileViews: dateFilter ? profileViewCount : (merchant?.profileViews ?? 0),
      rewardsDistribution,
      loyaltyType: merchant?.loyaltyType || DEFAULT_LOYALTY_TYPE,
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
