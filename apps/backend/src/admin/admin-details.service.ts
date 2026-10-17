import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RAW_QUERY_RUNNER, type IRawQueryRunner } from '../common/repositories';
import { moroccoParts } from '../common/utils/morocco-time';

const DAY_MS = 24 * 60 * 60 * 1000;
const ALERTS_CACHE_TTL = 60_000;

export const NOTIF_STATS_PERIODS = [7, 30, 90] as const;
export type NotifStatsPeriod = (typeof NOTIF_STATS_PERIODS)[number];

type Row = Record<string, unknown>;

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

function iso(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

/** One bucket per Morocco calendar day, oldest first, ending today. */
function dayBuckets<T>(days: number, now: Date, empty: () => T): Map<string, T> {
  const map = new Map<string, T>();
  for (let i = days - 1; i >= 0; i--) {
    map.set(moroccoParts(new Date(now.getTime() - i * DAY_MS)).ymd, empty());
  }
  return map;
}

/**
 * Drill-down analytics for the admin back-office: merchant and client
 * activity, notification performance, list enrichment and the alert badges.
 * Raw SQL bypasses the soft-delete middleware on purpose so deleted or
 * deactivated accounts stay inspectable.
 */
@Injectable()
export class AdminDetailsService {
  constructor(
    @Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // ── List enrichment ─────────────────────────────────────────────────────

  async merchantActivityByIds(ids: string[]): Promise<Map<string, { lastActivityAt: string | null; transactions30d: number }>> {
    const out = new Map<string, { lastActivityAt: string | null; transactions30d: number }>();
    if (ids.length === 0) return out;
    const d30 = new Date(Date.now() - 30 * DAY_MS);
    const rows = await this.rawQuery.queryRaw<Row>`
      SELECT merchant_id, MAX(created_at) AS last_at, COUNT(*) FILTER (WHERE created_at >= ${d30}) AS n30
      FROM transactions
      WHERE status = 'ACTIVE' AND merchant_id = ANY(${ids}::text[])
      GROUP BY merchant_id
    `;
    for (const r of rows) {
      out.set(String(r.merchant_id), { lastActivityAt: iso(r.last_at), transactions30d: num(r.n30) });
    }
    return out;
  }

  async clientActivityByIds(ids: string[]): Promise<Map<string, { lastActivityAt: string | null; transactionCount: number }>> {
    const out = new Map<string, { lastActivityAt: string | null; transactionCount: number }>();
    if (ids.length === 0) return out;
    const rows = await this.rawQuery.queryRaw<Row>`
      SELECT client_id, MAX(created_at) AS last_at, COUNT(*) AS n
      FROM transactions
      WHERE status = 'ACTIVE' AND client_id = ANY(${ids}::text[])
      GROUP BY client_id
    `;
    for (const r of rows) {
      out.set(String(r.client_id), { lastActivityAt: iso(r.last_at), transactionCount: num(r.n) });
    }
    return out;
  }

  async notificationReadsByIds(ids: string[]): Promise<Map<string, { delivered: number; read: number }>> {
    const out = new Map<string, { delivered: number; read: number }>();
    if (ids.length === 0) return out;
    const rows = await this.rawQuery.queryRaw<Row>`
      SELECT notification_id, COUNT(*) AS delivered, COUNT(*) FILTER (WHERE is_read) AS read
      FROM client_notification_statuses
      WHERE notification_id = ANY(${ids}::text[])
      GROUP BY notification_id
    `;
    for (const r of rows) {
      out.set(String(r.notification_id), { delivered: num(r.delivered), read: num(r.read) });
    }
    return out;
  }

  async merchantFacets() {
    const [cities, categories] = await Promise.all([
      this.rawQuery.queryRaw<Row>`
        SELECT ville, COUNT(*) AS n FROM merchants
        WHERE deleted_at IS NULL AND COALESCE(TRIM(ville), '') <> ''
        GROUP BY ville ORDER BY n DESC, ville ASC LIMIT 100
      `,
      this.rawQuery.queryRaw<Row>`
        SELECT categorie::text AS categorie, COUNT(*) AS n FROM merchants
        WHERE deleted_at IS NULL GROUP BY categorie ORDER BY n DESC
      `,
    ]);
    return {
      cities: cities.map((r) => ({ value: String(r.ville), count: num(r.n) })),
      categories: categories.map((r) => ({ value: String(r.categorie), count: num(r.n) })),
    };
  }

  // ── Merchant drill-down ─────────────────────────────────────────────────

  async getMerchantActivity(merchantId: string) {
    const q = this.rawQuery;
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * DAY_MS);
    const d60 = new Date(now.getTime() - 60 * DAY_MS);
    const d90 = new Date(now.getTime() - 90 * DAY_MS);

    const [merchant] = await q.queryRaw<Row>`
      SELECT m.id, m.stamps_for_reward, m.stamp_earning_mode::text AS stamp_earning_mode, m.amount_per_stamp,
             m.accumulation_limit, m.stamp_validity_days, m.language, m.onboarding_completed, m.email_verified,
             m.logo_url IS NOT NULL AS has_logo, m.cover_url IS NOT NULL AS has_cover,
             (m.latitude IS NOT NULL AND m.longitude IS NOT NULL) AS has_location,
             COALESCE(m.description, '') <> '' AS has_description, m.opening_hours IS NOT NULL AS has_hours,
             m.social_links IS NOT NULL AS has_socials, m.push_token IS NOT NULL AS has_push,
             COALESCE(array_length(m.gallery, 1), 0) AS gallery_count,
             m."whatsappQuotaUsed" AS whatsapp_quota_used, m."whatsappQuotaMax" AS whatsapp_quota_max,
             m."emailQuotaUsed" AS email_quota_used, m."emailQuotaMax" AS email_quota_max,
             m.referral_code, m.referral_months_earned, m.deleted_at, m.quartier, m.adresse,
             r.id AS referred_by_id, r.nom AS referred_by_nom,
             (SELECT COUNT(*) FROM merchants x WHERE x.referred_by_id = m.id AND x.deleted_at IS NULL) AS referrals
      FROM merchants m
      LEFT JOIN merchants r ON r.id = m.referred_by_id
      WHERE m.id = ${merchantId}
    `;
    if (!merchant) throw new NotFoundException('Commerçant non trouvé');

    const [txRows, cardRows, dailyRows, topClientRows, recentRows, rewardRows, teamRows, storeRows, featureRows, channelRows] =
      await Promise.all([
        q.queryRaw<Row>`
          SELECT
            COUNT(*) FILTER (WHERE status = 'ACTIVE') AS total,
            COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
            COUNT(*) FILTER (WHERE status = 'ACTIVE' AND type = 'EARN_STAMPS') AS earn,
            COUNT(*) FILTER (WHERE status = 'ACTIVE' AND type = 'REDEEM_REWARD') AS redeem,
            COUNT(*) FILTER (WHERE status = 'ACTIVE' AND type = 'ADJUST_STAMPS') AS adjust,
            COUNT(*) FILTER (WHERE status = 'ACTIVE' AND type = 'LUCKY_WHEEL_WIN') AS wheel,
            COUNT(*) FILTER (WHERE status = 'ACTIVE' AND type = 'COUPON_REDEEM') AS coupon,
            COALESCE(SUM(stamps) FILTER (WHERE status = 'ACTIVE' AND type = 'EARN_STAMPS'), 0) AS stamps_given,
            COALESCE(SUM(amount) FILTER (WHERE status = 'ACTIVE'), 0) AS amount,
            COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${d30}) AS last30,
            COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${d60} AND created_at < ${d30}) AS prev30,
            COUNT(DISTINCT client_id) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${d30}) AS active_clients30,
            COUNT(*) FILTER (WHERE status = 'ACTIVE' AND gift_status = 'PENDING') AS pending_gifts,
            MIN(created_at) FILTER (WHERE status = 'ACTIVE') AS first_at,
            MAX(created_at) FILTER (WHERE status = 'ACTIVE') AS last_at
          FROM transactions WHERE merchant_id = ${merchantId}
        `,
        q.queryRaw<Row>`
          WITH visits AS (
            SELECT client_id, COUNT(*) AS n FROM transactions
            WHERE merchant_id = ${merchantId} AND status = 'ACTIVE' AND type = 'EARN_STAMPS'
            GROUP BY client_id
          )
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE lc.deactivated_at IS NULL) AS active,
            COUNT(*) FILTER (WHERE lc.created_at >= ${d30}) AS new30,
            COUNT(*) FILTER (WHERE lc.deactivated_at IS NULL AND lc.stamps >= ${num(merchant.stamps_for_reward)}) AS reward_ready,
            COUNT(*) FILTER (WHERE v.n >= 2) AS returning,
            COALESCE(AVG(lc.stamps) FILTER (WHERE lc.deactivated_at IS NULL), 0) AS avg_stamps,
            (SELECT COUNT(*) FROM client_merchant_blocks b WHERE b.merchant_id = ${merchantId}) AS blocks
          FROM loyalty_cards lc
          LEFT JOIN visits v ON v.client_id = lc.client_id
          WHERE lc.merchant_id = ${merchantId}
        `,
        q.queryRaw<Row>`
          SELECT 'transactions' AS k, to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca', 'YYYY-MM-DD') AS d, COUNT(*) AS n
          FROM transactions WHERE merchant_id = ${merchantId} AND status = 'ACTIVE' AND created_at >= ${d90} GROUP BY 2
          UNION ALL
          SELECT 'clients', to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca', 'YYYY-MM-DD'), COUNT(DISTINCT client_id)
          FROM transactions WHERE merchant_id = ${merchantId} AND status = 'ACTIVE' AND created_at >= ${d90} GROUP BY 2
          UNION ALL
          SELECT 'newCards', to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca', 'YYYY-MM-DD'), COUNT(*)
          FROM loyalty_cards WHERE merchant_id = ${merchantId} AND created_at >= ${d90} GROUP BY 2
        `,
        q.queryRaw<Row>`
          SELECT c.id, c.prenom, c.nom, c.telephone, c.is_anonymous, c.deleted_at IS NOT NULL AS deleted,
                 lc.stamps, COUNT(t.id) AS visits, MAX(t.created_at) AS last_at, COALESCE(SUM(t.amount), 0) AS amount
          FROM transactions t
          JOIN clients c ON c.id = t.client_id
          LEFT JOIN loyalty_cards lc ON lc.client_id = t.client_id AND lc.merchant_id = t.merchant_id
          WHERE t.merchant_id = ${merchantId} AND t.status = 'ACTIVE'
          GROUP BY c.id, lc.stamps
          ORDER BY visits DESC, last_at DESC
          LIMIT 10
        `,
        q.queryRaw<Row>`
          SELECT t.id, t.type::text AS type, t.status::text AS status, t.stamps, t.amount, t.created_at,
                 t.performed_by_name, t.gift_status::text AS gift_status, c.id AS client_id, c.prenom, c.nom, rw.titre AS reward
          FROM transactions t
          JOIN clients c ON c.id = t.client_id
          LEFT JOIN rewards rw ON rw.id = t.reward_id
          WHERE t.merchant_id = ${merchantId}
          ORDER BY t.created_at DESC
          LIMIT 15
        `,
        q.queryRaw<Row>`
          SELECT rw.id, rw.titre, rw.cout, rw.created_at,
                 (SELECT COUNT(*) FROM transactions t WHERE t.reward_id = rw.id AND t.status = 'ACTIVE' AND t.type = 'REDEEM_REWARD') AS redeemed
          FROM rewards rw WHERE rw.merchant_id = ${merchantId}
          ORDER BY rw.cout ASC
        `,
        q.queryRaw<Row>`
          SELECT tm.id, tm.nom, tm.role::text AS role, tm.is_active,
                 (SELECT COUNT(*) FROM transactions t WHERE t.team_member_id = tm.id AND t.status = 'ACTIVE') AS tx
          FROM team_members tm WHERE tm.merchant_id = ${merchantId}
          ORDER BY tm.created_at ASC
        `,
        q.queryRaw<Row>`
          SELECT id, nom, ville, quartier, is_active FROM stores WHERE merchant_id = ${merchantId} ORDER BY created_at ASC
        `,
        q.queryRaw<Row>`
          SELECT
            (SELECT COUNT(*) FROM scratch_campaigns WHERE merchant_id = ${merchantId} AND status NOT IN ('DRAFT', 'CANCELLED')) AS scratch_campaigns,
            (SELECT COUNT(*) FROM scratch_cards WHERE merchant_id = ${merchantId}) AS scratch_cards,
            (SELECT COUNT(*) FROM scratch_cards WHERE merchant_id = ${merchantId} AND status = 'SCRATCHED') AS scratch_scratched,
            (SELECT COUNT(*) FROM lucky_wheel_campaigns WHERE merchant_id = ${merchantId} AND status <> 'DRAFT') AS wheel_campaigns,
            (SELECT COUNT(*) FROM lucky_wheel_campaigns WHERE merchant_id = ${merchantId} AND status = 'ACTIVE' AND ends_at > ${now}) AS wheel_active,
            (SELECT COUNT(*) FROM coupons WHERE merchant_id = ${merchantId}) AS coupons,
            (SELECT COUNT(*) FROM coupons WHERE merchant_id = ${merchantId} AND status = 'REDEEMED') AS coupons_redeemed,
            (SELECT COUNT(*) FROM client_claims WHERE merchant_id = ${merchantId}) AS claims,
            (SELECT COUNT(*) FROM client_claims WHERE merchant_id = ${merchantId} AND consumed_at IS NOT NULL) AS claims_consumed,
            (SELECT COUNT(*) FROM profile_views_log WHERE merchant_id = ${merchantId} AND created_at >= ${d30}) AS views30
        `,
        q.queryRaw<Row>`
          SELECT COALESCE(channel, 'PUSH') AS channel, COUNT(*) AS campaigns, COALESCE(SUM(recipient_count), 0) AS recipients,
                 COALESCE(SUM(success_count), 0) AS success, MAX(created_at) AS last_at
          FROM notifications WHERE merchant_id = ${merchantId}
          GROUP BY 1 ORDER BY campaigns DESC
        `,
      ]);

    const t = txRows[0] ?? {};
    const c = cardRows[0] ?? {};
    const f = featureRows[0] ?? {};

    const daily = dayBuckets(90, now, () => ({ transactions: 0, clients: 0, newCards: 0 }));
    for (const r of dailyRows) {
      const b = daily.get(String(r.d));
      if (b) b[String(r.k) as 'transactions' | 'clients' | 'newCards'] = num(r.n);
    }

    const totalCards = num(c.total);
    const profileChecks = {
      logo: Boolean(merchant.has_logo),
      cover: Boolean(merchant.has_cover),
      location: Boolean(merchant.has_location),
      description: Boolean(merchant.has_description),
      openingHours: Boolean(merchant.has_hours),
      socialLinks: Boolean(merchant.has_socials),
      reward: rewardRows.length > 0,
      pushEnabled: Boolean(merchant.has_push),
    };
    const done = Object.values(profileChecks).filter(Boolean).length;

    return {
      settings: {
        stampEarningMode: String(merchant.stamp_earning_mode),
        stampsForReward: num(merchant.stamps_for_reward),
        amountPerStamp: num(merchant.amount_per_stamp),
        accumulationLimit: merchant.accumulation_limit === null ? null : num(merchant.accumulation_limit),
        stampValidityDays: merchant.stamp_validity_days === null ? null : num(merchant.stamp_validity_days),
        language: String(merchant.language ?? 'fr'),
        onboardingCompleted: Boolean(merchant.onboarding_completed),
        emailVerified: Boolean(merchant.email_verified),
        quartier: (merchant.quartier as string | null) ?? null,
        adresse: (merchant.adresse as string | null) ?? null,
        deletedAt: iso(merchant.deleted_at),
      },
      profile: { checks: profileChecks, score: Math.round((done / Object.keys(profileChecks).length) * 100), galleryCount: num(merchant.gallery_count) },
      quotas: {
        whatsapp: { used: num(merchant.whatsapp_quota_used), max: num(merchant.whatsapp_quota_max) },
        email: { used: num(merchant.email_quota_used), max: num(merchant.email_quota_max) },
      },
      referral: {
        code: (merchant.referral_code as string | null) ?? null,
        monthsEarned: num(merchant.referral_months_earned),
        referrals: num(merchant.referrals),
        referredBy: merchant.referred_by_id ? { id: String(merchant.referred_by_id), nom: String(merchant.referred_by_nom) } : null,
      },
      transactions: {
        total: num(t.total),
        cancelled: num(t.cancelled),
        cancelRate: pct(num(t.cancelled), num(t.total) + num(t.cancelled)),
        byType: {
          earn: num(t.earn),
          redeem: num(t.redeem),
          adjust: num(t.adjust),
          wheel: num(t.wheel),
          coupon: num(t.coupon),
        },
        stampsGiven: num(t.stamps_given),
        amount: Math.round(num(t.amount)),
        last30: num(t.last30),
        prev30: num(t.prev30),
        pendingGifts: num(t.pending_gifts),
        firstAt: iso(t.first_at),
        lastAt: iso(t.last_at),
      },
      clients: {
        cards: totalCards,
        active: num(c.active),
        new30: num(c.new30),
        active30: num(t.active_clients30),
        returning: num(c.returning),
        returningRate: pct(num(c.returning), totalCards),
        rewardReady: num(c.reward_ready),
        avgStamps: Math.round(num(c.avg_stamps) * 10) / 10,
        blocks: num(c.blocks),
      },
      daily: [...daily.entries()].map(([date, v]) => ({ date, ...v })),
      topClients: topClientRows.map((r) => ({
        id: String(r.id),
        name: [r.prenom, r.nom].filter(Boolean).join(' ') || null,
        telephone: (r.telephone as string | null) ?? null,
        isAnonymous: Boolean(r.is_anonymous),
        deleted: Boolean(r.deleted),
        stamps: num(r.stamps),
        visits: num(r.visits),
        amount: Math.round(num(r.amount)),
        lastAt: iso(r.last_at),
      })),
      recentTransactions: recentRows.map((r) => ({
        id: String(r.id),
        type: String(r.type),
        status: String(r.status),
        stamps: num(r.stamps),
        amount: num(r.amount),
        createdAt: iso(r.created_at),
        performedBy: (r.performed_by_name as string | null) ?? null,
        giftStatus: (r.gift_status as string | null) ?? null,
        reward: (r.reward as string | null) ?? null,
        client: { id: String(r.client_id), name: [r.prenom, r.nom].filter(Boolean).join(' ') || null },
      })),
      rewards: rewardRows.map((r) => ({ id: String(r.id), titre: String(r.titre), cout: num(r.cout), redeemed: num(r.redeemed) })),
      team: teamRows.map((r) => ({ id: String(r.id), nom: String(r.nom), role: String(r.role), isActive: Boolean(r.is_active), transactions: num(r.tx) })),
      stores: storeRows.map((r) => ({
        id: String(r.id),
        nom: String(r.nom),
        ville: (r.ville as string | null) ?? null,
        quartier: (r.quartier as string | null) ?? null,
        isActive: Boolean(r.is_active),
      })),
      features: {
        scratchCampaigns: num(f.scratch_campaigns),
        scratchCards: num(f.scratch_cards),
        scratchScratched: num(f.scratch_scratched),
        wheelCampaigns: num(f.wheel_campaigns),
        wheelActive: num(f.wheel_active),
        coupons: num(f.coupons),
        couponsRedeemed: num(f.coupons_redeemed),
        claims: num(f.claims),
        claimsConsumed: num(f.claims_consumed),
        views30: num(f.views30),
      },
      notifications: channelRows.map((r) => ({
        channel: String(r.channel),
        campaigns: num(r.campaigns),
        recipients: num(r.recipients),
        success: num(r.success),
        successRate: pct(num(r.success), num(r.recipients)),
        lastAt: iso(r.last_at),
      })),
    };
  }

  // ── Client drill-down ───────────────────────────────────────────────────

  async getClientActivity(clientId: string) {
    const q = this.rawQuery;
    const d30 = new Date(Date.now() - 30 * DAY_MS);

    const [exists] = await q.queryRaw<Row>`SELECT id, is_anonymous, push_token IS NOT NULL AS has_push, language FROM clients WHERE id = ${clientId}`;
    if (!exists) throw new NotFoundException('Client non trouvé');

    const [txRows, cardRows, recentRows, gameRows, blockRows] = await Promise.all([
      q.queryRaw<Row>`
        SELECT
          COUNT(*) FILTER (WHERE status = 'ACTIVE') AS total,
          COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND type = 'EARN_STAMPS') AS earn,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND type = 'REDEEM_REWARD') AS redeem,
          COALESCE(SUM(stamps) FILTER (WHERE status = 'ACTIVE' AND type = 'EARN_STAMPS'), 0) AS stamps_earned,
          COALESCE(SUM(amount) FILTER (WHERE status = 'ACTIVE'), 0) AS amount,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${d30}) AS last30,
          COUNT(DISTINCT merchant_id) FILTER (WHERE status = 'ACTIVE') AS merchants_visited,
          MIN(created_at) FILTER (WHERE status = 'ACTIVE') AS first_at,
          MAX(created_at) FILTER (WHERE status = 'ACTIVE') AS last_at
        FROM transactions WHERE client_id = ${clientId}
      `,
      q.queryRaw<Row>`
        SELECT lc.id, lc.merchant_id, lc.stamps, lc.last_visit_at, lc.deactivated_at, lc.created_at,
               m.nom, m.categorie::text AS categorie, m.stamps_for_reward,
               COUNT(t.id) AS visits, MAX(t.created_at) AS last_tx_at
        FROM loyalty_cards lc
        JOIN merchants m ON m.id = lc.merchant_id
        LEFT JOIN transactions t ON t.client_id = lc.client_id AND t.merchant_id = lc.merchant_id AND t.status = 'ACTIVE'
        WHERE lc.client_id = ${clientId}
        GROUP BY lc.id, m.id
        ORDER BY last_tx_at DESC NULLS LAST, lc.created_at DESC
        LIMIT 100
      `,
      q.queryRaw<Row>`
        SELECT t.id, t.type::text AS type, t.status::text AS status, t.stamps, t.amount, t.created_at,
               m.id AS merchant_id, m.nom AS merchant, rw.titre AS reward
        FROM transactions t
        JOIN merchants m ON m.id = t.merchant_id
        LEFT JOIN rewards rw ON rw.id = t.reward_id
        WHERE t.client_id = ${clientId}
        ORDER BY t.created_at DESC
        LIMIT 20
      `,
      q.queryRaw<Row>`
        SELECT
          (SELECT COUNT(*) FROM scratch_cards WHERE client_id = ${clientId}) AS scratch_total,
          (SELECT COUNT(*) FROM scratch_cards WHERE client_id = ${clientId} AND status = 'SCRATCHED') AS scratch_scratched,
          (SELECT COUNT(*) FROM coupons WHERE client_id = ${clientId}) AS coupons_total,
          (SELECT COUNT(*) FROM coupons WHERE client_id = ${clientId} AND status = 'REDEEMED') AS coupons_redeemed,
          (SELECT COUNT(*) FROM coupons WHERE client_id = ${clientId} AND status = 'ACTIVE') AS coupons_active,
          (SELECT COUNT(*) FROM lucky_wheel_tickets WHERE client_id = ${clientId}) AS wheel_tickets,
          (SELECT COUNT(*) FROM client_notification_statuses WHERE client_id = ${clientId}) AS notif_received,
          (SELECT COUNT(*) FROM client_notification_statuses WHERE client_id = ${clientId} AND is_read) AS notif_read,
          (SELECT COUNT(*) FROM client_referrals WHERE client_id = ${clientId}) AS referrals
      `,
      q.queryRaw<Row>`
        SELECT b.merchant_id, m.nom, b.created_at FROM client_merchant_blocks b
        JOIN merchants m ON m.id = b.merchant_id
        WHERE b.client_id = ${clientId} ORDER BY b.created_at DESC
      `,
    ]);

    const t = txRows[0] ?? {};
    const g = gameRows[0] ?? {};
    return {
      isAnonymous: Boolean(exists.is_anonymous),
      pushReachable: Boolean(exists.has_push),
      language: String(exists.language ?? 'fr'),
      transactions: {
        total: num(t.total),
        cancelled: num(t.cancelled),
        earn: num(t.earn),
        redeem: num(t.redeem),
        stampsEarned: num(t.stamps_earned),
        amount: Math.round(num(t.amount)),
        last30: num(t.last30),
        merchantsVisited: num(t.merchants_visited),
        firstAt: iso(t.first_at),
        lastAt: iso(t.last_at),
      },
      cards: cardRows.map((r) => ({
        id: String(r.id),
        merchant: { id: String(r.merchant_id), nom: String(r.nom), categorie: String(r.categorie) },
        stamps: num(r.stamps),
        stampsForReward: num(r.stamps_for_reward),
        visits: num(r.visits),
        lastVisitAt: iso(r.last_tx_at) ?? iso(r.last_visit_at),
        deactivatedAt: iso(r.deactivated_at),
        createdAt: iso(r.created_at),
      })),
      recentTransactions: recentRows.map((r) => ({
        id: String(r.id),
        type: String(r.type),
        status: String(r.status),
        stamps: num(r.stamps),
        amount: num(r.amount),
        createdAt: iso(r.created_at),
        reward: (r.reward as string | null) ?? null,
        merchant: { id: String(r.merchant_id), nom: String(r.merchant) },
      })),
      games: {
        scratchTotal: num(g.scratch_total),
        scratchScratched: num(g.scratch_scratched),
        couponsTotal: num(g.coupons_total),
        couponsRedeemed: num(g.coupons_redeemed),
        couponsActive: num(g.coupons_active),
        wheelTickets: num(g.wheel_tickets),
      },
      notifications: {
        received: num(g.notif_received),
        read: num(g.notif_read),
        readRate: pct(num(g.notif_read), num(g.notif_received)),
      },
      referrals: num(g.referrals),
      blocks: blockRows.map((r) => ({ merchantId: String(r.merchant_id), nom: String(r.nom), createdAt: iso(r.created_at) })),
    };
  }

  // ── Notifications performance ───────────────────────────────────────────

  async getNotificationStats(days: NotifStatsPeriod = 30) {
    const cacheKey = `admin:notif-stats:${days}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const q = this.rawQuery;
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);
    const prevSince = new Date(now.getTime() - 2 * days * DAY_MS);

    const [channelRows, totalsRows, dailyRows, senderRows, audienceRows] = await Promise.all([
      q.queryRaw<Row>`
        SELECT COALESCE(channel, 'PUSH') AS channel, COUNT(*) AS campaigns,
               COALESCE(SUM(recipient_count), 0) AS recipients, COALESCE(SUM(success_count), 0) AS success,
               COALESCE(SUM(failure_count), 0) AS failure
        FROM notifications WHERE created_at >= ${since}
        GROUP BY 1 ORDER BY campaigns DESC
      `,
      q.queryRaw<Row>`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= ${since}) AS campaigns,
          COUNT(*) FILTER (WHERE created_at >= ${prevSince} AND created_at < ${since}) AS campaigns_prev,
          COUNT(*) FILTER (WHERE created_at >= ${since} AND merchant_id IS NULL) AS admin_campaigns,
          COUNT(DISTINCT merchant_id) FILTER (WHERE created_at >= ${since}) AS senders,
          COALESCE(SUM(recipient_count) FILTER (WHERE created_at >= ${since}), 0) AS recipients,
          COALESCE(SUM(recipient_count) FILTER (WHERE created_at >= ${prevSince} AND created_at < ${since}), 0) AS recipients_prev,
          (SELECT COUNT(*) FROM client_notification_statuses WHERE created_at >= ${since}) AS delivered_inbox,
          (SELECT COUNT(*) FROM client_notification_statuses WHERE created_at >= ${since} AND is_read) AS read_inbox,
          (SELECT COUNT(*) FROM client_merchant_blocks WHERE created_at >= ${since}) AS blocks
        FROM notifications WHERE created_at >= ${prevSince}
      `,
      q.queryRaw<Row>`
        SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca', 'YYYY-MM-DD') AS d,
               COUNT(*) AS campaigns, COALESCE(SUM(recipient_count), 0) AS recipients, COALESCE(SUM(success_count), 0) AS success
        FROM notifications WHERE created_at >= ${since}
        GROUP BY 1
      `,
      q.queryRaw<Row>`
        WITH reads AS (
          SELECT n.merchant_id, COUNT(s.*) AS delivered, COUNT(s.*) FILTER (WHERE s.is_read) AS read
          FROM notifications n
          JOIN client_notification_statuses s ON s.notification_id = n.id
          WHERE n.created_at >= ${since} AND n.merchant_id IS NOT NULL
          GROUP BY n.merchant_id
        ),
        blocks AS (
          SELECT merchant_id, COUNT(*) AS n FROM client_merchant_blocks WHERE created_at >= ${since} GROUP BY merchant_id
        )
        SELECT m.id, m.nom, COUNT(n.id) AS campaigns, COALESCE(SUM(n.recipient_count), 0) AS recipients,
               COALESCE(SUM(n.success_count), 0) AS success, MAX(n.created_at) AS last_at,
               COALESCE(MAX(r.delivered), 0) AS delivered, COALESCE(MAX(r.read), 0) AS read, COALESCE(MAX(b.n), 0) AS blocks
        FROM notifications n
        JOIN merchants m ON m.id = n.merchant_id
        LEFT JOIN reads r ON r.merchant_id = n.merchant_id
        LEFT JOIN blocks b ON b.merchant_id = n.merchant_id
        WHERE n.created_at >= ${since}
        GROUP BY m.id
        ORDER BY campaigns DESC, recipients DESC
        LIMIT 10
      `,
      q.queryRaw<Row>`
        SELECT COALESCE(audience, CASE WHEN merchant_id IS NULL THEN 'ADMIN' ELSE 'MERCHANT_CLIENTS' END) AS audience,
               COUNT(*) AS campaigns, COALESCE(SUM(recipient_count), 0) AS recipients
        FROM notifications WHERE created_at >= ${since}
        GROUP BY 1 ORDER BY campaigns DESC
      `,
    ]);

    const t = totalsRows[0] ?? {};
    const daily = dayBuckets(days, now, () => ({ campaigns: 0, recipients: 0, success: 0 }));
    for (const r of dailyRows) {
      const b = daily.get(String(r.d));
      if (b) {
        b.campaigns = num(r.campaigns);
        b.recipients = num(r.recipients);
        b.success = num(r.success);
      }
    }
    const channels = channelRows.map((r) => ({
      channel: String(r.channel),
      campaigns: num(r.campaigns),
      recipients: num(r.recipients),
      success: num(r.success),
      failure: num(r.failure),
      successRate: pct(num(r.success), num(r.recipients)),
    }));
    const recipients = num(t.recipients);
    const success = channels.reduce((a, c) => a + c.success, 0);

    const result = {
      period: { days, since: since.toISOString(), generatedAt: now.toISOString() },
      totals: {
        campaigns: num(t.campaigns),
        campaignsPrev: num(t.campaigns_prev),
        adminCampaigns: num(t.admin_campaigns),
        senders: num(t.senders),
        recipients,
        recipientsPrev: num(t.recipients_prev),
        success,
        successRate: pct(success, recipients),
        inboxDelivered: num(t.delivered_inbox),
        inboxRead: num(t.read_inbox),
        readRate: pct(num(t.read_inbox), num(t.delivered_inbox)),
        blocks: num(t.blocks),
      },
      channels,
      audiences: audienceRows.map((r) => ({ audience: String(r.audience), campaigns: num(r.campaigns), recipients: num(r.recipients) })),
      daily: [...daily.entries()].map(([date, v]) => ({ date, ...v })),
      topSenders: senderRows.map((r) => ({
        id: String(r.id),
        nom: String(r.nom),
        campaigns: num(r.campaigns),
        recipients: num(r.recipients),
        successRate: pct(num(r.success), num(r.recipients)),
        readRate: pct(num(r.read), num(r.delivered)),
        blocks: num(r.blocks),
        lastAt: iso(r.last_at),
      })),
    };
    await this.cache.set(cacheKey, result, ALERTS_CACHE_TTL);
    return result;
  }

  // ── Alert badges ────────────────────────────────────────────────────────

  async getAlerts() {
    const cacheKey = 'admin:alerts';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const d1 = new Date(now.getTime() - DAY_MS);
    const d7 = new Date(now.getTime() - 7 * DAY_MS);
    const in7 = new Date(now.getTime() + 7 * DAY_MS);
    const [x] = await this.rawQuery.queryRaw<Row>`
      SELECT
        (SELECT COUNT(*) FROM payout_requests WHERE status = 'PENDING') AS payouts_pending,
        (SELECT COALESCE(SUM(amount), 0) FROM payout_requests WHERE status = 'PENDING') AS payouts_amount,
        (SELECT COUNT(*) FROM client_referrals WHERE status = 'PENDING') AS referrals_pending,
        (SELECT COUNT(*) FROM merchants WHERE deleted_at IS NULL AND is_active AND plan = 'PREMIUM'
           AND NOT plan_activated_by_admin AND plan_expires_at > ${now} AND plan_expires_at <= ${in7}) AS trials_ending,
        (SELECT COUNT(*) FROM merchants WHERE deleted_at IS NULL AND is_active AND plan = 'PREMIUM'
           AND plan_activated_by_admin AND plan_expires_at > ${now} AND plan_expires_at <= ${in7}) AS paid_ending,
        (SELECT COUNT(*) FROM merchants m WHERE m.deleted_at IS NULL AND m.is_active AND m.created_at < ${d7}
           AND m.created_at >= ${new Date(now.getTime() - 30 * DAY_MS)}
           AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.merchant_id = m.id)) AS stuck_new_merchants,
        (SELECT COUNT(*) FROM merchants WHERE deleted_at IS NULL AND created_at >= ${d1}) AS new_merchants_24h,
        (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL AND created_at >= ${d1}) AS new_clients_24h,
        (SELECT COALESCE(SUM(recipient_count), 0) FROM notifications WHERE created_at >= ${d1}) AS notif_recipients_24h,
        (SELECT COALESCE(SUM(success_count), 0) FROM notifications WHERE created_at >= ${d1}) AS notif_success_24h,
        (SELECT COUNT(*) FROM transactions WHERE status = 'CANCELLED' AND created_at >= ${d1}) AS cancelled_24h,
        (SELECT COUNT(*) FROM transactions WHERE created_at >= ${d1}) AS tx_24h
    `;
    const r = x ?? {};
    const recipients = num(r.notif_recipients_24h);
    const result = {
      generatedAt: now.toISOString(),
      payoutsPending: num(r.payouts_pending),
      payoutsPendingAmount: num(r.payouts_amount),
      referralsPending: num(r.referrals_pending),
      trialsEnding7d: num(r.trials_ending),
      paidEnding7d: num(r.paid_ending),
      stuckNewMerchants: num(r.stuck_new_merchants),
      newMerchants24h: num(r.new_merchants_24h),
      newClients24h: num(r.new_clients_24h),
      notifRecipients24h: recipients,
      notifSuccessRate24h: recipients > 0 ? pct(num(r.notif_success_24h), recipients) : null,
      cancelled24h: num(r.cancelled_24h),
      transactions24h: num(r.tx_24h),
    };
    await this.cache.set(cacheKey, result, ALERTS_CACHE_TTL);
    return result;
  }
}
