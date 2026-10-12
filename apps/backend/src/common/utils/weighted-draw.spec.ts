import { weightedRandomPick } from './weighted-draw';

describe('weightedRandomPick', () => {
  const items = [
    { id: 'a', weight: 1 },
    { id: 'b', weight: 3 },
    { id: 'c', weight: 6 },
  ];

  it('maps each roll to the matching weight interval', () => {
    const pickAt = (roll: number) => weightedRandomPick(items, () => roll)?.id;
    expect(pickAt(0)).toBe('a');
    expect(pickAt(1)).toBe('b');
    expect(pickAt(3)).toBe('b');
    expect(pickAt(4)).toBe('c');
    expect(pickAt(9)).toBe('c');
  });

  it('passes the total weight to the rng', () => {
    const rng = jest.fn(() => 0);
    weightedRandomPick(items, rng);
    expect(rng).toHaveBeenCalledWith(10);
  });

  it('never picks items with a zero or negative weight', () => {
    const list = [
      { id: 'zero', weight: 0 },
      { id: 'neg', weight: -5 },
      { id: 'ok', weight: 2 },
    ];
    for (let roll = 0; roll < 2; roll++) {
      expect(weightedRandomPick(list, () => roll)?.id).toBe('ok');
    }
  });

  it('returns null when nothing is eligible', () => {
    expect(weightedRandomPick([])).toBeNull();
    expect(weightedRandomPick([{ weight: 0 }])).toBeNull();
  });

  it('roughly follows the weights with the real rng', () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const n = 20_000;
    for (let i = 0; i < n; i++) counts[weightedRandomPick(items)!.id]++;
    expect(counts.a / n).toBeCloseTo(0.1, 1);
    expect(counts.b / n).toBeCloseTo(0.3, 1);
    expect(counts.c / n).toBeCloseTo(0.6, 1);
  });
});
