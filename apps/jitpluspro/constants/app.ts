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
  // Setup checklist (Accueil) — dismissable only once 100% complete.
  CHECKLIST_DISMISSED: 'checklist_dismissed',
  // Local flag: user reviewed/confirmed their loyalty program from the checklist.
  CHECKLIST_LOYALTY_CONFIRMED: 'checklist_loyalty_confirmed',
  // Cached "first scan done" so the item stays checked without a data flash on reload.
  CHECKLIST_SCANNED: 'checklist_scanned',
  // Display preference: checklist widget collapsed to its compact one-line form.
  CHECKLIST_COLLAPSED: 'checklist_collapsed',
  // User permanently hid the checklist from the Accueil (still reachable elsewhere).
  CHECKLIST_HIDDEN: 'checklist_hidden',
  // One-time discreet notice shown once after the user permanently hides the guide.
  CHECKLIST_HIDE_NOTICE_SEEN: 'checklist_hide_notice_seen',
  // Contextual reminder banners (messages / store-preview) dismissals.
  MESSAGES_LOGO_BANNER_DISMISSED: 'messages_logo_banner_dismissed',
  STORE_PREVIEW_BANNER_DISMISSED: 'store_preview_banner_dismissed',
  // Premium trial-end reminder (Accueil): stores the YYYY-MM-DD it was dismissed
  // so it reappears the next day until the trial converts or expires.
  TRIAL_END_BANNER_DISMISSED_DAY: 'trial_end_banner_dismissed_day',
  // Guided tour (Accueil): set to 'true' once the tour has been auto-proposed,
  // so it is never proposed automatically again (still relaunchable via "?").
  TOUR_AUTO_SHOWN: 'tour_auto_shown',
  // When set to 'true', disables anonymous crash diagnostics (Sentry).
  // Required so EU/GDPR users can opt out of diagnostic data collection,
  // even though it contains no PII.
  SENTRY_OPT_OUT: 'sentry_opt_out',
  // Custom animated splash (SplashAnimated.tsx): set to '1' once the full
  // sequence (shops scene + text) has been played on this install. Every
  // launch after that plays the reduced ~250ms logo fade instead so returning
  // users aren't slowed down.
  SPLASH_SHOWN: 'splash_shown',
};

// Upload validation
export const ALLOWED_LOGO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
export const MAX_LOGO_SIZE_MB = 10; // aligned with backend MAX_FILE_SIZE (sharp optimizes server-side)
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
