import { ClientClaimService } from './client-claim.service';
import { createHash } from 'crypto';

/**
 * Security audit 2026-11-05 — a claim link only transfers the data of the
 * merchant who issued it, and never hands the (unproven) phone to the bearer.
 */

const TOKEN = 'A'.repeat(43);
const ANON = 'anon-1';
const REAL = 'real-1';
const MERCHANT_A = 'merchant-a'; // issued the link
const MERCHANT_B = 'merchant-b'; // other merchant who Quick-Added the same phone

function setup(remaining: { cards: number; tx: number; claims: number }) {
  const tx = {
    clientClaim: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'claim-1', tokenHash: createHash('sha256').update(TOKEN).digest('hex'),
        clientId: ANON, merchantId: MERCHANT_A, consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000), merchant: { id: MERCHANT_A, nom: 'A' },
      }),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(remaining.claims),
    },
    client: {
      findUnique: jest.fn().mockResolvedValue({ id: ANON, isAnonymous: true, deletedAt: null, telephone: '+212600000000', countryCode: 'MA' }),
      update: jest.fn().mockResolvedValue({}),
    },
    loyaltyCard: {
      findMany: jest.fn().mockResolvedValue([{ id: 'card-a', merchantId: MERCHANT_A, stamps: 3, lastVisitAt: new Date(), deactivatedAt: null }]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(remaining.cards),
    },
    transaction: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(remaining.tx),
    },
    luckyWheelTicket: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    scratchCard: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    coupon: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const txRunner = { run: jest.fn((fn: (t: unknown) => unknown) => fn(tx)) };
  const service = new ClientClaimService({} as any, {} as any, {} as any, txRunner as any, {} as any);
  return { service, tx };
}

describe('ClientClaimService.consumeClaim', () => {
  it('only moves the issuing merchant\'s cards, transactions, tickets and coupons', async () => {
    const { service, tx } = setup({ cards: 1, tx: 1, claims: 1 });

    await service.consumeClaim(REAL, TOKEN);

    expect(tx.loyaltyCard.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: ANON, merchantId: MERCHANT_A } }));
    expect(tx.loyaltyCard.deleteMany).toHaveBeenCalledWith({ where: { clientId: ANON, merchantId: MERCHANT_A } });
    expect(tx.transaction.updateMany).toHaveBeenCalledWith({ where: { clientId: ANON, merchantId: MERCHANT_A }, data: { clientId: REAL } });
    expect(tx.luckyWheelTicket.updateMany).toHaveBeenCalledWith({ where: { clientId: ANON, campaign: { merchantId: MERCHANT_A } }, data: { clientId: REAL } });
    expect(tx.scratchCard.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: ANON, merchantId: MERCHANT_A } }));
    expect(tx.coupon.updateMany).toHaveBeenCalledWith({ where: { clientId: ANON, merchantId: MERCHANT_A }, data: { clientId: REAL } });
    // Merchant B's data is still there → the anonymous shell (and its phone) survives
    expect(tx.client.update).not.toHaveBeenCalled();
    expect(MERCHANT_B).toBeDefined();
  });

  it('soft-deletes the empty shell but never gives its phone to the link bearer', async () => {
    const { service, tx } = setup({ cards: 0, tx: 0, claims: 0 });

    await service.consumeClaim(REAL, TOKEN);

    expect(tx.client.update).toHaveBeenCalledTimes(1);
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: ANON },
      data: expect.objectContaining({ deletedAt: expect.any(Date), telephone: null }),
    });
    expect(tx.client.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: REAL } }));
  });
});
