import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import {
  REWARD_REPOSITORY, type IRewardRepository,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../../common/repositories';
import { MS_PER_DAY } from '../../common/constants';

@Injectable()
export class MerchantDashboardService {
  private static readonly STATS_TTL = 5 * 60_000;
  private static readonly TRENDS_TTL = 10 * 60_000;
  private static readonly DISTRIBUTION_TTL = 5 * 60_000;
  private static readonly GAMES_TTL = 2 * 60_000;
  private static readonly TOP_PRIZES_LIMIT = 5;

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
      total_stamps: number;
      total_redeemed_stamps: number;
      total_transactions: number;
      profile_views: number;
      total_rewards_given: number;
      lucky_wheel_plays: number;
      lucky_wheel_wins: number;
      lucky_wheel_fulfilled: number;
    }>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM loyalty_cards WHERE merchant_id = ${merchantId}) AS total_clients,
        (SELECT COALESCE(SUM(stamps), 0)::int FROM loyalty_cards WHERE merchant_id = ${merchantId}) AS total_stamps,
        (SELECT COALESCE(SUM(t.stamps), 0)::int FROM transactions t
         WHERE t.merchant_id = ${merchantId} AND t.status = 'ACTIVE' AND t.type = 'REDEEM_REWARD') AS total_redeemed_stamps,
        (SELECT COUNT(*)::int FROM transactions t
         WHERE t.merchant_id = ${merchantId} AND t.status = 'ACTIVE') AS total_transactions,
        (SELECT profile_views FROM merchants WHERE id = ${merchantId}) AS profile_views,
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
      totalStamps: row?.total_stamps ?? 0,
      totalRedeemedStamps: row?.total_redeemed_stamps ?? 0,
      totalTransactions: row?.total_transactions ?? 0,
      totalRewardsGiven: (row?.total_rewards_given ?? 0) + (row?.lucky_wheel_fulfilled ?? 0),
      profileViews: row?.profile_views ?? 0,
      luckyWheelPlays: row?.lucky_wheel_plays ?? 0,
      luckyWheelWins: row?.lucky_wheel_wins ?? 0,
    };

    await this.cache.set(cacheKey, result, MerchantDashboardService.STATS_TTL);
    return result;
  }

  // ── Accueil home stats — today/yesterday stamps + current-month daily scans.
  // All plans, team-accessible, uncached (kept live: refetched on WS scan events). ──
  async getHomeStats(merchantId: string) {
    // Day/month boundaries in Morocco time (UTC+1, no DST) so "today" matches the
    // merchant's local day regardless of the server timezone (cf. cron-utils).
    const OFFSET_MS = 3_600_000;
    const local = new Date(Date.now() + OFFSET_MS); // UTC fields now read as Morocco-local
    const y = local.getUTCFullYear();
    const mo = local.getUTCMonth();
    const day = local.getUTCDate();
    const startToday = new Date(Date.UTC(y, mo, day) - OFFSET_MS);
    const startYesterday = new Date(startToday.getTime() - MS_PER_DAY);
    const startMonth = new Date(Date.UTC(y, mo, 1) - OFFSET_MS);
    const startNextMonth = new Date(Date.UTC(y, mo + 1, 1) - OFFSET_MS);
    const daysInMonth = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();

    const [agg] = await this.rawQuery.queryRaw<{
      today_stamps: number;
      today_clients: number;
      yesterday_stamps: number;
    }>(Prisma.sql`
      SELECT
        COALESCE(SUM(stamps) FILTER (WHERE created_at >= ${startToday}), 0)::int AS today_stamps,
        COUNT(DISTINCT client_id) FILTER (WHERE created_at >= ${startToday})::int AS today_clients,
        COALESCE(SUM(stamps) FILTER (WHERE created_at >= ${startYesterday} AND created_at < ${startToday}), 0)::int AS yesterday_stamps
      FROM transactions
      WHERE merchant_id = ${merchantId}
        AND status = 'ACTIVE'
        AND type = 'EARN_STAMPS'
        AND created_at >= ${startYesterday}
    `);

    const dailyRows = await this.rawQuery.queryRaw<{ day: number; cnt: number }>(Prisma.sql`
      SELECT EXTRACT(DAY FROM (created_at + interval '1 hour'))::int AS day, COUNT(*)::int AS cnt
      FROM transactions
      WHERE merchant_id = ${merchantId}
        AND status = 'ACTIVE'
        AND type = 'EARN_STAMPS'
        AND created_at >= ${startMonth}
        AND created_at < ${startNextMonth}
      GROUP BY 1
    `);

    const daily = new Array<number>(daysInMonth).fill(0);
    let monthTotal = 0;
    for (const r of dailyRows) {
      const idx = (r.day ?? 0) - 1;
      if (idx >= 0 && idx < daysInMonth) {
        daily[idx] = r.cnt ?? 0;
        monthTotal += r.cnt ?? 0;
      }
    }

    return {
      today: { stamps: agg?.today_stamps ?? 0, clients: agg?.today_clients ?? 0 },
      yesterday: { stamps: agg?.yesterday_stamps ?? 0 },
      month: { total: monthTotal, daily },
    };
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

    // Lucky-wheel and scratch prizes are reported by getGamesStats (top prizes),
    // so this list stays limited to the loyalty reward catalogue.
    await this.cache.set(cacheKey, distribution, MerchantDashboardService.DISTRIBUTION_TTL);
    return distribution;
  }

  // ── 3. Games — scratch cards + lucky wheel summary ─────────
  async getGamesStats(merchantId: string) {
    const cacheKey = `dashboard:games:${merchantId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const [[row], topRows] = await Promise.all([
      this.rawQuery.queryRaw<{
        scratch_campaigns: number;
        scratch_active_campaigns: number;
        scratch_sent: number;
        scratch_scratched: number;
        scratch_redeemed: number;
        scratch_revenue: number;
        scratch_discount: number;
        wheel_campaigns: number;
        wheel_active_campaigns: number;
        wheel_plays: number;
        wheel_wins: number;
        wheel_pending: number;
        wheel_fulfilled: number;
      }>(Prisma.sql`
        SELECT
          (SELECT COUNT(*)::int FROM scratch_campaigns
           WHERE merchant_id = ${merchantId}) AS scratch_campaigns,
          (SELECT COUNT(*)::int FROM scratch_campaigns
           WHERE merchant_id = ${merchantId} AND status IN ('SCHEDULED', 'SENDING', 'SENT')) AS scratch_active_campaigns,
          (SELECT COUNT(*)::int FROM scratch_cards
           WHERE merchant_id = ${merchantId}) AS scratch_sent,
          (SELECT COUNT(*)::int FROM scratch_cards
           WHERE merchant_id = ${merchantId} AND status = 'SCRATCHED') AS scratch_scratched,
          sc.redeemed AS scratch_redeemed,
          sc.revenue AS scratch_revenue,
          sc.discount AS scratch_discount,
          (SELECT COUNT(*)::int FROM lucky_wheel_campaigns
           WHERE merchant_id = ${merchantId}) AS wheel_campaigns,
          (SELECT COUNT(*)::int FROM lucky_wheel_campaigns
           WHERE merchant_id = ${merchantId} AND status = 'ACTIVE' AND ends_at > now()) AS wheel_active_campaigns,
          wd.plays AS wheel_plays,
          wd.wins AS wheel_wins,
          wd.pending AS wheel_pending,
          wd.fulfilled AS wheel_fulfilled
        FROM (
          SELECT
            COUNT(*)::int AS redeemed,
            COALESCE(SUM(purchase_amount), 0)::float AS revenue,
            COALESCE(SUM(discount_amount), 0)::float AS discount
          FROM coupons
          WHERE merchant_id = ${merchantId} AND source = 'SCRATCH_CARD' AND status = 'REDEEMED'
        ) sc,
        (
          SELECT
            COUNT(*)::int AS plays,
            COUNT(*) FILTER (WHERE d.result = 'WON')::int AS wins,
            -- Overdue draws are only flagged EXPIRED lazily, so filter on claim_before here.
            COUNT(*) FILTER (
              WHERE d.result = 'WON' AND d.fulfilment = 'PENDING'
                AND (d.claim_before IS NULL OR d.claim_before >= now())
            )::int AS pending,
            COUNT(*) FILTER (WHERE d.fulfilment = 'CLAIMED')::int AS fulfilled
          FROM lucky_wheel_draws d
          INNER JOIN lucky_wheel_tickets tk ON tk.id = d.ticket_id
          INNER JOIN lucky_wheel_campaigns c ON c.id = tk.campaign_id
          WHERE c.merchant_id = ${merchantId}
        ) wd
      `),
      this.rawQuery.queryRaw<{ label: string; source: 'SCRATCH' | 'WHEEL'; cnt: number }>(Prisma.sql`
        SELECT label, source, cnt FROM (
          SELECT label, 'SCRATCH' AS source, COUNT(*)::int AS cnt
          FROM coupons
          WHERE merchant_id = ${merchantId} AND source = 'SCRATCH_CARD' AND status <> 'CANCELLED'
          GROUP BY label
          UNION ALL
          SELECT p.label, 'WHEEL' AS source, COUNT(*)::int AS cnt
          FROM lucky_wheel_draws d
          INNER JOIN lucky_wheel_tickets tk ON tk.id = d.ticket_id
          INNER JOIN lucky_wheel_campaigns c ON c.id = tk.campaign_id
          INNER JOIN lucky_wheel_prizes p ON p.id = d.prize_id
          WHERE c.merchant_id = ${merchantId} AND d.result = 'WON'
          GROUP BY p.label
        ) prizes
        ORDER BY cnt DESC, label ASC
        LIMIT ${MerchantDashboardService.TOP_PRIZES_LIMIT}
      `),
    ]);

    const roundMoney = (n: number | null | undefined) => Math.round((n ?? 0) * 100) / 100;
    const result = {
      scratch: {
        campaigns: row?.scratch_campaigns ?? 0,
        activeCampaigns: row?.scratch_active_campaigns ?? 0,
        sent: row?.scratch_sent ?? 0,
        scratched: row?.scratch_scratched ?? 0,
        redeemed: row?.scratch_redeemed ?? 0,
        revenue: roundMoney(row?.scratch_revenue),
        discountGiven: roundMoney(row?.scratch_discount),
      },
      wheel: {
        campaigns: row?.wheel_campaigns ?? 0,
        activeCampaigns: row?.wheel_active_campaigns ?? 0,
        plays: row?.wheel_plays ?? 0,
        wins: row?.wheel_wins ?? 0,
        pending: row?.wheel_pending ?? 0,
        fulfilled: row?.wheel_fulfilled ?? 0,
      },
      topPrizes: topRows.map((r) => ({ label: r.label, source: r.source, count: r.cnt ?? 0 })),
    };

    await this.cache.set(cacheKey, result, MerchantDashboardService.GAMES_TTL);
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
