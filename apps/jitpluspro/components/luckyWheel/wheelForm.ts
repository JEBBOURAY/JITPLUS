// Pure state and validation for the lucky wheel wizard (no React Native).
import { addDaysYmd, diffDaysYmd } from '@jitplus/shared/src/scratch';
import { buildWheelSegments, computeOddsBreakdown, type WheelSegment } from '@jitplus/shared/src/luckyWheel';
import { moroccoWallTimeToIso, moroccoYmdOf } from '@/components/scratch/campaignForm';
import type { FormError } from '@/components/games/gameForm';
import type { WheelCampaign, WheelCampaignInput } from './types';

export const WHEEL_STEPS = ['prizes', 'chances', 'timing', 'look', 'review'] as const;
export type WheelStep = (typeof WHEEL_STEPS)[number];

export const WHEEL_LIMITS = {
  NAME_MIN: 3,
  NAME_MAX: 255,
  DESCRIPTION_MAX: 2000,
  LABEL_MAX: 255,
  PRIZE_DESCRIPTION_MAX: 1000,
  /** One wheel colour per prize: more would repeat colours on the client wheel. */
  MAX_PRIZES: 6,
  STOCK_MAX: 99999,
  MIN_SPEND_MAX: 999999,
} as const;

export const WIN_RATE_PRESETS = [25, 40, 50, 70] as const;
export const DURATION_PRESETS = [7, 30, 90] as const;
type WheelDuration = (typeof DURATION_PRESETS)[number];
export const MIN_SPEND_PRESETS = [0, 50, 100, 200] as const;
export const STOCK_PRESETS = [10, 50, 100] as const;
/** Hours to collect a prize; '' means no limit. */
export const CLAIM_PRESETS = ['24', '72', '168', ''] as const;

/** Relative prize weights behind the three frequency choices. */
export const FREQUENCIES = { often: 5, sometimes: 2, rare: 1 } as const;
type Frequency = keyof typeof FREQUENCIES;
export const FREQUENCY_ORDER: readonly Frequency[] = ['often', 'sometimes', 'rare'];

export const WHEEL_TEMPLATES = ['simple', 'tiers', 'jackpot'] as const;
export type WheelTemplate = (typeof WHEEL_TEMPLATES)[number];

export interface WheelPrizeForm {
  key: string;
  /** Database id of a saved prize, kept so its stock and history survive an edit */
  dbId?: string;
  label: string;
  description: string;
  weight: string;
  totalStock: string;
  claimWindowHours: string;
}

export interface WheelForm {
  name: string;
  description: string;
  /** Percentage 1–100 */
  winRate: string;
  /** Preset driving the end date; null once the merchant picks the dates himself */
  durationDays: WheelDuration | null;
  startsAt: string;
  endsAt: string;
  minSpend: string;
  prizes: WheelPrizeForm[];
}

let keySeq = 0;
const nextKey = () => `p${Date.now().toString(36)}${(keySeq++).toString(36)}`;

const parseInteger = (s: string): number | null => (/^\d+$/.test(s.trim()) ? parseInt(s.trim(), 10) : null);

export function emptyPrize(patch: Partial<WheelPrizeForm> = {}): WheelPrizeForm {
  return {
    key: nextKey(),
    label: '',
    description: '',
    weight: String(FREQUENCIES.sometimes),
    totalStock: '50',
    claimWindowHours: '72',
    ...patch,
  };
}

/** Last day of a period of `days` days starting on `startYmd` (both days included). */
function endForDuration(startYmd: string, days: number): string {
  return addDaysYmd(startYmd, Math.max(1, days) - 1);
}

/** Number of days covered, both ends included. */
export function durationOf(startYmd: string, endYmd: string): number {
  return diffDaysYmd(startYmd, endYmd) + 1;
}

function detectDuration(startYmd: string, endYmd: string): WheelDuration | null {
  const days = durationOf(startYmd, endYmd);
  return DURATION_PRESETS.find((d) => d === days) ?? null;
}

/** A ready-to-launch wheel: the "tiers" template, 30 days from today, no minimum spend. */
export function initialWheelForm(today: string, name: string, labelOf: (key: string) => string): WheelForm {
  return {
    name,
    description: '',
    winRate: templateWinRate('tiers'),
    durationDays: 30,
    startsAt: today,
    endsAt: endForDuration(today, 30),
    minSpend: '0',
    prizes: templatePrizes('tiers', labelOf),
  };
}

