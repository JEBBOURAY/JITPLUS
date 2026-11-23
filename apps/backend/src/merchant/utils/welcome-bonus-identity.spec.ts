import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientClosureService } from '../../client-auth/client-closure.service';
import { grantWelcomeBonusInTx } from './welcome-bonus';
import {
  hasWelcomeBonusClaim,
  rememberWelcomeHistoryInTx,
  welcomeIdentityHashes,
  type WelcomeIdentitySource,
} from './welcome-bonus-identity';

const base: WelcomeIdentitySource = {
  email: null, emailVerified: false, telephone: null, telephoneVerified: false, googleId: null, appleId: null,
};

describe('welcomeIdentityHashes', () => {
  it('hashes only proven identities', () => {
    expect(welcomeIdentityHashes(base)).toEqual([]);
    expect(welcomeIdentityHashes({ ...base, email: 'a@example.test', telephone: '+212600000001' })).toEqual([]);
    expect(welcomeIdentityHashes({ ...base, email: 'a@example.test', emailVerified: true })).toHaveLength(1);
    expect(
      welcomeIdentityHashes({
        email: 'a@example.test', emailVerified: true, telephone: '+212600000001', telephoneVerified: true, googleId: 'g', appleId: 'a',
      }),
    ).toHaveLength(4);
  });

  it('is stable, ignores email case, and never contains the identity', () => {
    const [h1] = welcomeIdentityHashes({ ...base, email: 'Amina@Example.test', emailVerified: true });
    const [h2] = welcomeIdentityHashes({ ...base, email: ' amina@example.test', emailVerified: true });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toContain('amina');
  });

  it('separates identity kinds and depends on the server secret', () => {
    const asEmail = welcomeIdentityHashes({ ...base, email: 'x', emailVerified: true })[0];
    const asGoogle = welcomeIdentityHashes({ ...base, googleId: 'x' })[0];
    expect(asEmail).not.toBe(asGoogle);

    const before = process.env.WELCOME_BONUS_HMAC_SECRET;
    process.env.WELCOME_BONUS_HMAC_SECRET = 'another-secret-another-secret-another';
    try {
      expect(welcomeIdentityHashes({ ...base, googleId: 'x' })[0]).not.toBe(asGoogle);
    } finally {
      if (before === undefined) delete process.env.WELCOME_BONUS_HMAC_SECRET;
      else process.env.WELCOME_BONUS_HMAC_SECRET = before;
    }
  });
});

describe('rememberWelcomeHistoryInTx', () => {
  const client = { ...base, email: 'a@example.test', emailVerified: true, googleId: 'g-1' };
  function fakeTx(found: WelcomeIdentitySource | null, merchants: string[]) {
    return {
      client: { findFirst: jest.fn().mockResolvedValue(found) },
      transaction: { findMany: jest.fn().mockResolvedValue(merchants.map((merchantId) => ({ merchantId }))) },
      welcomeBonusClaim: { createMany: jest.fn().mockImplementation(({ data }) => ({ count: data.length })) },
    };
  }

  it('keeps one row per merchant with history and per identity', async () => {
    const tx = fakeTx(client, ['m1', 'm2']);
    await expect(rememberWelcomeHistoryInTx(tx as never, 'c1')).resolves.toBe(4);
    const { data, skipDuplicates } = tx.welcomeBonusClaim.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(new Set(data.map((d: { merchantId: string }) => d.merchantId))).toEqual(new Set(['m1', 'm2']));
    expect(tx.transaction.findMany.mock.calls[0][0].where).toEqual({
      clientId: 'c1', type: { in: ['EARN_STAMPS', 'WELCOME_BONUS'] },
    });
  });

  it('writes nothing without a proven identity or without history', async () => {
    const anonymous = fakeTx({ ...base, telephone: '+212600000001' }, ['m1']);
    await expect(rememberWelcomeHistoryInTx(anonymous as never, 'c1')).resolves.toBe(0);
    expect(anonymous.welcomeBonusClaim.createMany).not.toHaveBeenCalled();
    const newcomer = fakeTx(client, []);
    await expect(rememberWelcomeHistoryInTx(newcomer as never, 'c1')).resolves.toBe(0);
    expect(newcomer.welcomeBonusClaim.createMany).not.toHaveBeenCalled();
  });
});

