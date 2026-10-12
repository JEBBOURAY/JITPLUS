// ── Scratch cards & coupons — limits shared by both apps ─────────────────────
// The backend DTOs enforce the same limits (apps/backend/src/scratch-card/dto).

export const COUPON_CODE_LENGTH = 6;

/** Prefix of the QR content shown on a coupon: jitplus://coupon/<token> */
export const COUPON_QR_PREFIX = 'jitplus://coupon/';

export const SCRATCH_LIMITS = {
  MAX_REWARDS: 8,
  MIN_WEIGHT: 1,
  MAX_WEIGHT: 1000,
  MAX_STOCK: 100_000,
  MAX_BONUS_STAMPS: 20,
  MAX_PERCENT: 100,
  MAX_FIXED_DISCOUNT: 10_000,
  MAX_MIN_PURCHASE: 100_000,
  MAX_MIN_DELAY_HOURS: 168,
  MAX_AUDIENCE_DAYS: 365,
  MAX_AUDIENCE_STAMPS: 1000,
  NAME_MAX: 80,
  MESSAGE_MAX: 200,
  LABEL_MAX: 80,
  /** The scratch deadline is 1 to 60 days after sending */
  MAX_CARD_DAYS: 60,
  /** Coupons stay usable at least 1 day after the scratch deadline */
  MIN_COUPON_AFTER_CARD_DAYS: 1,
  MAX_COUPON_DAYS: 120,
} as const;

/** Default dates proposed by the campaign wizard */
export const SCRATCH_DEFAULTS = {
  CARD_DAYS: 7,
  COUPON_DAYS_AFTER_CARD: 7,
  /** Below this gap the wizard warns the merchant */
  WARN_COUPON_GAP_DAYS: 3,
} as const;

/** Share of the card that must be scratched before it reveals itself */
export const SCRATCH_REVEAL_THRESHOLD = 0.55;

export const COUPON_REMINDER_HOURS = 48;
export const SCRATCH_CARD_REMINDER_HOURS = 24;

/** Weekday bits, ISO order: index 0 = Monday … 6 = Sunday */
export const WEEKDAY_BITS = [1, 2, 4, 8, 16, 32, 64] as const;
export const ALL_WEEKDAYS_MASK = 127;

/** Send-time slots offered by the wizard (Morocco time, outside quiet hours) */
export const SCRATCH_SEND_SLOTS = ['10:00', '12:00', '17:00', '19:00'] as const;
