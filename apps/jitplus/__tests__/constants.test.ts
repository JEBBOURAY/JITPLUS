import {
  DEBOUNCE_MS, FOCUS_DELAY_MS, BANNER_ANIM_DURATION_MS,
  WELCOME_BANNER_VISIBLE_MS, REWARD_BANNER_VISIBLE_MS, FRESH_REWARD_WINDOW_MS,
  SWIPE_THRESHOLD_RATIO, MAX_VISIBLE_STAMPS, DEFAULT_STAMPS_GOAL,
  OTP_RESEND_COOLDOWN_S, OTP_CODE_LENGTH, MIN_PASSWORD_LENGTH,
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

  it('MAX_VISIBLE_STAMPS is reasonable', () => {
    expect(MAX_VISIBLE_STAMPS).toBeGreaterThanOrEqual(10);
  });

  it('OTP_CODE_LENGTH is 6', () => {
    expect(OTP_CODE_LENGTH).toBe(6);
  });

  it('MIN_PASSWORD_LENGTH is 8', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });
});
