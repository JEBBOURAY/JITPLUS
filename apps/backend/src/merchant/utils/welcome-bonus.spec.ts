import {
  computeWelcomeBonusMax,
  consumeWelcomeBonusInTx,
  effectivePlanOf,
  pendingWelcomeBonus,
  grantWelcomeBonusInTx,
  reserveWelcomeBonusInTx,
  resolveWelcomeOffer,
  type WelcomeBonusCardState,
} from './welcome-bonus';

const NOW = new Date('2026-11-18T12:00:00Z');
const LATER = new Date('2026-12-01T12:00:00Z');
const rules = {
  stampsForReward: 10,
  rewards: [] as { cout: number }[],
  welcomeBonusEnabled: true,
  welcomeBonusStamps: 2,
  welcomeBonusTrigger: 'CARD_OR_SCAN' as const,
  welcomeBonusEndsAt: null,
};
const reservedCard = {
  id: 'card-1',
  stamps: 0,
  welcomeBonusReservedStamps: 2,
  welcomeBonusReservedAt: NOW,
  welcomeBonusCreditedAt: null,
};

function fakeTx(opts: { priorEarn?: boolean; count?: number; priorClaim?: boolean } = {}) {
  return {
    // Identity memory of deleted accounts (welcome-bonus-identity).
    client: {
      findFirst: jest.fn().mockResolvedValue({
        email: 'a@example.test', emailVerified: true, telephone: null, telephoneVerified: false, googleId: null, appleId: null,
      }),
    },
    welcomeBonusClaim: { findFirst: jest.fn().mockResolvedValue(opts.priorClaim ? { id: 'claim' } : null) },
    transaction: {
      findFirst: jest.fn().mockResolvedValue(opts.priorEarn ? { id: 'tx' } : null),
      create: jest.fn().mockResolvedValue({ id: 'tx' }),
    },
    loyaltyCard: { updateMany: jest.fn().mockResolvedValue({ count: opts.count ?? 1 }) },
  } as any;
}

describe('computeWelcomeBonusMax', () => {
  it.each([[1, 0], [2, 0], [3, 1], [5, 1], [8, 2], [10, 2], [12, 3], [20, 5], [100, 5]])(
    'threshold %i allows %i stamp(s)',
    (threshold, max) => expect(computeWelcomeBonusMax(threshold)).toBe(max),
  );
});

describe('effectivePlanOf', () => {
  it('treats an expired PREMIUM as FREE', () => {
    expect(effectivePlanOf({ plan: 'PREMIUM', planExpiresAt: NOW }, LATER)).toBe('FREE');
    expect(effectivePlanOf({ plan: 'PREMIUM', planExpiresAt: LATER }, NOW)).toBe('PREMIUM');
    expect(effectivePlanOf({ plan: 'PREMIUM', planExpiresAt: null }, NOW)).toBe('PREMIUM');
    expect(effectivePlanOf({ plan: 'FREE', planExpiresAt: LATER }, NOW)).toBe('FREE');
  });
});

describe('resolveWelcomeOffer', () => {
  it('returns the active offer', () => {
    expect(resolveWelcomeOffer(rules, 'PREMIUM', NOW)).toEqual({ stamps: 2, trigger: 'CARD_OR_SCAN' });
  });
  it('is off when disabled, on the free plan, or after its end date', () => {
    expect(resolveWelcomeOffer({ ...rules, welcomeBonusEnabled: false }, 'PREMIUM', NOW)).toBeNull();
    expect(resolveWelcomeOffer(rules, 'FREE', NOW)).toBeNull();
    expect(resolveWelcomeOffer({ ...rules, welcomeBonusEndsAt: NOW }, 'PREMIUM', NOW)).toBeNull();
  });
  it('follows the cheapest reward, not stampsForReward', () => {
    expect(resolveWelcomeOffer({ ...rules, welcomeBonusStamps: 5, rewards: [{ cout: 4 }, { cout: 20 }] }, 'PREMIUM', NOW)?.stamps).toBe(1);
    expect(resolveWelcomeOffer({ ...rules, rewards: [{ cout: 2 }] }, 'PREMIUM', NOW)).toBeNull();
  });
});

describe('pendingWelcomeBonus', () => {
  it('is capped to the current rules', () => {
    expect(pendingWelcomeBonus(reservedCard, { ...rules, stampsForReward: 4 })?.stamps).toBe(1);
  });
  it('is gone once credited', () => {
    expect(pendingWelcomeBonus({ ...reservedCard, welcomeBonusCreditedAt: NOW }, rules)).toBeNull();
  });
  it('survives the merchant switching the offer off', () => {
    expect(pendingWelcomeBonus(reservedCard, { ...rules, welcomeBonusEnabled: false })?.stamps).toBe(2);
  });
});

