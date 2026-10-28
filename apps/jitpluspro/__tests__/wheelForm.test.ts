import {
  WHEEL_LIMITS,
  WHEEL_STEPS,
  availableActions,
  emptyPrize,
  formFromCampaign,
  formSignature,
  formToInput,
  initialWheelForm,
  liveState,
  prizeChances,
  previewSegments,
  simulateSpin,
  validatePrizes,
  validateStep,
  validateTiming,
  validateWinRate,
  wheelFormReducer,
  type WheelForm,
} from '@/components/luckyWheel/wheelForm';
import { moroccoYmdOf } from '@/components/scratch/campaignForm';
import type { WheelCampaign } from '@/components/luckyWheel/types';

const TODAY = '2026-10-08';
const labelOf = (key: string) => `label:${key}`;
const base = (): WheelForm => initialWheelForm(TODAY, 'Roue', labelOf);

const campaign = (patch: Partial<WheelCampaign> = {}): WheelCampaign => ({
  id: 'c1',
  name: 'Roue été',
  description: null,
  globalWinRate: 0.4,
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: '2026-09-30T22:59:00.000Z',
  minSpendAmount: 50,
  status: 'ACTIVE',
  prizes: [
    { id: 'p1', label: 'Café', weight: 5, totalStock: 50, remaining: 20, claimWindowHours: 72 },
    { id: 'p2', label: 'Repas', weight: 1, totalStock: 3, remaining: 0, claimWindowHours: null },
  ],
  ...patch,
});

describe('initial lucky wheel form', () => {
  it('is ready to launch: three prizes, 40 % winners, 30 days from today', () => {
    const form = base();
    expect(form.prizes.map((p) => p.label)).toEqual(['label:coffee', 'label:discount10', 'label:gift']);
    expect(form.winRate).toBe('40');
    expect(form.startsAt).toBe(TODAY);
    expect(form.endsAt).toBe('2026-11-06');
    for (const step of WHEEL_STEPS) {
      expect(validateStep(form, step, TODAY)).toBeNull();
    }
  });
});

describe('chances shown to the merchant', () => {
  it('splits the win rate by weight and adds up to 100 %', () => {
    const { perPrize, lostPct } = prizeChances(base());
    expect(lostPct).toBe(60);
    expect(perPrize.reduce((s, p) => s + p, 0) + lostPct).toBe(100);
    expect(perPrize[0]).toBeGreaterThan(perPrize[1]);
    expect(perPrize[1]).toBeGreaterThan(perPrize[2]);
  });

  it('builds the client wheel with one segment set per prize and a lost slice', () => {
    const form = base();
    const segments = previewSegments(form, 'Perdu', (i) => `Lot ${i + 1}`);
    const ids = new Set(segments.filter((s) => !s.isLost).map((s) => s.prizeId));
    expect(ids).toEqual(new Set(form.prizes.map((p) => p.key)));
    expect(segments.some((s) => s.isLost && s.label === 'Perdu')).toBe(true);
  });

  it('names an unnamed prize with its placeholder', () => {
    const form = { ...base(), prizes: [emptyPrize()] };
    const segments = previewSegments(form, 'Perdu', (i) => `Lot ${i + 1}`);
    expect(segments.find((s) => !s.isLost)?.label).toBe('Lot 1');
  });

  it('simulates a spin: loses above the win rate, wins by weight below', () => {
    const form = base();
    expect(simulateSpin(form, () => 0.99)).toBeNull();
    expect(simulateSpin(form, () => 0)).toBe(0);
    const rolls = [0.1, 0.99];
    expect(simulateSpin(form, () => rolls.shift() ?? 0)).toBe(2);
  });
});

describe('wheelFormReducer', () => {
  it('keeps the end date in step with a duration preset', () => {
    let form = wheelFormReducer(base(), { type: 'SET', patch: { durationDays: 7 } });
    expect(form.endsAt).toBe('2026-10-14');
    form = wheelFormReducer(form, { type: 'SET', patch: { startsAt: '2026-10-10' } });
    expect(form.endsAt).toBe('2026-10-16');
  });

  it('switches to custom dates when the end is picked by hand', () => {
    const form = wheelFormReducer(base(), { type: 'SET', patch: { endsAt: '2026-10-20' } });
    expect(form.durationDays).toBeNull();
    const back = wheelFormReducer(form, { type: 'SET', patch: { endsAt: '2026-10-14' } });
    expect(back.durationDays).toBe(7);
  });

  it('caps the number of prizes and keeps at least one', () => {
    let form = base();
    for (let i = 0; i < 10; i++) form = wheelFormReducer(form, { type: 'ADD_PRIZE' });
    expect(form.prizes).toHaveLength(WHEEL_LIMITS.MAX_PRIZES);
    for (const p of [...form.prizes]) form = wheelFormReducer(form, { type: 'REMOVE_PRIZE', key: p.key });
    expect(form.prizes).toHaveLength(1);
  });
});

