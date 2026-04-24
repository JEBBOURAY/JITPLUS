/** API request timeout in milliseconds */
export const API_TIMEOUT_MS = 10_000;

/** Minimum password length for registration */
export const MIN_PASSWORD_LENGTH = 8;

/** Search input debounce delay in milliseconds */
export const SEARCH_DEBOUNCE_MS = 350;
// AsyncStorage keys
export const ASYNC_STORAGE_KEYS = {
  ACTIVITY_BANNER_DISMISSED: 'activity_banner_dismissed',
  CLIENTS_BANNER_DISMISSED: 'clients_banner_dismissed',
  // When set to 'true', disables anonymous crash diagnostics (Sentry).
  // Required so EU/GDPR users can opt out of diagnostic data collection,
  // even though it contains no PII.
  SENTRY_OPT_OUT: 'sentry_opt_out',
};

// Upload validation
export const ALLOWED_LOGO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const MAX_LOGO_SIZE_MB = 5;
export const MAX_LOGO_SIZE_BYTES = MAX_LOGO_SIZE_MB * 1024 * 1024;
/** QR scan area ratio relative to screen width */
export const SCAN_AREA_RATIO = 0.68;

/** Navigation delay after QR scan detection (ms) */
export const NAVIGATION_DELAY_MS = 600;

/** Success modal display duration (ms) */
export const SUCCESS_DISPLAY_MS = 2500;

/** Maximum digits for amount input */
export const MAX_AMOUNT_DIGITS = 8;

/** Maximum stamps per single transaction */
export const MAX_STAMPS_PER_TX = 20;
