import { notificationLink } from './notification-link';

describe('notificationLink', () => {
  it('keeps the routing keys of a push payload and drops the display extras', () => {
    expect(notificationLink({
      event: 'coupon_redeemed', action: 'open_coupon', couponId: 'c1', merchantId: 'm1',
      newBalance: '4', merchantLogo: 'https://x/logo.png', merchantSocials: '{}',
    })).toEqual({ event: 'coupon_redeemed', action: 'open_coupon', couponId: 'c1', merchantId: 'm1' });
  });

  it('is undefined when the payload has nothing to route on', () => {
    expect(notificationLink({ merchantLogo: 'https://x/logo.png' })).toBeUndefined();
    expect(notificationLink(undefined)).toBeUndefined();
  });
});
