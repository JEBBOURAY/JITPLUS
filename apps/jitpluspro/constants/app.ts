/** API request timeout in milliseconds */
export const API_TIMEOUT_MS = 10_000;

/** Minimum password length for registration */
export const MIN_PASSWORD_LENGTH = 8;

/** Search input debounce delay in milliseconds */
export const SEARCH_DEBOUNCE_MS = 350;
/** Days without a visit before a client counts as inactive (mirrors the backend). */
export const INACTIVE_CLIENT_DAYS = 30;
// AsyncStorage keys
export const ASYNC_STORAGE_KEYS = {
  WELCOME_SEEN: 'welcome_seen',
  // Contextual reminder banner (messages) dismissal.
  MESSAGES_LOGO_BANNER_DISMISSED: 'messages_logo_banner_dismissed',
  // Premium trial-end reminder (Accueil): stores the YYYY-MM-DD it was dismissed
  // so it reappears the next day until the trial converts or expires.
  TRIAL_END_BANNER_DISMISSED_DAY: 'trial_end_banner_dismissed_day',
  // Accueil promo carousel: JSON array of banner keys already opened.
  PROMO_CARDS_READ: 'promo_cards_read',
  // "Maîtrisez JitPlus" guide: prefix of a per-merchant JSON array of steps
  // already detected as done, so they stay checked once older data leaves the
  // first loaded page (e.g. the first reward given).
  GUIDE_STEPS_DONE: 'guide_steps_done',
  // When set to 'true', disables anonymous crash diagnostics (Sentry).
  // Required so EU/GDPR users can opt out of diagnostic data collection,
  // even though it contains no PII.
  SENTRY_OPT_OUT: 'sentry_opt_out',
  // Lucky wheel screen: intro/hero card permanently hidden once dismissed.
  LUCKY_WHEEL_INTRO_DISMISSED: 'lucky_wheel_intro_dismissed',
  // Scanner: first-visit guide modal, and the older "how it works" banner it replaces.
  FIRST_SCAN_GUIDE_DONE: '@jitpluspro_first_scan_guide',
  SCAN_HOW_IT_WORKS_DISMISSED: '@jitpluspro_scan_how_it_works_v2',
};

// Upload validation
export const ALLOWED_LOGO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_LOGO_SIZE_MB = 10; // aligned with backend MAX_FILE_SIZE (sharp optimizes server-side)
export const MAX_LOGO_SIZE_BYTES = MAX_LOGO_SIZE_MB * 1024 * 1024;
/** QR scan area ratio relative to screen width */
export const SCAN_AREA_RATIO = 0.68;

/** Navigation delay after QR scan detection (ms): just long enough to see the "found" state */
export const NAVIGATION_DELAY_MS = 150;

/** Success modal display duration (ms); the modal also closes on tap */
export const SUCCESS_DISPLAY_MS = 1500;

/** Maximum digits for amount input */
export const MAX_AMOUNT_DIGITS = 8;

/** Maximum stamps per single transaction (aligned with backend MAX_STAMPS_PER_TX) */
export const MAX_STAMPS_PER_TX = 20;

/** Store pages of the JitPlus client app (the one customers install). */
export const CLIENT_APP_ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.jitplus.client';
export const CLIENT_APP_IOS_URL = 'https://apps.apple.com/app/jitplus/id6762307929';
