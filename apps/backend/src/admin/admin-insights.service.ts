import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RAW_QUERY_RUNNER, type IRawQueryRunner } from '../common/repositories';
import { ADMIN_STATS_CACHE_TTL, MS_PER_DAY } from '../common/constants';
import { moroccoParts } from '../common/utils/morocco-time';
import { allLimited, firstRow, num, pct, type Row, type Windows } from './admin-insights.helpers';
import {
  queryClientKpis, queryLoyaltyHealth, queryMerchantKpis, queryMiscKpis, queryTransactionKpis,
  shapeClients, shapeEngagement, shapeLoyalty, shapeMerchants, shapeTransactions,
} from './admin-insights.kpi-rows';

export const INSIGHT_PERIODS = [7, 30, 90] as const;
export type InsightPeriod = (typeof INSIGHT_PERIODS)[number];

/** KPI queries in flight at once (each holds a pool connection while it runs). */
const INSIGHT_QUERY_CONCURRENCY = 4;

/**
 * Product analytics for the admin dashboard (growth, activation, retention,
 * feature adoption, games, geography). Raw SQL bypasses the soft-delete
 * middleware, so every query on merchants/clients filters deleted_at itself.
 *
 * compute() runs the KPI queries at most INSIGHT_QUERY_CONCURRENCY at a time
 * (the pool holds 10 connections per instance, shared with live traffic),
 * then shapes each block.
 * Blocks whose output only depends on their own query fetch + shape in one
 * method; aggregate rows reused by several blocks (merchants, clients,
 * transactions, misc, loyalty) are fetched raw and shaped in compute(), with
 * their query + shape functions in admin-insights.kpi-rows.ts.
 */
