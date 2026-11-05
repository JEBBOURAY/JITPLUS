import { BadRequestException, ConflictException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { MerchantTransactionService, STAMP_CODE_PERFORMER } from './merchant-transaction.service';

jest.mock('../utils/lucky-wheel-tickets', () => ({
  awardLuckyWheelTicketsInTx: jest.fn().mockResolvedValue(0),
}));

const CLIENT_ID = 'client-1';
const MERCHANT_ID = 'merchant-1';
const CODE_ID = 'code-1';

type Code = { id: string; merchantId: string; stamps: number; amount: number; status: string; redeemedByClientId: string | null };

function setup(opts: {
  code?: Code | null;
  card?: { id: string; stamps: number; deactivatedAt: Date | null } | null;
  accumulationLimit?: number | null;
  claimCount?: number;
} = {}) {
  const code: Code | null = opts.code === undefined
    ? { id: CODE_ID, merchantId: MERCHANT_ID, stamps: 3, amount: 0, status: 'ACTIVE', redeemedByClientId: null }
    : opts.code;
  const card = opts.card === undefined ? null : opts.card;
  const prisma = {
    stampCode: {
      findUnique: jest.fn().mockResolvedValue(code),
      updateMany: jest.fn().mockResolvedValue({ count: opts.claimCount ?? 1 }),
    },
    client: { findUnique: jest.fn().mockResolvedValue({ id: CLIENT_ID, deletedAt: null }) },
    merchant: { findUnique: jest.fn().mockResolvedValue({ id: MERCHANT_ID, isActive: true, deletedAt: null }) },
    loyaltyCard: {
      findUnique: jest.fn().mockResolvedValue(card),
      create: jest.fn().mockResolvedValue({ id: 'lc-new', stamps: 0, deactivatedAt: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1', stamps: 3 }) },
  };
  const clientRepo = { findUnique: jest.fn().mockResolvedValue({ id: CLIENT_ID, language: 'fr', deletedAt: null }) };
  const merchantRepo = {
    findUnique: jest.fn().mockResolvedValue({
      id: MERCHANT_ID, nom: 'Boutique', isActive: true, deletedAt: null,
      accumulationLimit: opts.accumulationLimit ?? null,
      amountPerStamp: 10, stampsForReward: 10, stampEarningMode: 'PER_VISIT', rewards: [],
    }),
  };
  const loyaltyCardRepo = { findUnique: jest.fn().mockResolvedValue({ stamps: 7 }) };
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
    loyaltyCardRepo as any,
    { findFirst: jest.fn().mockResolvedValue(null) } as any,
    txRunner as any,
    notifications as any,
    eventsGateway as any,
    planService as any,
    prisma.stampCode as any,
  );
  return { service, prisma, planService, eventsGateway };
}

describe('MerchantTransactionService.redeemStampCode', () => {
  it('claims the code and credits its stamps as an EARN_STAMPS transaction, enrolling the client', async () => {
    const { service, prisma, planService, eventsGateway } = setup();
    const res = await service.redeemStampCode(CLIENT_ID, CODE_ID);

    expect(prisma.stampCode.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: CODE_ID, status: 'ACTIVE' },
      data: expect.objectContaining({ status: 'REDEEMED', redeemedByClientId: CLIENT_ID }),
    }));
    // Counted inside the transaction, with the plan resolved before it (no 2nd pool connection).
    expect(planService.assertCanAddClient).toHaveBeenCalledWith(MERCHANT_ID, { tx: prisma, plan: 'FREE' });
    expect(prisma.loyaltyCard.create).toHaveBeenCalled();
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'EARN_STAMPS', stamps: 3, stampCodeId: CODE_ID, performedByName: STAMP_CODE_PERFORMER,
      }),
    });
    expect(eventsGateway.emitStampsUpdated).toHaveBeenCalled();
    expect(res).toMatchObject({ success: true, alreadyRedeemed: false, stamps: 3, newBalance: 3 });
  });

  it('caps the credit at the accumulation limit', async () => {
    const { service } = setup({ card: { id: 'lc1', stamps: 8, deactivatedAt: null }, accumulationLimit: 10 });
    await expect(service.redeemStampCode(CLIENT_ID, CODE_ID)).resolves.toMatchObject({ stamps: 2, newBalance: 10 });
  });

  it('refuses a client already at the limit (the code stays usable: the transaction rolls back)', async () => {
    const { service, prisma } = setup({ card: { id: 'lc1', stamps: 10, deactivatedAt: null }, accumulationLimit: 10 });
    await expect(service.redeemStampCode(CLIENT_ID, CODE_ID)).rejects.toThrow(BadRequestException);
    await expect(service.redeemStampCode(CLIENT_ID, CODE_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ACCUMULATION_LIMIT' }),
    });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('is an idempotent success when the same client scans an already used code', async () => {
    const { service, prisma } = setup({
      code: { id: CODE_ID, merchantId: MERCHANT_ID, stamps: 3, amount: 0, status: 'REDEEMED', redeemedByClientId: CLIENT_ID },
    });
    await expect(service.redeemStampCode(CLIENT_ID, CODE_ID)).resolves.toMatchObject({ alreadyRedeemed: true, newBalance: 7 });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('refuses a code used by another client', async () => {
    const { service } = setup({
      code: { id: CODE_ID, merchantId: MERCHANT_ID, stamps: 3, amount: 0, status: 'REDEEMED', redeemedByClientId: 'other' },
    });
    await expect(service.redeemStampCode(CLIENT_ID, CODE_ID)).rejects.toThrow(ConflictException);
  });

  it('refuses when a concurrent scan claimed the code first', async () => {
    const { service, prisma } = setup({ claimCount: 0 });
    prisma.stampCode.findUnique
      .mockResolvedValueOnce({ id: CODE_ID, merchantId: MERCHANT_ID, stamps: 3, amount: 0, status: 'ACTIVE', redeemedByClientId: null })
      .mockResolvedValueOnce({ stamps: 3, redeemedByClientId: 'other' });
    await expect(service.redeemStampCode(CLIENT_ID, CODE_ID)).rejects.toThrow(ConflictException);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('refuses a revoked code and an unknown code', async () => {
    const revoked = setup({
      code: { id: CODE_ID, merchantId: MERCHANT_ID, stamps: 3, amount: 0, status: 'REVOKED', redeemedByClientId: null },
    });
    await expect(revoked.service.redeemStampCode(CLIENT_ID, CODE_ID)).rejects.toThrow(GoneException);
    const unknown = setup({ code: null });
    await expect(unknown.service.redeemStampCode(CLIENT_ID, CODE_ID)).rejects.toThrow(NotFoundException);
  });

  it('retries once when two first redemptions race to create the same loyalty card', async () => {
    const { service, prisma } = setup();
    prisma.loyaltyCard.create.mockRejectedValueOnce(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    await expect(service.redeemStampCode(CLIENT_ID, CODE_ID)).resolves.toMatchObject({ success: true, stamps: 3 });
    expect(prisma.stampCode.updateMany).toHaveBeenCalledTimes(2);
  });

  it('hides the merchant upsell when the FREE client limit is reached', async () => {
    const { service, planService } = setup();
    planService.assertCanAddClient.mockRejectedValue(new ForbiddenException('Passez au plan Pro'));
    await expect(service.redeemStampCode(CLIENT_ID, CODE_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MERCHANT_CLIENT_LIMIT' }),
    });
  });
});
