// Pure state, validation and payloads of the deal wizard (no React Native).
// The rules mirror apps/backend/src/deals (deal-rules.ts and dto/index.ts).
import {
  DEAL_DEFAULT_DAYS,
  DEAL_LIMITS,
  computePercentOff,
  type DealDisplayStatus,
  type DealInput,
  type DealOffer,
  type DealScope,
  type DealType,
  type MerchantDealDto,
} from '@jitplus/shared/src/deals';
import { addDaysYmd, diffDaysYmd } from '@jitplus/shared/src/scratch';
import type { FormError } from '@/components/games/gameForm';
import { getErrorDetails } from '@/utils/error';

export const DEAL_WIZARD_STEPS = ['offer', 'visual', 'dates', 'review'] as const;
export type DealWizardStep = (typeof DEAL_WIZARD_STEPS)[number];

/** Order of the type chips in the wizard. */
export const DEAL_TYPE_OPTIONS: readonly DealType[] = ['PERCENT_OFF', 'PRICE_DROP', 'BUY_X_GET_Y', 'FREE_ITEM', 'OTHER'];

export const DEAL_DURATION_PRESETS = [3, 7, 14, 30] as const;

export const TITLE_MIN = 3;

export interface DealForm {
  scope: DealScope;
  type: DealType;
  title: string;
  description: string;
  conditions: string;
  originalPrice: string;
  dealPrice: string;
  percentOff: string;
  buyQty: string;
  freeQty: string;
  imageUrl: string | null;
  linkUrl: string;
  allStores: boolean;
  storeIds: string[];
  startsOn: string;
  endsOn: string;
}

export function initialDealForm(today: string): DealForm {
  return {
    scope: 'LOCAL',
    type: 'PERCENT_OFF',
    title: '',
    description: '',
    conditions: '',
    originalPrice: '',
    dealPrice: '',
    percentOff: '',
    buyQty: '1',
    freeQty: '1',
    imageUrl: null,
    linkUrl: '',
    allStores: true,
    storeIds: [],
    startsOn: today,
    endsOn: addDaysYmd(today, DEAL_DEFAULT_DAYS),
  };
}

const numText = (n: number | null | undefined) => (n == null ? '' : String(n));

export function formFromDeal(d: MerchantDealDto): DealForm {
  return {
    scope: d.scope,
    type: d.type,
    title: d.title,
    description: d.description ?? '',
    conditions: d.conditions ?? '',
    originalPrice: numText(d.originalPrice),
    dealPrice: numText(d.dealPrice),
    percentOff: d.type === 'PERCENT_OFF' ? numText(d.percentOff) : '',
    buyQty: numText(d.buyQty) || '1',
    freeQty: numText(d.freeQty) || '1',
    imageUrl: d.imageUrl,
    linkUrl: d.linkUrl ?? '',
    allStores: d.allStores,
    storeIds: [...d.storeIds],
    startsOn: d.startsOn,
    endsOn: d.endsOn,
  };
}