/**
 * The real scenario on Postgres. Skipped unless BOOKING_IT_DATABASE_URL points
 * at a migrated throwaway database (same switch as booking.integration.spec).
 */
const url = process.env.BOOKING_IT_DATABASE_URL;
(url ? describe : describe.skip)('welcome gift after deleting and recreating the account (integration)', () => {
  let prisma: PrismaService;
  let closure: ClientClosureService;
  let merchantId: string;
  const tag = randomUUID().slice(0, 8);
  const email = `gift-${tag}@example.test`;
  const offer = { stamps: 2, trigger: 'CARD_OR_SCAN' as const };
  const clients: string[] = [];

  async function signUp(data: { email?: string; emailVerified?: boolean; googleId?: string }) {
    const c = await prisma.client.create({ data: { prenom: 'Gift', ...data } });
    clients.push(c.id);
    return c.id;
  }
  /** What joinMerchant does: open the card, then try to grant the gift. */
  function join(clientId: string) {
    return prisma.$transaction(async (tx) => {
      const card = await tx.loyaltyCard.create({
        data: { clientId, merchantId, stamps: 0 },
        select: { id: true, stamps: true, welcomeBonusReservedStamps: true, welcomeBonusReservedAt: true, welcomeBonusCreditedAt: true },
      });
      return (await grantWelcomeBonusInTx(tx, { card, clientId, merchantId, offer, accumulationLimit: null })).granted;
    });
  }
  /** What the app's account deletion does. */
  function deleteAccount(clientId: string) {
    return closure.close(clientId, (tx, now) =>
      tx.client.update({ where: { id: clientId }, data: { deletedAt: now, email: null, telephone: null, googleId: null, appleId: null } }),
    );
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    const notify = { changed: jest.fn(), toMerchant: jest.fn().mockResolvedValue(undefined) };
    closure = new ClientClosureService({ run: (fn: never) => prisma.$transaction(fn) } as never, notify as never);
    const m = await prisma.merchant.create({
      data: { nom: `Gift IT ${tag}`, email: `gift-merchant-${tag}@example.test`, password: 'x', categorie: 'CAFE' },
    });
    merchantId = m.id;
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.transaction.deleteMany({ where: { merchantId } });
    await prisma.loyaltyCard.deleteMany({ where: { merchantId } });
    await prisma.client.deleteMany({ where: { id: { in: clients } } });
    await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('grants the gift once, then never again to the same email, however often the account is recreated', async () => {
    const first = await signUp({ email, emailVerified: true });
    expect(await join(first)).toBe(2);
    await deleteAccount(first);
    expect(await prisma.welcomeBonusClaim.count({ where: { merchantId } })).toBe(1);

    for (let round = 0; round < 2; round++) {
      const again = await signUp({ email, emailVerified: true });
      expect(await hasWelcomeBonusClaim(prisma, again, merchantId)).toBe(true);
      expect(await join(again)).toBe(0);
      await deleteAccount(again);
    }
    expect(await prisma.transaction.count({ where: { merchantId, type: 'WELCOME_BONUS' } })).toBe(1);
  });

  it('remembers every identity: the same Google account with another email gets nothing', async () => {
    const googleId = `g-${tag}`;
    const first = await signUp({ email: `g1-${tag}@example.test`, emailVerified: true, googleId });
    expect(await join(first)).toBe(2);
    await deleteAccount(first);
    const again = await signUp({ email: `g2-${tag}@example.test`, emailVerified: true, googleId });
    expect(await join(again)).toBe(0);
  });

  it('still welcomes a genuinely new client, and keeps no readable identity', async () => {
    const other = await signUp({ email: `new-${tag}@example.test`, emailVerified: true });
    expect(await join(other)).toBe(2);
    const rows = await prisma.welcomeBonusClaim.findMany({ where: { merchantId } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.identityHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain(tag);
    }
  });

  it('does not let an unverified email block the real owner', async () => {
    const victimEmail = `victim-${tag}@example.test`;
    const squatter = await signUp({ email: victimEmail, emailVerified: false });
    expect(await join(squatter)).toBe(2);
    await deleteAccount(squatter);
    const owner = await signUp({ email: victimEmail, emailVerified: true });
    expect(await join(owner)).toBe(2);
  });
});
