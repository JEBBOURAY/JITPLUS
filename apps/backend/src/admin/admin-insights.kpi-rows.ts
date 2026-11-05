import type { IRawQueryRunner } from '../common/repositories';
import { num, pct, type Row, type Windows } from './admin-insights.helpers';

/**
 * Aggregate KPI rows shared by several insights blocks: each query returns one
 * raw row that AdminInsightsService.compute() fetches once and hands to the
 * matching shape* function(s) below.
 */

// ── Merchants: funnel, plans, health, profile completeness, feature adoption

export function queryMerchantKpis(q: IRawQueryRunner, w: Windows) {
  return q.queryRaw<Row>`
        WITH tx AS (
          SELECT merchant_id,
                 COUNT(*) AS total,
                 COUNT(*) FILTER (WHERE created_at >= ${w.since}) AS recent,
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
          COUNT(*) FILTER (WHERE m.created_at >= ${w.since}) AS new_period,
          COUNT(*) FILTER (WHERE m.created_at >= ${w.prevSince} AND m.created_at < ${w.since}) AS new_prev,
          COUNT(*) FILTER (WHERE m.onboarding_completed) AS onboarded,
          COUNT(*) FILTER (WHERE rw.merchant_id IS NOT NULL) AS with_reward,
          COUNT(*) FILTER (WHERE tx.total > 0) AS with_tx,
          -- Strictly nested funnel: each step also requires every previous one
          COUNT(*) FILTER (WHERE rw.merchant_id IS NOT NULL AND tx.total > 0) AS funnel_tx,
          COUNT(*) FILTER (WHERE rw.merchant_id IS NOT NULL AND tx.total > 0 AND cards.n >= 10) AS funnel_10,
          COUNT(*) FILTER (WHERE rw.merchant_id IS NOT NULL AND tx.total > 0 AND cards.n >= 10
                             AND m.plan = 'PREMIUM' AND m.plan_activated_by_admin
                             AND (m.plan_expires_at IS NULL OR m.plan_expires_at > ${w.now})) AS funnel_paid,
          COUNT(*) FILTER (WHERE m.is_active AND tx.recent > 0) AS active_period,
          COUNT(*) FILTER (WHERE m.is_active AND tx.total > 0 AND tx.last_at < ${w.d30}) AS dormant,
          COUNT(*) FILTER (WHERE m.is_active AND tx.merchant_id IS NULL AND m.created_at < ${w.d7}) AS never_used,
          COUNT(*) FILTER (WHERE m.plan = 'PREMIUM' AND m.plan_activated_by_admin
                             AND (m.plan_expires_at IS NULL OR m.plan_expires_at > ${w.now})) AS paid,
          COUNT(*) FILTER (WHERE m.plan = 'PREMIUM' AND NOT m.plan_activated_by_admin
                             AND m.plan_expires_at > ${w.now}) AS trial_active,
          COUNT(*) FILTER (WHERE m.plan = 'PREMIUM' AND NOT m.plan_activated_by_admin
                             AND m.plan_expires_at > ${w.now} AND m.plan_expires_at <= ${w.in7}) AS trial_ending_7d,
          COUNT(*) FILTER (WHERE m.plan = 'PREMIUM' AND m.plan_activated_by_admin
                             AND m.plan_expires_at > ${w.now} AND m.plan_expires_at <= ${w.in7}) AS paid_ending_7d,
          COUNT(*) FILTER (WHERE m.trial_started_at IS NOT NULL AND (
                             m.plan_activated_by_admin OR pe.target_id IS NOT NULL
                             OR m.plan_expires_at IS NULL OR m.plan_expires_at <= ${w.now})) AS trials_finished,
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
    `;
}

export function shapeMerchants(m: Row) {
  const mTotal = num(m.total);
  return {
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
  };
}

// ── Clients: acquisition, reachability, retention, multi-merchant usage

