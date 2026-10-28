import { notificationKind, notificationTapRoute } from '@/utils/notificationKind';

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
});
