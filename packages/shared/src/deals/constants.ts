// ── Bons plans — limits shared by both apps ──────────────────────────────────
// The backend enforces the same values (apps/backend/src/deals/deal-limits.ts).

export const DEAL_LIMITS = {
  TITLE_MAX: 60,
  DESCRIPTION_MAX: 300,
  CONDITIONS_MAX: 200,
  LINK_MAX: 500,
  REPORT_COMMENT_MAX: 300,
  /** Deals live or scheduled at the same time */
  MAX_ACTIVE: 5,
  /** Deals created per day (Morocco time), deleted ones included */
  MAX_CREATED_PER_DAY: 3,
  /** Last day at most this many days after the first one */
  MAX_DURATION_DAYS: 30,
  /** First day at most this many days ahead */
  MAX_SCHEDULE_DAYS: 30,
  MIN_PERCENT: 1,
  MAX_PERCENT: 99,
  MAX_QTY: 20,
  MAX_PRICE: 1_000_000,
  MAX_STORES: 10,
} as const;

/** "Bientôt finis" tab: deals ending within this many hours */
export const DEAL_ENDING_SOON_HOURS = 48;

/** Default length proposed by the wizard */
export const DEAL_DEFAULT_DAYS = 7;
