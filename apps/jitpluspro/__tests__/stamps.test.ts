import { computeStampsForAmount, DEFAULT_AMOUNT_PER_STAMP, rescaleStamps, cardSlots } from '@/utils/stamps';
import { MAX_STAMPS_PER_TX } from '@/constants/app';

describe('computeStampsForAmount', () => {
  it('floors amount / amountPerStamp', () => {
    expect(computeStampsForAmount(25, 10)).toEqual({ stamps: 2, capped: false });
    expect(computeStampsForAmount(30, 7.5)).toEqual({ stamps: 4, capped: false });
  });

  it('returns 0 when the amount is below one stamp', () => {
    expect(computeStampsForAmount(9.99, 10)).toEqual({ stamps: 0, capped: false });
  });

  it('caps at MAX_STAMPS_PER_TX instead of rejecting', () => {
    expect(computeStampsForAmount(MAX_STAMPS_PER_TX * 10, 10)).toEqual({ stamps: MAX_STAMPS_PER_TX, capped: false });
    expect(computeStampsForAmount(MAX_STAMPS_PER_TX * 10 + 10, 10)).toEqual({ stamps: MAX_STAMPS_PER_TX, capped: true });
    expect(computeStampsForAmount(100000, 1)).toEqual({ stamps: MAX_STAMPS_PER_TX, capped: true });
  });

  it('falls back to the default amount per stamp when missing', () => {
    expect(computeStampsForAmount(DEFAULT_AMOUNT_PER_STAMP * 3, undefined).stamps).toBe(3);
    expect(computeStampsForAmount(DEFAULT_AMOUNT_PER_STAMP * 3, null).stamps).toBe(3);
    expect(computeStampsForAmount(DEFAULT_AMOUNT_PER_STAMP * 3, 0).stamps).toBe(3);
  });

  it('returns 0 for invalid amounts or rates', () => {
    expect(computeStampsForAmount(0, 10).stamps).toBe(0);
    expect(computeStampsForAmount(-50, 10).stamps).toBe(0);
    expect(computeStampsForAmount(Number.NaN, 10).stamps).toBe(0);
    expect(computeStampsForAmount(100, -5).stamps).toBe(0);
  });
});

describe('rescaleStamps', () => {
  it('keeps the progress ratio like the backend ROUND()', () => {
    expect(rescaleStamps(5, 10, 12)).toBe(6);
    expect(rescaleStamps(5, 10, 15)).toBe(8); // 7.5 rounds half up
    expect(rescaleStamps(3, 10, 5)).toBe(2); // 1.5 rounds half up
  });

  it('floors reward costs at 1 and balances at 0', () => {
    expect(rescaleStamps(1, 10, 3)).toBe(1);
    expect(rescaleStamps(1, 10, 3, 0)).toBe(0);
  });

  it('is a no-op when the reference is unchanged or invalid', () => {
    expect(rescaleStamps(7, 10, 10)).toBe(7);
    expect(rescaleStamps(7, 0, 10)).toBe(7);
  });
});

describe('cardSlots', () => {
  it('uses the cheapest reward when there is one', () => {
    expect(cardSlots([12, 8, 20], 10)).toBe(8);
  });

  it('falls back to stampsForReward without rewards', () => {
    expect(cardSlots([], 10)).toBe(10);
  });
});
