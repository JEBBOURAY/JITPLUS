/**
 * Shared app-level constants — extracted from screens to avoid magic numbers.
 */

// ── Timing ──
/** Default debounce delay for search inputs (ms) */
export const DEBOUNCE_MS = 300;
/** Delay before focusing a search TextInput after toggling (ms) */
export const FOCUS_DELAY_MS = 100;
/** Duration for banner fade-in / fade-out animations (ms) */
export const BANNER_ANIM_DURATION_MS = 400;
/** How long the welcome banner stays visible (ms) */
export const WELCOME_BANNER_VISIBLE_MS = 3000;
/** How long the reward banner stays visible (ms) */
export const REWARD_BANNER_VISIBLE_MS = 5000;
/** Freshness window: reward notifications shown if created within this period */
export const FRESH_REWARD_WINDOW_MS = 24 * 60 * 60 * 1000;

// ── Animation ──
/** Progress bar fill duration (ms) — used for stamp/point bars */
export const PROGRESS_ANIM_DURATION_MS = 700;
/** Delay before progress bar animation starts (ms) */
export const PROGRESS_ANIM_DELAY_MS = 150;
/** Stagger delay between notification items (ms) */
export const STAGGER_DELAY_MS = 60;
/** Maximum total stagger delay for long lists (ms) */
export const MAX_STAGGER_DELAY_MS = 300;

// ── Swipe-to-dismiss (notifications) ──
/** Ratio of screen width to trigger a swipe dismissal */
export const SWIPE_THRESHOLD_RATIO = 0.3;
/** Minimum horizontal movement to start tracking a swipe (px) */
export const PAN_MIN_DX = 10;
/** Duration for swipe-off animation (ms) */
export const SWIPE_DISMISS_DURATION_MS = 200;
/** Duration for row collapse after swipe (ms) */
export const ROW_COLLAPSE_DURATION_MS = 180;
/** Spring bounciness for swipe bounce-back */
export const SPRING_BOUNCINESS = 8;

// ── Map (discover) ──
/** Default map animate duration (ms) */
export const MAP_ANIMATE_DURATION_MS = 600;
/** Zoom delta when focusing on a single merchant */
export const MERCHANT_FOCUS_ZOOM_DELTA = 0.008;
/** Zoom delta when centering on user location */
export const USER_LOCATION_ZOOM_DELTA = 0.04;
/** Zoom delta for 'center on me' button */
export const USER_CENTER_ZOOM_DELTA = 0.015;
/** Cluster zoom-in divisor */
export const CLUSTER_ZOOM_DIVISOR = 2.5;
/** Screen height threshold for compact layout (px) */
export const COMPACT_SCREEN_HEIGHT = 710;

// ── Cards / Loyalty ──
/** Max visible stamp dots before showing "+N" */
export const MAX_VISIBLE_STAMPS = 20;
/** Default stamps needed for reward when merchant doesn't configure one */
export const DEFAULT_STAMPS_GOAL = 10;

// ── Profile / OTP ──
/** Cooldown before allowing OTP resend (seconds) */
export const OTP_RESEND_COOLDOWN_S = 60;
/** Expected OTP code length */
export const OTP_CODE_LENGTH = 6;
/** Draft persist debounce when going to background (ms) */
export const DRAFT_PERSIST_DEBOUNCE_MS = 300;
/** Minimum name length for profile validation */
export const MIN_NAME_LENGTH = 2;
/** Maximum name input length */
export const MAX_NAME_LENGTH = 50;
/** Minimum password length */
export const MIN_PASSWORD_LENGTH = 8;

// ── Store URLs ──
/** Android package name on Google Play */
export const ANDROID_PACKAGE = 'com.jitplus.client';
/** Apple App Store ID — update once the app is published on iOS */
export const IOS_APP_ID = process.env.EXPO_PUBLIC_IOS_APP_ID ?? '';

/** Returns the platform-appropriate store URL */
export function getStoreUrl(): string {
  const { Platform } = require('react-native');
  if (Platform.OS === 'ios' && IOS_APP_ID) {
    return `https://apps.apple.com/app/id${IOS_APP_ID}`;
  }
  if (Platform.OS === 'ios') {
    return `https://apps.apple.com/search?term=jitplus`;
  }
  return `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
}

/** Returns the platform-appropriate native "write a review" deep link.
 *  Prefers native store app (itms-apps:// / market://) over web URL for better UX.
 *  Falls back to the web URL returned by getStoreUrl() if the native scheme is unavailable. */
export function getReviewUrl(): string {
  const { Platform } = require('react-native');
  if (Platform.OS === 'ios' && IOS_APP_ID) {
    return `itms-apps://apps.apple.com/app/id${IOS_APP_ID}?action=write-review`;
  }
  if (Platform.OS === 'android') {
    return `market://details?id=${ANDROID_PACKAGE}`;
  }
  return getStoreUrl();
}

/** Unified support contact email — used across Profile & Referral screens. */
export const SUPPORT_EMAIL = 'contact@jitplus.com';
