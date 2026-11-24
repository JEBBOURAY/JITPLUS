import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RAW_QUERY_RUNNER, type IRawQueryRunner } from '../common/repositories';
import { ADMIN_STATS_CACHE_TTL, MS_PER_DAY } from '../common/constants';
import { num, type Row } from './admin-insights.helpers';
import type { InsightPeriod } from './admin-insights.service';
import { planKindOfRow } from './admin-crm.service';

/**
 * Pro features whose use leaves a dated trace. Each one maps to the event
 * counted for it in queryEvents():
 * - stamps: EARN_STAMPS transaction · rewards: REDEEM_REWARD · welcome: WELCOME_BONUS
 * - team: transaction recorded by a team member
 * - stampCodes: e-commerce code printed or redeemed · quickAdd: WhatsApp claim link created
 * - notifications: campaign sent by the merchant · scratch: scratch campaign scheduled or sent
 * - wheel: lucky-wheel draw by a client · collections: item checked on a collection card
 * - deals: deal published · booking: booking created (app or typed by the merchant)
 */
export const USAGE_FEATURES = [
  'stamps', 'rewards', 'welcome', 'team', 'stampCodes', 'quickAdd',
  'notifications', 'scratch', 'wheel', 'collections', 'deals', 'booking',
] as const;
export type UsageFeature = (typeof USAGE_FEATURES)[number];

/** Upper bound on the merchants returned (the page aggregates them client-side). */
const MAX_MERCHANTS = 5000;

