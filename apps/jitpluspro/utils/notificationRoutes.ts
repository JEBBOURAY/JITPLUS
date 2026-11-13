import type { Href } from 'expo-router';

/**
 * Deep-link keys sent by the backend in the push payload (`data.action`) and
 * stored on inbox items. Shared by the push tap handler and the inbox screen
 * so both always open the same screen. Keep in sync with
 * MERCHANT_PUSH_ACTIONS in the backend (merchant-notif-policy.ts).
 */
const ACTION_ROUTES: Record<string, Href> = {
  open_referral: '/referral',
  open_settings: '/settings',
  open_security: '/security',
  open_logo: '/account',
  open_scan: '/scan-qr',
  open_plan: '/plan',
  open_dashboard: '/(tabs)',
  open_clients: '/(tabs)/clients',
  open_messages: '/messages',
  open_notifications: '/admin-notifications',
  open_admin_notifications: '/admin-notifications',
  open_deals: '/deals',
  open_lucky_wheel: '/lucky-wheel',
  open_scratch_campaigns: '/scratch-campaigns',
  open_stamp_codes: '/stamp-codes',
  open_team: '/team',
  open_stores: '/stores',
  open_client_qr: '/client-app-qr',
  open_quick_add: '/quick-add',
  open_games: '/games',
  open_notification_settings: '/notification-settings',
};

/**
 * Actions that do not map to a plain screen: the caller handles them with
 * context (support WhatsApp link, verify-email needs the merchant's email).
 */
const SPECIAL_ACTIONS = ['open_support', 'open_verify_email'] as const;
export type SpecialAction = (typeof SPECIAL_ACTIONS)[number];

export function isSpecialAction(action: string | null | undefined): action is SpecialAction {
  return !!action && (SPECIAL_ACTIONS as readonly string[]).includes(action);
}

export function routeForAction(action: string | null | undefined): Href | null {
  if (!action) return null;
  return Object.prototype.hasOwnProperty.call(ACTION_ROUTES, action) ? ACTION_ROUTES[action] : null;
}
