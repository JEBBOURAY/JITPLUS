// ── DI tokens for model repositories ────────────────────────────────────────
// Each token corresponds to a Prisma model delegate injected via RepositoryModule.
//
// Data-access convention (both styles reach the same Prisma delegates):
// - Core modules (auth, client-auth, merchant, notifications, admin,
//   merchant-inbox, common/tasks) inject these tokens — one token per model
//   they touch, plus TRANSACTION_RUNNER / RAW_QUERY_RUNNER.
// - Self-contained feature modules built around interactive transactions and
//   raw SQL (deals, scratch-card, lucky-wheel, stamp-codes, common/coordination)
//   inject PrismaService directly.
// - Never mix both styles inside one module: a model missing here gets a new
//   token rather than a PrismaService injection in a core module.

export const MERCHANT_REPOSITORY = Symbol('MERCHANT_REPOSITORY');
export const CLIENT_REPOSITORY = Symbol('CLIENT_REPOSITORY');
export const LOYALTY_CARD_REPOSITORY = Symbol('LOYALTY_CARD_REPOSITORY');
export const TRANSACTION_REPOSITORY = Symbol('TRANSACTION_REPOSITORY');
export const STORE_REPOSITORY = Symbol('STORE_REPOSITORY');
export const TEAM_MEMBER_REPOSITORY = Symbol('TEAM_MEMBER_REPOSITORY');
export const DEVICE_SESSION_REPOSITORY = Symbol('DEVICE_SESSION_REPOSITORY');
export const CLIENT_SESSION_REPOSITORY = Symbol('CLIENT_SESSION_REPOSITORY');
export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');
export const CLIENT_NOTIFICATION_STATUS_REPOSITORY = Symbol('CLIENT_NOTIFICATION_STATUS_REPOSITORY');
export const OTP_REPOSITORY = Symbol('OTP_REPOSITORY');
export const ADMIN_USER_REPOSITORY = Symbol('ADMIN_USER_REPOSITORY');
export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');
export const PROFILE_VIEW_REPOSITORY = Symbol('PROFILE_VIEW_REPOSITORY');
export const CLIENT_MERCHANT_BLOCK_REPOSITORY = Symbol('CLIENT_MERCHANT_BLOCK_REPOSITORY');
export const QR_NONCE_REPOSITORY = Symbol('QR_NONCE_REPOSITORY');
export const DEAL_REPOSITORY = Symbol('DEAL_REPOSITORY');
export const REWARD_REPOSITORY = Symbol('REWARD_REPOSITORY');
export const CLIENT_REFERRAL_REPOSITORY = Symbol('CLIENT_REFERRAL_REPOSITORY');
export const MERCHANT_NOTIFICATION_READ_REPOSITORY = Symbol('MERCHANT_NOTIFICATION_READ_REPOSITORY');
export const MERCHANT_INBOX_REPOSITORY = Symbol('MERCHANT_INBOX_REPOSITORY');
export const PAYOUT_REQUEST_REPOSITORY = Symbol('PAYOUT_REQUEST_REPOSITORY');
export const LUCKY_WHEEL_CAMPAIGN_REPOSITORY = Symbol('LUCKY_WHEEL_CAMPAIGN_REPOSITORY');
export const LUCKY_WHEEL_PRIZE_REPOSITORY = Symbol('LUCKY_WHEEL_PRIZE_REPOSITORY');
export const LUCKY_WHEEL_TICKET_REPOSITORY = Symbol('LUCKY_WHEEL_TICKET_REPOSITORY');
export const LUCKY_WHEEL_DRAW_REPOSITORY = Symbol('LUCKY_WHEEL_DRAW_REPOSITORY');
export const CAMPAIGN_SENT_TRACKER_REPOSITORY = Symbol('CAMPAIGN_SENT_TRACKER_REPOSITORY');
export const STAMP_CODE_REPOSITORY = Symbol('STAMP_CODE_REPOSITORY');
export const MERCHANT_FOLLOW_UP_REPOSITORY = Symbol('MERCHANT_FOLLOW_UP_REPOSITORY');
export const MERCHANT_FOLLOW_UP_NOTE_REPOSITORY = Symbol('MERCHANT_FOLLOW_UP_NOTE_REPOSITORY');
export const SUBSCRIPTION_PAYMENT_REPOSITORY = Symbol('SUBSCRIPTION_PAYMENT_REPOSITORY');
export const TRANSACTION_RUNNER = Symbol('TRANSACTION_RUNNER');
export const RAW_QUERY_RUNNER = Symbol('RAW_QUERY_RUNNER');
