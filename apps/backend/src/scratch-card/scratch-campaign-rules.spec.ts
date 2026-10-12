import { BadRequestException } from '@nestjs/common';
import {
  normalizeRewards,
  plannedSendAt,
  resolveCampaignDates,
  resolveExtendedDates,
  validateAudience,
} from './scratch-campaign-rules';
import { nextAllowedSendTime } from '../common/tasks/cron-utils';

describe('nextAllowedSendTime (Morocco UTC+1)', () => {
  const at = (iso: string) => nextAllowedSendTime(new Date(iso)).toISOString();

  it('keeps an allowed time', () => {
    expect(at('2026-10-08T10:00:00.000Z')).toBe('2026-10-08T10:00:00.000Z');
  });

  it('moves a late evening send to 09:00 the next morning', () => {
    // Thursday 21:45 Morocco
    expect(at('2026-10-08T20:45:00.000Z')).toBe('2026-10-09T08:00:00.000Z');
  });

  it('moves an early morning send to 09:00 the same day', () => {
    // Thursday 07:30 Morocco
    expect(at('2026-10-08T06:30:00.000Z')).toBe('2026-10-08T08:00:00.000Z');
  });

  it('moves a Friday prayer-time send to 14:00', () => {
    // Friday 12:00 Morocco
    expect(at('2026-10-09T11:00:00.000Z')).toBe('2026-10-09T13:00:00.000Z');
  });
});

describe('plannedSendAt', () => {
  const now = new Date('2026-01-15T10:00:00Z');
  const fallback = new Date('2026-01-20T10:00:00Z');

  it('keeps the fallback when the field is absent', () => {
    expect(plannedSendAt(undefined, fallback, now)).toBe(fallback);
  });

  it('uses now when explicitly null', () => {
    expect(plannedSendAt(null, fallback, now)).toBe(now);
  });

  it('uses the planned date, never in the past', () => {
    expect(plannedSendAt('2026-02-01T09:00:00Z', fallback, now).toISOString()).toBe('2026-02-01T09:00:00.000Z');
    expect(plannedSendAt('2026-01-01T09:00:00Z', fallback, now)).toBe(now);
  });

  it('lets a card end 50 days after a send planned in 15 days', () => {
    const sendAt = plannedSendAt('2026-01-30T09:00:00Z', fallback, now);
    expect(() => resolveCampaignDates('2026-03-21', '2026-03-28', sendAt)).not.toThrow();
  });

  it('rejects an invalid date', () => {
    expect(() => plannedSendAt('nope', fallback, now)).toThrow(BadRequestException);
  });
});

const unlimited = { type: 'BONUS_STAMPS' as const, label: '+2 tampons', value: 2, weight: 10 };

describe('normalizeRewards', () => {
  it('requires at least one unlimited reward', () => {
    expect(() => normalizeRewards([{ ...unlimited, totalStock: 10 }])).toThrow(BadRequestException);
    expect(normalizeRewards([unlimited])[0]).toMatchObject({ totalStock: null, remaining: null });
  });

  it('copies the stock into remaining', () => {
    const [, limited] = normalizeRewards([unlimited, { type: 'FREE_PRODUCT', label: 'Café', weight: 1, totalStock: 50 }]);
    expect(limited).toMatchObject({ totalStock: 50, remaining: 50, value: null });
  });

  it('validates values per type', () => {
    expect(() => normalizeRewards([{ ...unlimited, type: 'PERCENT_DISCOUNT', value: 120 }])).toThrow('pourcentage');
    expect(() => normalizeRewards([{ ...unlimited, value: 25 }])).toThrow('tampons');
    expect(() => normalizeRewards([{ ...unlimited, type: 'FIXED_DISCOUNT', value: 0 }])).toThrow('montant');
  });

  it('checks the time window and weekdays', () => {
    expect(() => normalizeRewards([{ ...unlimited, allowedFromMin: 600 }])).toThrow('plage horaire');
    expect(normalizeRewards([{ ...unlimited, allowedWeekdays: 127 }])[0].allowedWeekdays).toBeNull();
    expect(normalizeRewards([{ ...unlimited, allowedWeekdays: 3 }])[0].allowedWeekdays).toBe(3);
  });

  it('only keeps the max discount on percentages', () => {
    const [r] = normalizeRewards([{ ...unlimited, type: 'FIXED_DISCOUNT', value: 30, maxDiscount: 10 }]);
    expect(r.maxDiscount).toBeNull();
  });
});

describe('validateAudience', () => {
  it('needs a value except for all clients', () => {
    expect(validateAudience('ALL_CLIENTS', 99)).toBeNull();
    expect(() => validateAudience('ACTIVE_SINCE', null)).toThrow(BadRequestException);
    expect(() => validateAudience('ACTIVE_SINCE', 400)).toThrow(BadRequestException);
    expect(validateAudience('MIN_STAMPS', 400)).toBe(400);
  });
});

describe('resolveCampaignDates', () => {
  const sendAt = new Date('2026-01-15T10:00:00Z');

  it('turns days into end of day in Morocco', () => {
    const d = resolveCampaignDates('2026-01-22', '2026-01-29', sendAt);
    expect(d.cardExpiresAt.toISOString()).toBe('2026-01-22T22:59:59.999Z');
    expect(d.couponExpiresAt.toISOString()).toBe('2026-01-29T22:59:59.999Z');
  });

  it('enforces the gaps and limits', () => {
    expect(() => resolveCampaignDates('2026-01-15', '2026-01-29', sendAt)).toThrow('lendemain');
    expect(() => resolveCampaignDates('2026-01-22', '2026-01-22', sendAt)).toThrow('1 jour');
    expect(() => resolveCampaignDates('2026-03-30', '2026-04-05', sendAt)).toThrow('60');
    expect(() => resolveCampaignDates('2026-01-22', '2026-06-01', sendAt)).toThrow('120');
  });
});

describe('resolveExtendedDates', () => {
  const current = {
    cardExpiresAt: new Date('2026-01-22T22:59:59.999Z'),
    couponExpiresAt: new Date('2026-01-29T22:59:59.999Z'),
    sentAt: new Date('2026-01-15T10:00:00Z'),
  };
  const now = new Date('2026-01-20T10:00:00Z');

  it('only allows moving dates later', () => {
    expect(() => resolveExtendedDates(current, { couponExpiresOn: '2026-01-28' }, now)).toThrow('prolongées');
    const d = resolveExtendedDates(current, { couponExpiresOn: '2026-02-05' }, now);
    expect(d.couponExpiresAt.toISOString()).toBe('2026-02-05T22:59:59.999Z');
    expect(d.cardExpiresAt).toEqual(current.cardExpiresAt);
  });

  it('keeps the coupon at least one day after the card', () => {
    expect(() => resolveExtendedDates(current, { cardExpiresOn: '2026-01-29' }, now)).toThrow('1 jour');
  });
});
