import type { MerchantInboxCategory } from './merchant-inbox.service';

/**
 * Delivery rules of the JitPlus Pro pushes, kept in one place so every sender
 * (crons, plan changes, admin news…) behaves the same way.
 */

/** Groups the merchant can switch off in the app. */
export const MERCHANT_NOTIF_PREF_KEYS = ['news', 'tips', 'reminders', 'reports'] as const;
export type MerchantNotifPrefKey = (typeof MERCHANT_NOTIF_PREF_KEYS)[number];
export type MerchantNotifPrefs = Record<MerchantNotifPrefKey, boolean>;

/**
 * Preference group of each category. `null` = always delivered: plan, quota,
 * account status and security alerts cannot be turned off.
 */
const CATEGORY_PREF: Record<MerchantInboxCategory, MerchantNotifPrefKey | null> = {
  SECURITY: null,
  PLAN: null,
  STATUS: null,
  QUOTA: null,
  ACTIVITY: 'reports',
  TIP: 'tips',
  OFFER: 'tips',
  SETUP: 'reminders',
  REMINDER: 'reminders',
  NEWS: 'news',
};

/**
 * Marketing categories share a frequency cap and never go out during quiet
 * hours. They also need a reachable device: an inbox-only reminder is noise.
 */
export const MARKETING_CATEGORIES: readonly MerchantInboxCategory[] = ['TIP', 'OFFER', 'SETUP', 'REMINDER', 'NEWS'];

/** At most this many marketing pushes per merchant per rolling day / week. */
export const MARKETING_DAILY_CAP = 1;
export const MARKETING_WEEKLY_CAP = 3;

/** Android channel per category (created by the Pro app in setupAndroidChannels). */
export const CATEGORY_CHANNEL: Record<MerchantInboxCategory, string> = {
  SECURITY: 'login-alerts',
  PLAN: 'jitpro-default',
  STATUS: 'jitpro-default',
  QUOTA: 'jitpro-default',
  ACTIVITY: 'jitpro-reports',
  TIP: 'jitpro-tips',
  OFFER: 'jitpro-tips',
  SETUP: 'jitpro-reminders',
  REMINDER: 'jitpro-reminders',
  NEWS: 'jitpro-news',
};

export function isMarketing(category: MerchantInboxCategory): boolean {
  return MARKETING_CATEGORIES.includes(category);
}

/** Stored JSON → full preference object. Anything that is not an explicit `false` means ON. */
export function parseNotifPrefs(raw: unknown): MerchantNotifPrefs {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(MERCHANT_NOTIF_PREF_KEYS.map((k) => [k, obj[k] !== false])) as MerchantNotifPrefs;
}

export function isCategoryEnabled(raw: unknown, category: MerchantInboxCategory): boolean {
  const key = CATEGORY_PREF[category];
  return key === null || parseNotifPrefs(raw)[key];
}

/**
 * Deep-link keys the Pro app understands (utils/notificationRoutes.ts there).
 * Admin news may only point to one of these.
 */
export const MERCHANT_PUSH_ACTIONS = [
  'open_dashboard', 'open_scan', 'open_clients', 'open_messages', 'open_settings',
  'open_logo', 'open_plan', 'open_referral', 'open_security', 'open_notifications',
  'open_deals', 'open_lucky_wheel', 'open_scratch_campaigns', 'open_stamp_codes',
  'open_team', 'open_stores', 'open_client_qr', 'open_quick_add', 'open_games',
  'open_notification_settings', 'open_verify_email', 'open_support',
] as const;
