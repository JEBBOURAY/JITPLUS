import { parseRetryAfterMs } from '@/components/login/retryAfter';

const res = (response: Record<string, unknown>) => ({ response });

describe('parseRetryAfterMs', () => {
  it('reads the Retry-After header in seconds (string or number)', () => {
    expect(parseRetryAfterMs(res({ headers: { 'retry-after': '30' } }))).toBe(30_000);
    expect(parseRetryAfterMs(res({ headers: { 'Retry-After': 5 } }))).toBe(5_000);
  });

  it('reads an HTTP-date Retry-After relative to now, null when past', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const future = new Date(now + 120_000).toUTCString();
    const got = parseRetryAfterMs(res({ headers: { 'retry-after': future } }));
    expect(got).toBeGreaterThan(118_000);
    expect(got).toBeLessThanOrEqual(120_000);
    expect(parseRetryAfterMs(res({ headers: { 'retry-after': new Date(now - 1000).toUTCString() } }))).toBeNull();
    jest.restoreAllMocks();
  });

  it('falls back to body fields in ms, seconds, then minutes', () => {
    expect(parseRetryAfterMs(res({ data: { retryAfterMs: 1500 } }))).toBe(1500);
    expect(parseRetryAfterMs(res({ data: { retry_after: '12' } }))).toBe(12_000);
    expect(parseRetryAfterMs(res({ data: { waitMinutes: 2 } }))).toBe(120_000);
  });

  it('parses the wait from the message, minutes before seconds', () => {
    expect(parseRetryAfterMs(res({ data: { message: 'Réessayez dans 15 minutes' } }))).toBe(900_000);
    expect(parseRetryAfterMs(res({ data: { message: 'wait 40 s' } }))).toBe(40_000);
  });

  it('returns null without a usable hint', () => {
    expect(parseRetryAfterMs(res({ data: { retryAfter: 0, message: 'Too many requests' } }))).toBeNull();
    expect(parseRetryAfterMs(new Error('boom'))).toBeNull();
    expect(parseRetryAfterMs(undefined)).toBeNull();
  });
});
