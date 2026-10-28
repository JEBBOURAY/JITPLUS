import type { Href } from 'expo-router';
import { isEntityId } from '@/utils/ids';

export type NotificationData = Record<string, string> | undefined;

const FEED: Href = '/(tabs)/notifications';

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

  // Action-based links from automated campaigns.
  switch (data?.action) {
    case 'open_explore': return '/(tabs)/discover';
    case 'open_scan': return '/(tabs)/qr';
    case 'open_referral': return '/referral';
    case 'open_cards': return '/(tabs)';
    case 'open_card': return merchantRoute ?? FEED;
    case 'open_notifications': return FEED;
    case 'open_scratch': {
      if (isEntityId(data.cardId)) return { pathname: '/scratch/[id]', params: { id: data.cardId } };
      // The initial "card received" push only carries the campaign id.
      if (isEntityId(data.campaignId)) {
        return { pathname: '/scratch/[id]', params: { id: data.campaignId, mode: 'campaign' } };
      }
      return '/(tabs)';
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

  // Event-based navigation (transactional & broadcast notifications).
  switch (data?.event) {
    case 'stamps_updated':
    case 'reward_available':
    case 'reward_redeemed':
    case 'reward_reminder':
    case 'notification_new':
      return merchantRoute ?? FEED;
    default:
      // Unknown payloads still land on the in-app feed rather than the
      // generic home — the user can find the message there.
      return FEED;
  }
}