function iso(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

/**
 * Feature usage per merchant for the admin "Usage" page: for every active
 * account, how often each Pro feature was used in the period and the one
 * before, whether it was ever used, when last, and what is switched on now.
 * The page derives adoption rates and segments (plan, city, category) from
 * these rows, so one cached payload serves every filter.
 */
@Injectable()
export class AdminUsageService {
  constructor(
    @Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getUsage(days: InsightPeriod = 30) {
    const cacheKey = `admin:usage:${days}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const since = new Date(now.getTime() - days * MS_PER_DAY);
    const prevSince = new Date(now.getTime() - 2 * days * MS_PER_DAY);

    // Sequential: both scan large tables and share the pool with live traffic.
    const merchantRows = await this.queryMerchants(now);
    const eventRows = await this.queryEvents(since, prevSince);

    const usageById = new Map<string, Partial<Record<UsageFeature, { n: number; prev: number; ever: number; last: string | null }>>>();
    for (const e of eventRows) {
      const id = String(e.merchant_id);
      const f = String(e.f) as UsageFeature;
      if (!USAGE_FEATURES.includes(f)) continue;
      const entry = usageById.get(id) ?? {};
      entry[f] = { n: num(e.cur), prev: num(e.prev), ever: num(e.ever), last: iso(e.last_at) };
      usageById.set(id, entry);
    }

    const merchants = merchantRows.map((r) => {
      const live: UsageFeature[] = [];
      if (r.has_reward) live.push('rewards');
      if (r.welcome_on) live.push('welcome');
      if (r.has_team) live.push('team');
      if (r.scratch_live) live.push('scratch');
      if (r.wheel_live) live.push('wheel');
      if (r.collection_live) live.push('collections');
      if (r.deal_live) live.push('deals');
      if (r.booking_on) live.push('booking');
      return {
        id: String(r.id),
        nom: String(r.nom),
        email: String(r.email),
        phone: (r.phone as string | null) ?? null,
        ville: (r.ville as string | null) ?? null,
        categorie: String(r.categorie),
        planKind: planKindOfRow(r),
        planExpiresAt: iso(r.expires_at),
        createdAt: iso(r.created_at)!,
        onboarded: Boolean(r.onboarded),
        clients: num(r.clients),
        lastAppAt: iso(r.last_app_at),
        usage: usageById.get(String(r.id)) ?? {},
        live,
        settings: {
          perAmount: Boolean(r.per_amount),
          stampExpiry: Boolean(r.stamp_expiry),
          multiStore: num(r.stores) > 1,
        },
      };
    });

    const result = {
      period: { days, since: since.toISOString(), until: now.toISOString() },
      generatedAt: now.toISOString(),
      features: USAGE_FEATURES,
      truncated: merchantRows.length >= MAX_MERCHANTS,
      merchants,
    };
    await this.cache.set(cacheKey, result, ADMIN_STATS_CACHE_TTL);
    return result;
  }

  /** Active accounts with their plan, what is switched on now and the last Pro app request. */
  private queryMerchants(now: Date) {
    return this.rawQuery.queryRaw<Row>`
        WITH cards AS (
          SELECT merchant_id, COUNT(*) AS n FROM loyalty_cards
          WHERE deactivated_at IS NULL GROUP BY merchant_id
        ),
        app AS (SELECT merchant_id, MAX(last_active_at) AS last_at FROM device_sessions GROUP BY merchant_id),
        st AS (SELECT merchant_id, COUNT(*) AS n FROM stores WHERE is_active GROUP BY merchant_id),
        rw AS (SELECT DISTINCT merchant_id FROM rewards),
        team AS (SELECT DISTINCT merchant_id FROM team_members WHERE is_active),
        scr AS (
          SELECT DISTINCT merchant_id FROM scratch_campaigns
          WHERE status IN ('SCHEDULED', 'SENDING') OR (status = 'SENT' AND card_expires_at > ${now})
        ),
        lw AS (
          SELECT DISTINCT merchant_id FROM lucky_wheel_campaigns
          WHERE status = 'ACTIVE' AND starts_at <= ${now} AND ends_at > ${now}
        ),
        col AS (SELECT DISTINCT merchant_id FROM collections WHERE status = 'ACTIVE'),
        dl AS (
          SELECT DISTINCT merchant_id FROM deals
          WHERE status = 'ACTIVE' AND starts_at <= ${now} AND ends_at > ${now}
        )
        SELECT m.id, m.nom, m.email, m.phone_number AS phone, m.ville, m.categorie::text AS categorie,
               m.plan::text AS plan, m.plan_activated_by_admin AS admin_plan, m.premium_grant::text AS premium_grant,
               m.plan_expires_at AS expires_at, m.created_at, m.onboarding_completed AS onboarded,
               COALESCE(cards.n, 0) AS clients,
               app.last_at AS last_app_at,
               COALESCE(st.n, 0) AS stores,
               (m.stamp_earning_mode = 'PER_AMOUNT') AS per_amount,
               (m.stamp_validity_days IS NOT NULL) AS stamp_expiry,
               (m.welcome_bonus_enabled AND (m.welcome_bonus_ends_at IS NULL OR m.welcome_bonus_ends_at > ${now})) AS welcome_on,
               COALESCE(bs.enabled, false) AS booking_on,
               (rw.merchant_id IS NOT NULL) AS has_reward,
               (team.merchant_id IS NOT NULL) AS has_team,
               (scr.merchant_id IS NOT NULL) AS scratch_live,
               (lw.merchant_id IS NOT NULL) AS wheel_live,
               (col.merchant_id IS NOT NULL) AS collection_live,
               (dl.merchant_id IS NOT NULL) AS deal_live
        FROM merchants m
        LEFT JOIN cards ON cards.merchant_id = m.id
        LEFT JOIN app ON app.merchant_id = m.id
        LEFT JOIN st ON st.merchant_id = m.id
        LEFT JOIN booking_settings bs ON bs.merchant_id = m.id
        LEFT JOIN rw ON rw.merchant_id = m.id
        LEFT JOIN team ON team.merchant_id = m.id
        LEFT JOIN scr ON scr.merchant_id = m.id
        LEFT JOIN lw ON lw.merchant_id = m.id
        LEFT JOIN col ON col.merchant_id = m.id
        LEFT JOIN dl ON dl.merchant_id = m.id
        WHERE m.deleted_at IS NULL AND m.is_active
        ORDER BY m.created_at DESC
        LIMIT ${MAX_MERCHANTS}
    `;
  }

  /** One row per (merchant, feature) ever used: counts in the period, the previous one, ever, and the last date. */
  private queryEvents(since: Date, prevSince: Date) {
    return this.rawQuery.queryRaw<Row>`
        SELECT merchant_id, f,
               COUNT(*) FILTER (WHERE at >= ${since}) AS cur,
               COUNT(*) FILTER (WHERE at >= ${prevSince} AND at < ${since}) AS prev,
               COUNT(*) AS ever,
               MAX(at) AS last_at
        FROM (
          SELECT merchant_id,
                 CASE type WHEN 'EARN_STAMPS' THEN 'stamps' WHEN 'REDEEM_REWARD' THEN 'rewards' ELSE 'welcome' END AS f,
                 created_at AS at
          FROM transactions
          WHERE status = 'ACTIVE' AND type IN ('EARN_STAMPS', 'REDEEM_REWARD', 'WELCOME_BONUS')
          UNION ALL
          SELECT merchant_id, 'team', created_at FROM transactions
          WHERE status = 'ACTIVE' AND team_member_id IS NOT NULL
          UNION ALL
          SELECT merchant_id, 'stampCodes', created_at FROM stamp_codes
          UNION ALL
          SELECT merchant_id, 'stampCodes', redeemed_at FROM stamp_codes WHERE redeemed_at IS NOT NULL
          UNION ALL
          SELECT merchant_id, 'quickAdd', created_at FROM client_claims
          UNION ALL
          SELECT merchant_id, 'notifications', created_at FROM notifications WHERE merchant_id IS NOT NULL
          UNION ALL
          SELECT merchant_id, 'scratch', created_at FROM scratch_campaigns WHERE status NOT IN ('DRAFT', 'CANCELLED')
          UNION ALL
          SELECT c.merchant_id, 'wheel', d.created_at
          FROM lucky_wheel_draws d
          JOIN lucky_wheel_tickets t ON t.id = d.ticket_id
          JOIN lucky_wheel_campaigns c ON c.id = t.campaign_id
          UNION ALL
          SELECT p.merchant_id, 'collections', k.created_at
          FROM collection_checks k JOIN collection_progress p ON p.id = k.progress_id
          UNION ALL
          SELECT merchant_id, 'deals', created_at FROM deals
          UNION ALL
          SELECT merchant_id, 'booking', created_at FROM bookings
        ) e
        GROUP BY merchant_id, f
    `;
  }
}
