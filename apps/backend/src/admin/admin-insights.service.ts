import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RAW_QUERY_RUNNER, type IRawQueryRunner } from '../common/repositories';
import { ADMIN_STATS_CACHE_TTL } from '../common/constants';
import { moroccoParts } from '../common/utils/morocco-time';

export const INSIGHT_PERIODS = [7, 30, 90] as const;
export type InsightPeriod = (typeof INSIGHT_PERIODS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

type Row = Record<string, unknown>;

/** Postgres COUNT/SUM come back as bigint or Decimal: normalise everything to number. */
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  const parsed = Number(String(v));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

/**
 * Product analytics for the admin dashboard (growth, activation, retention,
 * feature adoption, games, geography). Raw SQL bypasses the soft-delete
 * middleware, so every query on merchants/clients filters deleted_at itself.
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
    const since = new Date(now.getTime() - days * DAY_MS);
    const prevSince = new Date(now.getTime() - 2 * days * DAY_MS);
    const d1 = new Date(now.getTime() - DAY_MS);
    const d7 = new Date(now.getTime() - 7 * DAY_MS);
    const d30 = new Date(now.getTime() - 30 * DAY_MS);
    const in7 = new Date(now.getTime() + 7 * DAY_MS);
    const q = this.rawQuery;

    const [
      merchantRows,
      clientRows,
      activityRows,
      txRows,
      dailyRows,
      heatmapRows,
      categoryRows,
      cityRows,
      topMerchantRows,
      trialEndingRows,
      dormantRows,
      scratchRows,
      couponSourceRows,
      couponTypeRows,
      wheelRows,
      miscRows,
      blockedRows,
      languageRows,
      loyaltyRows,
    ] = await Promise.all([
      // ── Merchants: funnel, plans, health, profile completeness, feature adoption
      q.queryRaw<Row>`
        WITH tx AS (
          SELECT merchant_id,
                 COUNT(*) AS total,
                 COUNT(*) FILTER (WHERE created_at >= ${since}) AS recent,
                 MAX(created_at) AS last_at
          FROM transactions WHERE status = 'ACTIVE'
          GROUP BY merchant_id
        ),
        cards AS (SELECT merchant_id, COUNT(*) AS n FROM loyalty_cards GROUP BY merchant_id),
        rw AS (SELECT DISTINCT merchant_id FROM rewards),
        team AS (SELECT DISTINCT merchant_id FROM team_members WHERE is_active),
        st AS (SELECT merchant_id, COUNT(*) AS n FROM stores WHERE is_active GROUP BY merchant_id),
        scr AS (SELECT DISTINCT merchant_id FROM scratch_campaigns WHERE status NOT IN ('DRAFT', 'CANCELLED')),
        lw AS (SELECT DISTINCT merchant_id FROM lucky_wheel_campaigns WHERE status <> 'DRAFT'),
        qa AS (SELECT DISTINCT merchant_id FROM client_claims),
        nt AS (SELECT DISTINCT merchant_id FROM notifications WHERE merchant_id IS NOT NULL),
        paid_ever AS (
          SELECT DISTINCT target_id FROM audit_logs
          WHERE action = 'ACTIVATE_PREMIUM' AND target_id IS NOT NULL
        )
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE m.is_active) AS active_accounts,
          COUNT(*) FILTER (WHERE NOT m.is_active) AS banned,
          COUNT(*) FILTER (WHERE m.created_at >= ${since}) AS new_period,
          COUNT(*) FILTER (WHERE m.created_at >= ${prevSince} AND m.created_at < ${since}) AS new_prev,
          COUNT(*) FILTER (WHERE m.onboarding_completed) AS onboarded,
          COUNT(*) FILTER (WHERE rw.merchant_id IS NOT NULL) AS with_reward,
          COUNT(*) FILTER (WHERE tx.total > 0) AS with_tx,
          -- Strictly nested funnel: each step also requires every previous one
          COUNT(*) FILTER (WHERE rw.merchant_id IS NOT NULL AND tx.total > 0) AS funnel_tx,
          COUNT(*) FILTER (WHERE rw.merchant_id IS NOT NULL AND tx.total > 0 AND cards.n >= 10) AS funnel_10,
          COUNT(*) FILTER (WHERE rw.merchant_id IS NOT NULL AND tx.total > 0 AND cards.n >= 10
                             AND m.plan = 'PREMIUM' AND m.plan_activated_by_admin
                             AND (m.plan_expires_at IS NULL OR m.plan_expires_at > ${now})) AS funnel_paid,
          COUNT(*) FILTER (WHERE m.is_active AND tx.recent > 0) AS active_period,
          COUNT(*) FILTER (WHERE m.is_active AND tx.total > 0 AND tx.last_at < ${d30}) AS dormant,
          COUNT(*) FILTER (WHERE m.is_active AND tx.merchant_id IS NULL AND m.created_at < ${d7}) AS never_used,
          COUNT(*) FILTER (WHERE m.plan = 'PREMIUM' AND m.plan_activated_by_admin
                             AND (m.plan_expires_at IS NULL OR m.plan_expires_at > ${now})) AS paid,
          COUNT(*) FILTER (WHERE m.plan = 'PREMIUM' AND NOT m.plan_activated_by_admin
                             AND m.plan_expires_at > ${now}) AS trial_active,
          COUNT(*) FILTER (WHERE m.plan = 'PREMIUM' AND NOT m.plan_activated_by_admin
                             AND m.plan_expires_at > ${now} AND m.plan_expires_at <= ${in7}) AS trial_ending_7d,
          COUNT(*) FILTER (WHERE m.plan = 'PREMIUM' AND m.plan_activated_by_admin
                             AND m.plan_expires_at > ${now} AND m.plan_expires_at <= ${in7}) AS paid_ending_7d,
          COUNT(*) FILTER (WHERE m.trial_started_at IS NOT NULL AND (
                             m.plan_activated_by_admin OR pe.target_id IS NOT NULL
                             OR m.plan_expires_at IS NULL OR m.plan_expires_at <= ${now})) AS trials_finished,
          COUNT(*) FILTER (WHERE m.trial_started_at IS NOT NULL
                             AND (m.plan_activated_by_admin OR pe.target_id IS NOT NULL)) AS trials_converted,
          COUNT(*) FILTER (WHERE m.logo_url IS NOT NULL) AS with_logo,
          COUNT(*) FILTER (WHERE m.cover_url IS NOT NULL) AS with_cover,
          COUNT(*) FILTER (WHERE m.latitude IS NOT NULL AND m.longitude IS NOT NULL) AS with_location,
          COUNT(*) FILTER (WHERE COALESCE(m.description, '') <> '') AS with_description,
          COUNT(*) FILTER (WHERE m.opening_hours IS NOT NULL) AS with_hours,
          COUNT(*) FILTER (WHERE m.social_links IS NOT NULL) AS with_socials,
          COUNT(*) FILTER (WHERE m.push_token IS NOT NULL) AS with_push,
          COUNT(*) FILTER (WHERE m.stamp_validity_days IS NOT NULL) AS with_stamp_expiry,
          COUNT(*) FILTER (WHERE m.stamp_earning_mode = 'PER_AMOUNT') AS per_amount,
          COUNT(*) FILTER (WHERE team.merchant_id IS NOT NULL) AS with_team,
          COUNT(*) FILTER (WHERE st.n > 1) AS multi_store,
          COUNT(*) FILTER (WHERE scr.merchant_id IS NOT NULL) AS uses_scratch,
          COUNT(*) FILTER (WHERE lw.merchant_id IS NOT NULL) AS uses_wheel,
          COUNT(*) FILTER (WHERE qa.merchant_id IS NOT NULL) AS uses_quick_add,
          COUNT(*) FILTER (WHERE nt.merchant_id IS NOT NULL) AS uses_notifications,
          COUNT(*) FILTER (WHERE m.referred_by_id IS NOT NULL) AS referred_by_merchant,
          COUNT(*) FILTER (WHERE m.referred_by_client_id IS NOT NULL) AS referred_by_client,
          COUNT(*) FILTER (WHERE m.google_id IS NOT NULL) AS via_google,
          COUNT(*) FILTER (WHERE m.apple_id IS NOT NULL) AS via_apple,
          COALESCE(AVG(m.stamps_for_reward), 0) AS avg_stamps_for_reward
        FROM merchants m
        LEFT JOIN tx ON tx.merchant_id = m.id
        LEFT JOIN cards ON cards.merchant_id = m.id
        LEFT JOIN rw ON rw.merchant_id = m.id
        LEFT JOIN team ON team.merchant_id = m.id
        LEFT JOIN st ON st.merchant_id = m.id
        LEFT JOIN scr ON scr.merchant_id = m.id
        LEFT JOIN lw ON lw.merchant_id = m.id
        LEFT JOIN qa ON qa.merchant_id = m.id
        LEFT JOIN nt ON nt.merchant_id = m.id
        LEFT JOIN paid_ever pe ON pe.target_id = m.id
        WHERE m.deleted_at IS NULL
      `,

      // ── Clients: acquisition, reachability, retention, multi-merchant usage
      q.queryRaw<Row>`
        WITH cards AS (
          SELECT client_id, COUNT(*) AS n FROM loyalty_cards
          WHERE deactivated_at IS NULL GROUP BY client_id
        ),
        act AS (
          SELECT client_id, COUNT(*) AS visits FROM transactions
          WHERE status = 'ACTIVE' AND created_at >= ${since} GROUP BY client_id
        ),
        prev AS (
          SELECT DISTINCT client_id FROM transactions
          WHERE status = 'ACTIVE' AND created_at >= ${prevSince} AND created_at < ${since}
        )
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE c.is_anonymous) AS anonymous,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous) AS registered,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous AND c.created_at >= ${since}) AS new_period,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous AND c.created_at >= ${prevSince} AND c.created_at < ${since}) AS new_prev,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous AND c.push_token IS NOT NULL AND c.notif_push) AS push_reachable,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous AND c.email IS NOT NULL AND c.notif_email) AS email_reachable,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous AND c.telephone IS NOT NULL AND c.notif_whatsapp) AS whatsapp_reachable,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous AND c.google_id IS NOT NULL) AS via_google,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous AND c.apple_id IS NOT NULL) AS via_apple,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous AND c.google_id IS NULL AND c.apple_id IS NULL
                             AND c.telephone IS NOT NULL) AS via_phone,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous AND c.google_id IS NULL AND c.apple_id IS NULL
                             AND c.telephone IS NULL) AS via_email,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous AND cards.n IS NULL) AS no_card,
          COUNT(*) FILTER (WHERE cards.n = 1) AS one_card,
          COUNT(*) FILTER (WHERE cards.n BETWEEN 2 AND 3) AS two_three_cards,
          COUNT(*) FILTER (WHERE cards.n >= 4) AS four_plus_cards,
          COALESCE(AVG(cards.n), 0) AS avg_cards,
          COUNT(*) FILTER (WHERE act.client_id IS NOT NULL) AS active_period,
          COUNT(*) FILTER (WHERE act.visits >= 2) AS returning_period,
          COUNT(*) FILTER (WHERE prev.client_id IS NOT NULL) AS active_prev,
          COUNT(*) FILTER (WHERE prev.client_id IS NOT NULL AND act.client_id IS NOT NULL) AS retained,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous AND c.date_naissance IS NOT NULL) AS with_birthday,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous AND NOT c.share_info_merchants) AS no_share_info
        FROM clients c
        LEFT JOIN cards ON cards.client_id = c.id
        LEFT JOIN act ON act.client_id = c.id
        LEFT JOIN prev ON prev.client_id = c.id
        WHERE c.deleted_at IS NULL
      `,

      // ── DAU / WAU / MAU (rolling windows, independent of the selected period)
      q.queryRaw<Row>`
        SELECT
          COUNT(DISTINCT client_id) FILTER (WHERE created_at >= ${d1}) AS dau,
          COUNT(DISTINCT client_id) FILTER (WHERE created_at >= ${d7}) AS wau,
          COUNT(DISTINCT client_id) AS mau,
          COUNT(DISTINCT merchant_id) FILTER (WHERE created_at >= ${d1}) AS merchant_dau,
          COUNT(DISTINCT merchant_id) FILTER (WHERE created_at >= ${d7}) AS merchant_wau,
          COUNT(DISTINCT merchant_id) AS merchant_mau
        FROM transactions
        WHERE status = 'ACTIVE' AND created_at >= ${d30}
      `,

      // ── Transactions over the period vs previous period
      q.queryRaw<Row>`
        SELECT
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${since}) AS total,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at < ${since}) AS total_prev,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${since} AND type = 'EARN_STAMPS') AS earn,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${since} AND type = 'REDEEM_REWARD') AS redeem,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at < ${since} AND type = 'REDEEM_REWARD') AS redeem_prev,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${since} AND type = 'ADJUST_STAMPS') AS adjust,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${since} AND type = 'LUCKY_WHEEL_WIN') AS wheel_win,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${since} AND type = 'COUPON_REDEEM') AS coupon_redeem,
          COUNT(*) FILTER (WHERE status = 'CANCELLED' AND created_at >= ${since}) AS cancelled,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${since} AND team_member_id IS NOT NULL) AS by_team,
          COALESCE(SUM(stamps) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${since} AND type = 'EARN_STAMPS'), 0) AS stamps_issued,
          COALESCE(SUM(stamps) FILTER (WHERE status = 'ACTIVE' AND created_at < ${since} AND type = 'EARN_STAMPS'), 0) AS stamps_issued_prev,
          COALESCE(SUM(stamps) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${since} AND type = 'REDEEM_REWARD'), 0) AS stamps_redeemed,
          COALESCE(SUM(amount) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${since} AND type = 'EARN_STAMPS'), 0) AS amount_tracked,
          COALESCE(SUM(amount) FILTER (WHERE status = 'ACTIVE' AND created_at < ${since} AND type = 'EARN_STAMPS'), 0) AS amount_tracked_prev
        FROM transactions
        WHERE created_at >= ${prevSince}
      `,

      // ── Daily series (Morocco calendar days)
      q.queryRaw<{ k: string; d: string; n: bigint }>`
        SELECT 'merchants' AS k, to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca', 'YYYY-MM-DD') AS d, COUNT(*) AS n
        FROM merchants WHERE deleted_at IS NULL AND created_at >= ${since} GROUP BY 2
        UNION ALL
        SELECT 'clients', to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca', 'YYYY-MM-DD'), COUNT(*)
        FROM clients WHERE deleted_at IS NULL AND NOT is_anonymous AND created_at >= ${since} GROUP BY 2
        UNION ALL
        SELECT 'transactions', to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca', 'YYYY-MM-DD'), COUNT(*)
        FROM transactions WHERE status = 'ACTIVE' AND created_at >= ${since} GROUP BY 2
        UNION ALL
        SELECT 'activeClients', to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca', 'YYYY-MM-DD'), COUNT(DISTINCT client_id)
        FROM transactions WHERE status = 'ACTIVE' AND created_at >= ${since} GROUP BY 2
      `,

      // ── Weekday × hour heatmap of transactions (Morocco time)
      q.queryRaw<{ dow: number; h: number; n: bigint }>`
        SELECT EXTRACT(ISODOW FROM local_ts)::int AS dow, EXTRACT(HOUR FROM local_ts)::int AS h, COUNT(*) AS n
        FROM (
          SELECT (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca' AS local_ts
          FROM transactions WHERE status = 'ACTIVE' AND created_at >= ${since}
        ) s
        GROUP BY 1, 2
      `,

      // ── Categories: supply (merchants) vs usage (cards, transactions)
      q.queryRaw<Row>`
        WITH tx AS (
          SELECT merchant_id, COUNT(*) AS n FROM transactions
          WHERE status = 'ACTIVE' AND created_at >= ${since} GROUP BY merchant_id
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
      `,

      // ── Cities
      q.queryRaw<Row>`
        WITH tx AS (
          SELECT merchant_id, COUNT(*) AS n FROM transactions
          WHERE status = 'ACTIVE' AND created_at >= ${since} GROUP BY merchant_id
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
      `,

      // ── Top merchants of the period
      q.queryRaw<Row>`
        SELECT m.id, m.nom, m.categorie::text AS category, m.ville, m.plan::text AS plan,
               m.plan_activated_by_admin AS paid,
               COUNT(t.id) AS transactions,
               COUNT(DISTINCT t.client_id) AS clients,
               COUNT(t.id) FILTER (WHERE t.type = 'REDEEM_REWARD') AS redeems
        FROM transactions t
        JOIN merchants m ON m.id = t.merchant_id
        WHERE t.status = 'ACTIVE' AND t.created_at >= ${since} AND m.deleted_at IS NULL
        GROUP BY m.id
        ORDER BY transactions DESC
        LIMIT 10
      `,

      // ── Trials ending within 7 days (sales follow-up list)
      q.queryRaw<Row>`
        SELECT m.id, m.nom, m.email, m.phone_number AS phone, m.plan_expires_at AS expires_at,
               (SELECT COUNT(*) FROM loyalty_cards lc WHERE lc.merchant_id = m.id) AS clients,
               (SELECT COUNT(*) FROM transactions t WHERE t.merchant_id = m.id AND t.status = 'ACTIVE') AS transactions
        FROM merchants m
        WHERE m.deleted_at IS NULL AND m.is_active
          AND m.plan = 'PREMIUM' AND NOT m.plan_activated_by_admin
          AND m.plan_expires_at > ${now} AND m.plan_expires_at <= ${in7}
        ORDER BY m.plan_expires_at ASC
        LIMIT 15
      `,

      // ── Dormant merchants: used the app before, nothing for 30 days
      q.queryRaw<Row>`
        WITH tx AS (
          SELECT merchant_id, MAX(created_at) AS last_at, COUNT(*) AS total
          FROM transactions WHERE status = 'ACTIVE' GROUP BY merchant_id
        )
        SELECT m.id, m.nom, m.email, m.phone_number AS phone, m.plan::text AS plan, tx.last_at, tx.total AS transactions,
               (SELECT COUNT(*) FROM loyalty_cards lc WHERE lc.merchant_id = m.id) AS clients
        FROM merchants m
        JOIN tx ON tx.merchant_id = m.id
        WHERE m.deleted_at IS NULL AND m.is_active AND tx.last_at < ${d30}
        ORDER BY clients DESC, tx.last_at DESC
        LIMIT 15
      `,

      // ── Scratch cards
      q.queryRaw<Row>`
        SELECT
          (SELECT COUNT(*) FROM scratch_campaigns WHERE created_at >= ${since} AND status <> 'DRAFT') AS campaigns_period,
          (SELECT COUNT(*) FROM scratch_campaigns WHERE status IN ('SCHEDULED', 'SENDING')) AS scheduled,
          (SELECT COUNT(*) FROM scratch_campaigns WHERE status = 'SENT' AND card_expires_at > ${now}) AS live,
          (SELECT COUNT(*) FROM scratch_campaigns WHERE status = 'CANCELLED' AND created_at >= ${since}) AS cancelled,
          COUNT(*) AS cards,
          COUNT(*) FILTER (WHERE sc.push_sent_at IS NOT NULL) AS pushed,
          COUNT(*) FILTER (WHERE sc.opened_at IS NOT NULL OR sc.scratched_at IS NOT NULL) AS opened,
          COUNT(*) FILTER (WHERE sc.status = 'SCRATCHED') AS scratched,
          COUNT(*) FILTER (WHERE sc.status = 'EXPIRED') AS expired,
          COUNT(*) FILTER (WHERE sc.status = 'PENDING') AS pending
        FROM scratch_cards sc
        WHERE sc.created_at >= ${since}
      `,

      // ── Coupons by source
      q.queryRaw<Row>`
        SELECT source::text AS source,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'REDEEMED') AS redeemed,
               COUNT(*) FILTER (WHERE status = 'EXPIRED') AS expired,
               COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
               COALESCE(SUM(discount_amount) FILTER (WHERE status = 'REDEEMED'), 0) AS discount,
               COALESCE(SUM(purchase_amount) FILTER (WHERE status = 'REDEEMED'), 0) AS purchase
        FROM coupons
        WHERE created_at >= ${since}
        GROUP BY source
      `,

      // ── Coupons by reward type (which offer converts best)
      q.queryRaw<Row>`
        SELECT type::text AS type,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'REDEEMED') AS redeemed
        FROM coupons
        WHERE created_at >= ${since}
        GROUP BY type
        ORDER BY total DESC
      `,

      // ── Lucky wheel
      q.queryRaw<Row>`
        SELECT
          (SELECT COUNT(*) FROM lucky_wheel_campaigns
            WHERE status = 'ACTIVE' AND starts_at <= ${now} AND ends_at > ${now}) AS live,
          (SELECT COUNT(*) FROM lucky_wheel_campaigns WHERE created_at >= ${since} AND status <> 'DRAFT') AS campaigns_period,
          (SELECT COUNT(*) FROM lucky_wheel_tickets WHERE created_at >= ${since}) AS tickets,
          (SELECT COUNT(*) FROM lucky_wheel_tickets WHERE created_at >= ${since} AND used) AS used,
          (SELECT COUNT(*) FROM lucky_wheel_draws WHERE created_at >= ${since}) AS draws,
          (SELECT COUNT(*) FROM lucky_wheel_draws WHERE created_at >= ${since} AND result = 'WON') AS won,
          (SELECT COUNT(*) FROM lucky_wheel_draws WHERE created_at >= ${since} AND fulfilment = 'CLAIMED') AS claimed,
          (SELECT COUNT(*) FROM lucky_wheel_draws WHERE created_at >= ${since} AND fulfilment = 'EXPIRED') AS expired,
          (SELECT COUNT(*) FROM lucky_wheel_draws WHERE fulfilment = 'PENDING') AS pending_all,
          (SELECT COUNT(*) FROM lucky_wheel_prizes p JOIN lucky_wheel_campaigns c ON c.id = p.campaign_id
            WHERE c.status = 'ACTIVE' AND c.ends_at > ${now} AND p.remaining = 0) AS out_of_stock
      `,

      // ── Misc engagement, moderation, ops queues
      q.queryRaw<Row>`
        SELECT
          (SELECT COUNT(*) FROM client_claims WHERE created_at >= ${since}) AS claims_created,
          (SELECT COUNT(*) FROM client_claims WHERE created_at >= ${since} AND consumed_at IS NOT NULL) AS claims_consumed,
          (SELECT COUNT(*) FROM client_merchant_blocks) AS blocks_total,
          (SELECT COUNT(*) FROM client_merchant_blocks WHERE created_at >= ${since}) AS blocks_period,
          (SELECT COUNT(*) FROM profile_views_log WHERE created_at >= ${since}) AS profile_views,
          (SELECT COUNT(*) FROM profile_views_log WHERE created_at >= ${prevSince} AND created_at < ${since}) AS profile_views_prev,
          (SELECT COUNT(*) FROM loyalty_cards WHERE created_at >= ${since}) AS cards_period,
          (SELECT COUNT(*) FROM loyalty_cards WHERE created_at >= ${prevSince} AND created_at < ${since}) AS cards_prev,
          (SELECT COUNT(*) FROM merchant_inbox_notifications WHERE created_at >= ${since}) AS inbox_sent,
          (SELECT COUNT(*) FROM merchant_inbox_notifications WHERE created_at >= ${since} AND read_at IS NOT NULL) AS inbox_read,
          (SELECT COUNT(*) FROM notifications WHERE created_at >= ${since} AND merchant_id IS NOT NULL) AS merchant_campaigns,
          (SELECT COUNT(*) FROM notifications WHERE created_at >= ${since} AND merchant_id IS NULL) AS admin_campaigns,
          (SELECT COALESCE(SUM(recipient_count), 0) FROM notifications WHERE created_at >= ${since}) AS notif_recipients,
          (SELECT COALESCE(SUM(success_count), 0) FROM notifications WHERE created_at >= ${since}) AS notif_success,
          (SELECT COUNT(*) FROM client_notification_statuses WHERE created_at >= ${since}) AS client_notif_delivered,
          (SELECT COUNT(*) FROM client_notification_statuses WHERE created_at >= ${since} AND is_read) AS client_notif_read,
          (SELECT COUNT(*) FROM payout_requests WHERE status = 'PENDING') AS payouts_pending,
          (SELECT COALESCE(SUM(amount), 0) FROM payout_requests WHERE status = 'PENDING') AS payouts_pending_amount,
          (SELECT COUNT(*) FROM client_referrals WHERE status = 'PENDING') AS client_referrals_pending,
          (SELECT COUNT(*) FROM merchants WHERE deleted_at IS NULL AND referred_by_id IS NOT NULL AND created_at >= ${since}) AS merchant_referrals_period,
          (SELECT COUNT(*) FROM team_members WHERE is_active) AS team_members,
          (SELECT COUNT(*) FROM stores WHERE is_active) AS stores,
          (SELECT COUNT(*) FROM transactions WHERE status = 'ACTIVE' AND gift_status = 'PENDING') AS pending_gifts,
          (SELECT COUNT(*) FROM transactions WHERE status = 'ACTIVE' AND gift_status = 'PENDING' AND created_at < ${d7}) AS pending_gifts_old
      `,

      // ── Most blocked merchants (moderation signal)
      q.queryRaw<Row>`
        SELECT m.id, m.nom, m.categorie::text AS category, COUNT(*) AS blocks
        FROM client_merchant_blocks b
        JOIN merchants m ON m.id = b.merchant_id
        WHERE m.deleted_at IS NULL
        GROUP BY m.id
        ORDER BY blocks DESC
        LIMIT 5
      `,

      // ── App languages
      q.queryRaw<{ audience: string; language: string; n: bigint }>`
        SELECT 'merchants' AS audience, language, COUNT(*) AS n FROM merchants WHERE deleted_at IS NULL GROUP BY language
        UNION ALL
        SELECT 'clients', language, COUNT(*) FROM clients WHERE deleted_at IS NULL AND NOT is_anonymous GROUP BY language
      `,

      // ── Loyalty health: cards ready for a reward but not redeemed yet
      q.queryRaw<Row>`
        SELECT
          COUNT(*) AS cards,
          COUNT(*) FILTER (WHERE lc.stamps >= m.stamps_for_reward) AS rewards_ready,
          COUNT(*) FILTER (WHERE lc.stamps = 0) AS empty_cards,
          COUNT(*) FILTER (WHERE lc.last_visit_at < ${d30}) AS inactive_cards,
          COALESCE(AVG(lc.stamps), 0) AS avg_stamps
        FROM loyalty_cards lc
        JOIN merchants m ON m.id = lc.merchant_id
        WHERE lc.deactivated_at IS NULL AND m.deleted_at IS NULL
      `,
    ]);

    const m = merchantRows[0] ?? {};
    const c = clientRows[0] ?? {};
    const a = activityRows[0] ?? {};
    const t = txRows[0] ?? {};
    const s = scratchRows[0] ?? {};
    const w = wheelRows[0] ?? {};
    const x = miscRows[0] ?? {};
    const l = loyaltyRows[0] ?? {};

    // Daily buckets: one entry per Morocco calendar day, oldest first
    const dailyMap = new Map<string, { merchants: number; clients: number; transactions: number; activeClients: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const ymd = moroccoParts(new Date(now.getTime() - i * DAY_MS)).ymd;
      dailyMap.set(ymd, { merchants: 0, clients: 0, transactions: 0, activeClients: 0 });
    }
    for (const r of dailyRows) {
      const bucket = dailyMap.get(r.d);
      if (bucket && r.k in bucket) bucket[r.k as keyof typeof bucket] = num(r.n);
    }
    const daily = [...dailyMap.entries()].map(([date, v]) => ({ date, ...v }));

    // 7 × 24 matrix, Monday first
    const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const r of heatmapRows) {
      const dow = num(r.dow);
      const h = num(r.h);
      if (dow >= 1 && dow <= 7 && h >= 0 && h < 24) heatmap[dow - 1][h] = num(r.n);
    }

    const coupons = {
      bySource: couponSourceRows.map((r) => ({
        source: String(r.source),
        total: num(r.total),
        redeemed: num(r.redeemed),
        expired: num(r.expired),
        active: num(r.active),
        discount: num(r.discount),
        purchase: num(r.purchase),
      })),
      byType: couponTypeRows.map((r) => ({
        type: String(r.type),
        total: num(r.total),
        redeemed: num(r.redeemed),
        redemptionRate: pct(num(r.redeemed), num(r.total)),
      })),
    };
    const couponTotals = coupons.bySource.reduce(
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

    const mTotal = num(m.total);
    const cRegistered = num(c.registered);
    const mau = num(a.mau);

    const languages: Record<'merchants' | 'clients', { language: string; count: number }[]> = { merchants: [], clients: [] };
    for (const r of languageRows) {
      const key = r.audience === 'merchants' ? 'merchants' : 'clients';
      languages[key].push({ language: r.language, count: num(r.n) });
    }
    languages.merchants.sort((p, n) => n.count - p.count);
    languages.clients.sort((p, n) => n.count - p.count);

    return {
      period: { days, since: since.toISOString(), until: now.toISOString() },
      generatedAt: now.toISOString(),
      merchants: {
        total: mTotal,
        activeAccounts: num(m.active_accounts),
        banned: num(m.banned),
        newPeriod: num(m.new_period),
        newPrev: num(m.new_prev),
        activePeriod: num(m.active_period),
        dormant: num(m.dormant),
        neverUsed: num(m.never_used),
        onboarded: num(m.onboarded),
        withTransaction: num(m.with_tx),
        funnel: {
          registered: mTotal,
          withReward: num(m.with_reward),
          firstTransaction: num(m.funnel_tx),
          tenClients: num(m.funnel_10),
          paid: num(m.funnel_paid),
        },
        plans: {
          paid: num(m.paid),
          trialActive: num(m.trial_active),
          free: Math.max(0, mTotal - num(m.paid) - num(m.trial_active)),
          trialEnding7d: num(m.trial_ending_7d),
          paidEnding7d: num(m.paid_ending_7d),
          trialsFinished: num(m.trials_finished),
          trialsConverted: num(m.trials_converted),
          trialConversionRate: pct(num(m.trials_converted), num(m.trials_finished)),
        },
        profile: {
          logo: num(m.with_logo),
          cover: num(m.with_cover),
          location: num(m.with_location),
          description: num(m.with_description),
          openingHours: num(m.with_hours),
          socialLinks: num(m.with_socials),
          pushEnabled: num(m.with_push),
        },
        features: {
          stampExpiry: num(m.with_stamp_expiry),
          perAmountMode: num(m.per_amount),
          team: num(m.with_team),
          multiStore: num(m.multi_store),
          scratchCards: num(m.uses_scratch),
          luckyWheel: num(m.uses_wheel),
          quickAdd: num(m.uses_quick_add),
          notifications: num(m.uses_notifications),
        },
        acquisition: {
          referredByMerchant: num(m.referred_by_merchant),
          referredByClient: num(m.referred_by_client),
          google: num(m.via_google),
          apple: num(m.via_apple),
        },
        avgStampsForReward: Math.round(num(m.avg_stamps_for_reward) * 10) / 10,
      },
      clients: {
        total: num(c.total),
        registered: cRegistered,
        anonymous: num(c.anonymous),
        newPeriod: num(c.new_period),
        newPrev: num(c.new_prev),
        activePeriod: num(c.active_period),
        returningPeriod: num(c.returning_period),
        activePrev: num(c.active_prev),
        retained: num(c.retained),
        retentionRate: pct(num(c.retained), num(c.active_prev)),
        reachability: {
          push: num(c.push_reachable),
          email: num(c.email_reachable),
          whatsapp: num(c.whatsapp_reachable),
        },
        acquisition: {
          google: num(c.via_google),
          apple: num(c.via_apple),
          phone: num(c.via_phone),
          email: num(c.via_email),
        },
        cards: {
          none: num(c.no_card),
          one: num(c.one_card),
          twoToThree: num(c.two_three_cards),
          fourPlus: num(c.four_plus_cards),
          average: Math.round(num(c.avg_cards) * 100) / 100,
        },
        withBirthday: num(c.with_birthday),
        noShareInfo: num(c.no_share_info),
      },
      activity: {
        dau: num(a.dau),
        wau: num(a.wau),
        mau,
        stickiness: pct(num(a.dau), mau),
        merchantDau: num(a.merchant_dau),
        merchantWau: num(a.merchant_wau),
        merchantMau: num(a.merchant_mau),
      },
      transactions: {
        total: num(t.total),
        totalPrev: num(t.total_prev),
        earn: num(t.earn),
        redeem: num(t.redeem),
        redeemPrev: num(t.redeem_prev),
        adjust: num(t.adjust),
        luckyWheelWin: num(t.wheel_win),
        couponRedeem: num(t.coupon_redeem),
        cancelled: num(t.cancelled),
        cancelRate: pct(num(t.cancelled), num(t.total) + num(t.cancelled)),
        byTeam: num(t.by_team),
        stampsIssued: num(t.stamps_issued),
        stampsIssuedPrev: num(t.stamps_issued_prev),
        stampsRedeemed: num(t.stamps_redeemed),
        amountTracked: Math.round(num(t.amount_tracked)),
        amountTrackedPrev: Math.round(num(t.amount_tracked_prev)),
        avgPerActiveMerchant: num(m.active_period) > 0 ? Math.round(num(t.total) / num(m.active_period)) : 0,
        avgPerActiveClient: num(c.active_period) > 0 ? Math.round((num(t.total) / num(c.active_period)) * 10) / 10 : 0,
      },
      loyalty: {
        activeCards: num(l.cards),
        newCards: num(x.cards_period),
        newCardsPrev: num(x.cards_prev),
        rewardsReady: num(l.rewards_ready),
        emptyCards: num(l.empty_cards),
        inactiveCards: num(l.inactive_cards),
        avgStamps: Math.round(num(l.avg_stamps) * 10) / 10,
        pendingGifts: num(x.pending_gifts),
        pendingGiftsOld: num(x.pending_gifts_old),
      },
      scratch: {
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
      },
      luckyWheel: {
        live: num(w.live),
        campaignsPeriod: num(w.campaigns_period),
        tickets: num(w.tickets),
        used: num(w.used),
        draws: num(w.draws),
        won: num(w.won),
        claimed: num(w.claimed),
        expired: num(w.expired),
        pendingAll: num(w.pending_all),
        outOfStock: num(w.out_of_stock),
        winRate: pct(num(w.won), num(w.draws)),
        claimRate: pct(num(w.claimed), num(w.won)),
      },
      coupons: {
        ...coupons,
        totals: { ...couponTotals, redemptionRate: pct(couponTotals.redeemed, couponTotals.total) },
      },
      engagement: {
        claimsCreated: num(x.claims_created),
        claimsConsumed: num(x.claims_consumed),
        claimRate: pct(num(x.claims_consumed), num(x.claims_created)),
        profileViews: num(x.profile_views),
        profileViewsPrev: num(x.profile_views_prev),
        inboxSent: num(x.inbox_sent),
        inboxRead: num(x.inbox_read),
        inboxReadRate: pct(num(x.inbox_read), num(x.inbox_sent)),
        merchantCampaigns: num(x.merchant_campaigns),
        adminCampaigns: num(x.admin_campaigns),
        notifRecipients: num(x.notif_recipients),
        notifSuccess: num(x.notif_success),
        notifSuccessRate: pct(num(x.notif_success), num(x.notif_recipients)),
        clientNotifDelivered: num(x.client_notif_delivered),
        clientNotifRead: num(x.client_notif_read),
        clientNotifReadRate: pct(num(x.client_notif_read), num(x.client_notif_delivered)),
        teamMembers: num(x.team_members),
        stores: num(x.stores),
      },
      moderation: {
        blocksTotal: num(x.blocks_total),
        blocksPeriod: num(x.blocks_period),
        topBlocked: blockedRows.map((r) => ({
          id: String(r.id),
          nom: String(r.nom),
          category: String(r.category),
          blocks: num(r.blocks),
        })),
      },
      ops: {
        payoutsPending: num(x.payouts_pending),
        payoutsPendingAmount: num(x.payouts_pending_amount),
        clientReferralsPending: num(x.client_referrals_pending),
        merchantReferralsPeriod: num(x.merchant_referrals_period),
      },
      daily,
      heatmap,
      categories: categoryRows.map((r) => ({
        category: String(r.category),
        merchants: num(r.merchants),
        active: num(r.active),
        cards: num(r.cards),
        transactions: num(r.transactions),
      })),
      cities: cityRows.map((r) => ({
        city: String(r.city),
        merchants: num(r.merchants),
        active: num(r.active),
        transactions: num(r.transactions),
      })),
      languages,
      topMerchants: topMerchantRows.map((r) => ({
        id: String(r.id),
        nom: String(r.nom),
        category: String(r.category),
        ville: (r.ville as string | null) ?? null,
        plan: String(r.plan),
        paid: Boolean(r.paid),
        transactions: num(r.transactions),
        clients: num(r.clients),
        redeems: num(r.redeems),
      })),
      trialsEnding: trialEndingRows.map((r) => ({
        id: String(r.id),
        nom: String(r.nom),
        email: String(r.email),
        phone: (r.phone as string | null) ?? null,
        expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : String(r.expires_at),
        clients: num(r.clients),
        transactions: num(r.transactions),
      })),
      dormantMerchants: dormantRows.map((r) => ({
        id: String(r.id),
        nom: String(r.nom),
        email: String(r.email),
        phone: (r.phone as string | null) ?? null,
        plan: String(r.plan),
        lastActivityAt: r.last_at instanceof Date ? r.last_at.toISOString() : String(r.last_at),
        transactions: num(r.transactions),
        clients: num(r.clients),
      })),
    };
  }
}
