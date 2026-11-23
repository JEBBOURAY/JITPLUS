import { getCollectionGiftStatus, splitCollectionGifts } from '../utils/collectionHistory';

const NOW = new Date('2026-11-22T12:00:00Z');
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000).toISOString();

function gift(id: string, coupon: any, completedAt = day(-1)) {
  return { id, completedAt, coupon };
}
const coupon = (over: Partial<{ status: string; validFrom: string; expiresAt: string }> = {}) => ({
  id: 'k', status: 'ACTIVE', validFrom: day(-1), expiresAt: day(5), redeemedAt: null, ...over,
});

describe('getCollectionGiftStatus', () => {
  it('reads the coupon state', () => {
    expect(getCollectionGiftStatus(gift('a', coupon()), NOW)).toBe('toUse');
    expect(getCollectionGiftStatus(gift('a', coupon({ validFrom: day(1) })), NOW)).toBe('soon');
    expect(getCollectionGiftStatus(gift('a', coupon({ status: 'REDEEMED' })), NOW)).toBe('used');
    expect(getCollectionGiftStatus(gift('a', coupon({ status: 'CANCELLED' })), NOW)).toBe('cancelled');
    expect(getCollectionGiftStatus(gift('a', coupon({ status: 'EXPIRED' })), NOW)).toBe('expired');
    expect(getCollectionGiftStatus(gift('a', null), NOW)).toBe('gone');
  });

  it('treats an ACTIVE coupon past its end as expired (stale cache)', () => {
    expect(getCollectionGiftStatus(gift('a', coupon({ expiresAt: day(-1) })), NOW)).toBe('expired');
  });
});

describe('splitCollectionGifts', () => {
  it('puts usable gifts first by expiry, and the others latest first', () => {
    const gifts = [
      gift('late', coupon({ expiresAt: day(9) })),
      gift('used-old', coupon({ status: 'REDEEMED' }), day(-10)),
      gift('soon', coupon({ validFrom: day(1), expiresAt: day(3) })),
      gift('used-new', coupon({ status: 'REDEEMED' }), day(-2)),
    ];
    const { toUse, past } = splitCollectionGifts(gifts, NOW);
    expect(toUse.map((g) => g.id)).toEqual(['soon', 'late']);
    expect(past.map((g) => g.id)).toEqual(['used-new', 'used-old']);
  });
});