export function queryClientKpis(q: IRawQueryRunner, w: Windows) {
  return q.queryRaw<Row>`
        WITH cards AS (
          SELECT client_id, COUNT(*) AS n FROM loyalty_cards
          WHERE deactivated_at IS NULL GROUP BY client_id
        ),
        act AS (
          SELECT client_id, COUNT(*) AS visits FROM transactions
          WHERE status = 'ACTIVE' AND created_at >= ${w.since} GROUP BY client_id
        ),
        prev AS (
          SELECT DISTINCT client_id FROM transactions
          WHERE status = 'ACTIVE' AND created_at >= ${w.prevSince} AND created_at < ${w.since}
        )
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE c.is_anonymous) AS anonymous,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous) AS registered,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous AND c.created_at >= ${w.since}) AS new_period,
          COUNT(*) FILTER (WHERE NOT c.is_anonymous AND c.created_at >= ${w.prevSince} AND c.created_at < ${w.since}) AS new_prev,
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
    `;
}

export function shapeClients(c: Row) {
  return {
    total: num(c.total),
    registered: num(c.registered),
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
  };
}

// ── Transactions over the period vs previous period

export function queryTransactionKpis(q: IRawQueryRunner, w: Windows) {
  return q.queryRaw<Row>`
        SELECT
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${w.since}) AS total,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at < ${w.since}) AS total_prev,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${w.since} AND type = 'EARN_STAMPS') AS earn,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${w.since} AND type = 'REDEEM_REWARD') AS redeem,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at < ${w.since} AND type = 'REDEEM_REWARD') AS redeem_prev,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${w.since} AND type = 'ADJUST_STAMPS') AS adjust,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${w.since} AND type = 'LUCKY_WHEEL_WIN') AS wheel_win,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${w.since} AND type = 'COUPON_REDEEM') AS coupon_redeem,
          COUNT(*) FILTER (WHERE status = 'CANCELLED' AND created_at >= ${w.since}) AS cancelled,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${w.since} AND team_member_id IS NOT NULL) AS by_team,
          COALESCE(SUM(stamps) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${w.since} AND type = 'EARN_STAMPS'), 0) AS stamps_issued,
          COALESCE(SUM(stamps) FILTER (WHERE status = 'ACTIVE' AND created_at < ${w.since} AND type = 'EARN_STAMPS'), 0) AS stamps_issued_prev,
          COALESCE(SUM(stamps) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${w.since} AND type = 'REDEEM_REWARD'), 0) AS stamps_redeemed,
          COALESCE(SUM(amount) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${w.since} AND type IN ('EARN_STAMPS', 'PURCHASE')), 0) AS amount_tracked,
          COALESCE(SUM(amount) FILTER (WHERE status = 'ACTIVE' AND created_at < ${w.since} AND type IN ('EARN_STAMPS', 'PURCHASE')), 0) AS amount_tracked_prev
        FROM transactions
        WHERE created_at >= ${w.prevSince}
    `;
}

/** `m` / `c` are the merchant and client KPI rows (per-active-user averages). */
export function shapeTransactions(t: Row, m: Row, c: Row) {
  return {
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
  };
}

// ── Misc engagement, moderation, ops queues (shared by several blocks)

