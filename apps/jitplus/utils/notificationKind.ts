import type { Href } from 'expo-router';
import type { ClientNotification } from '@/types';
import { NOTIFICATIONS_FEED, resolveNotificationRoute } from '@/utils/notificationRouting';

export type NotificationKind = 'deals' | 'official' | 'merchant';

type NotificationLike = Pick<ClientNotification, 'type' | 'merchantName'> & Partial<Pick<ClientNotification, 'link'>>;

/** Deal digests have no merchant: they get the deals visual instead of the JitPlus logo. */
export function notificationKind(notif: NotificationLike): NotificationKind {
  if (notif.type === 'deals_digest') return 'deals';
  return notif.merchantName ? 'merchant' : 'official';
}

/** Screen an in-app notification points at (same routing as a push tap); null when it has none. */
export function notificationLinkRoute(notif: NotificationLike): Href | null {
  if (notif.link) {
    const route = resolveNotificationRoute(notif.link);
    if (route !== NOTIFICATIONS_FEED) return route;
  }
  return notif.type === 'deals_digest' ? '/(tabs)/deals' : null;
}

/**
 * Screen opened by tapping an in-app notification; null shows its detail sheet.
 * A merchant's own message is read in the sheet first, which offers the link.
 */
export function notificationTapRoute(notif: NotificationLike): Href | null {
  if (notif.link?.event === 'notification_new') return null;
  return notificationLinkRoute(notif);
}
