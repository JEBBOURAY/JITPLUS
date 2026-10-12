import {
  emptyReward,
  initialCampaignForm,
  isSlotTooFar,
  isSlotUnavailable,
  pickSendSlot,
  validateDates,
  validateRewards,
} from '@/components/scratch/campaignForm';

const at = (iso: string) => new Date(iso).getTime();

describe('scratch planned send: 30-day limit (Morocco time)', () => {
  // 2026-10-08 09:00 in Morocco (UTC+1)
  const now = at('2026-10-08T08:00:00Z');

  it('accepts a slot within 30 days and refuses one beyond', () => {
    expect(isSlotTooFar('2026-11-07', '10:00', at('2026-10-08T09:30:00Z'))).toBe(false);
    expect(isSlotTooFar('2026-11-07', '10:00', now)).toBe(true);
    expect(isSlotUnavailable('2026-11-07', '10:00', now)).toBe(true);
  });

  it('picks no slot past the limit on the last day', () => {
    expect(pickSendSlot('2026-11-07', '17:00', at('2026-10-08T10:30:00Z'))).toBe('10:00');
  });

  it('rejects a planned slot beyond 30 days', () => {
    const form = { ...initialCampaignForm('2026-10-08'), sendMode: 'later' as const, sendDay: '2026-11-07', sendSlot: '19:00' };
    expect(validateDates(form, '2026-10-08', now)).toEqual({ key: 'scratch.wizard.slotTooFar', params: { days: 30 } });
  });
});

describe('scratch rewards: backend bounds', () => {
  const percent = (patch: Partial<ReturnType<typeof emptyReward>>) => ({
    ...emptyReward('PERCENT_DISCOUNT'),
    label: '-20 %',
    value: '20',
    ...patch,
  });

  it('caps the maximum discount at 10 000 MAD', () => {
    expect(validateRewards([percent({ maxDiscount: '10000' })])).toBeNull();
    expect(validateRewards([percent({ maxDiscount: '10001' })])).toEqual({
      key: 'scratch.wizard.maxDiscountRange',
      params: { max: 10_000 },
    });
  });

  it('caps the minimum purchase at 100 000 MAD', () => {
    expect(validateRewards([percent({ minPurchase: '100000' })])).toBeNull();
    expect(validateRewards([percent({ minPurchase: '100000.5' })])).toEqual({
      key: 'scratch.wizard.minPurchaseRange',
      params: { max: 100_000 },
    });
  });
});