/** Accepts "12,5" as typed on French keyboards; null for an empty or invalid value. */
export const parseDecimal = (s: string): number | null => {
  const v = (s || '').trim().replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const parseInteger = (s: string): number | null => {
  const n = parseDecimal(s);
  return n != null && Number.isInteger(n) ? n : null;
};
const toPrice = (n: number) => Math.round(n * 100) / 100;

/** Keeps digits and one decimal separator for price inputs. */
export const priceInput = (s: string) => {
  const cleaned = s.replace(/[^0-9.,]/g, '');
  const sep = cleaned.search(/[.,]/);
  if (sep < 0) return cleaned;
  return cleaned.slice(0, sep + 1) + cleaned.slice(sep + 1).replace(/[.,]/g, '').slice(0, 2);
};

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOST = /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u;

/**
 * Same checks as the backend normalizeDealLink, without URL (partial in React
 * Native): https, no credentials, a real domain name rather than an IP address.
 * URL shorteners are refused by the backend, whose message is shown.
 */
export function isHttpsUrl(raw: string): boolean {
  const value = (raw || '').trim();
  if (!value || value.length > DEAL_LIMITS.LINK_MAX || /\s/.test(value)) return false;
  const match = /^https:\/\/([^/?#]+)([/?#].*)?$/i.exec(value);
  if (!match) return false;
  const authority = match[1];
  if (authority.includes('@')) return false;
  const host = authority.replace(/:\d{1,5}$/, '').toLowerCase().replace(/\.$/, '');
  return HOST.test(host) && !IPV4.test(host);
}

/** "www.shop.ma" becomes "https://www.shop.ma"; a typed scheme (http included) is kept so validation can flag it. */
export function withHttps(raw: string): string {
  const value = (raw || '').trim();
  if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value.replace(/^\/+/, '')}`;
}

function validateOffer(form: DealForm): FormError | null {
  const title = form.title.trim();
  if (title.length < TITLE_MIN) return { key: 'deals.wizard.errors.titleShort', params: { min: TITLE_MIN } };
  if (title.length > DEAL_LIMITS.TITLE_MAX) return { key: 'deals.wizard.errors.tooLong', params: { max: DEAL_LIMITS.TITLE_MAX } };
  if (form.description.trim().length > DEAL_LIMITS.DESCRIPTION_MAX) {
    return { key: 'deals.wizard.errors.tooLong', params: { max: DEAL_LIMITS.DESCRIPTION_MAX } };
  }
  if (form.conditions.trim().length > DEAL_LIMITS.CONDITIONS_MAX) {
    return { key: 'deals.wizard.errors.tooLong', params: { max: DEAL_LIMITS.CONDITIONS_MAX } };
  }
  const validPrice = (n: number | null) => n != null && n >= 0 && n <= DEAL_LIMITS.MAX_PRICE;
  switch (form.type) {
    case 'PERCENT_OFF': {
      const pct = parseInteger(form.percentOff);
      if (pct == null || pct < DEAL_LIMITS.MIN_PERCENT || pct > DEAL_LIMITS.MAX_PERCENT) {
        return { key: 'deals.wizard.errors.percentRange', params: { min: DEAL_LIMITS.MIN_PERCENT, max: DEAL_LIMITS.MAX_PERCENT } };
      }
      return null;
    }
    case 'PRICE_DROP': {
      const original = parseDecimal(form.originalPrice);
      const price = parseDecimal(form.dealPrice);
      if (original == null || price == null) return { key: 'deals.wizard.errors.pricesRequired' };
      if (!validPrice(original) || !validPrice(price)) return { key: 'deals.wizard.errors.priceInvalid' };
      if (!(original > 0) || price >= original) return { key: 'deals.wizard.errors.priceNotLower' };
      return null;
    }
    case 'BUY_X_GET_Y': {
      const inRange = (n: number | null) => n != null && n >= 1 && n <= DEAL_LIMITS.MAX_QTY;
      if (!inRange(parseInteger(form.buyQty)) || !inRange(parseInteger(form.freeQty))) {
        return { key: 'deals.wizard.errors.qtyRange', params: { max: DEAL_LIMITS.MAX_QTY } };
      }
      return null;
    }
    case 'FREE_ITEM': {
      if (!form.originalPrice.trim()) return null;
      return validPrice(parseDecimal(form.originalPrice)) ? null : { key: 'deals.wizard.errors.priceInvalid' };
    }
    default:
      return null;
  }
}

function validateVisual(form: DealForm): FormError | null {
  const link = form.linkUrl.trim();
  if (!link && form.scope === 'ONLINE') return { key: 'deals.wizard.errors.linkRequired' };
  if (link && !isHttpsUrl(link)) return { key: 'deals.wizard.errors.linkInvalid' };
  if (form.scope === 'LOCAL' && !form.allStores) {
    if (form.storeIds.length === 0) return { key: 'deals.wizard.errors.storesRequired' };
    if (form.storeIds.length > DEAL_LIMITS.MAX_STORES) {
      return { key: 'deals.wizard.errors.storesTooMany', params: { max: DEAL_LIMITS.MAX_STORES } };
    }
  }
  return null;
}

/** `started`: the deal is already live, so only its last day can move (counted from today). */
export function validateDealDates(form: Pick<DealForm, 'startsOn' | 'endsOn'>, today: string, started = false): FormError | null {
  if (started) {
    const left = diffDaysYmd(today, form.endsOn);
    if (left < 0) return { key: 'deals.wizard.errors.endPast' };
    if (left > DEAL_LIMITS.MAX_DURATION_DAYS) {
      return { key: 'deals.wizard.errors.endTooFar', params: { days: DEAL_LIMITS.MAX_DURATION_DAYS } };
    }
    return null;
  }
  const ahead = diffDaysYmd(today, form.startsOn);
  if (ahead < 0) return { key: 'deals.wizard.errors.startPast' };
  if (ahead > DEAL_LIMITS.MAX_SCHEDULE_DAYS) {
    return { key: 'deals.wizard.errors.startTooFar', params: { days: DEAL_LIMITS.MAX_SCHEDULE_DAYS } };
  }
  const length = diffDaysYmd(form.startsOn, form.endsOn);
  if (length < 0) return { key: 'deals.wizard.errors.endBeforeStart' };
  if (length > DEAL_LIMITS.MAX_DURATION_DAYS) {
    return { key: 'deals.wizard.errors.durationTooLong', params: { days: DEAL_LIMITS.MAX_DURATION_DAYS } };
  }
  return null;
}

export function validateDealStep(form: DealForm, step: DealWizardStep, today: string, started = false): FormError | null {
  switch (step) {
    case 'offer':
      return validateOffer(form);
    case 'visual':
      return validateVisual(form);
    case 'dates':
      return validateDealDates(form, today, started);
    default:
      return null;
  }
}

/** Offer fields of the chosen type only: the others are not sent. */
export function offerOf(form: DealForm): DealOffer {
  switch (form.type) {
    case 'PERCENT_OFF':
      return { type: form.type, percentOff: parseInteger(form.percentOff) };
    case 'PRICE_DROP': {
      const original = parseDecimal(form.originalPrice);
      const price = parseDecimal(form.dealPrice);
      return { type: form.type, originalPrice: original == null ? null : toPrice(original), dealPrice: price == null ? null : toPrice(price) };
    }
    case 'BUY_X_GET_Y':
      return { type: form.type, buyQty: parseInteger(form.buyQty), freeQty: parseInteger(form.freeQty) };
    case 'FREE_ITEM': {
      // null clears a value left from a previous type when editing.
      const value = parseDecimal(form.originalPrice);
      return { type: form.type, originalPrice: value == null ? null : toPrice(value) };
    }
    default:
      return { type: form.type };
  }
}

/** Every offer field, as the client app receives them (preview, badge). */
export function previewOffer(form: DealForm): Required<DealOffer> {
  const offer = offerOf(form);
  const full: Required<DealOffer> = {
    type: offer.type,
    originalPrice: offer.originalPrice ?? null,
    dealPrice: offer.dealPrice ?? null,
    percentOff: offer.percentOff ?? null,
    buyQty: offer.buyQty ?? null,
    freeQty: offer.freeQty ?? null,
  };
  if (full.type === 'PRICE_DROP') full.percentOff = computePercentOff(full.originalPrice, full.dealPrice);
  return full;
}

export function dealFormToInput(form: DealForm): DealInput {
  const link = form.linkUrl.trim();
  const local = form.scope === 'LOCAL';
  return {
    scope: form.scope,
    ...offerOf(form),
    title: form.title.trim(),
    description: form.description.trim() || null,
    conditions: form.conditions.trim() || null,
    imageUrl: form.imageUrl || null,
    linkUrl: link || null,
    allStores: local ? form.allStores : true,
    ...(local && !form.allStores ? { storeIds: [...new Set(form.storeIds)] } : {}),
    startsOn: form.startsOn,
    endsOn: form.endsOn,
  };
}

export type DealPatch = Partial<Omit<DealInput, 'scope'>>;

/** PATCH body of an edit: the scope never changes, and a live deal keeps its start. */
export function dealFormToPatch(form: DealForm, started: boolean): DealPatch {
  const input: Partial<DealInput> = dealFormToInput(form);
  const { startsOn } = input;
  delete input.scope;
  delete input.startsOn;
  const patch: DealPatch = input;
  // allStores/storeIds mean nothing for an online deal.
  if (form.scope === 'ONLINE') {
    delete patch.allStores;
    delete patch.storeIds;
  } else if (form.allStores) {
    patch.storeIds = [];
  }
  return started ? patch : { ...patch, startsOn };
}

export type DealFormPatch = Partial<DealForm>;

/** Moving the first day keeps the length, within the 30-day maximum. */
export function applyDealPatch(state: DealForm, patch: DealFormPatch): DealForm {
  const next = { ...state, ...patch };
  if (patch.startsOn && !patch.endsOn && patch.startsOn !== state.startsOn) {
    const length = Math.max(0, Math.min(DEAL_LIMITS.MAX_DURATION_DAYS, diffDaysYmd(state.startsOn, state.endsOn)));
    next.endsOn = addDaysYmd(patch.startsOn, length);
  }
  return next;
}

export type DealFormAction = { type: 'SET'; patch: DealFormPatch } | { type: 'RESET'; form: DealForm };

export function dealFormReducer(state: DealForm, action: DealFormAction): DealForm {
  switch (action.type) {
    case 'SET':
      return applyDealPatch(state, action.patch);
    case 'RESET':
      return action.form;
    default:
      return state;
  }
}

// ── List ──────────────────────────────────────────────────────────────────────

export const DEAL_LIST_TABS = ['live', 'scheduled', 'ended'] as const;
export type DealListTab = (typeof DEAL_LIST_TABS)[number];

const TAB_STATUSES: Record<DealListTab, readonly DealDisplayStatus[]> = {
  live: ['LIVE'],
  scheduled: ['SCHEDULED'],
  ended: ['ENDED', 'REMOVED'],
};

const time = (iso: string) => new Date(iso).getTime();

/** Live: ending soonest first. Scheduled: starting soonest first. Ended: most recent first. */
export function dealsForTab<T extends Pick<MerchantDealDto, 'displayStatus' | 'startsAt' | 'endsAt'>>(deals: readonly T[], tab: DealListTab): T[] {
  const list = deals.filter((d) => TAB_STATUSES[tab].includes(d.displayStatus));
  if (tab === 'live') return list.sort((a, b) => time(a.endsAt) - time(b.endsAt));
  if (tab === 'scheduled') return list.sort((a, b) => time(a.startsAt) - time(b.startsAt));
  return list.sort((a, b) => time(b.endsAt) - time(a.endsAt));
}

export function tabOfStatus(status: DealDisplayStatus): DealListTab {
  return status === 'LIVE' ? 'live' : status === 'SCHEDULED' ? 'scheduled' : 'ended';
}

// ── Backend error codes ───────────────────────────────────────────────────────

export type DealErrorAction =
  | { kind: 'needsLocation' }
  | { kind: 'duplicate'; dealId: string }
  | { kind: 'limit' }
  | null;

/** What the screen can offer for a known backend error; null for a plain message. */
export function dealErrorAction(error: unknown): DealErrorAction {
  const { code, meta } = getErrorDetails(error);
  switch (code) {
    case 'DEAL_NEEDS_LOCATION':
      return { kind: 'needsLocation' };
    case 'DEAL_DUPLICATE':
      return typeof meta?.dealId === 'string' && meta.dealId ? { kind: 'duplicate', dealId: meta.dealId } : null;
    case 'DEAL_LIMIT_ACTIVE':
    case 'DEAL_LIMIT_DAILY':
      return { kind: 'limit' };
    default:
      return null;
  }
}

/** The limits reached, in the order they are checked by the backend. */
export function dealLimitReached(limits: { activeCount: number; maxActive: number; createdToday: number; maxPerDay: number } | undefined): 'active' | 'daily' | null {
  if (!limits) return null;
  if (limits.activeCount >= limits.maxActive) return 'active';
  if (limits.createdToday >= limits.maxPerDay) return 'daily';
  return null;
}