interface TemplatePrize {
  labelKey: string;
  weight: number;
  stock: number;
}

const TEMPLATES: Record<WheelTemplate, { winRate: number; prizes: TemplatePrize[] }> = {
  simple: { winRate: 25, prizes: [{ labelKey: 'coffee', weight: FREQUENCIES.often, stock: 50 }] },
  tiers: {
    winRate: 40,
    prizes: [
      { labelKey: 'coffee', weight: FREQUENCIES.often, stock: 50 },
      { labelKey: 'discount10', weight: FREQUENCIES.sometimes, stock: 20 },
      { labelKey: 'gift', weight: FREQUENCIES.rare, stock: 5 },
    ],
  },
  jackpot: {
    winRate: 50,
    prizes: [
      { labelKey: 'discount5', weight: FREQUENCIES.often, stock: 100 },
      { labelKey: 'dessert', weight: FREQUENCIES.sometimes, stock: 30 },
      { labelKey: 'meal', weight: FREQUENCIES.rare, stock: 3 },
    ],
  },
};

export function templateWinRate(template: WheelTemplate): string {
  return String(TEMPLATES[template].winRate);
}

/** Prizes of a template; `labelOf` turns 'coffee' into the merchant's language. */
export function templatePrizes(template: WheelTemplate, labelOf: (key: string) => string): WheelPrizeForm[] {
  return TEMPLATES[template].prizes.map((p) =>
    emptyPrize({ label: labelOf(p.labelKey), weight: String(p.weight), totalStock: String(p.stock) }),
  );
}

/** Preset matching a weight, or null for a custom weight saved by an older version. */
export function frequencyOf(weight: string): Frequency | null {
  const w = parseInteger(weight);
  return FREQUENCY_ORDER.find((f) => FREQUENCIES[f] === w) ?? null;
}

export function winRateOf(form: Pick<WheelForm, 'winRate'>): number {
  const rate = parseInteger(form.winRate) ?? 0;
  return Math.max(0, Math.min(100, rate));
}

/** Share of all spins (in %) that wins each prize, plus the share that loses. Sums to 100. */
export function prizeChances(form: Pick<WheelForm, 'winRate' | 'prizes'>): { perPrize: number[]; lostPct: number } {
  return computeOddsBreakdown(
    form.prizes.map((p) => ({ label: p.label, weight: Math.max(1, parseInteger(p.weight) ?? 1) })),
    winRateOf(form) / 100,
  );
}

/** Same segments as the client wheel in JitPlus. */
export function previewSegments(
  form: Pick<WheelForm, 'winRate' | 'prizes'>,
  lostLabel: string,
  placeholder: (index: number) => string,
): WheelSegment[] {
  return buildWheelSegments(
    form.prizes.map((p, i) => ({
      id: p.key,
      label: p.label.trim() || placeholder(i),
      weight: Math.max(1, parseInteger(p.weight) ?? 1),
    })),
    winRateOf(form) / 100,
    lostLabel,
  );
}

/**
 * Local imitation of the server draw used by the "try the wheel" button:
 * win with the global rate, then pick a prize by weight.
 */
export function simulateSpin(
  form: Pick<WheelForm, 'winRate' | 'prizes'>,
  random: () => number = Math.random,
): number | null {
  if (!form.prizes.length || random() * 100 >= winRateOf(form)) return null;
  return pickWeighted(form.prizes.map((p) => Math.max(1, parseInteger(p.weight) ?? 1)), random);
}

