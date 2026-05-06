import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { MerchantProfileService } from './merchant-profile.service';
import {
  MERCHANT_REPOSITORY,
  DEVICE_SESSION_REPOSITORY,
  LOYALTY_CARD_REPOSITORY,
  TRANSACTION_REPOSITORY,
  TRANSACTION_RUNNER,
  RAW_QUERY_RUNNER,
  REWARD_REPOSITORY,
  TEAM_MEMBER_REPOSITORY,
  STORE_REPOSITORY,
} from '../../common/repositories';
import { NotificationsService } from '../../notifications/notifications.service';
import { EventsGateway } from '../../events/events.gateway';
import { AuditLogService } from '../../admin/audit-log.service';
import { MailService } from '../../mail/mail.service';

// ── Tx mock that records SQL and simulates UPDATEs against an in-memory store ──
//
// We do not need a real DB: we just verify that the SERVICE issues the correct
// formula by matching arguments captured by $executeRaw. For aggregate queries
// we return pre-computed sums so the audit summary can be asserted.

interface FakeCard {
  id: string;
  points: number;
}
interface FakeReward {
  id: string;
  cout: number;
}

function makeTxMock(state: { cards: FakeCard[]; rewards: FakeReward[]; merchantId: string }) {
  // $executeRaw is a tag function in Prisma. Jest receives (strings, ...values).
  const executeRawCalls: { sql: string; values: unknown[] }[] = [];
  const $executeRaw = jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join('?');
    executeRawCalls.push({ sql, values });

    // Simulate the UPDATE side-effect on the in-memory state.
    if (sql.includes('UPDATE loyalty_cards')) {
      // Detect direction from SQL fragment (handles optional ::numeric cast).
      const isDivide = /points(?:::numeric)?\s*\/\s*\?/.test(sql);
      const isMultiply = /points(?:::numeric)?\s*\*\s*\?/.test(sql);
      const ratio = values[0] as number;
      const cap = sql.includes('LEAST') ? (values[1] as number) : null;
      for (const c of state.cards) {
        let v = c.points;
        if (isDivide) v = Math.max(Math.round(c.points / ratio), 0);
        else if (isMultiply) v = Math.max(Math.round(c.points * ratio), 0);
        if (cap !== null) v = Math.min(v, cap);
        c.points = v;
      }
    } else if (sql.includes('UPDATE rewards')) {
      const isDivide = /cout(?:::numeric)?\s*\/\s*\?/.test(sql);
      const isMultiply = /cout(?:::numeric)?\s*\*\s*\?/.test(sql);
      const ratio = values[0] as number;
      for (const r of state.rewards) {
        let v = r.cout;
        if (isDivide) v = Math.max(Math.round(r.cout / ratio), 1);
        else if (isMultiply) v = Math.max(Math.round(r.cout * ratio), 1);
        r.cout = v;
      }
    }
    return Promise.resolve(state.cards.length);
  });

  const reward = {
    findMany: jest.fn(async () => state.rewards.map((r) => ({ ...r }))),
  };
  const loyaltyCard = {
    aggregate: jest.fn(async (args: any) => {
      const sum = state.cards.reduce((s, c) => s + c.points, 0);
      const count = state.cards.length;
      const result: any = { _sum: { points: sum } };
      if (args?._count) result._count = { _all: count };
      return result;
    }),
  };
  const merchant = {
    update: jest.fn(async ({ data, select }: any) => ({
      id: state.merchantId,
      nom: 'Mock',
      ...data,
      // populate select-shaped fields with sensible defaults
      ...Object.fromEntries(Object.keys(select || {}).map((k) => [k, (data as any)[k] ?? null])),
    })),
  };

  return { tx: { $executeRaw, reward, loyaltyCard, merchant }, executeRawCalls };
}

