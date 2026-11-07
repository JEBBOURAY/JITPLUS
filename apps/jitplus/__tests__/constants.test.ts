import {
  DEBOUNCE_MS, FRESH_REWARD_WINDOW_MS,
  SWIPE_THRESHOLD_RATIO,
} from '@/constants';

describe('constants', () => {
  it('DEBOUNCE_MS is a positive number', () => {
    expect(DEBOUNCE_MS).toBeGreaterThan(0);
  });

  it('FRESH_REWARD_WINDOW_MS equals 24h in ms', () => {
    expect(FRESH_REWARD_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('SWIPE_THRESHOLD_RATIO is between 0 and 1', () => {
    expect(SWIPE_THRESHOLD_RATIO).toBeGreaterThan(0);
    expect(SWIPE_THRESHOLD_RATIO).toBeLessThan(1);
  });
});