/** Index drawn at random in proportion to the weights. */
export function pickWeighted(weights: number[], random: () => number = Math.random): number {
  let roll = random() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

type WheelFormAction =
  | { type: 'SET'; patch: Partial<WheelForm> }
  | { type: 'SET_PRIZE'; key: string; patch: Partial<WheelPrizeForm> }
  | { type: 'ADD_PRIZE' }
  | { type: 'REMOVE_PRIZE'; key: string }
  | { type: 'SET_PRIZES'; prizes: WheelPrizeForm[]; winRate?: string }
  | { type: 'RESET'; form: WheelForm };

export function wheelFormReducer(state: WheelForm, action: WheelFormAction): WheelForm {
  switch (action.type) {
    case 'SET': {
      const next = { ...state, ...action.patch };
      // A preset keeps the end date in step with the start date.
      if (next.durationDays != null && ('durationDays' in action.patch || 'startsAt' in action.patch)) {
        next.endsAt = endForDuration(next.startsAt, next.durationDays);
      }
      if ('endsAt' in action.patch && !('durationDays' in action.patch)) {
        next.durationDays = detectDuration(next.startsAt, next.endsAt);
      }
      return next;
    }
    case 'SET_PRIZE':
      return { ...state, prizes: state.prizes.map((p) => (p.key === action.key ? { ...p, ...action.patch } : p)) };
    case 'ADD_PRIZE':
      if (state.prizes.length >= WHEEL_LIMITS.MAX_PRIZES) return state;
      return { ...state, prizes: [...state.prizes, emptyPrize({ weight: String(FREQUENCIES.rare), totalStock: '10' })] };
    case 'REMOVE_PRIZE':
      if (state.prizes.length <= 1) return state;
      return { ...state, prizes: state.prizes.filter((p) => p.key !== action.key) };
    case 'SET_PRIZES':
      return { ...state, prizes: action.prizes, ...(action.winRate ? { winRate: action.winRate } : {}) };
    case 'RESET':
      return action.form;
    default:
      return state;
  }
}

export function validatePrizes(prizes: WheelPrizeForm[]): FormError | null {
  if (prizes.length === 0) return { key: 'luckyWheel.wizard.errNoPrize' };
  for (const [i, p] of prizes.entries()) {
    const n = i + 1;
    if (!p.label.trim()) return { key: 'luckyWheel.wizard.errPrizeName', params: { n } };
    const stock = parseInteger(p.totalStock);
    if (stock == null || stock < 1 || stock > WHEEL_LIMITS.STOCK_MAX) {
      return { key: 'luckyWheel.wizard.errPrizeStock', params: { n } };
    }
    const weight = parseInteger(p.weight);
    if (weight == null || weight < 1) return { key: 'luckyWheel.wizard.errPrizeFrequency', params: { n } };
    if (p.claimWindowHours.trim() && !(parseInteger(p.claimWindowHours) ?? 0)) {
      return { key: 'luckyWheel.wizard.errClaim', params: { n } };
    }
  }
  return null;
}

export function validateWinRate(form: Pick<WheelForm, 'winRate'>): FormError | null {
  const rate = parseInteger(form.winRate);
  return rate == null || rate < 1 || rate > 100 ? { key: 'luckyWheel.wizard.errWinRate' } : null;
}

/** `originalStart` is the saved start date when editing: an unchanged past start stays allowed. */
export function validateTiming(form: WheelForm, today: string, originalStart?: string): FormError | null {
  if (form.startsAt !== originalStart && diffDaysYmd(today, form.startsAt) < 0) {
    return { key: 'luckyWheel.wizard.errStartPast' };
  }
  if (diffDaysYmd(form.startsAt, form.endsAt) < 0) return { key: 'luckyWheel.wizard.errDates' };
  if (diffDaysYmd(today, form.endsAt) < 0) return { key: 'luckyWheel.wizard.errEndPast' };
  const minSpend = parseInteger(form.minSpend || '0');
  if (minSpend == null || minSpend > WHEEL_LIMITS.MIN_SPEND_MAX) return { key: 'luckyWheel.wizard.errMinSpend' };
  return null;
}

function validateName(form: WheelForm): FormError | null {
  const name = form.name.trim();
  if (!name) return { key: 'luckyWheel.wizard.errNameRequired' };
  if (name.length < WHEEL_LIMITS.NAME_MIN) return { key: 'luckyWheel.wizard.errNameShort', params: { min: WHEEL_LIMITS.NAME_MIN } };
  return null;
}

export function validateStep(form: WheelForm, step: WheelStep, today: string, originalStart?: string): FormError | null {
  switch (step) {
    case 'prizes':
      return validatePrizes(form.prizes);
    case 'chances':
      return validateWinRate(form);
    case 'timing':
      return validateTiming(form, today, originalStart);
    case 'look':
      return validateName(form);
    default:
      return null;
  }
}

/**
 * The start keeps the historic UTC-midnight value (the API checks the start
 * day on its own clock); the end covers the whole last day in Morocco time.
 */
function startIso(ymd: string): string {
  return `${ymd}T00:00:00.000Z`;
}

function endIso(ymd: string): string {
  return moroccoWallTimeToIso(ymd, '23:59');
}

export function formToInput(form: WheelForm): WheelCampaignInput {
  const description = form.description.trim();
  return {
    name: form.name.trim(),
    ...(description ? { description } : {}),
    globalWinRate: Math.max(1, winRateOf(form)) / 100,
    startsAt: startIso(form.startsAt),
    endsAt: endIso(form.endsAt),
    minSpendAmount: parseInteger(form.minSpend || '0') ?? 0,
    prizes: form.prizes.map((p) => {
      const desc = p.description.trim();
      const claim = parseInteger(p.claimWindowHours);
      return {
        ...(p.dbId ? { id: p.dbId } : {}),
        label: p.label.trim(),
        ...(desc ? { description: desc } : {}),
        weight: Math.max(1, parseInteger(p.weight) ?? 1),
        totalStock: Math.max(1, parseInteger(p.totalStock) ?? 1),
        ...(claim ? { claimWindowHours: claim } : {}),
      };
    }),
  };
}

/** Form of a saved campaign. `copy` drops the ids and restarts the same duration today. */
export function formFromCampaign(campaign: WheelCampaign, opts: { copy?: { today: string; name: string } } = {}): WheelForm {
  const startsAt = moroccoYmdOf(new Date(campaign.startsAt));
  const endsAt = moroccoYmdOf(new Date(campaign.endsAt));
  const prizes = (campaign.prizes ?? []).map((p) => emptyPrize({
    dbId: opts.copy ? undefined : p.id,
    label: p.label ?? '',
    description: p.description ?? '',
    weight: String(Math.max(1, p.weight ?? 1)),
    totalStock: String(Math.max(1, p.totalStock ?? 1)),
    claimWindowHours: p.claimWindowHours ? String(p.claimWindowHours) : '',
  }));
  const base: WheelForm = {
    name: campaign.name,
    description: campaign.description ?? '',
    winRate: String(Math.round(campaign.globalWinRate * 100)),
    durationDays: detectDuration(startsAt, endsAt),
    startsAt,
    endsAt,
    minSpend: String(campaign.minSpendAmount ?? 0),
    prizes: prizes.length ? prizes : [emptyPrize()],
  };
  if (!opts.copy) return base;
  const days = Math.max(1, durationOf(startsAt, endsAt));
  return {
    ...base,
    name: opts.copy.name.slice(0, WHEEL_LIMITS.NAME_MAX),
    startsAt: opts.copy.today,
    endsAt: endForDuration(opts.copy.today, days),
    durationDays: DURATION_PRESETS.find((d) => d === days) ?? null,
  };
}

/** Fields worth comparing to know whether leaving the wizard loses work. */
export function formSignature(form: WheelForm): string {
  return JSON.stringify({ ...form, prizes: form.prizes.map(({ key: _key, ...rest }) => rest) });
}

type WheelStatusAction = 'activate' | 'pause' | 'resume' | 'end' | 'edit' | 'delete' | 'push';

/** Actions the API accepts for a status (see LuckyWheelService.updateCampaignStatus). */
export function availableActions(status: WheelCampaign['status']): WheelStatusAction[] {
  switch (status) {
    case 'DRAFT':
      return ['activate', 'edit', 'delete'];
    case 'ACTIVE':
      return ['push', 'pause', 'edit', 'end'];
    case 'PAUSED':
      return ['resume', 'edit', 'end', 'delete'];
    default:
      return ['delete'];
  }
}

/** Why an active wheel can or can't be played right now; null for other statuses. */
export function liveState(campaign: WheelCampaign, now: Date = new Date()): 'upcoming' | 'running' | 'over' | 'empty' | null {
  if (campaign.status !== 'ACTIVE') return null;
  if (now < new Date(campaign.startsAt)) return 'upcoming';
  if (now > new Date(campaign.endsAt)) return 'over';
  if ((campaign.prizes ?? []).every((p) => p.remaining <= 0)) return 'empty';
  return 'running';
}
