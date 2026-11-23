import { buildTransactionWhere, summarizeByType } from './transaction-filters';

const M = 'merchant-1';

describe('buildTransactionWhere', () => {
  it('without filters keeps the full history minus program-change rows', () => {
    expect(buildTransactionWhere(M, {})).toEqual({ merchantId: M, type: { not: 'LOYALTY_PROGRAM_CHANGE' } });
  });

  it('maps each kind to its types', () => {
    expect(buildTransactionWhere(M, { kind: 'stamps' }).type).toEqual({ in: ['EARN_STAMPS', 'WELCOME_BONUS'] });
    expect(buildTransactionWhere(M, { kind: 'rewards' }).type).toEqual({ in: ['REDEEM_REWARD'] });
    expect(buildTransactionWhere(M, { kind: 'games' }).type).toEqual({ in: ['LUCKY_WHEEL_WIN'] });
    expect(buildTransactionWhere(M, { kind: 'coupons' }).type).toEqual({ in: ['COUPON_REDEEM'] });
    expect(buildTransactionWhere(M, { kind: 'adjustments' }).type).toEqual({ in: ['ADJUST_STAMPS'] });
  });

  it('"cancelled" filters on the status, across every type', () => {
    expect(buildTransactionWhere(M, { kind: 'cancelled' })).toEqual({
      merchantId: M,
      type: { not: 'LOYALTY_PROGRAM_CHANGE' },
      status: 'CANCELLED',
    });
  });

  it('adds the period, the staff and the matched clients', () => {
    const from = new Date('2026-11-01T00:00:00Z');
    expect(buildTransactionWhere(M, { from, staff: 'owner', clientIds: ['c1'] })).toMatchObject({
      createdAt: { gte: from },
      teamMemberId: null,
      clientId: { in: ['c1'] },
    });
    expect(buildTransactionWhere(M, { staff: 'tm-1' }).teamMemberId).toBe('tm-1');
  });

  it('is always scoped by the merchant', () => {
    expect(buildTransactionWhere(M, { kind: 'rewards', staff: 'tm-1', clientIds: [] }).merchantId).toBe(M);
  });
});

describe('summarizeByType', () => {
  it('counts given stamps (visits + welcome), redeemed rewards and the typed amounts', () => {
    expect(
      summarizeByType([
        { type: 'EARN_STAMPS', _count: 10, _sum: { stamps: 14, amount: 420.5 } },
        { type: 'WELCOME_BONUS', _count: 2, _sum: { stamps: 2, amount: 0 } },
        { type: 'REDEEM_REWARD', _count: 3, _sum: { stamps: 30, amount: null } },
        { type: 'ADJUST_STAMPS', _count: 1, _sum: { stamps: -2, amount: 0 } },
        { type: 'PURCHASE', _count: 1, _sum: { stamps: 0, amount: 80.1 } },
      ]),
    ).toEqual({ stampsGiven: 16, rewardsRedeemed: 3, revenue: 500.6 });
  });

  it('is all zeros with no rows', () => {
    expect(summarizeByType([])).toEqual({ stampsGiven: 0, rewardsRedeemed: 0, revenue: 0 });
  });
});