export function queryMiscKpis(q: IRawQueryRunner, w: Windows) {
  return q.queryRaw<Row>`
        SELECT
          (SELECT COUNT(*) FROM client_claims WHERE created_at >= ${w.since}) AS claims_created,
          (SELECT COUNT(*) FROM client_claims WHERE created_at >= ${w.since} AND consumed_at IS NOT NULL) AS claims_consumed,
          (SELECT COUNT(*) FROM client_merchant_blocks) AS blocks_total,
          (SELECT COUNT(*) FROM client_merchant_blocks WHERE created_at >= ${w.since}) AS blocks_period,
          (SELECT COUNT(*) FROM profile_views_log WHERE created_at >= ${w.since}) AS profile_views,
          (SELECT COUNT(*) FROM profile_views_log WHERE created_at >= ${w.prevSince} AND created_at < ${w.since}) AS profile_views_prev,
          (SELECT COUNT(*) FROM loyalty_cards WHERE created_at >= ${w.since}) AS cards_period,
          (SELECT COUNT(*) FROM loyalty_cards WHERE created_at >= ${w.prevSince} AND created_at < ${w.since}) AS cards_prev,
          (SELECT COUNT(*) FROM merchant_inbox_notifications WHERE created_at >= ${w.since}) AS inbox_sent,
          (SELECT COUNT(*) FROM merchant_inbox_notifications WHERE created_at >= ${w.since} AND read_at IS NOT NULL) AS inbox_read,
          (SELECT COUNT(*) FROM notifications WHERE created_at >= ${w.since} AND merchant_id IS NOT NULL) AS merchant_campaigns,
          (SELECT COUNT(*) FROM notifications WHERE created_at >= ${w.since} AND merchant_id IS NULL) AS admin_campaigns,
          (SELECT COALESCE(SUM(recipient_count), 0) FROM notifications WHERE created_at >= ${w.since}) AS notif_recipients,
          (SELECT COALESCE(SUM(success_count), 0) FROM notifications WHERE created_at >= ${w.since}) AS notif_success,
          (SELECT COUNT(*) FROM client_notification_statuses WHERE created_at >= ${w.since}) AS client_notif_delivered,
          (SELECT COUNT(*) FROM client_notification_statuses WHERE created_at >= ${w.since} AND is_read) AS client_notif_read,
          (SELECT COUNT(*) FROM payout_requests WHERE status = 'PENDING') AS payouts_pending,
          (SELECT COALESCE(SUM(amount), 0) FROM payout_requests WHERE status = 'PENDING') AS payouts_pending_amount,
          (SELECT COUNT(*) FROM client_referrals WHERE status = 'PENDING') AS client_referrals_pending,
          (SELECT COUNT(*) FROM merchants WHERE deleted_at IS NULL AND referred_by_id IS NOT NULL AND created_at >= ${w.since}) AS merchant_referrals_period,
          (SELECT COUNT(*) FROM team_members WHERE is_active) AS team_members,
          (SELECT COUNT(*) FROM stores WHERE is_active) AS stores,
          (SELECT COUNT(*) FROM transactions WHERE status = 'ACTIVE' AND gift_status = 'PENDING') AS pending_gifts,
          (SELECT COUNT(*) FROM transactions WHERE status = 'ACTIVE' AND gift_status = 'PENDING' AND created_at < ${w.d7}) AS pending_gifts_old
    `;
}

export function shapeEngagement(x: Row) {
  return {
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
  };
}

// ── Loyalty health: cards ready for a reward but not redeemed yet

export function queryLoyaltyHealth(q: IRawQueryRunner, w: Windows) {
  return q.queryRaw<Row>`
        SELECT
          COUNT(*) AS cards,
          COUNT(*) FILTER (WHERE lc.stamps >= m.stamps_for_reward) AS rewards_ready,
          COUNT(*) FILTER (WHERE lc.stamps = 0) AS empty_cards,
          COUNT(*) FILTER (WHERE lc.last_visit_at < ${w.d30}) AS inactive_cards,
          COALESCE(AVG(lc.stamps), 0) AS avg_stamps
        FROM loyalty_cards lc
        JOIN merchants m ON m.id = lc.merchant_id
        WHERE lc.deactivated_at IS NULL AND m.deleted_at IS NULL
    `;
}

/** `x` is the misc KPI row (new cards, pending gifts). */
export function shapeLoyalty(l: Row, x: Row) {
  return {
    activeCards: num(l.cards),
    newCards: num(x.cards_period),
    newCardsPrev: num(x.cards_prev),
    rewardsReady: num(l.rewards_ready),
    emptyCards: num(l.empty_cards),
    inactiveCards: num(l.inactive_cards),
    avgStamps: Math.round(num(l.avg_stamps) * 10) / 10,
    pendingGifts: num(x.pending_gifts),
    pendingGiftsOld: num(x.pending_gifts_old),
  };
}
