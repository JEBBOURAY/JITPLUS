import { notificationKind, notificationLinkRoute, notificationTapRoute } from '@/utils/notificationKind';

const ID = '3f2b8c1e-9a4d-4e2b-8f1a-0c5d6e7f8a9b';

describe('notificationKind', () => {
  it('gives deal digests their own visual even without a merchant', () => {
    expect(notificationKind({ type: 'deals_digest', merchantName: null })).toBe('deals');
  });

  it('keeps merchant and official notifications apart', () => {
    expect(notificationKind({ type: 'promo', merchantName: 'Café Atlas' })).toBe('merchant');
    expect(notificationKind({ type: 'promo', merchantName: null })).toBe('official');
    expect(notificationKind({ type: 'info', merchantName: '' })).toBe('official');
  });
});

describe('notificationTapRoute', () => {
  it('opens the deals tab for a digest, the detail sheet otherwise', () => {
    expect(notificationTapRoute({ type: 'deals_digest', merchantName: null })).toBe('/(tabs)/deals');
    expect(notificationTapRoute({ type: 'promo', merchantName: 'Café Atlas' })).toBeNull();
    expect(notificationTapRoute({ type: 'reward', merchantName: null })).toBeNull();
  });

  it('opens the screen the notification points at', () => {
    const base = { type: 'promo' as const, merchantName: 'Café Atlas' };
    expect(notificationTapRoute({ ...base, link: { event: 'stamps_updated', merchantId: ID } }))
      .toEqual({ pathname: '/merchant/[id]', params: { id: ID } });
    expect(notificationTapRoute({ ...base, link: { action: 'open_coupon', couponId: ID } }))
      .toEqual({ pathname: '/coupons/[id]', params: { id: ID } });
    expect(notificationTapRoute({ ...base, link: { action: 'open_scratch', campaignId: ID } }))
      .toEqual({ pathname: '/scratch/[id]', params: { id: ID, mode: 'campaign' } });
    expect(notificationTapRoute({ ...base, link: { event: 'lucky_wheel_ticket', action: 'open_wheel', merchantId: ID } }))
      .toEqual({ pathname: '/(tabs)', params: { wheel: ID } });
    expect(notificationTapRoute({ type: 'deals_digest', merchantName: null, link: { action: 'open_deal', dealId: ID } }))
      .toEqual({ pathname: '/deal/[id]', params: { id: ID } });
  });

  it('keeps a merchant message in its sheet, with a link to the merchant', () => {
    const message = { type: 'promo' as const, merchantName: 'Café Atlas', link: { event: 'notification_new', action: 'open_card', merchantId: ID } };
    expect(notificationTapRoute(message)).toBeNull();
    expect(notificationLinkRoute(message)).toEqual({ pathname: '/merchant/[id]', params: { id: ID } });
  });

  it('has no link for a notification without a target', () => {
    const official = { type: 'promo' as const, merchantName: null, link: { event: 'admin_broadcast', action: 'open_notifications' } };
    expect(notificationTapRoute(official)).toBeNull();
    expect(notificationLinkRoute(official)).toBeNull();
    expect(notificationLinkRoute({ type: 'promo', merchantName: null, link: null })).toBeNull();
  });
});
