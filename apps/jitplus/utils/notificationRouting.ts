import type { Href } from 'expo-router';
import { isEntityId } from '@/utils/ids';

export type NotificationData = Record<string, string> | undefined;

/** The in-app feed: where a notification with no target of its own lands. */
export const NOTIFICATIONS_FEED: Href = '/(tabs)/notifications';
const FEED = NOTIFICATIONS_FEED;

/**
 * Screen opened by a notification tap. The same payload shape arrives on
 * Android (FCM data) and iOS (APNs `data`). Ids are validated before they are
 * put in a route.
 */
export function resolveNotificationRoute(data: NotificationData): Href {
  const merchantId = isEntityId(data?.merchantId) ? data.merchantId : undefined;
  const merchantRoute: Href | undefined = merchantId
    ? { pathname: '/merchant/[id]', params: { id: merchantId } }
    : undefined;

  // The wheel is a full-screen modal of the home tab; `wheel` carries the
  // merchant whose tickets to show first.
  const wheelRoute: Href = { pathname: '/(tabs)', params: { wheel: merchantId ?? '1' } };

  // Action-based links from automated campaigns.
  switch (data?.action) {
    case 'open_explore': return '/(tabs)/discover';
    case 'open_scan': return '/(tabs)/qr';
    case 'open_cards': return '/(tabs)';
    case 'open_card': return merchantRoute ?? FEED;
    case 'open_notifications': return FEED;
    case 'open_wheel': return wheelRoute;
    case 'open_scratch': {
      if (isEntityId(data.cardId)) return { pathname: '/scratch/[id]', params: { id: data.cardId } };
      // The initial "card received" push only carries the campaign id.
      if (isEntityId(data.campaignId)) {
        return { pathname: '/scratch/[id]', params: { id: data.campaignId, mode: 'campaign' } };
      }
      return '/scratch';
    }
    case 'open_coupon':
      return isEntityId(data.couponId) ? { pathname: '/coupons/[id]', params: { id: data.couponId } } : '/coupons';
    case 'open_coupons': return '/coupons';
    case 'open_deal':
      return isEntityId(data.dealId) ? { pathname: '/deal/[id]', params: { id: data.dealId } } : '/(tabs)/deals';
    case 'open_deals': return '/(tabs)/deals';
    case undefined:
    case '':
      break;
    default:
      if (__DEV__) console.warn('Unknown FCM action:', data?.action);
  }

  // Tickets pushed by a backend that predates `open_wheel`.
  if (data?.event === 'lucky_wheel_ticket') return wheelRoute;

  // No (known) action: open whatever the payload points at. Covers the
  // transactional events (stamps, rewards) and any event
  // added on the backend after this build shipped.
  if (isEntityId(data?.couponId)) return { pathname: '/coupons/[id]', params: { id: data.couponId } };
  if (isEntityId(data?.cardId)) return { pathname: '/scratch/[id]', params: { id: data.cardId } };
  if (isEntityId(data?.dealId)) return { pathname: '/deal/[id]', params: { id: data.dealId } };
  // Payloads with no target (admin broadcasts) land on the in-app feed, where
  // the message can be read.
  return merchantRoute ?? FEED;
}
