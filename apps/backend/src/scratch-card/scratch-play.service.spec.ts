import { GoneException, NotFoundException } from '@nestjs/common';
import { ScratchPlayService } from './scratch-play.service';
import * as weightedDraw from '../common/utils/weighted-draw';

const FUTURE = new Date(Date.now() + 86_400_000);

function setup(opts: { card?: any; rewards?: any[]; decrementCounts?: number[] } = {}) {
  const card =
    opts.card === undefined
      ? {
          id: 'card1',
          clientId: 'client1',
          merchantId: 'm1',
          status: 'PENDING',
          expiresAt: FUTURE,
          campaign: { id: 'camp1', status: 'SENT', couponExpiresAt: FUTURE },
          coupon: null,
        }
      : opts.card;
  const decrements = [...(opts.decrementCounts ?? [])];
  const tx = {
    scratchCard: {
      findFirst: jest.fn().mockResolvedValue(card),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    scratchReward: {
      findMany: jest.fn().mockResolvedValue(opts.rewards ?? []),
      updateMany: jest.fn().mockImplementation(() => Promise.resolve({ count: decrements.length ? decrements.shift() : 1 })),
    },
  };
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const couponService = {
    createFromReward: jest.fn().mockResolvedValue({ id: 'coupon1' }),
    getClientCoupon: jest.fn().mockResolvedValue({ id: 'coupon1' }),
    toDto: jest.fn(),
  };
  const service = new ScratchPlayService(prisma as any, couponService as any);
  jest.spyOn(service, 'getCard').mockResolvedValue({ id: 'card1' } as any);
  return { service, tx, couponService };
}

const reward = (id: string, weight: number, remaining: number | null) => ({
  id,
  weight,
  remaining,
  type: 'FREE_PRODUCT',
  label: id,
  value: null,
  maxDiscount: null,
  minPurchaseAmount: null,
  minDelayHours: 0,
  allowedWeekdays: null,
  allowedFromMin: null,
  allowedToMin: null,
});

describe('ScratchPlayService.scratch', () => {
  it('draws a reward, books the stock and creates the coupon', async () => {
    const { service, tx, couponService } = setup({ rewards: [reward('limited', 1000, 5)] });
    await service.scratch('client1', 'card1');
    expect(tx.scratchReward.updateMany).toHaveBeenCalledWith({
      where: { id: 'limited', remaining: { gt: 0 } },
      data: { remaining: { decrement: 1 } },
    });
    expect(tx.scratchCard.update).toHaveBeenCalledWith({ where: { id: 'card1' }, data: { rewardId: 'limited' } });
    expect(couponService.createFromReward).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ reward: expect.objectContaining({ id: 'limited' }) }),
    );
  });

  it('falls back to another reward when the stock ran out concurrently', async () => {
    const { service, tx } = setup({
      rewards: [reward('limited', 1000, 1), reward('unlimited', 1, null)],
      decrementCounts: [0],
    });
    // Force the first pick on the limited reward
    const firstItem = ((items: any[]) => items[0]) as (...args: unknown[]) => any;
    jest.spyOn(weightedDraw, 'weightedRandomPick')
      .mockImplementationOnce(firstItem as any)
      .mockImplementationOnce(firstItem as any);
    await service.scratch('client1', 'card1');
    expect(tx.scratchCard.update).toHaveBeenCalledWith({ where: { id: 'card1' }, data: { rewardId: 'unlimited' } });
  });

  it('is idempotent: an already scratched card returns its coupon without drawing', async () => {
    const { service, tx, couponService } = setup({
      card: {
        id: 'card1',
        clientId: 'client1',
        merchantId: 'm1',
        status: 'SCRATCHED',
        expiresAt: FUTURE,
        campaign: { id: 'camp1', status: 'SENT', couponExpiresAt: FUTURE },
        coupon: { id: 'coupon1' },
      },
    });
    await service.scratch('client1', 'card1');
    expect(tx.scratchReward.findMany).not.toHaveBeenCalled();
    expect(couponService.getClientCoupon).toHaveBeenCalledWith('client1', 'coupon1');
  });

  it('refuses cancelled campaigns, expired cards and foreign cards', async () => {
    const cancelled = setup({
      card: {
        id: 'card1', clientId: 'client1', merchantId: 'm1', status: 'PENDING', expiresAt: FUTURE,
        campaign: { id: 'camp1', status: 'CANCELLED', couponExpiresAt: FUTURE }, coupon: null,
      },
    });
    await expect(cancelled.service.scratch('client1', 'card1')).rejects.toBeInstanceOf(GoneException);

    const expired = setup({
      card: {
        id: 'card1', clientId: 'client1', merchantId: 'm1', status: 'PENDING', expiresAt: new Date(Date.now() - 1000),
        campaign: { id: 'camp1', status: 'SENT', couponExpiresAt: FUTURE }, coupon: null,
      },
    });
    await expect(expired.service.scratch('client1', 'card1')).rejects.toBeInstanceOf(GoneException);

    const foreign = setup({ card: null });
    await expect(foreign.service.scratch('client1', 'card1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
