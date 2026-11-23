import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MerchantTransactionService } from './merchant-transaction.service';

jest.mock('../utils/lucky-wheel-tickets', () => ({
  awardLuckyWheelTicketsInTx: jest.fn().mockResolvedValue(0),
}));

const CLIENT_ID = 'client-1';
const MERCHANT_ID = 'merchant-1';

function setup(card: { id: string; stamps: number; deactivatedAt: Date | null } | null) {
  const prisma = {
    client: { findUnique: jest.fn().mockResolvedValue({ id: CLIENT_ID, deletedAt: null }) },
    merchant: { findUnique: jest.fn().mockResolvedValue({ id: MERCHANT_ID, isActive: true, deletedAt: null }) },
    loyaltyCard: {
      findUnique: jest.fn().mockResolvedValue(card),
      create: jest.fn().mockResolvedValue({ id: 'lc-new', stamps: 0, deactivatedAt: null }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: card?.id ?? 'lc-new', stamps: card?.stamps ?? 0, deactivatedAt: null, ...data })),
    },
    transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1', stamps: 1 }) },
    luckyWheelCampaign: { findFirst: jest.fn().mockResolvedValue({ id: 'wheel-1' }) },
    clientMerchantBlock: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const clientRepo = { findUnique: jest.fn().mockResolvedValue({ id: CLIENT_ID, language: 'fr', deletedAt: null }) };
  const merchantRepo = {
    findUnique: jest.fn().mockResolvedValue({
      nom: 'Cafe', isActive: true, deletedAt: null, accumulationLimit: null,
      amountPerStamp: null, stampsForReward: 10, stampEarningMode: 'PER_VISIT', rewards: [],
    }),
  };
  const planService = {
    assertCanAddClient: jest.fn().mockResolvedValue(undefined),
    resolveEffectivePlan: jest.fn().mockResolvedValue({ plan: 'FREE' }),
  };
  const notifications = { sendToClient: jest.fn().mockResolvedValue(undefined) };
  const eventsGateway = { emitStampsUpdated: jest.fn(), emitTransactionRecorded: jest.fn() };
  const txRunner = { run: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)) };

  const service = new MerchantTransactionService(
    clientRepo as any,
    merchantRepo as any,
    {} as any,
    { findUnique: jest.fn() } as any,
    { findFirst: jest.fn().mockResolvedValue(null) } as any,
    txRunner as any,
    notifications as any,
    eventsGateway as any,
    planService as any,
    {} as any,
  );
  return { service, prisma, planService, clientRepo, merchantRepo, eventsGateway, notifications };
}