@Injectable()
export class AdminInsightsService {
  constructor(
    @Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getInsights(days: InsightPeriod = 30) {
    const cacheKey = `admin:insights:${days}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.compute(days);
    await this.cache.set(cacheKey, result, ADMIN_STATS_CACHE_TTL);
    return result;
  }

  private async compute(days: InsightPeriod) {
    const now = new Date();
    const w: Windows = {
      days,
      now,
      since: new Date(now.getTime() - days * MS_PER_DAY),
      prevSince: new Date(now.getTime() - 2 * days * MS_PER_DAY),
      d1: new Date(now.getTime() - MS_PER_DAY),
      d7: new Date(now.getTime() - 7 * MS_PER_DAY),
      d30: new Date(now.getTime() - 30 * MS_PER_DAY),
      in7: new Date(now.getTime() + 7 * MS_PER_DAY),
    };

    const [
      m,
      c,
      activity,
      t,
      daily,
      heatmap,
      categories,
      cities,
      topMerchants,
      trialsEnding,
      dormantMerchants,
      scratch,
      coupons,
      luckyWheel,
      x,
      topBlocked,
      languages,
      l,
    ] = await allLimited([
      () => firstRow(queryMerchantKpis(this.rawQuery, w)),
      () => firstRow(queryClientKpis(this.rawQuery, w)),
      () => this.activityKpis(w),
      () => firstRow(queryTransactionKpis(this.rawQuery, w)),
      () => this.dailySeries(w),
      () => this.weekdayHourHeatmap(w),
      () => this.categoryBreakdown(w),
      () => this.cityBreakdown(w),
      () => this.topMerchants(w),
      () => this.trialsEnding(w),
      () => this.dormantMerchants(w),
      () => this.scratchKpis(w),
      () => this.couponKpis(w),
      () => this.luckyWheelKpis(w),
      () => firstRow(queryMiscKpis(this.rawQuery, w)),
      () => this.mostBlockedMerchants(),
      () => this.appLanguages(),
      () => firstRow(queryLoyaltyHealth(this.rawQuery, w)),
    ], INSIGHT_QUERY_CONCURRENCY);

    return {
      period: { days, since: w.since.toISOString(), until: now.toISOString() },
      generatedAt: now.toISOString(),
      merchants: shapeMerchants(m),
      clients: shapeClients(c),
      activity,
      transactions: shapeTransactions(t, m, c),
      loyalty: shapeLoyalty(l, x),
      scratch,
      luckyWheel,
      coupons,
      engagement: shapeEngagement(x),
      moderation: {
        blocksTotal: num(x.blocks_total),
        blocksPeriod: num(x.blocks_period),
        topBlocked,
      },
      ops: {
        payoutsPending: num(x.payouts_pending),
        payoutsPendingAmount: num(x.payouts_pending_amount),
        clientReferralsPending: num(x.client_referrals_pending),
        merchantReferralsPeriod: num(x.merchant_referrals_period),
      },
      daily,
      heatmap,
      categories,
      cities,
      languages,
      topMerchants,
      trialsEnding,
      dormantMerchants,
    };
  }

  // ── DAU / WAU / MAU (rolling windows, independent of the selected period)

  private async activityKpis(w: Windows) {
    const a = await firstRow(this.queryActivity(w));
    const mau = num(a.mau);
    return {
      dau: num(a.dau),
      wau: num(a.wau),
      mau,
      stickiness: pct(num(a.dau), mau),
      merchantDau: num(a.merchant_dau),
      merchantWau: num(a.merchant_wau),
      merchantMau: num(a.merchant_mau),
    };
  }

  private queryActivity(w: Windows) {
    return this.rawQuery.queryRaw<Row>`
        SELECT
          COUNT(DISTINCT client_id) FILTER (WHERE created_at >= ${w.d1}) AS dau,
          COUNT(DISTINCT client_id) FILTER (WHERE created_at >= ${w.d7}) AS wau,
          COUNT(DISTINCT client_id) AS mau,
          COUNT(DISTINCT merchant_id) FILTER (WHERE created_at >= ${w.d1}) AS merchant_dau,
          COUNT(DISTINCT merchant_id) FILTER (WHERE created_at >= ${w.d7}) AS merchant_wau,
          COUNT(DISTINCT merchant_id) AS merchant_mau
        FROM transactions
        WHERE status = 'ACTIVE' AND created_at >= ${w.d30}
    `;
  }

  // ── Daily series (Morocco calendar days)

  private async dailySeries(w: Windows) {
    const dailyRows = await this.queryDailySeries(w);
    // Daily buckets: one entry per Morocco calendar day, oldest first
    const dailyMap = new Map<string, { merchants: number; clients: number; transactions: number; activeClients: number }>();
    for (let i = w.days - 1; i >= 0; i--) {
      const ymd = moroccoParts(new Date(w.now.getTime() - i * MS_PER_DAY)).ymd;
      dailyMap.set(ymd, { merchants: 0, clients: 0, transactions: 0, activeClients: 0 });
    }
    for (const r of dailyRows) {
      const bucket = dailyMap.get(r.d);
      if (bucket && r.k in bucket) bucket[r.k as keyof typeof bucket] = num(r.n);
    }
    return [...dailyMap.entries()].map(([date, v]) => ({ date, ...v }));
  }

  private queryDailySeries(w: Windows) {
    return this.rawQuery.queryRaw<{ k: string; d: string; n: bigint }>`
        SELECT 'merchants' AS k, to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca', 'YYYY-MM-DD') AS d, COUNT(*) AS n
        FROM merchants WHERE deleted_at IS NULL AND created_at >= ${w.since} GROUP BY 2
        UNION ALL
        SELECT 'clients', to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca', 'YYYY-MM-DD'), COUNT(*)
        FROM clients WHERE deleted_at IS NULL AND NOT is_anonymous AND created_at >= ${w.since} GROUP BY 2
        UNION ALL
        SELECT 'transactions', to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca', 'YYYY-MM-DD'), COUNT(*)
        FROM transactions WHERE status = 'ACTIVE' AND created_at >= ${w.since} GROUP BY 2
        UNION ALL
        SELECT 'activeClients', to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca', 'YYYY-MM-DD'), COUNT(DISTINCT client_id)
        FROM transactions WHERE status = 'ACTIVE' AND created_at >= ${w.since} GROUP BY 2
    `;
  }

  // ── Weekday × hour heatmap of transactions (Morocco time)

  private async weekdayHourHeatmap(w: Windows) {
    const heatmapRows = await this.queryHeatmap(w);
    // 7 × 24 matrix, Monday first
    const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const r of heatmapRows) {
      const dow = num(r.dow);
      const h = num(r.h);
      if (dow >= 1 && dow <= 7 && h >= 0 && h < 24) heatmap[dow - 1][h] = num(r.n);
    }
    return heatmap;
  }

  private queryHeatmap(w: Windows) {
    return this.rawQuery.queryRaw<{ dow: number; h: number; n: bigint }>`
        SELECT EXTRACT(ISODOW FROM local_ts)::int AS dow, EXTRACT(HOUR FROM local_ts)::int AS h, COUNT(*) AS n
        FROM (
          SELECT (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca' AS local_ts
          FROM transactions WHERE status = 'ACTIVE' AND created_at >= ${w.since}
        ) s
        GROUP BY 1, 2
    `;
  }

  // ── Categories: supply (merchants) vs usage (cards, transactions)

  private async categoryBreakdown(w: Windows) {
    const categoryRows = await this.queryCategories(w);
    return categoryRows.map((r) => ({
      category: String(r.category),
      merchants: num(r.merchants),
      active: num(r.active),
      cards: num(r.cards),
      transactions: num(r.transactions),
    }));
  }

  private queryCategories(w: Windows) {
    return this.rawQuery.queryRaw<Row>`
        WITH tx AS (
          SELECT merchant_id, COUNT(*) AS n FROM transactions
          WHERE status = 'ACTIVE' AND created_at >= ${w.since} GROUP BY merchant_id
        ),
        cards AS (SELECT merchant_id, COUNT(*) AS n FROM loyalty_cards GROUP BY merchant_id)
        SELECT m.categorie::text AS category,
               COUNT(*) AS merchants,
               COUNT(*) FILTER (WHERE tx.n > 0 AND m.is_active) AS active,
               COALESCE(SUM(cards.n), 0) AS cards,
               COALESCE(SUM(tx.n), 0) AS transactions
        FROM merchants m
        LEFT JOIN tx ON tx.merchant_id = m.id
        LEFT JOIN cards ON cards.merchant_id = m.id
        WHERE m.deleted_at IS NULL
        GROUP BY m.categorie
        ORDER BY merchants DESC
    `;
  }

  // ── Cities

  private async cityBreakdown(w: Windows) {
    const cityRows = await this.queryCities(w);
    return cityRows.map((r) => ({
      city: String(r.city),
      merchants: num(r.merchants),
      active: num(r.active),
      transactions: num(r.transactions),
    }));
  }

  private queryCities(w: Windows) {
    return this.rawQuery.queryRaw<Row>`
        WITH tx AS (
          SELECT merchant_id, COUNT(*) AS n FROM transactions
          WHERE status = 'ACTIVE' AND created_at >= ${w.since} GROUP BY merchant_id
        )
        SELECT COALESCE(INITCAP(LOWER(NULLIF(TRIM(m.ville), ''))), '—') AS city,
               COUNT(*) AS merchants,
               COUNT(*) FILTER (WHERE tx.n > 0 AND m.is_active) AS active,
               COALESCE(SUM(tx.n), 0) AS transactions
        FROM merchants m
        LEFT JOIN tx ON tx.merchant_id = m.id
        WHERE m.deleted_at IS NULL
        GROUP BY 1
        ORDER BY merchants DESC
        LIMIT 12
    `;
  }

  // ── Top merchants of the period

  private async topMerchants(w: Windows) {
    const topMerchantRows = await this.queryTopMerchants(w);
    return topMerchantRows.map((r) => ({
      id: String(r.id),
      nom: String(r.nom),
      category: String(r.category),
      ville: (r.ville as string | null) ?? null,
      plan: String(r.plan),
      paid: Boolean(r.paid),
      transactions: num(r.transactions),
      clients: num(r.clients),
      redeems: num(r.redeems),
    }));
  }

  private queryTopMerchants(w: Windows) {
    return this.rawQuery.queryRaw<Row>`
        SELECT m.id, m.nom, m.categorie::text AS category, m.ville, m.plan::text AS plan,
               m.plan_activated_by_admin AS paid,
               COUNT(t.id) AS transactions,
               COUNT(DISTINCT t.client_id) AS clients,
               COUNT(t.id) FILTER (WHERE t.type = 'REDEEM_REWARD') AS redeems
        FROM transactions t
        JOIN merchants m ON m.id = t.merchant_id
        WHERE t.status = 'ACTIVE' AND t.created_at >= ${w.since} AND m.deleted_at IS NULL
        GROUP BY m.id
        ORDER BY transactions DESC
        LIMIT 10
    `;
  }

  // ── Trials ending within 7 days (sales follow-up list)

  private async trialsEnding(w: Windows) {
    const trialEndingRows = await this.queryTrialsEnding(w);
    return trialEndingRows.map((r) => ({
      id: String(r.id),
      nom: String(r.nom),
      email: String(r.email),
      phone: (r.phone as string | null) ?? null,
      expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : String(r.expires_at),
      clients: num(r.clients),
      transactions: num(r.transactions),
    }));
  }

  private queryTrialsEnding(w: Windows) {
    return this.rawQuery.queryRaw<Row>`
        SELECT m.id, m.nom, m.email, m.phone_number AS phone, m.plan_expires_at AS expires_at,
               (SELECT COUNT(*) FROM loyalty_cards lc WHERE lc.merchant_id = m.id) AS clients,
               (SELECT COUNT(*) FROM transactions t WHERE t.merchant_id = m.id AND t.status = 'ACTIVE') AS transactions
        FROM merchants m
        WHERE m.deleted_at IS NULL AND m.is_active
          AND m.plan = 'PREMIUM' AND NOT m.plan_activated_by_admin
          AND m.plan_expires_at > ${w.now} AND m.plan_expires_at <= ${w.in7}
        ORDER BY m.plan_expires_at ASC
        LIMIT 15
    `;
  }

  // ── Dormant merchants: used the app before, nothing for 30 days

  private async dormantMerchants(w: Windows) {
    const dormantRows = await this.queryDormantMerchants(w);
    return dormantRows.map((r) => ({
      id: String(r.id),
      nom: String(r.nom),
      email: String(r.email),
      phone: (r.phone as string | null) ?? null,
      plan: String(r.plan),
      lastActivityAt: r.last_at instanceof Date ? r.last_at.toISOString() : String(r.last_at),
      transactions: num(r.transactions),
      clients: num(r.clients),
    }));
  }

  private queryDormantMerchants(w: Windows) {
    return this.rawQuery.queryRaw<Row>`
        WITH tx AS (
          SELECT merchant_id, MAX(created_at) AS last_at, COUNT(*) AS total
          FROM transactions WHERE status = 'ACTIVE' GROUP BY merchant_id
        )
        SELECT m.id, m.nom, m.email, m.phone_number AS phone, m.plan::text AS plan, tx.last_at, tx.total AS transactions,
               (SELECT COUNT(*) FROM loyalty_cards lc WHERE lc.merchant_id = m.id) AS clients
        FROM merchants m
        JOIN tx ON tx.merchant_id = m.id
        WHERE m.deleted_at IS NULL AND m.is_active AND tx.last_at < ${w.d30}
        ORDER BY clients DESC, tx.last_at DESC
        LIMIT 15
    `;
  }

  // ── Scratch cards

  private async scratchKpis(w: Windows) {
    const s = await firstRow(this.queryScratch(w));
    return {
      campaignsPeriod: num(s.campaigns_period),
      scheduled: num(s.scheduled),
      live: num(s.live),
      cancelled: num(s.cancelled),
      cards: num(s.cards),
      pushed: num(s.pushed),
      opened: num(s.opened),
      scratched: num(s.scratched),
      expired: num(s.expired),
      pending: num(s.pending),
      scratchRate: pct(num(s.scratched), num(s.cards)),
    };
  }

  private queryScratch(w: Windows) {
    return this.rawQuery.queryRaw<Row>`
        SELECT
          (SELECT COUNT(*) FROM scratch_campaigns WHERE created_at >= ${w.since} AND status <> 'DRAFT') AS campaigns_period,
          (SELECT COUNT(*) FROM scratch_campaigns WHERE status IN ('SCHEDULED', 'SENDING')) AS scheduled,
          (SELECT COUNT(*) FROM scratch_campaigns WHERE status = 'SENT' AND card_expires_at > ${w.now}) AS live,
          (SELECT COUNT(*) FROM scratch_campaigns WHERE status = 'CANCELLED' AND created_at >= ${w.since}) AS cancelled,
          COUNT(*) AS cards,
          COUNT(*) FILTER (WHERE sc.push_sent_at IS NOT NULL) AS pushed,
          COUNT(*) FILTER (WHERE sc.opened_at IS NOT NULL OR sc.scratched_at IS NOT NULL) AS opened,
          COUNT(*) FILTER (WHERE sc.status = 'SCRATCHED') AS scratched,
          COUNT(*) FILTER (WHERE sc.status = 'EXPIRED') AS expired,
          COUNT(*) FILTER (WHERE sc.status = 'PENDING') AS pending
        FROM scratch_cards sc
        WHERE sc.created_at >= ${w.since}
    `;
  }

  // ── Coupons: by source and by reward type

  private async couponKpis(w: Windows) {
    // Sequential: compute() already runs INSIGHT_QUERY_CONCURRENCY blocks at once.
    const couponSourceRows = await this.queryCouponsBySource(w);
    const couponTypeRows = await this.queryCouponsByType(w);
    const bySource = couponSourceRows.map((r) => ({
      source: String(r.source),
      total: num(r.total),
      redeemed: num(r.redeemed),
      expired: num(r.expired),
      active: num(r.active),
      discount: num(r.discount),
      purchase: num(r.purchase),
    }));
    const byType = couponTypeRows.map((r) => ({
      type: String(r.type),
      total: num(r.total),
      redeemed: num(r.redeemed),
      redemptionRate: pct(num(r.redeemed), num(r.total)),
    }));
    const couponTotals = bySource.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        redeemed: acc.redeemed + r.redeemed,
        expired: acc.expired + r.expired,
        active: acc.active + r.active,
        discount: acc.discount + r.discount,
        purchase: acc.purchase + r.purchase,
      }),
      { total: 0, redeemed: 0, expired: 0, active: 0, discount: 0, purchase: 0 },
    );
    return {
      bySource,
      byType,
      totals: { ...couponTotals, redemptionRate: pct(couponTotals.redeemed, couponTotals.total) },
    };
  }

  private queryCouponsBySource(w: Windows) {
    return this.rawQuery.queryRaw<Row>`
        SELECT source::text AS source,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'REDEEMED') AS redeemed,
               COUNT(*) FILTER (WHERE status = 'EXPIRED') AS expired,
               COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
               COALESCE(SUM(discount_amount) FILTER (WHERE status = 'REDEEMED'), 0) AS discount,
               COALESCE(SUM(purchase_amount) FILTER (WHERE status = 'REDEEMED'), 0) AS purchase
        FROM coupons
        WHERE created_at >= ${w.since}
        GROUP BY source
    `;
  }

  /** Which offer converts best. */
  private queryCouponsByType(w: Windows) {
    return this.rawQuery.queryRaw<Row>`
        SELECT type::text AS type,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'REDEEMED') AS redeemed
        FROM coupons
        WHERE created_at >= ${w.since}
        GROUP BY type
        ORDER BY total DESC
    `;
  }

  // ── Lucky wheel

  private async luckyWheelKpis(w: Windows) {
    const lw = await firstRow(this.queryLuckyWheel(w));
    return {
      live: num(lw.live),
      campaignsPeriod: num(lw.campaigns_period),
      tickets: num(lw.tickets),
      used: num(lw.used),
      draws: num(lw.draws),
      won: num(lw.won),
      claimed: num(lw.claimed),
      expired: num(lw.expired),
      pendingAll: num(lw.pending_all),
      outOfStock: num(lw.out_of_stock),
      winRate: pct(num(lw.won), num(lw.draws)),
      claimRate: pct(num(lw.claimed), num(lw.won)),
    };
  }

  private queryLuckyWheel(w: Windows) {
    return this.rawQuery.queryRaw<Row>`
        SELECT
          (SELECT COUNT(*) FROM lucky_wheel_campaigns
            WHERE status = 'ACTIVE' AND starts_at <= ${w.now} AND ends_at > ${w.now}) AS live,
          (SELECT COUNT(*) FROM lucky_wheel_campaigns WHERE created_at >= ${w.since} AND status <> 'DRAFT') AS campaigns_period,
          (SELECT COUNT(*) FROM lucky_wheel_tickets WHERE created_at >= ${w.since}) AS tickets,
          (SELECT COUNT(*) FROM lucky_wheel_tickets WHERE created_at >= ${w.since} AND used) AS used,
          (SELECT COUNT(*) FROM lucky_wheel_draws WHERE created_at >= ${w.since}) AS draws,
          (SELECT COUNT(*) FROM lucky_wheel_draws WHERE created_at >= ${w.since} AND result = 'WON') AS won,
          (SELECT COUNT(*) FROM lucky_wheel_draws WHERE created_at >= ${w.since} AND fulfilment = 'CLAIMED') AS claimed,
          (SELECT COUNT(*) FROM lucky_wheel_draws WHERE created_at >= ${w.since} AND fulfilment = 'EXPIRED') AS expired,
          (SELECT COUNT(*) FROM lucky_wheel_draws WHERE fulfilment = 'PENDING') AS pending_all,
          (SELECT COUNT(*) FROM lucky_wheel_prizes p JOIN lucky_wheel_campaigns c ON c.id = p.campaign_id
            WHERE c.status = 'ACTIVE' AND c.ends_at > ${w.now} AND p.remaining = 0) AS out_of_stock
    `;
  }

  // ── Most blocked merchants (moderation signal)

  private async mostBlockedMerchants() {
    const blockedRows = await this.queryMostBlocked();
    return blockedRows.map((r) => ({
      id: String(r.id),
      nom: String(r.nom),
      category: String(r.category),
      blocks: num(r.blocks),
    }));
  }

  private queryMostBlocked() {
    return this.rawQuery.queryRaw<Row>`
        SELECT m.id, m.nom, m.categorie::text AS category, COUNT(*) AS blocks
        FROM client_merchant_blocks b
        JOIN merchants m ON m.id = b.merchant_id
        WHERE m.deleted_at IS NULL
        GROUP BY m.id
        ORDER BY blocks DESC
        LIMIT 5
    `;
  }

  // ── App languages

  private async appLanguages() {
    const languageRows = await this.queryLanguages();
    const languages: Record<'merchants' | 'clients', { language: string; count: number }[]> = { merchants: [], clients: [] };
    for (const r of languageRows) {
      const key = r.audience === 'merchants' ? 'merchants' : 'clients';
      languages[key].push({ language: r.language, count: num(r.n) });
    }
    languages.merchants.sort((p, n) => n.count - p.count);
    languages.clients.sort((p, n) => n.count - p.count);
    return languages;
  }

  private queryLanguages() {
    return this.rawQuery.queryRaw<{ audience: string; language: string; n: bigint }>`
        SELECT 'merchants' AS audience, language, COUNT(*) AS n FROM merchants WHERE deleted_at IS NULL GROUP BY language
        UNION ALL
        SELECT 'clients', language, COUNT(*) FROM clients WHERE deleted_at IS NULL AND NOT is_anonymous GROUP BY language
    `;
  }
}
