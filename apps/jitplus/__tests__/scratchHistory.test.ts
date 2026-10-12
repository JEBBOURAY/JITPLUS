import { getScratchEntryStatus, splitScratchCards } from '@/utils/scratchHistory';

const NOW = new Date('2026-10-10T12:00:00Z');
const FUTURE = '2026-10-20T12:00:00Z';
const PAST = '2026-10-01T12:00:00Z';

function card(over: Record<string, unknown> = {}) {
  return {
    id: 'c',
    status: 'PENDING',
    expiresAt: FUTURE,
    scratchedAt: null,
    coupon: null,
    ...over,
  } as Parameters<typeof getScratchEntryStatus>[0] & { id: string };
}

function coupon(status: string, expiresAt = FUTURE) {
  return { status, expiresAt } as never;
}

describe('getScratchEntryStatus', () => {
  it('classifies unscratched cards', () => {
    expect(getScratchEntryStatus(card(), NOW)).toBe('pending');
    expect(getScratchEntryStatus(card({ expiresAt: PAST }), NOW)).toBe('missed');
    expect(getScratchEntryStatus(card({ status: 'EXPIRED' }), NOW)).toBe('missed');
    expect(getScratchEntryStatus(card({ status: 'CANCELLED' }), NOW)).toBe('missed');
  });

  it('follows the coupon once scratched', () => {
    const scratched = { status: 'SCRATCHED', scratchedAt: PAST };
    expect(getScratchEntryStatus(card({ ...scratched, coupon: coupon('ACTIVE') }), NOW)).toBe('toUse');
    expect(getScratchEntryStatus(card({ ...scratched, coupon: coupon('ACTIVE', PAST) }), NOW)).toBe('expired');
    expect(getScratchEntryStatus(card({ ...scratched, coupon: coupon('REDEEMED') }), NOW)).toBe('used');
    expect(getScratchEntryStatus(card({ ...scratched, coupon: coupon('EXPIRED') }), NOW)).toBe('expired');
    expect(getScratchEntryStatus(card({ ...scratched, coupon: coupon('CANCELLED') }), NOW)).toBe('cancelled');
  });
});

describe('splitScratchCards', () => {
  it('splits and orders the lists', () => {
    const cards = [
      card({ id: 'p2', expiresAt: '2026-10-25T00:00:00Z' }),
      card({ id: 'p1', expiresAt: '2026-10-15T00:00:00Z' }),
      card({ id: 'u2', status: 'SCRATCHED', scratchedAt: PAST, coupon: coupon('ACTIVE', '2026-11-01T00:00:00Z') }),
      card({ id: 'u1', status: 'SCRATCHED', scratchedAt: PAST, coupon: coupon('ACTIVE', '2026-10-12T00:00:00Z') }),
      card({ id: 'old', status: 'SCRATCHED', scratchedAt: '2026-09-01T00:00:00Z', coupon: coupon('REDEEMED') }),
      card({ id: 'recent', status: 'SCRATCHED', scratchedAt: '2026-10-05T00:00:00Z', coupon: coupon('REDEEMED') }),
    ];
    const { pending, toUse, past } = splitScratchCards(cards, NOW);
    expect(pending.map((c) => c.id)).toEqual(['p1', 'p2']);
    expect(toUse.map((c) => c.id)).toEqual(['u1', 'u2']);
    expect(past.map((c) => c.id)).toEqual(['recent', 'old']);
  });
});