describe('MerchantTransactionService enrollment rules', () => {
  const earn = (service: MerchantTransactionService, allowEnroll?: boolean, allowReactivate?: boolean) =>
    service.createTransaction(CLIENT_ID, MERCHANT_ID, 'EARN_STAMPS', 0, 1, undefined, undefined, undefined, undefined, { allowEnroll, allowReactivate });

  it('credits an existing active member without a scan ticket', async () => {
    const { service, prisma } = setup({ id: 'lc1', stamps: 2, deactivatedAt: null });
    await expect(earn(service)).resolves.toMatchObject({ id: 'tx-1' });
    expect(prisma.loyaltyCard.create).not.toHaveBeenCalled();
  });

  it('refuses to enroll a non-member without a scan ticket', async () => {
    const { service, prisma } = setup(null);
    await expect(earn(service)).rejects.toThrow(NotFoundException);
    expect(prisma.loyaltyCard.create).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('enrolls a non-member when allowed (scan ticket / quick-add)', async () => {
    const { service, prisma, planService } = setup(null);
    await earn(service, true);
    // Counted inside the transaction, with the plan resolved before it (no 2nd pool connection).
    expect(planService.assertCanAddClient).toHaveBeenCalledWith(MERCHANT_ID, { tx: prisma, plan: 'FREE' });
    expect(prisma.loyaltyCard.create).toHaveBeenCalled();
  });

  it('refuses a client who left the programme without a scan ticket', async () => {
    const { service, prisma } = setup({ id: 'lc1', stamps: 0, deactivatedAt: new Date() });
    await expect(earn(service)).rejects.toThrow(BadRequestException);
    expect(prisma.loyaltyCard.update).not.toHaveBeenCalled();
  });

  it('reactivates a card that was left when a scan ticket is provided', async () => {
    const { service, prisma, planService } = setup({ id: 'lc1', stamps: 0, deactivatedAt: new Date() });
    await earn(service, true);
    expect(planService.assertCanAddClient).toHaveBeenCalled();
    expect(prisma.loyaltyCard.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lc1' }, data: { deactivatedAt: null } }),
    );
  });

  // Security audit 2026-11-05
  it('never revives a left card from a phone-number ticket (enroll only)', async () => {
    const { service, prisma } = setup({ id: 'lc1', stamps: 0, deactivatedAt: new Date() });
    await expect(earn(service, true, false)).rejects.toThrow(BadRequestException);
    expect(prisma.loyaltyCard.update).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('a phone-number ticket still enrolls a brand-new member', async () => {
    const { service, prisma } = setup(null);
    await earn(service, true, false);
    expect(prisma.loyaltyCard.create).toHaveBeenCalled();
  });

  it('refuses to (re)enroll a client who blocked the merchant, whatever the proof', async () => {
    for (const card of [null, { id: 'lc1', stamps: 0, deactivatedAt: new Date() }]) {
      const { service, prisma } = setup(card);
      prisma.clientMerchantBlock.findUnique.mockResolvedValue({ id: 'block-1' });
      await expect(earn(service, true, true)).rejects.toThrow(ForbiddenException);
      expect(prisma.loyaltyCard.create).not.toHaveBeenCalled();
      expect(prisma.loyaltyCard.update).not.toHaveBeenCalled();
    }
  });
});

describe('MerchantTransactionService stamps given from a booking', () => {
  const booking = { id: 'b1', merchantId: MERCHANT_ID, clientId: CLIENT_ID, status: 'CONFIRMED', startsAt: new Date(), checkedInAt: null, checkInTransactionId: null };
  const withBooking = (found: unknown) => {
    const ctx = setup({ id: 'lc1', stamps: 2, deactivatedAt: null });
    const bookingDb = { findFirst: jest.fn().mockResolvedValue(found), updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    Object.assign(ctx.prisma, { booking: bookingDb });
    const bookingService = { announceVisit: jest.fn(), checkInFromTransaction: jest.fn() };
    Object.assign(ctx.service, { booking: bookingService });
    return { ...ctx, bookingDb, bookingService };
  };
  const earn = (service: MerchantTransactionService, type: 'EARN_STAMPS' | 'REDEEM_REWARD' = 'EARN_STAMPS') =>
    service.createTransaction(CLIENT_ID, MERCHANT_ID, type, 0, 1, undefined, undefined, undefined, undefined, { booking: { id: 'b1', complete: false } });

  it('ties the transaction to the booking and skips the search for a nearby visit', async () => {
    const { service, bookingDb, bookingService } = withBooking(booking);
    await earn(service);
    expect(bookingDb.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ checkInTransactionId: 'tx-1' }) }));
    expect(bookingService.announceVisit).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', status: 'CHECKED_IN' }));
    expect(bookingService.checkInFromTransaction).not.toHaveBeenCalled();
  });

  it('fails the whole transaction when the booking cannot take the stamps', async () => {
    const { service, bookingService, eventsGateway } = withBooking({ ...booking, checkInTransactionId: 'tx-0' });
    await expect(earn(service)).rejects.toThrow('error.booking.alreadyCredited');
    expect(bookingService.announceVisit).not.toHaveBeenCalled();
    expect(eventsGateway.emitStampsUpdated).not.toHaveBeenCalled();
  });
});

describe('MerchantTransactionService PURCHASE (stamp-less wheel purchase)', () => {
  const purchase = (service: MerchantTransactionService, amount: number, stamps = 0) =>
    service.createTransaction(CLIENT_ID, MERCHANT_ID, 'PURCHASE', amount, stamps);

  it('records the purchase without touching the stamp balance', async () => {
    const { service, prisma } = setup({ id: 'lc1', stamps: 4, deactivatedAt: null });
    await purchase(service, 100);
    expect(prisma.luckyWheelCampaign.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ merchantId: MERCHANT_ID, ticketCostStamps: 0, minSpendAmount: { gt: 0, lte: 100 } }),
    }));
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'PURCHASE', amount: 100, stamps: 0 }),
    });
    expect(prisma.loyaltyCard.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ stamps: 4 }),
    }));
  });

  it('is accepted when the card is at the accumulation limit', async () => {
    const { service, prisma, merchantRepo } = setup({ id: 'lc1', stamps: 10, deactivatedAt: null });
    merchantRepo.findUnique.mockResolvedValue({
      nom: 'Cafe', isActive: true, deletedAt: null, accumulationLimit: 10,
      amountPerStamp: 150, stampsForReward: 10, stampEarningMode: 'PER_AMOUNT', rewards: [],
    });
    await purchase(service, 300);
    expect(prisma.transaction.create).toHaveBeenCalled();
  });

  it('refuses when no active wheel accepts this amount', async () => {
    const { service, prisma } = setup({ id: 'lc1', stamps: 4, deactivatedAt: null });
    prisma.luckyWheelCampaign.findFirst.mockResolvedValue(null);
    await expect(purchase(service, 100)).rejects.toThrow(BadRequestException);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('refuses stamps or a missing amount', async () => {
    const { service, prisma } = setup({ id: 'lc1', stamps: 4, deactivatedAt: null });
    await expect(purchase(service, 100, 1)).rejects.toThrow(BadRequestException);
    await expect(purchase(service, 0)).rejects.toThrow(BadRequestException);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('sends no stamp event or stamp push to the client', async () => {
    const { service, eventsGateway, notifications } = setup({ id: 'lc1', stamps: 4, deactivatedAt: null });
    await purchase(service, 100);
    expect(eventsGateway.emitStampsUpdated).not.toHaveBeenCalled();
    expect(eventsGateway.emitTransactionRecorded).toHaveBeenCalledWith(MERCHANT_ID, expect.objectContaining({ type: 'PURCHASE' }));
    expect(notifications.sendToClient).not.toHaveBeenCalled();
  });
});

describe('MerchantTransactionService.adjustStamps', () => {
  it('refuses to adjust a client without a loyalty card (no enrollment)', async () => {
    const { service, prisma } = setup(null);
    await expect(service.adjustStamps(CLIENT_ID, MERCHANT_ID, 3)).rejects.toThrow(NotFoundException);
    expect(prisma.loyaltyCard.create).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('refuses a deleted client', async () => {
    const { service, clientRepo, prisma } = setup({ id: 'lc1', stamps: 2, deactivatedAt: null });
    clientRepo.findUnique.mockResolvedValue({ id: CLIENT_ID, language: 'fr', deletedAt: new Date() });
    await expect(service.adjustStamps(CLIENT_ID, MERCHANT_ID, 3)).rejects.toThrow(NotFoundException);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('refuses an inactive merchant', async () => {
    const { service, merchantRepo, prisma } = setup({ id: 'lc1', stamps: 2, deactivatedAt: null });
    merchantRepo.findUnique.mockResolvedValue({ nom: 'Cafe', accumulationLimit: null, isActive: false, deletedAt: null });
    await expect(service.adjustStamps(CLIENT_ID, MERCHANT_ID, 3)).rejects.toThrow(NotFoundException);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('re-checks the client inside the transaction', async () => {
    const { service, prisma } = setup({ id: 'lc1', stamps: 2, deactivatedAt: null });
    prisma.client.findUnique.mockResolvedValue({ id: CLIENT_ID, deletedAt: new Date() });
    await expect(service.adjustStamps(CLIENT_ID, MERCHANT_ID, 3)).rejects.toThrow(NotFoundException);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('adjusts an active member', async () => {
    const { service, prisma } = setup({ id: 'lc1', stamps: 2, deactivatedAt: null });
    const res = await service.adjustStamps(CLIENT_ID, MERCHANT_ID, 3);
    expect(res).toMatchObject({ previousStamps: 2, newStamps: 5 });
    expect(prisma.loyaltyCard.update).toHaveBeenCalledWith(expect.objectContaining({ data: { stamps: 5 } }));
  });
});

// Security audit 2026-11-21: a typed phone number is no proof of consent, so
// the card it opens keeps the client's details masked until they confirm.
describe('MerchantTransactionService phone-enrolment consent', () => {
  const earnWith = (service: MerchantTransactionService, options: Record<string, boolean>) =>
    service.createTransaction(CLIENT_ID, MERCHANT_ID, 'EARN_STAMPS', 0, 1, undefined, undefined, undefined, undefined, options);

  it('marks a card opened from a phone ticket as consentPending', async () => {
    const { service, prisma } = setup(null);
    await earnWith(service, { allowEnroll: true, allowReactivate: false, welcomeProof: false, consentPending: true });
    expect(prisma.loyaltyCard.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ clientId: CLIENT_ID, merchantId: MERCHANT_ID, consentPending: true }),
    }));
  });

  it('a QR-ticket enrolment is not pending', async () => {
    const { service, prisma } = setup(null);
    await earnWith(service, { allowEnroll: true, allowReactivate: true, welcomeProof: true });
    expect(prisma.loyaltyCard.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ consentPending: false }),
    }));
  });

  it("the client's own QR scan confirms a pending card", async () => {
    const { service, prisma } = setup({ id: 'lc1', stamps: 1, deactivatedAt: null, consentPending: true } as never);
    await earnWith(service, { allowEnroll: true, allowReactivate: true, welcomeProof: true });
    expect(prisma.loyaltyCard.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'lc1' }, data: { consentPending: false },
    }));
  });

  it('another phone-ticket transaction does not confirm a pending card', async () => {
    const { service, prisma } = setup({ id: 'lc1', stamps: 1, deactivatedAt: null, consentPending: true } as never);
    await earnWith(service, { allowEnroll: true, allowReactivate: false, welcomeProof: false, consentPending: true });
    expect(prisma.loyaltyCard.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { consentPending: false } }));
  });
});

