import {
  buildWheelSegments,
  computeOddsBreakdown,
  pickTargetSegment,
  computeLandingRotation,
  segmentAtPointer,
  groupTicketsByCampaign,
  getDrawStatus,
} from '@/utils/luckyWheel';

const prizes = [
  { id: 'a', label: 'Café', weight: 3 },
  { id: 'b', label: 'Dessert', weight: 1 },
];

describe('computeOddsBreakdown', () => {
  it('sums prize odds to the win rate and returns the rest as lost', () => {
    const { perPrize, lostPct } = computeOddsBreakdown(prizes, 0.33);
    expect(perPrize.reduce((s, v) => s + v, 0)).toBe(33);
    expect(lostPct).toBe(67);
    expect(perPrize[0]).toBeGreaterThan(perPrize[1]);
  });

  it('handles a zero win rate', () => {
    expect(computeOddsBreakdown(prizes, 0)).toEqual({ perPrize: [0, 0], lostPct: 100 });
  });
});

describe('buildWheelSegments', () => {
  it('returns an empty wheel without prizes', () => {
    expect(buildWheelSegments([], 0.5, 'Perdu')).toEqual([]);
  });

  it('includes every prize and at least one lost segment', () => {
    const segs = buildWheelSegments(prizes, 1, 'Perdu');
    expect(segs.some((s) => s.isLost)).toBe(true);
    expect(segs.some((s) => s.prizeId === 'a')).toBe(true);
    expect(segs.some((s) => s.prizeId === 'b')).toBe(true);
    expect(segs.length).toBeGreaterThanOrEqual(8);
  });

  it('gives more segments to heavier prizes and follows the win rate', () => {
    const segs = buildWheelSegments(prizes, 0.5, 'Perdu');
    const a = segs.filter((s) => s.prizeId === 'a').length;
    const b = segs.filter((s) => s.prizeId === 'b').length;
    const lost = segs.filter((s) => s.isLost).length;
    expect(a).toBeGreaterThan(b);
    expect(lost).toBe(Math.round(segs.length / 2));
  });

  it('caps the wheel size with many prizes', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, label: `P${i}`, weight: 1 }));
    const segs = buildWheelSegments(many, 0.5, 'Perdu');
    expect(segs.filter((s) => s.isLost)).toHaveLength(1);
    expect(segs.filter((s) => !s.isLost)).toHaveLength(20);
  });
});

describe('pickTargetSegment', () => {
  const segs = buildWheelSegments(prizes, 0.5, 'Perdu');

  it('lands on the won prize', () => {
    const idx = pickTargetSegment(segs, { id: 'b', label: 'Dessert' }, () => 0.99);
    expect(segs[idx].prizeId).toBe('b');
  });

  it('falls back to label matching', () => {
    const idx = pickTargetSegment(segs, { label: 'Café' }, () => 0);
    expect(segs[idx].label).toBe('Café');
  });

  it('lands on a lost segment when lost', () => {
    const idx = pickTargetSegment(segs, null, () => 0.5);
    expect(segs[idx].isLost).toBe(true);
  });
});

describe('computeLandingRotation / segmentAtPointer', () => {
  it('stops on the target segment after the minimum travel', () => {
    for (let idx = 0; idx < 10; idx++) {
      for (const jitter of [-0.5, 0, 0.5]) {
        const current = 1234.5;
        const final = computeLandingRotation(current, idx, 10, 1400, jitter);
        expect(final - current).toBeGreaterThanOrEqual(1400);
        expect(final - current).toBeLessThan(1400 + 360);
        expect(segmentAtPointer(final, 10)).toBe(idx);
      }
    }
  });

  it('reads the segment under the pointer', () => {
    expect(segmentAtPointer(0, 8)).toBe(0);
    expect(segmentAtPointer(-50, 8)).toBe(1);
    expect(segmentAtPointer(10, 8)).toBe(7);
  });
});

describe('groupTicketsByCampaign', () => {
  it('groups tickets in order of first appearance', () => {
    const groups = groupTicketsByCampaign([
      { id: '1', campaignId: 'x' },
      { id: '2', campaignId: 'y' },
      { id: '3', campaignId: 'x' },
    ]);
    expect(groups.map((g) => g.campaignId)).toEqual(['x', 'y']);
    expect(groups[0].tickets.map((t) => t.id)).toEqual(['1', '3']);
  });
});

describe('getDrawStatus', () => {
  const now = new Date('2025-06-10T12:00:00Z');
  it('classifies draws', () => {
    expect(getDrawStatus({ result: 'LOST', fulfilment: null, claimBefore: null }, now)).toBe('lost');
    expect(getDrawStatus({ result: 'WON', fulfilment: 'CLAIMED', claimBefore: null }, now)).toBe('claimed');
    expect(getDrawStatus({ result: 'WON', fulfilment: 'PENDING', claimBefore: '2025-06-09T00:00:00Z' }, now)).toBe('expired');
    expect(getDrawStatus({ result: 'WON', fulfilment: 'PENDING', claimBefore: '2025-06-11T00:00:00Z' }, now)).toBe('pending');
    expect(getDrawStatus({ result: 'WON', fulfilment: 'EXPIRED', claimBefore: null }, now)).toBe('expired');
  });
});