describe('grantWelcomeBonusInTx', () => {
  const offer = { stamps: 2, trigger: 'CARD_OR_SCAN' as const };
  const params = {
    card: { id: 'card-1', stamps: 0 } as WelcomeBonusCardState,
    clientId: 'c',
    merchantId: 'm',
    offer,
    accumulationLimit: null,
    now: NOW,
  };

  it('credits a new card and writes its own ledger row', async () => {
    const tx = fakeTx();
    const res = await grantWelcomeBonusInTx(tx, params);
    expect(res.granted).toBe(2);
    expect(res.card.stamps).toBe(2);
    expect(tx.loyaltyCard.updateMany.mock.calls[0][0].where).toEqual({
      id: 'card-1', stamps: 0, welcomeBonusReservedAt: null, welcomeBonusCreditedAt: null,
    });
    expect(tx.transaction.create.mock.calls[0][0].data).toMatchObject({ type: 'WELCOME_BONUS', stamps: 2, amount: 0 });
  });
  it('gives nothing to a client with history, or to a card already handled', async () => {
    const known = fakeTx({ priorEarn: true });
    expect((await grantWelcomeBonusInTx(known, params)).granted).toBe(0);
    expect(known.loyaltyCard.updateMany).not.toHaveBeenCalled();
    for (const card of [reservedCard, { id: 'c', stamps: 0, welcomeBonusCreditedAt: NOW }, { id: 'c', stamps: 1 }]) {
      expect((await grantWelcomeBonusInTx(fakeTx(), { ...params, card })).granted).toBe(0);
    }
  });
  it('gives nothing when a deleted account with the same identity had history here', async () => {
    const returning = fakeTx({ priorClaim: true });
    expect((await grantWelcomeBonusInTx(returning, params)).granted).toBe(0);
    expect(returning.loyaltyCard.updateMany).not.toHaveBeenCalled();
    const reserved = fakeTx({ priorClaim: true });
    await reserveWelcomeBonusInTx(reserved, { ...params, card: { id: 'card-1', stamps: 0 } as never });
    expect(reserved.loyaltyCard.updateMany).not.toHaveBeenCalled();
  });
  it('writes no ledger row when it loses a race', async () => {
    const tx = fakeTx({ count: 0 });
    expect((await grantWelcomeBonusInTx(tx, params)).granted).toBe(0);
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
  it('respects the accumulation limit', async () => {
    expect((await grantWelcomeBonusInTx(fakeTx(), { ...params, accumulationLimit: 1 })).granted).toBe(1);
    expect((await grantWelcomeBonusInTx(fakeTx(), { ...params, accumulationLimit: 0 })).granted).toBe(0);
  });
});

describe('reserveWelcomeBonusInTx', () => {
  const offer = { stamps: 2, trigger: 'CARD_OR_SCAN' as const };
  const params = { card: { id: 'card-1', stamps: 0 } as WelcomeBonusCardState, clientId: 'c', merchantId: 'm', offer, now: NOW };

  it('reserves on a new card, with a conditional update', async () => {
    const tx = fakeTx();
    const card = await reserveWelcomeBonusInTx(tx, params);
    expect(card.welcomeBonusReservedStamps).toBe(2);
    expect(tx.loyaltyCard.updateMany.mock.calls[0][0].where).toEqual({
      id: 'card-1', welcomeBonusReservedAt: null, welcomeBonusCreditedAt: null,
    });
  });
  it('never reserves for an existing client', async () => {
    const tx = fakeTx({ priorEarn: true });
    await reserveWelcomeBonusInTx(tx, params);
    expect(tx.loyaltyCard.updateMany).not.toHaveBeenCalled();
    const tx2 = fakeTx();
    await reserveWelcomeBonusInTx(tx2, { ...params, card: { id: 'card-1', stamps: 1 } });
    expect(tx2.loyaltyCard.updateMany).not.toHaveBeenCalled();
  });
  it('never reserves twice', async () => {
    const tx = fakeTx();
    await reserveWelcomeBonusInTx(tx, { ...params, card: reservedCard });
    await reserveWelcomeBonusInTx(tx, { ...params, card: { id: 'c', stamps: 0, welcomeBonusCreditedAt: NOW } });
    expect(tx.loyaltyCard.updateMany).not.toHaveBeenCalled();
  });
  it('loses a race without claiming the reservation', async () => {
    const card = await reserveWelcomeBonusInTx(fakeTx({ count: 0 }), params);
    expect(card.welcomeBonusReservedAt).toBeUndefined();
  });
});

describe('consumeWelcomeBonusInTx', () => {
  const params = { card: reservedCard, merchant: rules, balance: 1, accumulationLimit: null, now: NOW };

  it('credits the reservation once', async () => {
    const tx = fakeTx();
    await expect(consumeWelcomeBonusInTx(tx, params)).resolves.toBe(2);
    expect(tx.loyaltyCard.updateMany.mock.calls[0][0].where).toEqual({ id: 'card-1', welcomeBonusCreditedAt: null });
  });
  it('gives nothing to the loser of a concurrent scan', async () => {
    await expect(consumeWelcomeBonusInTx(fakeTx({ count: 0 }), params)).resolves.toBe(0);
  });
  it('never exceeds the accumulation limit', async () => {
    await expect(consumeWelcomeBonusInTx(fakeTx(), { ...params, balance: 9, accumulationLimit: 10 })).resolves.toBe(1);
    await expect(consumeWelcomeBonusInTx(fakeTx(), { ...params, balance: 10, accumulationLimit: 10 })).resolves.toBe(0);
  });
});
