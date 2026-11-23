import { readFileSync } from 'fs';
import { join } from 'path';
import { ERROR_MESSAGES } from '../common/i18n/error-messages';
import { CANCEL_GRACE_MS, MAX_AGENDA_DAYS, MAX_SERVICES, clientCanCancel } from './booking.constants';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-21T10:00:00Z');
const booking = (status: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED', startsInMs: number, createdAgoMs: number) => ({
  status,
  startsAt: new Date(NOW + startsInMs),
  createdAt: new Date(NOW - createdAgoMs),
});

describe('clientCanCancel', () => {
  it('lets a pending request be withdrawn at any time', () => {
    expect(clientCanCancel(booking('PENDING', 10 * 60_000, 5 * HOUR), 2, NOW)).toBe(true);
  });

  it('follows the merchant deadline for a confirmed booking', () => {
    expect(clientCanCancel(booking('CONFIRMED', 3 * HOUR, 24 * HOUR), 2, NOW)).toBe(true);
    expect(clientCanCancel(booking('CONFIRMED', 2 * HOUR, 24 * HOUR), 2, NOW)).toBe(true);
    expect(clientCanCancel(booking('CONFIRMED', 2 * HOUR - 1, 24 * HOUR), 2, NOW)).toBe(false);
  });

  it('lets a booking made inside the deadline be undone during the grace period', () => {
    // Booked 90 minutes ahead with a 2 h deadline: never cancellable before.
    expect(clientCanCancel(booking('CONFIRMED', 90 * 60_000, 60_000), 2, NOW)).toBe(true);
    expect(clientCanCancel(booking('CONFIRMED', 90 * 60_000, CANCEL_GRACE_MS), 2, NOW)).toBe(true);
    expect(clientCanCancel(booking('CONFIRMED', 90 * 60_000, CANCEL_GRACE_MS + 1), 2, NOW)).toBe(false);
  });

  it('never applies the grace period once the visit has started', () => {
    expect(clientCanCancel(booking('CONFIRMED', 0, 60_000), 2, NOW)).toBe(false);
    expect(clientCanCancel(booking('CONFIRMED', -60_000, 5 * 60_000), 0, NOW)).toBe(false);
  });

  it('refuses any other status', () => {
    expect(clientCanCancel(booking('CHECKED_IN', 3 * HOUR, 60_000), 2, NOW)).toBe(false);
    expect(clientCanCancel(booking('COMPLETED', 3 * HOUR, 60_000), 2, NOW)).toBe(false);
  });
});

describe('booking error keys', () => {
  it('translates every key the booking module throws', () => {
    const used = new Set<string>();
    for (const file of ['booking-merchant.service.ts', 'booking-client.service.ts', 'booking.controllers.ts', 'booking-availability.service.ts']) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      for (const [key] of source.matchAll(/error\.booking\.[A-Za-z]+/g)) used.add(key);
    }
    expect(used.size).toBeGreaterThan(20);
    for (const key of used) {
      expect(ERROR_MESSAGES[key]).toEqual({ fr: expect.any(String), en: expect.any(String), ar: expect.any(String) });
    }
  });

  it('keeps no French sentence in the merchant booking API', () => {
    const source = readFileSync(join(__dirname, 'booking-merchant.service.ts'), 'utf8');
    const literal = [...source.matchAll(/Exception\(\s*(['"`])(?!error\.)/g)];
    expect(literal).toHaveLength(0);
  });

  it('quotes the real limits in the texts', () => {
    for (const lang of ['fr', 'en', 'ar'] as const) {
      expect(ERROR_MESSAGES['error.booking.maxServices'][lang]).toContain(String(MAX_SERVICES));
      expect(ERROR_MESSAGES['error.booking.periodTooLong'][lang]).toContain(String(MAX_AGENDA_DAYS));
    }
  });
});
