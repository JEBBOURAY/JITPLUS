import {
  DEAL_WIZARD_STEPS,
  dealErrorAction,
  dealFormReducer,
  dealFormToInput,
  dealFormToPatch,
  dealLimitReached,
  dealsForTab,
  formFromDeal,
  initialDealForm,
  isHttpsUrl,
  offerOf,
  parseDecimal,
  previewOffer,
  priceInput,
  tabOfStatus,
  validateDealDates,
  validateDealStep,
  withHttps,
  type DealForm,
} from '@/components/deals/dealForm';
import { getErrorDetails } from '@/utils/error';
import type { MerchantDealDto } from '@jitplus/shared/src/deals';

const TODAY = '2026-10-08';

const formOf = (patch: Partial<DealForm> = {}): DealForm => ({
  ...initialDealForm(TODAY),
  title: 'Baskets à -30 %',
  percentOff: '30',
  ...patch,
});

const apiError = (data: unknown) => ({ response: { status: 400, data } });

const deal = (patch: Partial<MerchantDealDto>): MerchantDealDto => ({
  id: 'd1',
  scope: 'LOCAL',
  type: 'PERCENT_OFF',
  title: 'Baskets',
  description: null,
  conditions: null,
  imageUrl: null,
  linkUrl: null,
  allStores: true,
  storeIds: [],
  originalPrice: null,
  dealPrice: null,
  percentOff: 30,
  buyQty: null,
  freeQty: null,
  startsAt: '2026-10-07T23:00:00.000Z',
  endsAt: '2026-10-15T22:59:59.000Z',
  startsOn: '2026-10-08',
  endsOn: '2026-10-15',
  status: 'ACTIVE',
  displayStatus: 'LIVE',
  endedReason: null,
  stats: { views: 0, linkClicks: 0, directions: 0, shares: 0 },
  createdAt: '2026-10-08T08:00:00.000Z',
  ...patch,
});

describe('initialDealForm', () => {
  it('starts today, in store, for every store, over the default length', () => {
    const form = initialDealForm(TODAY);
    expect(form).toMatchObject({ scope: 'LOCAL', allStores: true, startsOn: TODAY, endsOn: '2026-10-15', imageUrl: null });
    expect(DEAL_WIZARD_STEPS).toEqual(['offer', 'visual', 'dates', 'review']);
  });
});

describe('validateDealStep: offer', () => {
  it('requires a title of 3 characters or more', () => {
    expect(validateDealStep(formOf({ title: ' ab ' }), 'offer', TODAY)?.key).toBe('deals.wizard.errors.titleShort');
    expect(validateDealStep(formOf({ title: 'abc' }), 'offer', TODAY)).toBeNull();
    expect(validateDealStep(formOf({ title: 'a'.repeat(61) }), 'offer', TODAY)?.key).toBe('deals.wizard.errors.tooLong');
  });

  it('checks the percentage range', () => {
    expect(validateDealStep(formOf({ percentOff: '' }), 'offer', TODAY)?.key).toBe('deals.wizard.errors.percentRange');
    expect(validateDealStep(formOf({ percentOff: '0' }), 'offer', TODAY)?.key).toBe('deals.wizard.errors.percentRange');
    expect(validateDealStep(formOf({ percentOff: '100' }), 'offer', TODAY)?.key).toBe('deals.wizard.errors.percentRange');
    expect(validateDealStep(formOf({ percentOff: '99' }), 'offer', TODAY)).toBeNull();
  });

  it('requires a deal price lower than the original price', () => {
    const drop = (originalPrice: string, dealPrice: string) => formOf({ type: 'PRICE_DROP', originalPrice, dealPrice });
    expect(validateDealStep(drop('', '10'), 'offer', TODAY)?.key).toBe('deals.wizard.errors.pricesRequired');
    expect(validateDealStep(drop('100', '100'), 'offer', TODAY)?.key).toBe('deals.wizard.errors.priceNotLower');
    expect(validateDealStep(drop('99,90', '49,5'), 'offer', TODAY)).toBeNull();
  });

  it('checks quantities and the optional free item value', () => {
    expect(validateDealStep(formOf({ type: 'BUY_X_GET_Y', buyQty: '0' }), 'offer', TODAY)?.key).toBe('deals.wizard.errors.qtyRange');
    expect(validateDealStep(formOf({ type: 'BUY_X_GET_Y', buyQty: '21' }), 'offer', TODAY)?.key).toBe('deals.wizard.errors.qtyRange');
    expect(validateDealStep(formOf({ type: 'BUY_X_GET_Y', buyQty: '2', freeQty: '1' }), 'offer', TODAY)).toBeNull();
    expect(validateDealStep(formOf({ type: 'FREE_ITEM', originalPrice: '' }), 'offer', TODAY)).toBeNull();
    expect(validateDealStep(formOf({ type: 'OTHER' }), 'offer', TODAY)).toBeNull();
  });
});

