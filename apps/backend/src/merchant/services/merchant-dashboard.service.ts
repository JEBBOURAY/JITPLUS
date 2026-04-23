import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import {
  REWARD_REPOSITORY, type IRewardRepository,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../../common/repositories';
import { MS_PER_DAY, DEFAULT_LOYALTY_TYPE } from '../../common/constants';

@Injectable()
export class MerchantDashboardService {
  private static readonly STATS_TTL = 5 * 60_000;
  private static readonly TRENDS_TTL = 10 * 60_000;
  private static readonly DISTRIBUTION_TTL = 5 * 60_000;

  constructor(
    @Inject(REWARD_REPOSITORY) private rewardRepo: IRewardRepository,
    @Inject(RAW_QUERY_RUNNER) private rawQuery: IRawQueryRunner,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  // ── 1. KPIs — lightweight, no period filter ──────────────────
  async getKpis(merchantId: string) {
    const cacheKey = `dashboard:kpis:${merchantId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const [row] = await this.rawQuery.queryRaw<{
      total_clients: number;
      total_points: number;
      total_redeemed_points: number;
      total_transactions: number;
      profile_views: number;
      loyalty_type: string;
      total_rewards_given: number;
      lucky_wheel_plays: number;
      lucky_wheel_wins: number;
      lucky_wheel_fulfilled: number;
    }>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM loyalty_cards WHERE merchant_id = ${merchantId}) AS total_clients,
        (SELECT COALESCE(SUM(points), 0)::int FROM loyalty_cards WHERE merchant_id = ${merchantId}) AS total_points,
        (SELECT COALESCE(SUM(t.points), 0)::int FROM transactions t
         WHERE t.merchant_id = ${merchantId} AND t.status = 'ACTIVE' AND t.type = 'REDEEM_REWARD') AS total_redeemed_points,
        (SELECT COUNT(*)::int FROM transactions t
         WHERE t.merchant_id = ${merchantId} AND t.status = 'ACTIVE') AS total_transactions,
        (SELECT profile_views FROM merchants WHERE id = ${merchantId}) AS profile_views,
        (SELECT loyalty_type FROM merchants WHERE id = ${merchantId}) AS loyalty_type,
        (SELECT COUNT(*)::int FROM transactions t
         WHERE t.merchant_id = ${merchantId} AND t.status = 'ACTIVE' AND t.type = 'REDEEM_REWARD') AS total_rewards_given,
        (SELECT COUNT(*)::int FROM lucky_wheel_draws d
         INNER JOIN lucky_wheel_tickets tk ON tk.id = d.ticket_id
         INNER JOIN lucky_wheel_campaigns c ON c.id = tk.campaign_id
         WHERE c.merchant_id = ${merchantId}) AS lucky_wheel_plays,
        (SELECT COUNT(*)::int FROM lucky_wheel_draws d
         INNER JOIN lucky_wheel_tickets tk ON tk.id = d.ticket_id
         INNER JOIN lucky_wheel_campaigns c ON c.id = tk.campaign_id
         WHERE c.merchant_id = ${merchantId} AND d.result = 'WON') AS lucky_wheel_wins,
        (SELECT COUNT(*)::int FROM lucky_wheel_draws d
         INNER JOIN lucky_wheel_tickets tk ON tk.id = d.ticket_id
         INNER JOIN lucky_wheel_campaigns c ON c.id = tk.campaign_id
         WHERE c.merchant_id = ${merchantId} AND d.fulfilment = 'CLAIMED') AS lucky_wheel_fulfilled
    `);

    const result = {
      totalClients: row?.total_clients ?? 0,
      totalPoints: row?.total_points ?? 0,
      totalRedeemedPoints: row?.total_redeemed_points ?? 0,
      totalTransactions: row?.total_transactions ?? 0,
      totalRewardsGiven: (row?.total_rewards_given ?? 0) + (row?.lucky_wheel_fulfilled ?? 0),
      profileViews: row?.profile_views ?? 0,
      loyaltyType: row?.loyalty_type || DEFAULT_LOYALTY_TYPE,
      luckyWheelPlays: row?.lucky_wheel_plays ?? 0,
      luckyWheelWins: row?.lucky_wheel_wins ?? 0,
    };

    await this.cache.set(cacheKey, result, MerchantDashboardService.STATS_TTL);
    return result;
  }

  // ── 2. Rewards Distribution — separate light query ─────────
  async getRewardsDistribution(merchantId: string) {
    const cacheKey = `dashboard:distribution:${merchantId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

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
        GROUP BY reward_id
      `),
    ]);

    const rewardCounts = new Map<string, number>(
      rewardRedemptions.map((r: any) => [r.reward_id as string, r.cnt ?? 0]),
    );

    const distribution: Array<{ rewardId: string | null; title: string; count: number }> =
      rewards.map((reward: any) => ({
        rewardId: reward.id,
        title: reward.titre,
        count: rewardCounts.get(reward.id) || 0,
      }));

    // Count redemptions with no linked reward
    const [unknownRow] = await this.rawQuery.queryRaw<{ cnt: number }>(Prisma.sql`
      SELECT COUNT(*)::int AS cnt FROM transactions
      WHERE merchant_id = ${merchantId} AND status = 'ACTIVE' AND type = 'REDEEM_REWARD' AND reward_id IS NULL
    `);
    const unknownRedemptions = unknownRow?.cnt ?? 0;
    if (unknownRedemptions > 0) {
      distribution.push({ rewardId: null, title: 'Non attribue', count: unknownRedemptions });
    }

    // Include LuckyWheel fulfilled prizes in distribution
    const luckyWheelPrizeRows = await this.rawQuery.queryRaw<{ prize_id: string; label: string; cnt: number }>(Prisma.sql`
      SELECT p.id AS prize_id, p.label, COUNT(*)::int AS cnt
      FROM lucky_wheel_draws d
      INNER JOIN lucky_wheel_tickets tk ON tk.id = d.ticket_id
      INNER JOIN lucky_wheel_campaigns c ON c.id = tk.campaign_id
      INNER JOIN lucky_wheel_prizes p ON p.id = d.prize_id
      WHERE c.merchant_id = ${merchantId} AND d.fulfilment = 'CLAIMED'
      GROUP BY p.id, p.label
    `);
    for (const tp of luckyWheelPrizeRows) {
      distribution.push({ rewardId: tp.prize_id, title: `�️ ${tp.label}`, count: tp.cnt ?? 0 });
    }

    await this.cache.set(cacheKey, distribution, MerchantDashboardService.DISTRIBUTION_TTL);
    return distribution;
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
        lucky_wheel_fulfilled: number;
      }>(Prisma.sql`SELECT
         b.bucket,
         COALESCE(t.tx_count, 0)::int        AS tx_count,
         COALESCE(c.new_clients, 0)::int      AS new_clients,
         COALESCE(t.rewards_given, 0)::int    AS rewards_given,
         COALESCE(tf.lucky_wheel_fulfilled, 0)::int AS lucky_wheel_fulfilled
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
       LEFT JOIN (
         SELECT date_trunc(${trunc}, d.fulfilled_at) AS bucket, COUNT(*)::int AS lucky_wheel_fulfilled
         FROM lucky_wheel_draws d
         INNER JOIN lucky_wheel_tickets tk ON tk.id = d.ticket_id
         INNER JOIN lucky_wheel_campaigns camp ON camp.id = tk.campaign_id
         WHERE camp.merchant_id = ${merchantId} AND d.fulfilment = 'CLAIMED' AND d.fulfilled_at >= ${startDate}
         GROUP BY 1
       ) tf USING (bucket)
       ORDER BY b.bucket`);

    const transactionsRows = rows.map((r) => ({ bucket: r.bucket, count: r.tx_count }));
    const newClientsRows = rows.map((r) => ({ bucket: r.bucket, count: r.new_clients }));
    const rewardsGivenRows = rows.map((r) => ({ bucket: r.bucket, count: r.rewards_given + r.lucky_wheel_fulfilled }));

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
