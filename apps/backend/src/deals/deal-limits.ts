// Same values as packages/shared/src/deals/constants.ts (the backend does not
// import the shared package: its Docker image only contains apps/backend).
// deal-enums.spec.ts checks that both copies stay identical.
export const DEAL_LIMITS = {
  TITLE_MAX: 60,
  DESCRIPTION_MAX: 300,
  CONDITIONS_MAX: 200,
  LINK_MAX: 500,
  REPORT_COMMENT_MAX: 300,
  MAX_ACTIVE: 5,
  MAX_CREATED_PER_DAY: 3,
  MAX_DURATION_DAYS: 30,
  MAX_SCHEDULE_DAYS: 30,
  MIN_PERCENT: 1,
  MAX_PERCENT: 99,
  MAX_QTY: 20,
  MAX_PRICE: 1_000_000,
  MAX_STORES: 10,
} as const;

export const DEAL_ENDING_SOON_HOURS = 48;

// ── Backend only ─────────────────────────────────────────────
/** Ended, removed and deleted deals (and their images) are purged after this many days */
export const DEAL_PURGE_AFTER_DAYS = 90;
/** Distinct client reports that hide a deal until an admin reviews it */
export const DEAL_AUTO_HIDE_REPORTS = 5;
export const DEAL_FEED_PAGE_SIZE = 20;
/** "Près de moi": one ONLINE deal after every this many LOCAL ones */
export const DEAL_ONLINE_INTERLEAVE = 8;
/** "Près de moi" search box half-size */
export const DEAL_NEARBY_RADIUS_KM = 50;
/** Deeper pages are refused: offset pagination gets slow and nobody scrolls that far */
export const DEAL_FEED_MAX_PAGES = 25;
/** A client's view / click is counted once per window */
export const DEAL_VIEW_DEDUP_MS = 12 * 3_600_000;
export const DEAL_EVENT_DEDUP_MS = 3_600_000;
/** Popular = top share of the live deals of a city, with at least this many views */
export const DEAL_POPULAR_TOP_SHARE = 0.1;
export const DEAL_POPULAR_MIN_VIEWS = 10;

/** Deals that started longer ago are never announced (e.g. after an outage) */
export const DEAL_ALERT_FRESH_DAYS = 3;
/** ONLINE-only digests a client can get per week */
export const DEAL_ONLINE_ALERTS_PER_WEEK = 3;
export const DEAL_DIGEST_BATCH = 1000;
export const DEAL_DIGEST_MAX_DEALS = 2000;
/** Notification.audience of the in-app digest entries */
export const DEAL_DIGEST_AUDIENCE = 'DEALS_DIGEST';
export const DEAL_DIGEST_RETENTION_DAYS = 30;

export const DEAL_FEED_CACHE_TTL = 60_000;
export const DEAL_BADGES_CACHE_TTL = 60_000;
export const DEAL_TEASER_CACHE_TTL = 5 * 60_000;
export const DEAL_CITIES_CACHE_TTL = 10 * 60_000;

/** Link hosts refused: URL shorteners hide the real destination. */
export const BLOCKED_LINK_HOSTS: ReadonlySet<string> = new Set([
  'bit.ly', 'bitly.com', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly',
  'rebrand.ly', 'shorturl.at', 'rb.gy', 'tiny.cc', 't.ly', 'v.gd', 'bl.ink', 'short.io', 'shorte.st',
  'adf.ly', 'lnkd.in', 'qrco.de', 's.id', 'tr.ee', 'linktr.ee', 'grabify.link', 'iplogger.org',
]);
