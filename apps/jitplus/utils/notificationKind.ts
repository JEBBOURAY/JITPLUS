import type { Href } from 'expo-router';
import type { ClientNotification } from '@/types';

export type NotificationKind = 'deals' | 'official' | 'merchant';

type NotificationLike = Pick<ClientNotification, 'type' | 'merchantName'>;

/** Deal digests have no merchant: they get the deals visual instead of the JitPlus logo. */
export function notificationKind(notif: NotificationLike): NotificationKind {
  if (notif.type === 'deals_digest') return 'deals';
  return notif.merchantName ? 'merchant' : 'official';
}

/** Screen opened by tapping an in-app notification; null shows its detail sheet. */
export function notificationTapRoute(notif: NotificationLike): Href | null {
  return notif.type === 'deals_digest' ? '/(tabs)/deals' : null;
}