describe('MerchantTransactionService.getTransactions (history filters)', () => {
  function history() {
    const loyaltyCardRepo = { findMany: jest.fn().mockResolvedValue([{ clientId: 'c1' }, { clientId: 'c2' }]) };
    const transactionRepo = {
      findMany: jest.fn().mockResolvedValue([
        { id: 't1', type: 'EARN_STAMPS', client: { id: 'c1', prenom: 'Sara', nom: 'Alaoui', shareInfoMerchants: false } },
      ]),
      count: jest.fn().mockResolvedValue(1),
      groupBy: jest.fn().mockResolvedValue([{ type: 'EARN_STAMPS', _count: 1, _sum: { stamps: 2, amount: 50 } }]),
    };
    const service = new MerchantTransactionService(
      {} as any, {} as any, {} as any, loyaltyCardRepo as any, transactionRepo as any,
      {} as any, {} as any, {} as any, {} as any, {} as any,
    );
    return { service, loyaltyCardRepo, transactionRepo };
  }

  it('without filters returns the whole history and the page-1 totals', async () => {
    const { service, transactionRepo, loyaltyCardRepo } = history();
    const res = await service.getTransactions(MERCHANT_ID, 1, 20);
    expect(transactionRepo.findMany.mock.calls[0][0].where).toEqual({ merchantId: MERCHANT_ID, type: { not: 'LOYALTY_PROGRAM_CHANGE' } });
    expect(loyaltyCardRepo.findMany).not.toHaveBeenCalled();
    expect(res.summary).toEqual({ stampsGiven: 2, rewardsRedeemed: 0, revenue: 50 });
    expect(res.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    // Names stay masked for clients who don't share their info.
    expect(res.transactions[0].client.prenom).toBe('S.');
  });

  it('resolves the search from this merchant cards only, then filters on those clients', async () => {
    const { service, transactionRepo, loyaltyCardRepo } = history();
    await service.getTransactions(MERCHANT_ID, 1, 20, { search: ' sara ', kind: 'stamps', staff: 'owner', from: '2026-11-01T00:00:00.000Z' });
    const cardsArgs = loyaltyCardRepo.findMany.mock.calls[0][0];
    expect(cardsArgs.where.merchantId).toBe(MERCHANT_ID);
    expect(cardsArgs.where.client.OR).toEqual(expect.arrayContaining([{ prenom: { contains: 'sara', mode: 'insensitive' } }]));
    expect(cardsArgs.take).toBeGreaterThan(0);
    const where = transactionRepo.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      merchantId: MERCHANT_ID,
      clientId: { in: ['c1', 'c2'] },
      type: { in: ['EARN_STAMPS', 'WELCOME_BONUS'] },
      teamMemberId: null,
      createdAt: { gte: new Date('2026-11-01T00:00:00.000Z') },
    });
    // Totals read the same filter, active rows only.
    expect(transactionRepo.groupBy.mock.calls[0][0].where).toEqual({ ...where, status: 'ACTIVE' });
  });

  it('a search with no matching client answers empty without querying the history', async () => {
    const { service, transactionRepo, loyaltyCardRepo } = history();
    loyaltyCardRepo.findMany.mockResolvedValue([]);
    const res = await service.getTransactions(MERCHANT_ID, 1, 20, { search: 'zzz' });
    expect(transactionRepo.findMany).not.toHaveBeenCalled();
    expect(res).toEqual({
      transactions: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      summary: { stampsGiven: 0, rewardsRedeemed: 0, revenue: 0 },
    });
  });

  it('skips the totals after page 1 and for cancelled rows', async () => {
    const { service, transactionRepo } = history();
    const page2 = await service.getTransactions(MERCHANT_ID, 2, 20);
    const cancelled = await service.getTransactions(MERCHANT_ID, 1, 20, { kind: 'cancelled' });
    expect(transactionRepo.groupBy).not.toHaveBeenCalled();
    expect(page2.summary).toBeUndefined();
    expect(cancelled.summary).toBeUndefined();
    expect(transactionRepo.findMany.mock.calls[1][0].where.status).toBe('CANCELLED');
  });
});
