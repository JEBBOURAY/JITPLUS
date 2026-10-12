import {
  assuredChance,
  campaignFormReducer,
  detectDuration,
  emptyReward,
  formFromCampaign,
  formToInput,
  initialCampaignForm,
  syncAssured,
  templateRewards,
  validateRewards,
  validateStep,
} from '@/components/scratch/campaignForm';
import type { ScratchCampaignDto } from '@jitplus/shared/src/scratch';

const TODAY = '2026-10-10';
const labelFor = (type: string, value: number | null) => `${type}:${value}`;

describe('scratch wizard: ready to send with defaults', () => {
  it('starts on a valid single-discount campaign lasting one week', () => {
    const form = { ...initialCampaignForm(TODAY), name: 'Carte' };
    expect(form.rewards).toHaveLength(1);
    expect(form.rewards[0]).toMatchObject({ type: 'PERCENT_DISCOUNT', value: '10', weight: '100', unlimited: true });
    expect(form.cardExpiresOn).toBe('2026-10-17');
    expect(form.couponExpiresOn).toBe('2026-10-24');
    expect(validateStep(form, 'gift', TODAY)).toBeNull();
    expect(validateStep(form, 'audience', TODAY)).toBeNull();
    expect(validateStep(form, 'review', TODAY)).toBeNull();
  });

  it('fills an empty discount label with the automatic text', () => {
    const input = formToInput({ ...initialCampaignForm(TODAY), name: 'Carte' }, labelFor);
    expect(input.rewards[0].label).toBe('PERCENT_DISCOUNT:10');
  });
});

describe('scratch wizard: chances in percent', () => {
  it('gives the guaranteed reward the remainder', () => {
    const rewards = templateRewards('tiers');
    expect(rewards.map((r) => r.weight)).toEqual(['75', '20', '5']);
    expect(rewards[0].unlimited).toBe(true);
  });

  it('keeps the remainder in sync when another reward changes', () => {
    const form = { ...initialCampaignForm(TODAY), rewards: templateRewards('stamps') };
    const next = campaignFormReducer(form, { type: 'SET_REWARD', key: form.rewards[1].key, patch: { weight: '40' } });
    expect(next.rewards[0].weight).toBe('55');
  });

  it('never lets the guaranteed reward be removed or limited', () => {
    const form = { ...initialCampaignForm(TODAY), rewards: templateRewards('tiers') };
    expect(campaignFormReducer(form, { type: 'REMOVE_REWARD', key: form.rewards[0].key })).toBe(form);
    const limited = campaignFormReducer(form, { type: 'SET_REWARD', key: form.rewards[0].key, patch: { unlimited: false } });
    expect(limited.rewards[0].unlimited).toBe(true);
  });

  it('refuses other rewards taking 100 % or more', () => {
    const rewards = syncAssured([
      { ...emptyReward('PERCENT_DISCOUNT', '0', '10') },
      { ...emptyReward('PERCENT_DISCOUNT', '60', '20') },
      { ...emptyReward('BONUS_STAMPS', '40', '2') },
    ]);
    expect(assuredChance(rewards)).toBe(0);
    expect(validateRewards(rewards)).toEqual({ key: 'scratch.wizard.chancesTooHigh' });
  });

  it('asks for the product name of a free product', () => {
    expect(validateRewards(templateRewards('tiers'))).toEqual({ key: 'scratch.wizard.productRequired' });
  });

  it('adds a reward without pushing the guaranteed one below 1 %', () => {
    const form = { ...initialCampaignForm(TODAY), rewards: templateRewards('tiers') };
    const next = campaignFormReducer(form, { type: 'ADD_REWARD' });
    expect(next.rewards).toHaveLength(4);
    expect(next.rewards[3].weight).toBe('10');
    expect(next.rewards[0].weight).toBe('65');
  });
});

describe('scratch wizard: duration presets', () => {
  it('moves both deadlines with the sending day', () => {
    const form = initialCampaignForm(TODAY);
    const later = campaignFormReducer(form, { type: 'SET', patch: { sendMode: 'later', sendDay: '2026-10-12' }, today: TODAY });
    expect(later.cardExpiresOn).toBe('2026-10-19');
    expect(later.couponExpiresOn).toBe('2026-10-26');
    const month = campaignFormReducer(later, { type: 'SET', patch: { durationDays: 30 }, today: TODAY });
    expect(month.cardExpiresOn).toBe('2026-11-11');
    expect(month.couponExpiresOn).toBe('2026-11-18');
  });

  it('stops following the preset once a date is picked by hand', () => {
    const form = campaignFormReducer(initialCampaignForm(TODAY), {
      type: 'SET',
      patch: { cardExpiresOn: '2026-10-20', durationDays: null },
      today: TODAY,
    });
    const later = campaignFormReducer(form, { type: 'SET', patch: { sendMode: 'later', sendDay: '2026-10-12' }, today: TODAY });
    expect(later.cardExpiresOn).toBe('2026-10-20');
  });

  it('recognises a preset from saved dates', () => {
    expect(detectDuration(TODAY, '2026-10-24', '2026-10-31')).toBe(14);
    expect(detectDuration(TODAY, '2026-10-24', '2026-10-27')).toBeNull();
    expect(detectDuration(TODAY, '2026-10-20', '2026-10-27')).toBeNull();
  });
});

describe('scratch wizard: editing a saved campaign', () => {
  const reward = (patch: Record<string, unknown>) => ({
    id: 'r', type: 'PERCENT_DISCOUNT', label: 'PERCENT_DISCOUNT:20', value: 20, maxDiscount: null, rewardId: null,
    weight: 1, totalStock: null, minPurchaseAmount: null, minDelayHours: 0, allowedWeekdays: null,
    allowedFromMin: null, allowedToMin: null, ...patch,
  });

  it('puts the unlimited reward first and converts weights to percentages', () => {
    const campaign = {
      id: 'c', status: 'DRAFT', name: 'Old', message: null, designId: 'gold', audienceType: 'ALL_CLIENTS', audienceValue: null,
      cardExpiresOn: '2026-10-17', couponExpiresOn: '2026-10-24', sendAt: null,
      rewards: [
        reward({ id: 'a', type: 'FREE_PRODUCT', label: 'Café', value: null, weight: 1, totalStock: 10 }),
        reward({ id: 'b', weight: 3 }),
      ],
    } as unknown as ScratchCampaignDto;
    const form = formFromCampaign(campaign, TODAY, labelFor);
    expect(form.rewards.map((r) => [r.type, r.weight])).toEqual([['PERCENT_DISCOUNT', '75'], ['FREE_PRODUCT', '25']]);
    expect(form.rewards[0].label).toBe('');
    expect(form.rewards[1].label).toBe('Café');
    expect(form.durationDays).toBe(7);
  });
});
