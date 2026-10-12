import type { Href } from 'expo-router';

/**
 * Deep-link keys sent by the backend in the push payload (`data.action`) and
 * stored on inbox items. Shared by the push tap handler and the inbox screen
 * so both always open the same screen.
 */
const ACTION_ROUTES: Record<string, Href> = {
  open_referral: '/referral',
  open_settings: '/settings',
  open_security: '/security',
  open_logo: '/(tabs)/account',
  open_scan: '/(tabs)/scan',
  open_plan: '/plan',
  open_dashboard: '/(tabs)',
  open_clients: '/(tabs)/activity',
  open_messages: '/(tabs)/messages',
  open_notifications: '/admin-notifications',
  open_admin_notifications: '/admin-notifications',
};

export function routeForAction(action: string | null | undefined): Href | null {
  if (!action) return null;
  return Object.prototype.hasOwnProperty.call(ACTION_ROUTES, action) ? ACTION_ROUTES[action] : null;
}