describe('validateDealStep: visual', () => {
  it('requires an https link for an online deal only', () => {
    expect(validateDealStep(formOf({ scope: 'ONLINE' }), 'visual', TODAY)?.key).toBe('deals.wizard.errors.linkRequired');
    expect(validateDealStep(formOf(), 'visual', TODAY)).toBeNull();
    expect(validateDealStep(formOf({ linkUrl: 'http://shop.ma' }), 'visual', TODAY)?.key).toBe('deals.wizard.errors.linkInvalid');
    expect(validateDealStep(formOf({ scope: 'ONLINE', linkUrl: 'https://shop.ma/promo' }), 'visual', TODAY)).toBeNull();
  });

  it('requires at least one store when not every store is concerned', () => {
    expect(validateDealStep(formOf({ allStores: false, storeIds: [] }), 'visual', TODAY)?.key).toBe('deals.wizard.errors.storesRequired');
    expect(validateDealStep(formOf({ allStores: false, storeIds: ['s1'] }), 'visual', TODAY)).toBeNull();
    expect(validateDealStep(formOf({ scope: 'ONLINE', linkUrl: 'https://shop.ma', allStores: false }), 'visual', TODAY)).toBeNull();
  });
});

describe('isHttpsUrl / withHttps', () => {
  it('accepts https links to a domain name only', () => {
    expect(isHttpsUrl('https://www.shop.ma/promo?x=1')).toBe(true);
    expect(isHttpsUrl('https://boutique.ma:8443')).toBe(true);
    expect(isHttpsUrl('http://shop.ma')).toBe(false);
    expect(isHttpsUrl('https://localhost')).toBe(false);
    expect(isHttpsUrl('https://192.168.1.1')).toBe(false);
    expect(isHttpsUrl('https://user:pass@shop.ma')).toBe(false);
    expect(isHttpsUrl('https://shop .ma')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('')).toBe(false);
  });

  it('adds https:// to a bare domain and keeps a typed scheme', () => {
    expect(withHttps(' www.shop.ma ')).toBe('https://www.shop.ma');
    expect(withHttps('http://shop.ma')).toBe('http://shop.ma');
    expect(withHttps('https://shop.ma')).toBe('https://shop.ma');
    expect(withHttps('')).toBe('');
  });
});

describe('validateDealDates', () => {
  it('limits the start to 30 days ahead and the length to 30 days', () => {
    expect(validateDealDates({ startsOn: '2026-10-07', endsOn: '2026-10-10' }, TODAY)?.key).toBe('deals.wizard.errors.startPast');
    expect(validateDealDates({ startsOn: '2026-11-08', endsOn: '2026-11-10' }, TODAY)?.key).toBe('deals.wizard.errors.startTooFar');
    expect(validateDealDates({ startsOn: '2026-10-10', endsOn: '2026-10-09' }, TODAY)?.key).toBe('deals.wizard.errors.endBeforeStart');
    expect(validateDealDates({ startsOn: TODAY, endsOn: '2026-11-08' }, TODAY)?.key).toBe('deals.wizard.errors.durationTooLong');
    expect(validateDealDates({ startsOn: TODAY, endsOn: '2026-11-07' }, TODAY)).toBeNull();
    expect(validateDealDates({ startsOn: TODAY, endsOn: TODAY }, TODAY)).toBeNull();
  });

  it('counts the end of a live deal from today, whatever its start', () => {
    expect(validateDealDates({ startsOn: '2026-09-20', endsOn: '2026-11-07' }, TODAY, true)).toBeNull();
    expect(validateDealDates({ startsOn: '2026-09-20', endsOn: '2026-11-08' }, TODAY, true)?.key).toBe('deals.wizard.errors.endTooFar');
    expect(validateDealDates({ startsOn: '2026-09-20', endsOn: '2026-10-07' }, TODAY, true)?.key).toBe('deals.wizard.errors.endPast');
  });
});

