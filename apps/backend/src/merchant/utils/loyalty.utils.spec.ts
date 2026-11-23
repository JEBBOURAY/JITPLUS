import { computeEarnedStamps, computeEarnedStampsLegacy } from './loyalty.utils';
import { MAX_STAMPS_PER_TX } from '../../common/constants';

describe('computeEarnedStamps', () => {
  it('counts in cents, without float undercount', () => {
    expect(computeEarnedStamps(3.3, 1.1)).toBe(3);
    expect(computeEarnedStamps(6.6, 2.2)).toBe(3);
    expect(computeEarnedStamps(0.7, 0.1)).toBe(7);
    expect(computeEarnedStamps(3.29, 1.1)).toBe(2);
    expect(computeEarnedStamps(35, 10)).toBe(3);
  });

  it('returns 0 below one stamp or for invalid values', () => {
    expect(computeEarnedStamps(9.99, 10)).toBe(0);
    expect(computeEarnedStamps(0, 10)).toBe(0);
    expect(computeEarnedStamps(10, 0)).toBe(0);
    expect(computeEarnedStamps(10, 0.001)).toBe(0);
  });

  it('caps at MAX_STAMPS_PER_TX', () => {
    expect(computeEarnedStamps(100000, 1)).toBe(MAX_STAMPS_PER_TX);
  });

  it('keeps the legacy float count that old Pro builds send', () => {
    expect(computeEarnedStampsLegacy(3.3, 1.1)).toBe(2);
    expect(computeEarnedStampsLegacy(35, 10)).toBe(3);
  });
});