describe('MerchantProfileService.updateLoyaltySettings — loyalty type conversion', () => {
  let service: MerchantProfileService;

  // Build a fresh service with the chosen merchant fixture + tx state.
  async function buildService(opts: {
    merchant: any;
    cards: FakeCard[];
    rewards: FakeReward[];
  }) {
    const txState = { cards: [...opts.cards], rewards: [...opts.rewards], merchantId: opts.merchant.id };
    const { tx, executeRawCalls } = makeTxMock(txState);

    const merchantRepo = {
      findUnique: jest.fn().mockResolvedValue(opts.merchant),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...opts.merchant, ...data })),
    };

    const txRunner = {
      run: jest.fn().mockImplementation(async (fn: any) => fn(tx)),
    };

    const auditLogService = { log: jest.fn() };
    const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn().mockResolvedValue(undefined) };
    const notifications = { sendToClient: jest.fn(), sendToAll: jest.fn() };
    const eventsGateway = { emitPointsUpdated: jest.fn() };
    const transactionRepoDelegate = { createMany: jest.fn() };
    const loyaltyCardRepo = { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn(), count: jest.fn() };
    const rawQuery = { executeRaw: jest.fn() };
    const config = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantProfileService,
        { provide: MERCHANT_REPOSITORY, useValue: merchantRepo },
        { provide: DEVICE_SESSION_REPOSITORY, useValue: {} },
        { provide: LOYALTY_CARD_REPOSITORY, useValue: loyaltyCardRepo },
        { provide: TRANSACTION_REPOSITORY, useValue: transactionRepoDelegate },
        { provide: TRANSACTION_RUNNER, useValue: txRunner },
        { provide: RAW_QUERY_RUNNER, useValue: rawQuery },
        { provide: REWARD_REPOSITORY, useValue: {} },
        { provide: TEAM_MEMBER_REPOSITORY, useValue: {} },
        { provide: STORE_REPOSITORY, useValue: {} },
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: NotificationsService, useValue: notifications },
        { provide: EventsGateway, useValue: eventsGateway },
        { provide: ConfigService, useValue: config },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: MailService, useValue: {} },
      ],
    }).compile();

    service = module.get(MerchantProfileService);
    return { service, txState, txRunner, auditLogService, executeRawCalls, merchantRepo };
  }

  // ── Fixtures ────────────────────────────────────────────────────────────────

  const baseMerchant = {
    id: 'm1',
    nom: 'Café Test',
    loyaltyType: 'POINTS',
    conversionRate: 10,
    stampsForReward: 10,
    pointsRules: { rewardThreshold: 100 },
    accumulationLimit: 500,
  };

  // ── Cas 1 — POINTS → STAMPS, ratio par défaut (100/10 = 10) ─────────────────

  it('POINTS → STAMPS converts balances using rewardThreshold/stampsForReward', async () => {
    const { service, txState, auditLogService } = await buildService({
      merchant: baseMerchant,
      cards: [
        { id: 'a', points: 0 },
        { id: 'b', points: 80 },
        { id: 'c', points: 1000 },
      ],
      rewards: [{ id: 'r1', cout: 200 }],
    });

    await service.updateLoyaltySettings('m1', { loyaltyType: 'STAMPS' });

    // pointsPerStamp = 100/10 = 10
    expect(txState.cards.find((c) => c.id === 'a')!.points).toBe(0);
    expect(txState.cards.find((c) => c.id === 'b')!.points).toBe(8); // 80/10
    expect(txState.cards.find((c) => c.id === 'c')!.points).toBe(100); // 1000/10
    expect(txState.rewards[0].cout).toBe(20); // 200/10

    // Audit summary recorded
    const auditCall = (auditLogService.log as jest.Mock).mock.calls[0][0];
    expect(auditCall.metadata.loyaltyTypeChanged).toBe(true);
    expect(auditCall.metadata.conversion).toMatchObject({
      oldType: 'POINTS',
      newType: 'STAMPS',
      pointsPerStamp: 10,
      cardsAffected: 3,
      totalBalanceBefore: 1080,
    });
    expect(auditCall.metadata.conversion.rewardsBefore).toEqual([{ id: 'r1', cout: 200 }]);
    expect(auditCall.metadata.conversion.rewardsAfter).toEqual([{ id: 'r1', cout: 20 }]);
  });

  // ── Cas 2 — Régression : ne PAS utiliser conversionRate (l'ancien bug) ──────

  it('does not use conversionRate as the equivalence ratio (regression)', async () => {
    // conversionRate=2 but stampsForReward=10 ⇒ pointsPerStamp must remain 100/10 = 10,
    // NOT 2 (which was the buggy behaviour).
    const merchant = { ...baseMerchant, conversionRate: 2 };
    const { service, txState } = await buildService({
      merchant,
      cards: [{ id: 'b', points: 80 }],
      rewards: [],
    });

    await service.updateLoyaltySettings('m1', { loyaltyType: 'STAMPS' });

    // With the bug: 80 / 2 = 40 stamps. Correct: 80 / 10 = 8.
    expect(txState.cards[0].points).toBe(8);
    expect(txState.cards[0].points).not.toBe(40);
  });

  // ── Cas 3 — STAMPS → POINTS respects accumulationLimit ─────────────────────

  it('STAMPS → POINTS caps converted balances at accumulationLimit', async () => {
    const merchant = { ...baseMerchant, loyaltyType: 'STAMPS', accumulationLimit: 500 };
    const { service, txState } = await buildService({
      merchant,
      cards: [
        { id: 'a', points: 60 }, // 60×10 = 600 → capped to 500
        { id: 'b', points: 10 }, // 10×10 = 100 → unchanged
      ],
      rewards: [{ id: 'r1', cout: 20 }],
    });

    await service.updateLoyaltySettings('m1', { loyaltyType: 'POINTS' });

    expect(txState.cards.find((c) => c.id === 'a')!.points).toBe(500);
    expect(txState.cards.find((c) => c.id === 'b')!.points).toBe(100);
    expect(txState.rewards[0].cout).toBe(200); // 20×10
  });

  // ── Cas 4 — Round-trip preserves value (no asymmetric FLOOR drift) ─────────

  it('round-trip POINTS→STAMPS→POINTS preserves balances within ±ratio', async () => {
    // Step 1
    const { service: s1, txState: state1 } = await buildService({
      merchant: { ...baseMerchant, accumulationLimit: null },
      cards: [{ id: 'b', points: 80 }],
      rewards: [],
    });
    await s1.updateLoyaltySettings('m1', { loyaltyType: 'STAMPS' });
    const stamps = state1.cards[0].points; // 8

    // Step 2: simulate the merchant now in STAMPS state with that balance
    const { service: s2, txState: state2 } = await buildService({
      merchant: { ...baseMerchant, loyaltyType: 'STAMPS', accumulationLimit: null },
      cards: [{ id: 'b', points: stamps }],
      rewards: [],
    });
    await s2.updateLoyaltySettings('m1', { loyaltyType: 'POINTS' });

    // 80 → 8 → 80, lossless because 80 is a multiple of 10.
    expect(state2.cards[0].points).toBe(80);
  });

  // ── Cas 5 — Reward cost minimum is 1 (no free rewards exploit) ─────────────

  it('reward cost never falls below 1 after conversion', async () => {
    const { service, txState } = await buildService({
      merchant: baseMerchant,
      cards: [],
      rewards: [{ id: 'r1', cout: 5 }], // 5 / 10 = 0.5 → ROUND = 1 (clamp)
    });

    await service.updateLoyaltySettings('m1', { loyaltyType: 'STAMPS' });
    expect(txState.rewards[0].cout).toBeGreaterThanOrEqual(1);
  });

  // ── Cas 6 — Atomicity: tx rollback when merchant.update fails ──────────────

  it('rolls back balance conversion if merchant.update fails', async () => {
    const txState = { cards: [{ id: 'b', points: 80 }], rewards: [], merchantId: 'm1' };
    const { tx } = makeTxMock(txState);

    // Make merchant.update throw inside the tx callback.
    tx.merchant.update = jest.fn().mockRejectedValue(new Error('DB down'));

    // Simulate Prisma's $transaction rollback: if the callback throws, the
    // caller observes the throw AND no UPDATE side-effects should be visible
    // to subsequent reads. Our fake tx already mutated state, so we restore
    // it manually on rollback to mimic real Prisma semantics.
    const txRunner = {
      run: jest.fn().mockImplementation(async (fn: any) => {
        const before = JSON.parse(JSON.stringify(txState));
        try {
          return await fn(tx);
        } catch (e) {
          // rollback
          txState.cards = before.cards;
          txState.rewards = before.rewards;
          throw e;
        }
      }),
    };

    const merchantRepo = {
      findUnique: jest.fn().mockResolvedValue(baseMerchant),
      update: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantProfileService,
        { provide: MERCHANT_REPOSITORY, useValue: merchantRepo },
        { provide: DEVICE_SESSION_REPOSITORY, useValue: {} },
        { provide: LOYALTY_CARD_REPOSITORY, useValue: { findMany: jest.fn().mockResolvedValue([]) } },
        { provide: TRANSACTION_REPOSITORY, useValue: { createMany: jest.fn() } },
        { provide: TRANSACTION_RUNNER, useValue: txRunner },
        { provide: RAW_QUERY_RUNNER, useValue: { executeRaw: jest.fn() } },
        { provide: REWARD_REPOSITORY, useValue: {} },
        { provide: TEAM_MEMBER_REPOSITORY, useValue: {} },
        { provide: STORE_REPOSITORY, useValue: {} },
        { provide: CACHE_MANAGER, useValue: { del: jest.fn() } },
        { provide: NotificationsService, useValue: { sendToClient: jest.fn(), sendToAll: jest.fn() } },
        { provide: EventsGateway, useValue: { emitPointsUpdated: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: MailService, useValue: {} },
      ],
    }).compile();

    const svc = module.get(MerchantProfileService);
    await expect(svc.updateLoyaltySettings('m1', { loyaltyType: 'STAMPS' })).rejects.toThrow('DB down');
    // Balance must be back to the original value (rollback)
    expect(txState.cards[0].points).toBe(80);
  });

  // ── Cas 7 — Guard: invalid stampsForReward triggers BadRequest ─────────────

  it('rejects an explicit stampsForReward < 1', async () => {
    const { service } = await buildService({ merchant: baseMerchant, cards: [], rewards: [] });
    await expect(
      service.updateLoyaltySettings('m1', { loyaltyType: 'STAMPS', stampsForReward: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── Cas 8 — Same-type update does NOT touch balances ───────────────────────

  it('does not convert balances when loyaltyType is unchanged', async () => {
    const { service, txState, auditLogService } = await buildService({
      merchant: baseMerchant,
      cards: [{ id: 'b', points: 80 }],
      rewards: [{ id: 'r1', cout: 200 }],
    });

    await service.updateLoyaltySettings('m1', { conversionRate: 5 });

    expect(txState.cards[0].points).toBe(80);
    expect(txState.rewards[0].cout).toBe(200);
    const audit = (auditLogService.log as jest.Mock).mock.calls[0][0];
    expect(audit.metadata.loyaltyTypeChanged).toBe(false);
    expect(audit.metadata.conversion).toBeUndefined();
  });

  // ── Cas 9 — Combined dto: switch + new stampsForReward uses the NEW value ──

  it('combined { loyaltyType, stampsForReward } switch uses the NEW stampsForReward in the ratio', async () => {
    // rewardThreshold=100, NEW stampsForReward=5 ⇒ pointsPerStamp = 20
    const { service, txState } = await buildService({
      merchant: baseMerchant,
      cards: [{ id: 'b', points: 100 }],
      rewards: [],
    });

    await service.updateLoyaltySettings('m1', { loyaltyType: 'STAMPS', stampsForReward: 5 });

    // 100 / 20 = 5 stamps (not 100/10=10)
    expect(txState.cards[0].points).toBe(5);
  });
});
