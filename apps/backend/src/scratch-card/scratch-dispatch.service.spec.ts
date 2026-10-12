import { ScratchDispatchService } from './scratch-dispatch.service';

const EXPIRES = new Date('2030-01-10T23:59:59Z');

function setup(opts: { premium?: boolean; sentAt?: Date | null; statusAfterCreate?: string } = {}) {
  const campaign = {
    id: 'camp1',
    merchantId: 'm1',
    name: 'Promo',
    status: 'SENDING',
    message: null,
    audienceType: 'ALL_CLIENTS',
    audienceValue: null,
    sentAt: opts.sentAt ?? null,
    merchant: { id: 'm1', nom: 'Café', logoUrl: null, isActive: true, deletedAt: null, pushToken: 'tok', language: 'fr' },
  };
  const prisma = {
    scratchCampaign: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(campaign)
        .mockResolvedValue({ status: opts.statusAfterCreate ?? 'SENDING', cardExpiresAt: EXPIRES }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ cardExpiresAt: EXPIRES }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    loyaltyCard: {
      findMany: jest.fn().mockResolvedValueOnce([{ id: 'lc1', clientId: 'c1' }]).mockResolvedValue([]),
    },
    scratchCard: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const planService = { isPremium: jest.fn().mockResolvedValue(opts.premium ?? true) };
  const push = { send: jest.fn().mockResolvedValue(0), sendToMerchant: jest.fn().mockResolvedValue(undefined) };
  const events = { emitScratchCardsChanged: jest.fn() };
  const service = new ScratchDispatchService(prisma as any, planService as any, push as any, events as any);
  return { service, prisma, push };
}

describe('ScratchDispatchService.dispatch', () => {
  it('reverts a campaign not started yet to DRAFT and tells the merchant when Premium expired', async () => {
    const { service, prisma, push } = setup({ premium: false });
    await service.dispatch('camp1');
    expect(prisma.scratchCampaign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DRAFT' }) }),
    );
    expect(push.sendToMerchant).toHaveBeenCalledTimes(1);
    expect(prisma.scratchCard.createMany).not.toHaveBeenCalled();
  });

  it('closes a partially sent campaign as SENT instead of DRAFT when Premium expired', async () => {
    const { service, prisma, push } = setup({ premium: false, sentAt: new Date('2030-01-01T10:00:00Z') });
    await service.dispatch('camp1');
    const statuses = prisma.scratchCampaign.updateMany.mock.calls.map((c: any[]) => c[0].data.status);
    expect(statuses).toContain('SENT');
    expect(statuses).not.toContain('DRAFT');
    expect(prisma.scratchCard.createMany).not.toHaveBeenCalled();
    expect(push.sendToMerchant).not.toHaveBeenCalled();
  });

  it('cancels the cards it just created when the campaign was cancelled meanwhile, without pushing', async () => {
    const { service, prisma, push } = setup({ statusAfterCreate: 'CANCELLED' });
    await service.dispatch('camp1');
    expect(prisma.scratchCard.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.scratchCard.updateMany).toHaveBeenCalledWith({
      where: { campaignId: 'camp1', status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    expect(push.send).not.toHaveBeenCalled();
  });

  it('stops before creating cards when the lock can no longer be refreshed', async () => {
    const { service, prisma } = setup();
    prisma.scratchCampaign.updateMany.mockResolvedValueOnce({ count: 0 });
    await service.dispatch('camp1');
    expect(prisma.scratchCard.createMany).not.toHaveBeenCalled();
  });
});
