// Same values as packages/shared/src/scratch/constants.ts (the backend does not
// import the shared package: its Docker image only contains apps/backend).
// scratch-enums.spec.ts checks that both copies stay identical.
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
  MAX_CARD_DAYS: 60,
  MIN_COUPON_AFTER_CARD_DAYS: 1,
  MAX_COUPON_DAYS: 120,
} as const;

/** Look-back window used to match a campaign's "card received" notifications when cancelling it. */
export const SCRATCH_DISMISS_WINDOW_DAYS = 7;
/** Campaigns a merchant can send over a rolling 30-day window. */
export const SCRATCH_MAX_CAMPAIGNS_PER_30_DAYS = 4;
/** Scheduling horizon. */
export const SCRATCH_MAX_SCHEDULE_DAYS = 30;
/** A SENDING lock older than this is considered dead and retaken. */
export const SCRATCH_SENDING_LOCK_MS = 10 * 60_000;

export const COUPON_REMINDER_HOURS = 48;
export const SCRATCH_CARD_REMINDER_HOURS = 24;

const envFlag = (name: string) => ['true', '1', 'yes'].includes((process.env[name] ?? '').trim().toLowerCase());
const isProduction = () => (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production';

/**
 * Campaigns are sent on the merchant's request, so their dispatch can be
 * turned on alone (ENABLE_SCRATCH_DISPATCH) without the automated marketing
 * crons that ENABLE_CRONS would also start outside production.
 */
export function scratchDispatchForced(): boolean {
  return envFlag('ENABLE_SCRATCH_DISPATCH');
}

/** Local testing only: never honoured in production. */
export function scratchQuietHoursIgnored(): boolean {
  return !isProduction() && envFlag('SCRATCH_IGNORE_QUIET_HOURS');
}
