/** Bcrypt cost factor for password hashing (OWASP recommends >= 12 as of 2024) */
export const BCRYPT_SALT_ROUNDS = 12;

/** Default HTTP port when PORT env var is not set */
export const DEFAULT_PORT = 3000;

/** Max results returned by getClients */
export const MAX_CLIENT_RESULTS = 100;

/** Max results returned by getClientsForScan */
export const MAX_SCAN_RESULTS = 50;

/** Max results returned by findAll rewards */
export const MAX_REWARD_RESULTS = 100;

/** Default page size for paginated transaction queries */
export const DEFAULT_PAGE_SIZE = 20;

/** Milliseconds in a day */
export const MS_PER_DAY = 86_400_000;

/** OTP maximum attempts before lockout */
export const MAX_OTP_ATTEMPTS = 5;

/** OTP expiry time in milliseconds (5 minutes) */
export const OTP_EXPIRY_MS = 5 * 60 * 1000;

/** OTP range bounds */
export const OTP_MIN = 100000;
export const OTP_MAX = 1000000; // exclusive upper bound for randomInt()

/** Default fallback reward threshold (points mode) */
export const DEFAULT_REWARD_THRESHOLD = 100;

/** Default stamps for a reward */
export const DEFAULT_STAMPS_FOR_REWARD = 10;

/** Default points rate (points per dirham) */
export const DEFAULT_POINTS_RATE = 10;

/** Max stores per merchant (by plan) */
export const FREE_MAX_STORES = 1;
export const PREMIUM_MAX_STORES = 10;

/** Max clients for FREE plan */
export const FREE_MAX_CLIENTS = 20;

/** Default loyalty type */
export const DEFAULT_LOYALTY_TYPE = 'POINTS' as const;

/** Per-identifier OTP send cooldown (60 seconds) — reject re-sends within this window */
export const OTP_COOLDOWN_MS = 60_000;

/** Maximum OTP sends per identifier (phone or email) per day */
export const MAX_OTP_SENDS_PER_DAY = 10;

// ── Throttle / rate-limit defaults ──────────────────────────
/** Rate-limit window in milliseconds (1 minute) */
export const THROTTLE_TTL = 60_000;

// ── Cache TTLs ──────────────────────────────────────────────
/** How long resolved merchant plans are cached (1 min) */
export const PLAN_CACHE_TTL = 60_000;
/** How long merchant logos are cached in the notification service (5 min) */
export const LOGO_CACHE_TTL = 5 * 60_000;
/** How long JWT-strategy session lookups are cached (30 s) */
export const SESSION_CACHE_TTL = 30_000;
/** Throttle interval before updating lastActiveAt in device session (5 min) */
export const LAST_ACTIVE_THROTTLE_MS = 5 * 60_000;

// ── Cloud Run CPU-reduction cache TTLs ──────────────────────
/** Active merchants list — changes rarely (5 min) */
export const MERCHANTS_LIST_CACHE_TTL = 5 * 60_000;
/** Single merchant detail page — rewards / info (3 min) */
export const MERCHANT_DETAIL_CACHE_TTL = 3 * 60_000;
/** Rewards catalogue per merchant (3 min) */
export const REWARDS_CACHE_TTL = 3 * 60_000;
/** Merchant stores list (3 min) */
export const STORES_CACHE_TTL = 3 * 60_000;
/** Merchant profile — own profile (1 min) */
export const MERCHANT_PROFILE_CACHE_TTL = 60_000;
/** Unread notification count (30 s) */
export const UNREAD_COUNT_CACHE_TTL = 30_000;
/** Admin global stats cache (2 min) */
export const ADMIN_STATS_CACHE_TTL = 2 * 60_000;
/** Referral stats cache (5 min) */
export const REFERRAL_STATS_CACHE_TTL = 5 * 60_000;

// ── Referral ────────────────────────────────────────────────
/** Characters allowed in referral codes (no ambiguous chars like 0/O, I/1) */
export const REFERRAL_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Length of generated referral codes */
export const REFERRAL_CODE_LENGTH = 8;
/** Days added to premium plan per confirmed referral */
export const REFERRAL_BONUS_DAYS = 30;
/** Amount (DH) credited to client when a referred merchant converts to paid premium */
export const CLIENT_REFERRAL_BONUS_AMOUNT = 25;

// ── Defaults ────────────────────────────────────────────────
/** Logo URLs used in email templates and push notifications */
export const EMAIL_LOGO_JITPLUS = 'https://jitplus.com/jitpluslogo.png';
export const EMAIL_LOGO_JITPLUS_PRO = 'https://jitplus.com/jitplusprologo.png';

/** Default notification logo when merchant has no custom logo */
export const DEFAULT_NOTIFICATION_LOGO = EMAIL_LOGO_JITPLUS;

/** Duration of the free trial in days */
export const TRIAL_DURATION_DAYS = 30;

/** Default points rules for new merchants */
export const DEFAULT_POINTS_RULES = { pointsPerDirham: 10, minimumPurchase: 5 };

/** User type values */
export const USER_TYPE_MERCHANT = 'merchant' as const;
export const USER_TYPE_TEAM_MEMBER = 'team_member' as const;

/** Max consecutive failed login attempts before temporary lockout */
export const MAX_LOGIN_ATTEMPTS = 10;

/** Maximum concurrent device sessions per merchant */
export const MAX_SESSIONS_PER_MERCHANT = 5;
/** Lockout duration in minutes */
export const LOGIN_LOCKOUT_MINUTES = 15;
 