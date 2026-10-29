import { resolveNotificationRoute } from '@/utils/notificationRouting';

const ID = '3f2b8c1e-9a4d-4e2b-8f1a-0c5d6e7f8a9b';
const FEED = '/(tabs)/notifications';

describe('resolveNotificationRoute', () => {
  it('maps campaign actions to their screens', () => {
    expect(resolveNotificationRoute({ action: 'open_explore' })).toBe('/(tabs)/discover');
    expect(resolveNotificationRoute({ action: 'open_scan' })).toBe('/(tabs)/qr');
    expect(resolveNotificationRoute({ action: 'open_referral' })).toBe('/referral');
    expect(resolveNotificationRoute({ action: 'open_cards' })).toBe('/(tabs)');
    expect(resolveNotificationRoute({ action: 'open_notifications' })).toBe(FEED);
    expect(resolveNotificationRoute({ action: 'open_coupons' })).toBe('/coupons');
  });

  it('opens the merchant only for a valid id', () => {
    expect(resolveNotificationRoute({ action: 'open_card', merchantId: ID }))
      .toEqual({ pathname: '/merchant/[id]', params: { id: ID } });
    expect(resolveNotificationRoute({ action: 'open_card', merchantId: '../settings' })).toBe(FEED);
    expect(resolveNotificationRoute({ event: 'stamps_updated', merchantId: ID }))
      .toEqual({ pathname: '/merchant/[id]', params: { id: ID } });
    expect(resolveNotificationRoute({ event: 'reward_available', merchantId: 'x' })).toBe(FEED);
  });

  it('routes scratch cards by card id, then campaign id', () => {
    expect(resolveNotificationRoute({ action: 'open_scratch', cardId: ID }))
      .toEqual({ pathname: '/scratch/[id]', params: { id: ID } });
    expect(resolveNotificationRoute({ action: 'open_scratch', cardId: 'bad', campaignId: ID }))
      .toEqual({ pathname: '/scratch/[id]', params: { id: ID, mode: 'campaign' } });
    expect(resolveNotificationRoute({ action: 'open_scratch' })).toBe('/(tabs)');
  });

  it('routes coupons by id, or to the list', () => {
    expect(resolveNotificationRoute({ action: 'open_coupon', couponId: ID }))
      .toEqual({ pathname: '/coupons/[id]', params: { id: ID } });
    expect(resolveNotificationRoute({ action: 'open_coupon', couponId: '1 OR 1=1' })).toBe('/coupons');
  });

  it('routes deals by id, or to the deals tab', () => {
    expect(resolveNotificationRoute({ action: 'open_deal', dealId: ID }))
      .toEqual({ pathname: '/deal/[id]', params: { id: ID } });
    expect(resolveNotificationRoute({ action: 'open_deal', dealId: '../profile' })).toBe('/(tabs)/deals');
    expect(resolveNotificationRoute({ action: 'open_deal' })).toBe('/(tabs)/deals');
    expect(resolveNotificationRoute({ action: 'open_deals' })).toBe('/(tabs)/deals');
  });

  it('routes both shapes of the daily deals digest', () => {
    expect(resolveNotificationRoute({ event: 'deals_digest', action: 'open_deal', dealId: ID }))
      .toEqual({ pathname: '/deal/[id]', params: { id: ID } });
    expect(resolveNotificationRoute({ event: 'deals_digest', action: 'open_deals' })).toBe('/(tabs)/deals');
  });

  it('falls back to the in-app feed for broadcasts and unknown payloads', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveNotificationRoute({ event: 'weekly_digest' })).toBe(FEED);
    expect(resolveNotificationRoute({ action: 'something_new' })).toBe(FEED);
    expect(resolveNotificationRoute({})).toBe(FEED);
    expect(resolveNotificationRoute(undefined)).toBe(FEED);
  });
});
