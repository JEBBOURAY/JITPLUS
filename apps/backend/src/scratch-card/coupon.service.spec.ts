import { BadRequestException, ConflictException } from '@nestjs/common';
import { CouponService } from './coupon.service';

const PAST = new Date(Date.now() - 86_400_000);
const FUTURE = new Date(Date.now() + 86_400_000);

function baseCoupon(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coupon1',
    source: 'SCRATCH_CARD',
    code: '042913',
    type: 'PERCENT_DISCOUNT',
    label: '-20 %',
    value: 20,
    maxDiscount: null,
    conditions: {},
    status: 'ACTIVE',
    validFrom: PAST,
    expiresAt: FUTURE,
    redeemedAt: null,
    cancelledAt: null,
    createdAt: PAST,
    clientId: 'client1',
    merchantId: 'm1',
    purchaseAmount: null,
    discountAmount: null,
    scratchCardId: 'card1',
    redeemTransactionId: null,
    client: { id: 'client1', isAnonymous: false, deletedAt: null, language: 'fr' },
    ...overrides,
  };
}

function setup(opts: { coupon?: any; merchant?: any; card?: any; claimCount?: number } = {}) {
  const coupon = opts.coupon ?? baseCoupon();
  let txCounter = 0;
  const tx = {
    coupon: {
      findFirst: jest.fn().mockResolvedValue(coupon),
      updateMany: jest.fn().mockResolvedValue({ count: opts.claimCount ?? 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    merchant: {
      findUnique: jest.fn().mockResolvedValue(
        opts.merchant ?? { nom: 'Café Atlas', isActive: true, deletedAt: null, stampEarningMode: 'PER_AMOUNT', amountPerStamp: 10, accumulationLimit: null },
      ),
    },
    loyaltyCard: {
      findUnique: jest.fn().mockResolvedValue(opts.card === undefined ? { id: 'lc1', stamps: 3, deactivatedAt: null } : opts.card),
      create: jest.fn().mockResolvedValue({ id: 'lc-new', stamps: 0, deactivatedAt: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    transaction: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(() => Promise.resolve({ id: `tx${++txCounter}` })),
    },
    luckyWheelCampaign: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    $transaction: jest.fn((fn: any) => fn(tx)),
    coupon: { findUniqueOrThrow: jest.fn().mockResolvedValue(baseCoupon({ status: 'REDEEMED' })) },
    loyaltyCard: { findUnique: jest.fn() },
  };
  const service = new CouponService(
    prisma as any,
    { get: () => 'x'.repeat(40) } as any,
    { sendToClient: jest.fn().mockResolvedValue(undefined) } as any,
    { assertCanAddClient: jest.fn().mockResolvedValue(undefined) } as any,
    {
      emitCouponUpdated: jest.fn(),
      emitCouponRedeemed: jest.fn(),
      emitStampsUpdated: jest.fn(),
      emitTransactionRecorded: jest.fn(),
    } as any,
    { log: jest.fn() } as any,
  );
  return { service, tx };
}

const actor = { redeemedBy: 'm1' };

describe('CouponService.redeem', () => {
  it('computes the discount and earns stamps on the amount paid', async () => {
    const { service, tx } = setup();
    const res = await service.redeem('m1', 'coupon1', 180, actor);
    expect(res).toMatchObject({ discountAmount: 36, paidAmount: 144, stampsEarned: 14, bonusStamps: 0, newBalance: 17 });

    const [earn, redeem] = tx.transaction.create.mock.calls.map((c: any[]) => c[0].data);
    expect(earn).toMatchObject({ type: 'EARN_STAMPS', amount: 144, stamps: 14 });
    expect(redeem).toMatchObject({ type: 'COUPON_REDEEM', amount: 0, stamps: 0 });
    expect(tx.loyaltyCard.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stamps: 17, expiryReminderSentAt: null }) }),
    );
    expect(tx.coupon.update).toHaveBeenCalledWith({
      where: { id: 'coupon1' },
      data: { redeemTransactionId: 'tx2', earnTransactionId: 'tx1' },
    });
  });

  it('credits bonus stamps on a separate COUPON_REDEEM row, capped by the limit', async () => {
    const { service, tx } = setup({
      coupon: baseCoupon({ type: 'BONUS_STAMPS', value: 5, label: '+5 tampons' }),
      merchant: { nom: 'X', isActive: true, deletedAt: null, stampEarningMode: 'PER_VISIT', amountPerStamp: null, accumulationLimit: 8 },
    });
    const res = await service.redeem('m1', 'coupon1', 50, actor);
    // 3 + 1 (visit) = 4, then bonus capped at 8 → +4
    expect(res).toMatchObject({ stampsEarned: 1, bonusStamps: 4, newBalance: 8 });
    const redeem = tx.transaction.create.mock.calls[1][0].data;
    expect(redeem).toMatchObject({ type: 'COUPON_REDEEM', stamps: 4 });
  });

  it('allows a free product with no purchase and earns nothing', async () => {
    const { service, tx } = setup({ coupon: baseCoupon({ type: 'FREE_PRODUCT', value: null, label: 'Café' }) });
    const res = await service.redeem('m1', 'coupon1', 0, actor);
    expect(res).toMatchObject({ stampsEarned: 0, bonusStamps: 0, newBalance: 3 });
    expect(tx.transaction.create).toHaveBeenCalledTimes(1);
    expect(tx.loyaltyCard.update).not.toHaveBeenCalled();
  });

  it('needs an amount for money discounts', async () => {
    const { service } = setup();
    await expect(service.redeem('m1', 'coupon1', 0, actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses ghost clients, cancelled and already used coupons', async () => {
    await expect(
      setup({ coupon: baseCoupon({ client: { id: 'c', isAnonymous: true, deletedAt: null, language: 'fr' } }) }).service.redeem('m1', 'coupon1', 100, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup({ coupon: baseCoupon({ status: 'CANCELLED', cancelledAt: PAST }) }).service.redeem('m1', 'coupon1', 100, actor),
    ).rejects.toThrow('annulé');
    await expect(
      setup({ coupon: baseCoupon({ status: 'REDEEMED', redeemedAt: PAST }) }).service.redeem('m1', 'coupon1', 100, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces the minimum purchase on the ticket total', async () => {
    const { service } = setup({ coupon: baseCoupon({ conditions: { minPurchaseAmount: 200 } }) });
    await expect(service.redeem('m1', 'coupon1', 180, actor)).rejects.toThrow('200');
  });

  it('loses the race cleanly when another till redeemed first', async () => {
    const { service } = setup({ claimCount: 0 });
    await expect(service.redeem('m1', 'coupon1', 100, actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps the coupon usable but earns nothing when the client left the programme', async () => {
    const { service, tx } = setup({ card: { id: 'lc1', stamps: 3, deactivatedAt: PAST } });
    const res = await service.redeem('m1', 'coupon1', 100, actor);
    expect(res).toMatchObject({ stampsEarned: 0, bonusStamps: 0 });
    expect(tx.transaction.create).toHaveBeenCalledTimes(1);
  });
});

function readService(prisma: any) {
  return new CouponService(prisma, { get: () => 'x'.repeat(40) } as any, {} as any, {} as any, {} as any, {} as any);
}

describe('CouponService.check', () => {
  it('cannot be redeemed when the client deleted their account', async () => {
    const coupon = baseCoupon({
      client: { id: 'client1', prenom: 'Sara', nom: 'B', shareInfoMerchants: true, isAnonymous: false, deletedAt: PAST },
    });
    const service = readService({ coupon: { findFirst: jest.fn().mockResolvedValue(coupon) } });
    const res = await service.check('m1', { code: '042913' });
    expect(res.canRedeem).toBe(false);
  });
});

describe('CouponService.listForClientAtTill', () => {
  it('lists only the usable coupons of this client at this merchant, with their checks', async () => {
    const findMany = jest.fn().mockResolvedValue([
      baseCoupon({ client: { isAnonymous: false, deletedAt: null } }),
      baseCoupon({ id: 'coupon2', validFrom: FUTURE, client: { isAnonymous: false, deletedAt: null } }),
      baseCoupon({ id: 'coupon3', client: { isAnonymous: true, deletedAt: null } }),
    ]);
    const service = readService({ coupon: { findMany } });
    const res = await service.listForClientAtTill('m1', 'client1');

    expect(findMany.mock.calls[0][0].where).toMatchObject({
      merchantId: 'm1',
      clientId: 'client1',
      status: 'ACTIVE',
      expiresAt: { gt: expect.any(Date) },
    });
    expect(res.map((r) => [r.coupon.id, r.canRedeem])).toEqual([
      ['coupon1', true],
      ['coupon2', false],
      ['coupon3', false],
    ]);
    expect(res[1].checks.find((c) => c.key === 'dates')?.ok).toBe(false);
  });
});

describe('CouponService.listMerchantCoupons', () => {
  function listSetup() {
    const prisma = {
      coupon: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      teamMember: { findMany: jest.fn() },
    };
    return { service: readService(prisma), prisma };
  }

  it('excludes coupons past their expiry from ACTIVE', async () => {
    const { service, prisma } = listSetup();
    await service.listMerchantCoupons('m1', { status: 'ACTIVE' });
    const where = prisma.coupon.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ merchantId: 'm1', status: 'ACTIVE', expiresAt: { gt: expect.any(Date) } });
  });

  it('includes ACTIVE coupons past their expiry in EXPIRED', async () => {
    const { service, prisma } = listSetup();
    await service.listMerchantCoupons('m1', { status: 'EXPIRED' });
    const where = prisma.coupon.findMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
    expect(where.OR).toEqual([{ status: 'EXPIRED' }, { status: 'ACTIVE', expiresAt: { lte: expect.any(Date) } }]);
  });
});