describe('validation', () => {
  it('points at the faulty prize', () => {
    const prizes = base().prizes;
    expect(validatePrizes([prizes[0], { ...prizes[1], label: ' ' }])).toEqual({ key: 'luckyWheel.wizard.errPrizeName', params: { n: 2 } });
    expect(validatePrizes([{ ...prizes[0], totalStock: '0' }])).toEqual({ key: 'luckyWheel.wizard.errPrizeStock', params: { n: 1 } });
    expect(validatePrizes([{ ...prizes[0], claimWindowHours: '0' }])).toEqual({ key: 'luckyWheel.wizard.errClaim', params: { n: 1 } });
    expect(validatePrizes([])).toEqual({ key: 'luckyWheel.wizard.errNoPrize' });
  });

  it('refuses a new past start but keeps an unchanged one when editing', () => {
    const form = { ...base(), startsAt: '2026-09-01', durationDays: null, endsAt: '2026-10-30' };
    expect(validateTiming(form, TODAY)?.key).toBe('luckyWheel.wizard.errStartPast');
    expect(validateTiming(form, TODAY, '2026-09-01')).toBeNull();
  });

  it('checks the win rate and the dates', () => {
    expect(validateWinRate({ winRate: '0' })?.key).toBe('luckyWheel.wizard.errWinRate');
    expect(validateTiming({ ...base(), endsAt: '2026-10-07' }, TODAY)?.key).toBe('luckyWheel.wizard.errDates');
  });

  it('blocks each step on its own fields only', () => {
    expect(validateStep({ ...base(), winRate: '0' }, 'prizes', TODAY)).toBeNull();
    expect(validateStep({ ...base(), winRate: '0' }, 'chances', TODAY)?.key).toBe('luckyWheel.wizard.errWinRate');
    expect(validateStep({ ...base(), endsAt: '2026-10-07' }, 'timing', TODAY)?.key).toBe('luckyWheel.wizard.errDates');
    expect(validateStep({ ...base(), name: ' ' }, 'look', TODAY)?.key).toBe('luckyWheel.wizard.errNameRequired');
  });
});

describe('API mapping', () => {
  it('sends a rate between 0 and 1 and covers the whole last day in Morocco', () => {
    const input = formToInput({ ...base(), description: '  ' });
    expect(input.globalWinRate).toBe(0.4);
    expect(input.startsAt).toBe('2026-10-08T00:00:00.000Z');
    expect(moroccoYmdOf(new Date(input.endsAt))).toBe('2026-11-06');
    expect(moroccoYmdOf(new Date(new Date(input.endsAt).getTime() + 2 * 60_000))).toBe('2026-11-07');
    expect(input).not.toHaveProperty('description');
    expect(input.prizes[0]).toEqual({ label: 'label:coffee', weight: 5, totalStock: 50, claimWindowHours: 72 });
  });

  it('reloads a saved wheel with its prize ids so stock survives an edit', () => {
    const form = formFromCampaign(campaign());
    expect(form.prizes.map((p) => p.dbId)).toEqual(['p1', 'p2']);
    expect(form.winRate).toBe('40');
    expect(form.startsAt).toBe('2026-09-01');
    expect(form.endsAt).toBe('2026-09-30');
    expect(form.durationDays).toBe(30);
    expect(form.prizes[1].claimWindowHours).toBe('');
    expect(formToInput(form).prizes.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('duplicates without ids, starting today for the same duration', () => {
    const copy = formFromCampaign(campaign(), { copy: { today: TODAY, name: 'Copie' } });
    expect(copy.prizes.every((p) => p.dbId === undefined)).toBe(true);
    expect(copy.name).toBe('Copie');
    expect(copy.startsAt).toBe(TODAY);
    expect(copy.endsAt).toBe('2026-11-06');
  });

  it('ignores the internal prize keys when comparing forms', () => {
    const a = formFromCampaign(campaign());
    const b = formFromCampaign(campaign());
    expect(a.prizes[0].key).not.toBe(b.prizes[0].key);
    expect(formSignature(a)).toBe(formSignature(b));
    expect(formSignature({ ...a, name: 'Autre' })).not.toBe(formSignature(b));
  });
});

describe('campaign state', () => {
  it('offers only the actions the API accepts', () => {
    expect(availableActions('DRAFT')).toEqual(['activate', 'edit', 'delete']);
    expect(availableActions('ACTIVE')).not.toContain('delete');
    expect(availableActions('ENDED')).toEqual(['delete']);
  });

  it('explains why an active wheel cannot be played', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    expect(liveState(campaign(), now)).toBe('running');
    expect(liveState(campaign(), new Date('2026-08-15T12:00:00Z'))).toBe('upcoming');
    expect(liveState(campaign(), new Date('2026-10-15T12:00:00Z'))).toBe('over');
    expect(liveState(campaign({ prizes: campaign().prizes.map((p) => ({ ...p, remaining: 0 })) }), now)).toBe('empty');
    expect(liveState(campaign({ status: 'PAUSED' }), now)).toBeNull();
  });
});
