import {
  computeStampPlan,
  initials,
  parseAmount,
  rewardAvailability,
  sanitizeAmountInput,
  type StampPlanInput,
} from '@/utils/stampTransaction';

const visit = (overrides: Partial<StampPlanInput> = {}): StampPlanInput => ({
  mode: 'PER_VISIT',
  currentStamps: 3,
  amount: 0,
  countVisit: true,
  accumulationLimit: null,
  reward: null,
  ...overrides,
});

const perAmount = (overrides: Partial<StampPlanInput> = {}): StampPlanInput => ({
  ...visit(),
  mode: 'PER_AMOUNT',
  amountPerStamp: 10,
  ...overrides,
});

describe('computeStampPlan — per visit', () => {
  it('adds one stamp by default', () => {
    expect(computeStampPlan(visit())).toMatchObject({ kind: 'earn', earnStamps: 1, creditedStamps: 1, balanceAfter: 4, blocker: null });
  });

  it('has nothing to do when the visit is not counted and no gift is chosen', () => {
    expect(computeStampPlan(visit({ countVisit: false }))).toMatchObject({ kind: 'none', blocker: 'nothingSelected' });
  });

  it('offers a gift alone when the visit is not counted', () => {
    expect(computeStampPlan(visit({ countVisit: false, reward: { cout: 3 } }))).toMatchObject({
      kind: 'redeem',
      earnStamps: 0,
      balanceAfter: 0,
    });
  });

  it('redeems an affordable gift first so the limit does not swallow the visit', () => {
    const plan = computeStampPlan(visit({ currentStamps: 10, accumulationLimit: 10, reward: { cout: 10 } }));
    expect(plan).toMatchObject({ kind: 'earnAndRedeem', order: 'redeemFirst', earnStamps: 1, balanceAfter: 1, atLimit: false });
  });

  it('earns first when the gift needs the stamp of this visit', () => {
    const plan = computeStampPlan(visit({ currentStamps: 9, reward: { cout: 10 } }));
    expect(plan).toMatchObject({ kind: 'earnAndRedeem', order: 'earnFirst', balanceAfter: 0 });
  });

  it('refuses a gift the client cannot reach even with this visit', () => {
    expect(computeStampPlan(visit({ currentStamps: 3, reward: { cout: 10 } }))).toMatchObject({
      kind: 'none',
      blocker: 'rewardTooExpensive',
    });
  });

  it('blocks earning at the accumulation limit', () => {
    expect(computeStampPlan(visit({ currentStamps: 10, accumulationLimit: 10 }))).toMatchObject({
      kind: 'none',
      atLimit: true,
      earnStamps: 0,
      blocker: 'limitReached',
    });
  });
});

describe('computeStampPlan — per amount', () => {
  it('asks for an amount first', () => {
    expect(computeStampPlan(perAmount())).toMatchObject({ kind: 'none', blocker: 'enterAmount' });
  });

  it('derives the stamps from the amount', () => {
    expect(computeStampPlan(perAmount({ amount: 45 }))).toMatchObject({ kind: 'earn', earnStamps: 4, balanceAfter: 7 });
  });

  it('flags an amount below the price of one stamp', () => {
    expect(computeStampPlan(perAmount({ amount: 5 }))).toMatchObject({ kind: 'none', amountTooLow: true, blocker: 'amountTooLow' });
  });

  it('still lets a gift be offered when the amount earns nothing', () => {
    expect(computeStampPlan(perAmount({ amount: 5, reward: { cout: 3 } }))).toMatchObject({ kind: 'redeem', earnStamps: 0 });
  });

  it('caps a large purchase at the per-transaction maximum', () => {
    expect(computeStampPlan(perAmount({ amount: 10_000 }))).toMatchObject({ earnStamps: 20, perTxCapped: true });
  });

  it('trims the credit to the accumulation limit but sends the backend value', () => {
    expect(computeStampPlan(perAmount({ amount: 50, accumulationLimit: 5 }))).toMatchObject({
      earnStamps: 5,
      creditedStamps: 2,
      limitTrimmed: true,
      balanceAfter: 5,
    });
  });
});

describe('rewardAvailability', () => {
  it('says when a gift can be offered', () => {
    expect(rewardAvailability(5, 6, 7)).toEqual({ state: 'now' });
    expect(rewardAvailability(7, 6, 7)).toEqual({ state: 'afterPurchase' });
    expect(rewardAvailability(10, 6, 7)).toEqual({ state: 'missing', missing: 3 });
  });
});

describe('amount input', () => {
  it('accepts a comma as decimal separator and keeps two decimals', () => {
    expect(sanitizeAmountInput('12,505')).toBe('12.50');
    expect(sanitizeAmountInput('1.2.3')).toBe('1.23');
    expect(sanitizeAmountInput('abc45')).toBe('45');
  });

  it('ignores negative and too long values', () => {
    expect(sanitizeAmountInput('-5')).toBeNull();
    expect(sanitizeAmountInput('123456789')).toBeNull();
  });

  it('parses empty or invalid text as zero', () => {
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('.')).toBe(0);
    expect(parseAmount('12.5')).toBe(12.5);
  });
});

describe('initials', () => {
  it('builds the avatar letters', () => {
    expect(initials('sara', 'benali')).toBe('SB');
    expect(initials(null, 'Atlas')).toBe('A');
    expect(initials(null, null)).toBe('?');
  });
});
