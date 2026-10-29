import { BadRequestException, NotFoundException } from '@nestjs/common';
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
  };
  const clientRepo = { findUnique: jest.fn().mockResolvedValue({ id: CLIENT_ID, language: 'fr', deletedAt: null }) };
  const merchantRepo = {
    findUnique: jest.fn().mockResolvedValue({
      nom: 'Cafe', isActive: true, deletedAt: null, accumulationLimit: null,
      amountPerStamp: null, stampsForReward: 10, stampEarningMode: 'PER_VISIT', rewards: [],
    }),
  };
  const planService = { assertCanAddClient: jest.fn().mockResolvedValue(undefined) };
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
  );
  return { service, prisma, planService, clientRepo, merchantRepo };
}

describe('MerchantTransactionService enrollment rules', () => {
  const earn = (service: MerchantTransactionService, allowEnroll?: boolean) =>
    service.createTransaction(CLIENT_ID, MERCHANT_ID, 'EARN_STAMPS', 0, 1, undefined, undefined, undefined, undefined, { allowEnroll });

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
    expect(planService.assertCanAddClient).toHaveBeenCalledWith(MERCHANT_ID);
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