describe('offer payload', () => {
  it('sends only the fields of the chosen type', () => {
    const form = formOf({ type: 'BUY_X_GET_Y', percentOff: '30', originalPrice: '100', dealPrice: '50', buyQty: '2', freeQty: '1' });
    expect(offerOf(form)).toEqual({ type: 'BUY_X_GET_Y', buyQty: 2, freeQty: 1 });
    expect(offerOf(formOf({ type: 'PRICE_DROP', originalPrice: '99,999', dealPrice: '49.5' }))).toEqual({
      type: 'PRICE_DROP',
      originalPrice: 100,
      dealPrice: 49.5,
    });
    expect(offerOf(formOf({ type: 'FREE_ITEM', originalPrice: '' }))).toEqual({ type: 'FREE_ITEM', originalPrice: null });
    expect(offerOf(formOf({ type: 'OTHER', percentOff: '30' }))).toEqual({ type: 'OTHER' });
  });

  it('computes the percentage of a price drop for the preview', () => {
    const offer = previewOffer(formOf({ type: 'PRICE_DROP', originalPrice: '200', dealPrice: '150' }));
    expect(offer).toMatchObject({ type: 'PRICE_DROP', originalPrice: 200, dealPrice: 150, percentOff: 25, buyQty: null });
  });

  it('builds the create body: trimmed texts, nulls for empty fields, stores only when chosen', () => {
    const input = dealFormToInput(formOf({ title: '  Promo  ', description: '  ', linkUrl: ' https://shop.ma ' }));
    expect(input).toMatchObject({
      scope: 'LOCAL',
      type: 'PERCENT_OFF',
      percentOff: 30,
      title: 'Promo',
      description: null,
      conditions: null,
      imageUrl: null,
      linkUrl: 'https://shop.ma',
      allStores: true,
      startsOn: TODAY,
      endsOn: '2026-10-15',
    });
    expect(input).not.toHaveProperty('storeIds');
    expect(input).not.toHaveProperty('originalPrice');

    expect(dealFormToInput(formOf({ allStores: false, storeIds: ['s1', 's1', 's2'] })).storeIds).toEqual(['s1', 's2']);
    expect(dealFormToInput(formOf({ scope: 'ONLINE', allStores: false, storeIds: ['s1'] }))).toMatchObject({ allStores: true });
    expect(dealFormToInput(formOf({ scope: 'ONLINE', allStores: false, storeIds: ['s1'] }))).not.toHaveProperty('storeIds');
  });

  it('builds the edit body: no scope, no start for a live deal, empty stores for every store', () => {
    const patch = dealFormToPatch(formOf(), true);
    expect(patch).not.toHaveProperty('scope');
    expect(patch).not.toHaveProperty('startsOn');
    expect(patch).toMatchObject({ endsOn: '2026-10-15', allStores: true, storeIds: [] });

    expect(dealFormToPatch(formOf({ startsOn: '2026-10-10' }), false)).toMatchObject({ startsOn: '2026-10-10' });

    const online = dealFormToPatch(formOf({ scope: 'ONLINE', linkUrl: 'https://shop.ma' }), false);
    expect(online).not.toHaveProperty('allStores');
    expect(online).not.toHaveProperty('storeIds');
  });
});

