// Pure state and validation for the scratch campaign wizard (no React Native).
import {
  SCRATCH_LIMITS,
  SCRATCH_DEFAULTS,
  SCRATCH_SEND_SLOTS,
  DEFAULT_SCRATCH_DESIGN_ID,
  addDaysYmd,
  diffDaysYmd,
  maskFromWeekdays,
  minutesToTime,
  timeToMinutes,
  weekdaysFromMask,
  toYmd,
  rewardProbabilities,
  type CouponRewardType,
  type ScratchAudienceType,
  type ScratchCampaignDto,
  type ScratchCampaignInput,
  type ScratchRewardInput,
} from '@jitplus/shared/src/scratch';

export const WIZARD_STEPS = ['gift', 'audience', 'review'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export type DelayHours = 0 | 24 | 48;

/** Scratch period presets (days after sending); coupons stay valid COUPON_DAYS_AFTER_CARD more days. */
export const DURATION_PRESETS = [7, 14, 30] as const;
export type DurationDays = (typeof DURATION_PRESETS)[number];

export const CAMPAIGN_TEMPLATES = ['simple', 'tiers', 'stamps'] as const;
export type CampaignTemplate = (typeof CAMPAIGN_TEMPLATES)[number];

/** Audience types offered up front; the others sit under "more options". */
export const MAIN_AUDIENCE_TYPES: readonly ScratchAudienceType[] = ['ALL_CLIENTS', 'INACTIVE_SINCE', 'MIN_STAMPS'];
export const AUDIENCE_DEFAULT_VALUES: Record<ScratchAudienceType, string> = {
  ALL_CLIENTS: '',
  INACTIVE_SINCE: '30',
  ACTIVE_SINCE: '30',
  NEW_SINCE: '30',
  MIN_STAMPS: '5',
};

/** Text stored for a reward whose label was left empty, e.g. "-20 %" in the merchant's language. */
export type RewardLabelFn = (type: CouponRewardType, value: number | null) => string;

/** Backend SCRATCH_MAX_SCHEDULE_DAYS: a planned send is at most this far from now. */
export const MAX_SCHEDULE_DAYS = 30;
const MAX_SCHEDULE_MS = MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000;

export interface RewardForm {
  key: string;
  type: CouponRewardType;
  /** Product name for FREE_PRODUCT, optional detail ("sur l'addition") otherwise */
  label: string;
  value: string;
  maxDiscount: string;
  rewardId: string | null;
  /** Chance in % (integer). The first reward always holds the remainder up to 100. */
  weight: string;
  unlimited: boolean;
  totalStock: string;
  minPurchase: string;
  minDelayHours: DelayHours;
  /** ISO weekdays 1 = Monday … 7 = Sunday */
  weekdays: number[];
  hoursEnabled: boolean;
  fromTime: string;
  toTime: string;
}

export interface CampaignForm {
  name: string;
  message: string;
  designId: string;
  audienceType: ScratchAudienceType;
  audienceValue: string;
  cardExpiresOn: string;
  couponExpiresOn: string;
  /** Preset that drives both deadlines; null once the merchant picks the dates himself */
  durationDays: DurationDays | null;
  rewards: RewardForm[];
  sendMode: 'now' | 'later';
  sendDay: string;
  sendSlot: string;
}

export interface FormError {
  key: string;
  params?: Record<string, unknown>;
}

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
let keySeq = 0;
const nextKey = () => `r${Date.now().toString(36)}${(keySeq++).toString(36)}`;

export function emptyReward(type: CouponRewardType = 'PERCENT_DISCOUNT', weight = '10', value = ''): RewardForm {
  return {
    key: nextKey(),
    type,
    label: '',
    value,
    maxDiscount: '',
    rewardId: null,
    weight,
    unlimited: true,
    totalStock: '',
    minPurchase: '',
    minDelayHours: 0,
    weekdays: [...ALL_DAYS],
    hoursEnabled: false,
    fromTime: '10:00',
    toTime: '18:00',
  };
}

export function durationDates(sendYmd: string, days: DurationDays): Pick<CampaignForm, 'cardExpiresOn' | 'couponExpiresOn'> {
  return {
    cardExpiresOn: addDaysYmd(sendYmd, days),
    couponExpiresOn: addDaysYmd(sendYmd, days + SCRATCH_DEFAULTS.COUPON_DAYS_AFTER_CARD),
  };
}

export function sendYmdOf(form: Pick<CampaignForm, 'sendMode' | 'sendDay'>, today: string): string {
  return form.sendMode === 'later' ? form.sendDay : today;
}

/** The preset matching the dates (scratch period and coupon gap), or null for custom dates. */
export function detectDuration(sendYmd: string, cardExpiresOn: string, couponExpiresOn: string): DurationDays | null {
  const days = diffDaysYmd(sendYmd, cardExpiresOn);
  const preset = DURATION_PRESETS.find((d) => d === days);
  if (!preset) return null;
  return diffDaysYmd(cardExpiresOn, couponExpiresOn) === SCRATCH_DEFAULTS.COUPON_DAYS_AFTER_CARD ? preset : null;
}

const sumOtherChances = (rewards: RewardForm[]) =>
  rewards.slice(1).reduce((s, r) => s + Math.max(0, parseInteger(r.weight) ?? 0), 0);

/** Chance left for the first reward once the others are set (can drop below 1 when they exceed 99 %). */
export function assuredChance(rewards: RewardForm[]): number {
  return 100 - sumOtherChances(rewards);
}

/** The first reward is the guaranteed one: unlimited, and it takes whatever chance the others leave. */
export function syncAssured(rewards: RewardForm[]): RewardForm[] {
  if (rewards.length === 0) return rewards;
  const [first, ...others] = rewards;
  return [{ ...first, weight: String(assuredChance(rewards)), unlimited: true, totalStock: '' }, ...others];
}

export function templateRewards(template: CampaignTemplate): RewardForm[] {
  switch (template) {
    case 'tiers':
      return syncAssured([
        emptyReward('PERCENT_DISCOUNT', '0', '10'),
        emptyReward('PERCENT_DISCOUNT', '20', '20'),
        emptyReward('FREE_PRODUCT', '5'),
      ]);
    case 'stamps':
      return syncAssured([
        emptyReward('BONUS_STAMPS', '0', '1'),
        emptyReward('BONUS_STAMPS', '25', '2'),
        emptyReward('BONUS_STAMPS', '5', '5'),
      ]);
    case 'simple':
    default:
      return syncAssured([emptyReward('PERCENT_DISCOUNT', '100', '10')]);
  }
}

export function initialCampaignForm(today: string): CampaignForm {
  const durationDays: DurationDays = 7;
  return {
    name: '',
    message: '',
    designId: DEFAULT_SCRATCH_DESIGN_ID,
    audienceType: 'ALL_CLIENTS',
    audienceValue: AUDIENCE_DEFAULT_VALUES.INACTIVE_SINCE,
    ...durationDates(today, durationDays),
    durationDays,
    rewards: templateRewards('simple'),
    sendMode: 'now',
    sendDay: addDaysYmd(today, 1),
    sendSlot: SCRATCH_SEND_SLOTS[0],
  };
}

const numText = (n: number | null | undefined) => (n == null ? '' : String(n));

/**
 * Loads a saved campaign into the wizard: an unlimited reward moves first (it
 * becomes the guaranteed one) and weights become whole percentages. Labels
 * equal to the automatic text are cleared so they follow later value edits.
 */
export function formFromCampaign(c: ScratchCampaignDto, today: string, labelFor?: RewardLabelFn): CampaignForm {
  const base = initialCampaignForm(today);
  const sendAt = c.status === 'SCHEDULED' && c.sendAt ? new Date(c.sendAt) : null;
  const sendSlot = sendAt ? moroccoTimeOf(sendAt) : base.sendSlot;
  const sendMode = sendAt ? 'later' : 'now';
  const sendDay = sendAt ? moroccoYmdOf(sendAt) : base.sendDay;

  const ordered = [...c.rewards];
  const unlimitedIndex = ordered.findIndex((r) => r.totalStock == null);
  if (unlimitedIndex > 0) ordered.unshift(...ordered.splice(unlimitedIndex, 1));
  const percents = rewardProbabilities(ordered.map((r) => r.weight));

  return {
    ...base,
    name: c.name,
    message: c.message ?? '',
    designId: c.designId,
    audienceType: c.audienceType,
    audienceValue: c.audienceValue != null ? String(c.audienceValue) : base.audienceValue,
    cardExpiresOn: c.cardExpiresOn,
    couponExpiresOn: c.couponExpiresOn,
    durationDays: detectDuration(sendYmdOf({ sendMode, sendDay }, today), c.cardExpiresOn, c.couponExpiresOn),
    sendMode,
    sendDay,
    sendSlot: (SCRATCH_SEND_SLOTS as readonly string[]).includes(sendSlot) ? sendSlot : base.sendSlot,
    rewards: syncAssured(ordered.map((r, i) => ({
      key: nextKey(),
      type: r.type,
      label: r.type !== 'FREE_PRODUCT' && labelFor && r.label === labelFor(r.type, r.value ?? null) ? '' : r.label,
      value: numText(r.value),
      maxDiscount: numText(r.maxDiscount),
      rewardId: r.rewardId ?? null,
      weight: String(Math.max(1, Math.round(percents[i] ?? 0))),
      unlimited: r.totalStock == null,
      totalStock: numText(r.totalStock),
      minPurchase: numText(r.minPurchaseAmount),
      minDelayHours: r.minDelayHours === 24 || r.minDelayHours === 48 ? r.minDelayHours : 0,
      weekdays: weekdaysFromMask(r.allowedWeekdays),
      hoursEnabled: r.allowedFromMin != null && r.allowedToMin != null,
      fromTime: r.allowedFromMin != null ? minutesToTime(r.allowedFromMin) : '10:00',
      toTime: r.allowedToMin != null ? minutesToTime(r.allowedToMin) : '18:00',
    }))),
  };
}

const parseNum = (s: string): number | null => {
  const n = parseFloat((s || '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const parseInteger = (s: string): number | null => {
  const n = parseNum(s);
  return n != null && Number.isInteger(n) ? n : null;
};

export function rewardToInput(r: RewardForm, labelFor?: RewardLabelFn): ScratchRewardInput {
  const value = r.type === 'FREE_PRODUCT' ? null : parseNum(r.value);
  const minPurchase = parseNum(r.minPurchase);
  const from = r.hoursEnabled ? timeToMinutes(r.fromTime) : null;
  const to = r.hoursEnabled ? timeToMinutes(r.toTime) : null;
  const label = r.label.trim();
  return {
    type: r.type,
    label: label || (labelFor && r.type !== 'FREE_PRODUCT' ? labelFor(r.type, value) : ''),
    value,
    maxDiscount: r.type === 'PERCENT_DISCOUNT' ? parseNum(r.maxDiscount) : null,
    rewardId: r.type === 'FREE_PRODUCT' ? r.rewardId : null,
    weight: Math.max(SCRATCH_LIMITS.MIN_WEIGHT, Math.min(SCRATCH_LIMITS.MAX_WEIGHT, parseInteger(r.weight) ?? 1)),
    totalStock: r.unlimited ? null : parseInteger(r.totalStock),
    minPurchaseAmount: minPurchase != null && minPurchase > 0 ? minPurchase : null,
    minDelayHours: r.minDelayHours,
    allowedWeekdays: maskFromWeekdays(r.weekdays),
    allowedFromMin: from != null && to != null ? from : null,
    allowedToMin: from != null && to != null ? to : null,
  };
}

export function formToInput(form: CampaignForm, labelFor?: RewardLabelFn): ScratchCampaignInput {
  return {
    name: form.name.trim(),
    message: form.message.trim() || null,
    designId: form.designId,
    audienceType: form.audienceType,
    audienceValue: form.audienceType === 'ALL_CLIENTS' ? null : parseInteger(form.audienceValue),
    cardExpiresOn: form.cardExpiresOn,
    couponExpiresOn: form.couponExpiresOn,
    rewards: form.rewards.map((r) => rewardToInput(r, labelFor)),
    // Lets the backend validate the dates against the planned sending day.
    sendAt: sendAtIso(form) ?? null,
  };
}

/** Advanced settings in use on a reward (shown on the collapsed "more options" toggle). */
export function countRewardOptions(r: RewardForm): number {
  let n = 0;
  if (r.type !== 'FREE_PRODUCT' && r.label.trim()) n++;
  if (r.type === 'PERCENT_DISCOUNT' && (parseNum(r.maxDiscount) ?? 0) > 0) n++;
  if (!r.unlimited) n++;
  if ((parseNum(r.minPurchase) ?? 0) > 0) n++;
  if (r.minDelayHours > 0) n++;
  if (r.weekdays.length < 7) n++;
  if (r.hoursEnabled) n++;
  return n;
}

export function validateRewards(rewards: RewardForm[]): FormError | null {
  if (rewards.length === 0) return { key: 'scratch.wizard.rewardValueRequired' };
  for (const [i, r] of rewards.entries()) {
    if (r.type === 'FREE_PRODUCT' && !r.label.trim()) return { key: 'scratch.wizard.productRequired' };
    if (i > 0) {
      const chance = parseInteger(r.weight);
      if (chance == null || chance < 1 || chance > 99) return { key: 'scratch.wizard.chanceRange' };
    }
    const value = parseNum(r.value);
    if (r.type === 'PERCENT_DISCOUNT') {
      if (value == null) return { key: 'scratch.wizard.rewardValueRequired' };
      if (value < 1 || value > SCRATCH_LIMITS.MAX_PERCENT) return { key: 'scratch.wizard.percentRange' };
    } else if (r.type === 'FIXED_DISCOUNT') {
      if (value == null || value < 1 || value > SCRATCH_LIMITS.MAX_FIXED_DISCOUNT) {
        return { key: 'scratch.wizard.rewardValueRequired' };
      }
    } else if (r.type === 'BONUS_STAMPS') {
      if (value == null || !Number.isInteger(value) || value < 1 || value > SCRATCH_LIMITS.MAX_BONUS_STAMPS) {
        return { key: 'scratch.wizard.stampsRange', params: { max: SCRATCH_LIMITS.MAX_BONUS_STAMPS } };
      }
    }
    if (r.type === 'PERCENT_DISCOUNT' && (parseNum(r.maxDiscount) ?? 0) > SCRATCH_LIMITS.MAX_FIXED_DISCOUNT) {
      return { key: 'scratch.wizard.maxDiscountRange', params: { max: SCRATCH_LIMITS.MAX_FIXED_DISCOUNT } };
    }
    if ((parseNum(r.minPurchase) ?? 0) > SCRATCH_LIMITS.MAX_MIN_PURCHASE) {
      return { key: 'scratch.wizard.minPurchaseRange', params: { max: SCRATCH_LIMITS.MAX_MIN_PURCHASE } };
    }
    if (!r.unlimited) {
      const stock = parseInteger(r.totalStock);
      if (stock == null || stock < 1 || stock > SCRATCH_LIMITS.MAX_STOCK) return { key: 'scratch.wizard.stockRequired' };
    }
    if (r.weekdays.length === 0) return { key: 'scratch.wizard.weekdaysRequired' };
    if (r.hoursEnabled) {
      const from = timeToMinutes(r.fromTime);
      const to = timeToMinutes(r.toTime);
      if (from == null || to == null || from === to) return { key: 'scratch.wizard.hoursInvalid' };
    }
  }
  if (rewards.length > 1 && assuredChance(rewards) < 1) return { key: 'scratch.wizard.chancesTooHigh' };
  if (!rewards.some((r) => r.unlimited)) return { key: 'scratch.wizard.unlimitedRequired' };
  return null;
}

/** True when the Morocco wall-clock slot of `ymd` is already over. */
export function isSlotPast(ymd: string, slot: string, nowMs: number = Date.now()): boolean {
  return new Date(moroccoWallTimeToIso(ymd, slot)).getTime() <= nowMs;
}

/**
 * True when a planned `slot` of `ymd` falls in the backend quiet hours
 * (cron-utils isQuietHours: 21:00–09:00, Friday 11:30–14:00), e.g. 12:00 on a Friday.
 */
export function isSlotQuiet(ymd: string, slot: string): boolean {
  const [h, mi] = slot.split(':').map(Number);
  const minutes = h * 60 + mi;
  if (minutes >= 21 * 60 || minutes < 9 * 60) return true;
  const [y, m, d] = ymd.split('-').map(Number);
  const isFriday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5;
  return isFriday && minutes >= 11 * 60 + 30 && minutes < 14 * 60;
}

/** True when the slot is further than the backend allows a send to be planned. */
export function isSlotTooFar(ymd: string, slot: string, nowMs: number = Date.now()): boolean {
  return new Date(moroccoWallTimeToIso(ymd, slot)).getTime() > nowMs + MAX_SCHEDULE_MS;
}

export function isSlotUnavailable(ymd: string, slot: string, nowMs: number = Date.now()): boolean {
  return isSlotPast(ymd, slot, nowMs) || isSlotQuiet(ymd, slot) || isSlotTooFar(ymd, slot, nowMs);
}

/** Keeps `current` when still available, otherwise the first available slot of the day. */
export function pickSendSlot(ymd: string, current: string, nowMs: number = Date.now()): string {
  if (!isSlotUnavailable(ymd, current, nowMs)) return current;
  return SCRATCH_SEND_SLOTS.find((slot) => !isSlotUnavailable(ymd, slot, nowMs)) ?? current;
}

/** Same rules as the backend resolveCampaignDates, counted from the sending day. */
export function validateDates(form: CampaignForm, today: string, nowMs: number = Date.now()): FormError | null {
  if (form.sendMode === 'later' && isSlotPast(form.sendDay, form.sendSlot, nowMs)) {
    return { key: 'scratch.wizard.slotPast' };
  }
  if (form.sendMode === 'later' && isSlotQuiet(form.sendDay, form.sendSlot)) {
    return { key: 'scratch.wizard.slotQuiet' };
  }
  if (form.sendMode === 'later' && isSlotTooFar(form.sendDay, form.sendSlot, nowMs)) {
    return { key: 'scratch.wizard.slotTooFar', params: { days: MAX_SCHEDULE_DAYS } };
  }
  const sendYmd = form.sendMode === 'later' ? form.sendDay : today;
  const cardDays = diffDaysYmd(sendYmd, form.cardExpiresOn);
  if (cardDays < 1) return { key: 'scratch.wizard.cardBeforeSend' };
  if (cardDays > SCRATCH_LIMITS.MAX_CARD_DAYS) {
    return { key: 'scratch.wizard.cardTooFar', params: { days: SCRATCH_LIMITS.MAX_CARD_DAYS } };
  }
  if (diffDaysYmd(form.cardExpiresOn, form.couponExpiresOn) < SCRATCH_LIMITS.MIN_COUPON_AFTER_CARD_DAYS) {
    return { key: 'scratch.wizard.couponBeforeCard' };
  }
  if (diffDaysYmd(sendYmd, form.couponExpiresOn) > SCRATCH_LIMITS.MAX_COUPON_DAYS) {
    return { key: 'scratch.wizard.couponTooFar', params: { days: SCRATCH_LIMITS.MAX_COUPON_DAYS } };
  }
  return null;
}

export function validateAudience(form: CampaignForm): FormError | null {
  if (form.audienceType === 'ALL_CLIENTS') return null;
  const v = parseInteger(form.audienceValue);
  const max = form.audienceType === 'MIN_STAMPS' ? SCRATCH_LIMITS.MAX_AUDIENCE_STAMPS : SCRATCH_LIMITS.MAX_AUDIENCE_DAYS;
  return v != null && v >= 1 && v <= max ? null : { key: 'scratch.wizard.audienceValueInvalid', params: { max } };
}

export function validateStep(form: CampaignForm, step: WizardStep, today: string): FormError | null {
  switch (step) {
    case 'gift':
      return validateRewards(form.rewards);
    case 'audience':
      return validateAudience(form) ?? validateDates(form, today);
    case 'review':
      return form.name.trim() ? null : { key: 'scratch.wizard.nameRequired' };
    default:
      return null;
  }
}

export function couponGapIsShort(form: CampaignForm): boolean {
  return diffDaysYmd(form.cardExpiresOn, form.couponExpiresOn) < SCRATCH_DEFAULTS.WARN_COUPON_GAP_DAYS;
}

// ── Reducer ─────────────────────────────────────────────────────

export type CampaignFormAction =
  | { type: 'SET'; patch: Partial<CampaignForm>; today?: string }
  | { type: 'SET_REWARD'; key: string; patch: Partial<RewardForm> }
  | { type: 'SET_REWARDS'; rewards: RewardForm[] }
  | { type: 'ADD_REWARD' }
  | { type: 'REMOVE_REWARD'; key: string }
  | { type: 'RESET'; form: CampaignForm };

const NEW_REWARD_CHANCE = 10;

export function campaignFormReducer(state: CampaignForm, action: CampaignFormAction): CampaignForm {
  switch (action.type) {
    case 'SET': {
      const next = { ...state, ...action.patch };
      // A duration preset keeps both deadlines relative to the sending day.
      const timingChanged = 'durationDays' in action.patch || 'sendMode' in action.patch || 'sendDay' in action.patch;
      if (timingChanged && next.durationDays != null && action.today) {
        return { ...next, ...durationDates(sendYmdOf(next, action.today), next.durationDays) };
      }
      // Keep the coupon deadline after the scratch deadline when the latter moves.
      if (action.patch.cardExpiresOn && diffDaysYmd(next.cardExpiresOn, next.couponExpiresOn) < SCRATCH_LIMITS.MIN_COUPON_AFTER_CARD_DAYS) {
        next.couponExpiresOn = addDaysYmd(next.cardExpiresOn, SCRATCH_DEFAULTS.COUPON_DAYS_AFTER_CARD);
      }
      if (action.patch.sendDay && next.sendMode === 'later' && diffDaysYmd(next.sendDay, next.cardExpiresOn) < 1) {
        next.cardExpiresOn = addDaysYmd(next.sendDay, SCRATCH_DEFAULTS.CARD_DAYS);
        if (diffDaysYmd(next.cardExpiresOn, next.couponExpiresOn) < SCRATCH_LIMITS.MIN_COUPON_AFTER_CARD_DAYS) {
          next.couponExpiresOn = addDaysYmd(next.cardExpiresOn, SCRATCH_DEFAULTS.COUPON_DAYS_AFTER_CARD);
        }
      }
      return next;
    }
    case 'SET_REWARD':
      return { ...state, rewards: syncAssured(state.rewards.map((r) => (r.key === action.key ? { ...r, ...action.patch } : r))) };
    case 'SET_REWARDS':
      return { ...state, rewards: syncAssured(action.rewards) };
    case 'ADD_REWARD': {
      if (state.rewards.length >= SCRATCH_LIMITS.MAX_REWARDS) return state;
      // Take the new chance from the guaranteed reward without leaving it below 1 %.
      const chance = Math.max(1, Math.min(NEW_REWARD_CHANCE, assuredChance(state.rewards) - 1));
      return { ...state, rewards: syncAssured([...state.rewards, emptyReward('FREE_PRODUCT', String(chance))]) };
    }
    case 'REMOVE_REWARD':
      if (state.rewards.length <= 1 || state.rewards[0].key === action.key) return state;
      return { ...state, rewards: syncAssured(state.rewards.filter((r) => r.key !== action.key)) };
    case 'RESET':
      return action.form;
    default:
      return state;
  }
}

// ── Morocco wall clock (sending slots are in Morocco time) ──────

function moroccoParts(date: Date): { y: number; m: number; d: number; h: number; mi: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Casablanca',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const res = { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute') };
    return Object.values(res).every(Number.isFinite) ? res : null;
  } catch {
    return null;
  }
}

/** Today in Morocco as YYYY-MM-DD (device date when Intl time zones are unavailable). */
export function moroccoToday(now: Date = new Date()): string {
  return moroccoYmdOf(now);
}

export function moroccoYmdOf(date: Date): string {
  const p = moroccoParts(date);
  if (!p) return toYmd(date);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function moroccoTimeOf(date: Date): string {
  const p = moroccoParts(date);
  const h = p ? p.h : date.getHours();
  const mi = p ? p.mi : date.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

/** Instant of a Morocco wall-clock time (handles the Ramadan switch to UTC+0). */
export function moroccoWallTimeToIso(ymd: string, hhmm: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, h, mi);
  let offsetMin = 60;
  const p = moroccoParts(new Date(asUtc - offsetMin * 60_000));
  if (p) {
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    offsetMin = Math.round((seen - (asUtc - offsetMin * 60_000)) / 60_000);
  }
  return new Date(asUtc - offsetMin * 60_000).toISOString();
}

export function sendAtIso(form: CampaignForm): string | undefined {
  return form.sendMode === 'later' ? moroccoWallTimeToIso(form.sendDay, form.sendSlot) : undefined;
}
