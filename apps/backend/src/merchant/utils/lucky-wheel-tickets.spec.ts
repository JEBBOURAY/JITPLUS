import { awardLuckyWheelTicketsInTx } from './lucky-wheel-tickets';

function makeTx(campaigns: any[], qualifyingCount = 1) {
  return {
    luckyWheelCampaign: { findMany: jest.fn().mockResolvedValue(campaigns) },
    transaction: { count: jest.fn().mockResolvedValue(qualifyingCount) },
    luckyWheelTicket: { createMany: jest.fn().mockResolvedValue({ count: campaigns.length }) },
  };
}

const base = { clientId: 'c1', merchantId: 'm1', transactionId: 't1' };
const startsAt = new Date('2026-01-01T00:00:00Z');
const free = { id: 'free', ticketCostStamps: 0, ticketEveryNVisits: null, minSpendAmount: 0, startsAt };
const paid = { id: 'paid', ticketCostStamps: 5, ticketEveryNVisits: null, minSpendAmount: 0, startsAt };

describe('awardLuckyWheelTicketsInTx', () => {
  it('ignores transaction types other than EARN_STAMPS / REDEEM_REWARD', async () => {
    const tx = makeTx([free]);
    await expect(
      awardLuckyWheelTicketsInTx(tx, { ...base, type: 'COUPON_REDEEM', amount: 100, stamps: 0 }),
    ).resolves.toBe(0);
    expect(tx.luckyWheelCampaign.findMany).not.toHaveBeenCalled();
  });

  it('grants a free-campaign ticket on EARN_STAMPS only', async () => {
    const tx = makeTx([free, paid]);
    await expect(
      awardLuckyWheelTicketsInTx(tx, { ...base, type: 'EARN_STAMPS', amount: 50, stamps: 1 }),
    ).resolves.toBe(1);
    expect(tx.luckyWheelTicket.createMany).toHaveBeenCalledWith({
      data: [{ campaignId: 'free', clientId: 'c1', transactionId: 't1' }],
    });
  });

  it('grants a cost-based ticket on REDEEM_REWARD when enough stamps are spent', async () => {
    const tx = makeTx([free, paid]);
    await expect(
      awardLuckyWheelTicketsInTx(tx, { ...base, type: 'REDEEM_REWARD', amount: 0, stamps: 5 }),
    ).resolves.toBe(1);
    const tx2 = makeTx([paid]);
    await expect(
      awardLuckyWheelTicketsInTx(tx2, { ...base, type: 'REDEEM_REWARD', amount: 0, stamps: 4 }),
    ).resolves.toBe(0);
    expect(tx2.luckyWheelTicket.createMany).not.toHaveBeenCalled();
  });

  it('enforces the minimum spend', async () => {
    const tx = makeTx([{ ...free, minSpendAmount: 100 }]);
    await expect(
      awardLuckyWheelTicketsInTx(tx, { ...base, type: 'EARN_STAMPS', amount: 99, stamps: 1 }),
    ).resolves.toBe(0);
  });

  it('applies the every-N-visits rule on qualifying transactions', async () => {
    const campaign = { ...free, ticketEveryNVisits: 3 };
    const miss = makeTx([campaign], 2);
    await expect(
      awardLuckyWheelTicketsInTx(miss, { ...base, type: 'EARN_STAMPS', amount: 0, stamps: 1 }),
    ).resolves.toBe(0);
    const hit = makeTx([campaign], 6);
    await expect(
      awardLuckyWheelTicketsInTx(hit, { ...base, type: 'EARN_STAMPS', amount: 0, stamps: 1 }),
    ).resolves.toBe(1);
    expect(hit.transaction.count).toHaveBeenCalledWith({
      where: { clientId: 'c1', merchantId: 'm1', type: 'EARN_STAMPS', createdAt: { gte: startsAt } },
    });
  });
});