describe('formFromDeal / reducer', () => {
  it('loads a deal into the form', () => {
    const form = formFromDeal(deal({ type: 'PRICE_DROP', originalPrice: 100, dealPrice: 70, percentOff: 30, allStores: false, storeIds: ['s1'] }));
    expect(form).toMatchObject({ type: 'PRICE_DROP', originalPrice: '100', dealPrice: '70', percentOff: '', allStores: false, storeIds: ['s1'], buyQty: '1' });
  });

  it('keeps the length when the first day moves', () => {
    const state = formOf({ startsOn: TODAY, endsOn: '2026-10-11' });
    expect(dealFormReducer(state, { type: 'SET', patch: { startsOn: '2026-10-20' } })).toMatchObject({ startsOn: '2026-10-20', endsOn: '2026-10-23' });
    expect(dealFormReducer(state, { type: 'SET', patch: { startsOn: '2026-10-20', endsOn: '2026-10-21' } }).endsOn).toBe('2026-10-21');
  });
});

describe('number inputs', () => {
  it('parses French decimals and keeps two decimals at most', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(priceInput('12,345')).toBe('12,34');
    expect(priceInput('1.2.3')).toBe('1.23');
    expect(priceInput('a1b2')).toBe('12');
  });
});

describe('deal list', () => {
  it('sorts each tab and maps the statuses to tabs', () => {
    const deals = [
      deal({ id: 'live-late', endsAt: '2026-10-20T22:59:59.000Z' }),
      deal({ id: 'live-soon', endsAt: '2026-10-09T22:59:59.000Z' }),
      deal({ id: 'sched', displayStatus: 'SCHEDULED', startsAt: '2026-10-12T23:00:00.000Z' }),
      deal({ id: 'ended-old', displayStatus: 'ENDED', endsAt: '2026-09-01T22:59:59.000Z' }),
      deal({ id: 'removed', displayStatus: 'REMOVED', endsAt: '2026-10-01T22:59:59.000Z' }),
    ];
    expect(dealsForTab(deals, 'live').map((d) => d.id)).toEqual(['live-soon', 'live-late']);
    expect(dealsForTab(deals, 'scheduled').map((d) => d.id)).toEqual(['sched']);
    expect(dealsForTab(deals, 'ended').map((d) => d.id)).toEqual(['removed', 'ended-old']);
    expect(tabOfStatus('REMOVED')).toBe('ended');
    expect(tabOfStatus('SCHEDULED')).toBe('scheduled');
  });

  it('reports the limit reached, active deals first', () => {
    expect(dealLimitReached(undefined)).toBeNull();
    expect(dealLimitReached({ activeCount: 5, maxActive: 5, createdToday: 3, maxPerDay: 3 })).toBe('active');
    expect(dealLimitReached({ activeCount: 1, maxActive: 5, createdToday: 3, maxPerDay: 3 })).toBe('daily');
    expect(dealLimitReached({ activeCount: 1, maxActive: 5, createdToday: 0, maxPerDay: 3 })).toBeNull();
  });
});

describe('backend errors', () => {
  it('reads the code and meta of an API error', () => {
    expect(getErrorDetails(apiError({ code: 'DEAL_DUPLICATE', meta: { dealId: 'd9' } }))).toEqual({ code: 'DEAL_DUPLICATE', meta: { dealId: 'd9' } });
    expect(getErrorDetails(apiError('oops'))).toEqual({});
    expect(getErrorDetails(new Error('network'))).toEqual({});
    expect(getErrorDetails(null)).toEqual({});
  });

  it('maps the deal error codes to the action offered', () => {
    expect(dealErrorAction(apiError({ code: 'DEAL_NEEDS_LOCATION' }))).toEqual({ kind: 'needsLocation' });
    expect(dealErrorAction(apiError({ code: 'DEAL_DUPLICATE', meta: { dealId: 'd9' } }))).toEqual({ kind: 'duplicate', dealId: 'd9' });
    expect(dealErrorAction(apiError({ code: 'DEAL_DUPLICATE' }))).toBeNull();
    expect(dealErrorAction(apiError({ code: 'DEAL_LIMIT_ACTIVE' }))).toEqual({ kind: 'limit' });
    expect(dealErrorAction(apiError({ code: 'DEAL_LIMIT_DAILY' }))).toEqual({ kind: 'limit' });
    expect(dealErrorAction(apiError({ message: 'Titre interdit' }))).toBeNull();
  });
});
