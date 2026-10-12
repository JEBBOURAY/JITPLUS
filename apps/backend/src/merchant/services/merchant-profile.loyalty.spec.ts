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
import { AuditLogService } from '../../admin/audit-log.service';
import { MailService } from '../../mail/mail.service';

// ── Tx mock that records SQL and simulates UPDATEs against an in-memory store ──
//
// We do not need a real DB: we just verify that the SERVICE issues the correct
// formula by matching arguments captured by $executeRaw.

interface FakeCard {
  id: string;
  stamps: number;
}
interface FakeReward {
  id: string;
  cout: number;
}
interface TxState {
  cards: FakeCard[];
  rewards: FakeReward[];
  merchantId: string;
}

function makeTxMock(state: TxState) {
  // $executeRaw is a tag function in Prisma. Jest receives (strings, ...values).
  const executeRawCalls: { sql: string; values: unknown[] }[] = [];
  const $executeRaw = jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join('?');
    executeRawCalls.push({ sql, values });

    // Simulate the rescale UPDATE side-effect: value * newRef / oldRef.
    if (sql.includes('UPDATE loyalty_cards')) {
      const [newRef, oldRef] = values as number[];
      const cap = sql.includes('LEAST') ? (values[2] as number) : null;
      for (const c of state.cards) {
        let v = Math.max(Math.round((c.stamps * newRef) / oldRef), 0);
        if (cap !== null) v = Math.min(v, cap);
        c.stamps = v;
      }
    } else if (sql.includes('UPDATE rewards')) {
      const [newRef, oldRef] = values as number[];
      for (const r of state.rewards) {
        r.cout = Math.max(Math.round((r.cout * newRef) / oldRef), 1);
      }
    }
    return Promise.resolve(state.cards.length);
  });

  const merchant = {
    update: jest.fn(async ({ data, select }: any) => ({
      id: state.merchantId,
      nom: 'Mock',
      ...data,
      // populate select-shaped fields with sensible defaults
      ...Object.fromEntries(Object.keys(select || {}).map((k) => [k, (data as any)[k] ?? null])),
    })),
  };

  return { tx: { $executeRaw, merchant }, executeRawCalls };
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('MerchantProfileService — stamps loyalty settings', () => {
  // Build a fresh service with the chosen merchant fixture + tx state.
  async function buildService(opts: {
    merchant: any;
    cards: FakeCard[];
    rewards: FakeReward[];
    txRunner?: { run: jest.Mock };
    tx?: ReturnType<typeof makeTxMock>['tx'];
    cardsOverLimit?: { id: string; clientId: string; stamps: number; client: { language: string | null } }[];
  }) {
    const txState: TxState = { cards: [...opts.cards], rewards: [...opts.rewards], merchantId: opts.merchant.id };
    const mock = makeTxMock(txState);
    const tx = opts.tx ?? mock.tx;

    const merchantRepo = {
      findUnique: jest.fn().mockResolvedValue(opts.merchant),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...opts.merchant, ...data })),
    };

    const txRunner = opts.txRunner ?? {
      run: jest.fn().mockImplementation(async (fn: any) => fn(tx)),
    };

    const auditLogService = { log: jest.fn() };
    const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn().mockResolvedValue(undefined) };
    const notifications = { sendToClient: jest.fn().mockResolvedValue(undefined), sendToAll: jest.fn() };
    const transactionRepoDelegate = { createMany: jest.fn().mockResolvedValue({ count: 0 }) };
    const loyaltyCardRepo = {
      findMany: jest.fn()
        .mockResolvedValueOnce(opts.cardsOverLimit ?? [])
        .mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(3),
    };
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
        { provide: ConfigService, useValue: config },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: MailService, useValue: {} },
      ],
    }).compile();

    const service = module.get(MerchantProfileService);
    return {
      service,
      txState,
      tx,
      txRunner,
      auditLogService,
      executeRawCalls: mock.executeRawCalls,
      merchantRepo,
      loyaltyCardRepo,
      transactionRepoDelegate,
      notifications,
    };
  }

  // ── Fixtures ────────────────────────────────────────────────────────────────

  const baseMerchant = {
    id: 'm1',
    nom: 'Café Test',
    stampsForReward: 10,
    accumulationLimit: null,
  };

  // ── Rescale on stampsForReward change ──────────────────────────────────────

  it('rescales reward costs and client balances when stampsForReward changes', async () => {
    const { service, txState, tx } = await buildService({
      merchant: baseMerchant,
      cards: [
        { id: 'a', stamps: 0 },
        { id: 'b', stamps: 5 },
        { id: 'c', stamps: 10 },
      ],
      rewards: [
        { id: 'r1', cout: 10 },
        { id: 'r2', cout: 20 },
      ],
    });

    await service.updateLoyaltySettings('m1', { stampsForReward: 15 });

    // value * 15 / 10
    expect(txState.cards.find((c) => c.id === 'a')!.stamps).toBe(0);
    expect(txState.cards.find((c) => c.id === 'b')!.stamps).toBe(8); // 7.5 → 8
    expect(txState.cards.find((c) => c.id === 'c')!.stamps).toBe(15);
    expect(txState.rewards.map((r) => r.cout)).toEqual([15, 30]);

    // The new value is persisted on the merchant in the same transaction
    expect(tx.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stampsForReward: 15 } }),
    );
  });

  it('locks the merchant row before rescaling', async () => {
    const { service, executeRawCalls } = await buildService({
      merchant: baseMerchant,
      cards: [{ id: 'b', stamps: 5 }],
      rewards: [],
    });

    await service.updateLoyaltySettings('m1', { stampsForReward: 20 });

    expect(executeRawCalls[0].sql).toContain('FOR UPDATE');
    expect(executeRawCalls.some((c) => c.sql.includes('UPDATE loyalty_cards') && c.sql.includes('stamps'))).toBe(true);
  });

  it('caps rescaled balances at accumulationLimit', async () => {
    const { service, txState } = await buildService({
      merchant: { ...baseMerchant, accumulationLimit: 25 },
      cards: [
        { id: 'a', stamps: 15 }, // 15 × 2 = 30 → capped to 25
        { id: 'b', stamps: 5 },  // 5 × 2 = 10 → unchanged
      ],
      rewards: [{ id: 'r1', cout: 10 }],
    });

    await service.updateLoyaltySettings('m1', { stampsForReward: 20 });

    expect(txState.cards.find((c) => c.id === 'a')!.stamps).toBe(25);
    expect(txState.cards.find((c) => c.id === 'b')!.stamps).toBe(10);
    expect(txState.rewards[0].cout).toBe(20);
  });

  it('reward cost never falls below 1 after rescale', async () => {
    const { service, txState } = await buildService({
      merchant: baseMerchant,
      cards: [],
      rewards: [{ id: 'r1', cout: 2 }], // 2 × 1 / 10 = 0.2 → clamped to 1
    });

    await service.updateLoyaltySettings('m1', { stampsForReward: 1 });
    expect(txState.rewards[0].cout).toBe(1);
  });

  it('does not touch balances or rewards when stampsForReward is unchanged', async () => {
    const { service, txState, executeRawCalls } = await buildService({
      merchant: baseMerchant,
      cards: [{ id: 'b', stamps: 8 }],
      rewards: [{ id: 'r1', cout: 10 }],
    });

    await service.updateLoyaltySettings('m1', {
      stampsForReward: 10,
      stampEarningMode: 'PER_AMOUNT',
      amountPerStamp: 25,
    });

    expect(executeRawCalls).toHaveLength(0);
    expect(txState.cards[0].stamps).toBe(8);
    expect(txState.rewards[0].cout).toBe(10);
  });

  it('rolls back the rescale if merchant.update fails', async () => {
    const txState: TxState = { cards: [{ id: 'b', stamps: 5 }], rewards: [{ id: 'r1', cout: 10 }], merchantId: 'm1' };
    const { tx } = makeTxMock(txState);
    tx.merchant.update = jest.fn().mockRejectedValue(new Error('DB down'));

    // Simulate Prisma's $transaction rollback: our fake tx already mutated
    // state, so restore it on throw to mimic real Prisma semantics.
    const txRunner = {
      run: jest.fn().mockImplementation(async (fn: any) => {
        const before = JSON.parse(JSON.stringify(txState));
        try {
          return await fn(tx);
        } catch (e) {
          txState.cards = before.cards;
          txState.rewards = before.rewards;
          throw e;
        }
      }),
    };

    const { service } = await buildService({ merchant: baseMerchant, cards: [], rewards: [], tx, txRunner });

    await expect(service.updateLoyaltySettings('m1', { stampsForReward: 20 })).rejects.toThrow('DB down');
    expect(txState.cards[0].stamps).toBe(5);
    expect(txState.rewards[0].cout).toBe(10);
  });

  // ── Guards ────────────────────────────────────────────────────────────────

  it('rejects an explicit stampsForReward < 1', async () => {
    const { service } = await buildService({ merchant: baseMerchant, cards: [], rewards: [] });
    await expect(
      service.updateLoyaltySettings('m1', { stampsForReward: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-positive amountPerStamp', async () => {
    const { service } = await buildService({ merchant: baseMerchant, cards: [], rewards: [] });
    await expect(
      service.updateLoyaltySettings('m1', { amountPerStamp: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── Audit log ─────────────────────────────────────────────────────────────

  it('records the stamps settings in the audit log', async () => {
    const { service, auditLogService } = await buildService({ merchant: baseMerchant, cards: [], rewards: [] });

    await service.updateLoyaltySettings('m1', { stampsForReward: 12, accumulationLimit: 50 });

    const audit = (auditLogService.log as jest.Mock).mock.calls[0][0];
    expect(audit.action).toBe('UPDATE_LOYALTY_SETTINGS');
    expect(audit.metadata).toEqual({
      stampEarningMode: undefined,
      amountPerStamp: undefined,
      stampsForReward: 12,
      accumulationLimit: 50,
    });
  });

  // ── Accumulation limit ────────────────────────────────────────────────────

  it('previewAccumulationLimit counts cards whose stamps exceed the limit', async () => {
    const { service, loyaltyCardRepo } = await buildService({ merchant: baseMerchant, cards: [], rewards: [] });

    await expect(service.previewAccumulationLimit('m1', 30)).resolves.toEqual({ affectedClients: 3 });
    expect(loyaltyCardRepo.count).toHaveBeenCalledWith({ where: { merchantId: 'm1', stamps: { gt: 30 } } });
  });

  it('forceCapClients caps over-limit balances, logs ADJUST_STAMPS and notifies clients', async () => {
    const { service, tx, loyaltyCardRepo, transactionRepoDelegate, notifications } = await buildService({
      merchant: baseMerchant,
      cards: [],
      rewards: [],
      cardsOverLimit: [
        { id: 'c1', clientId: 'cl1', stamps: 40, client: { language: 'fr' } },
        { id: 'c2', clientId: 'cl2', stamps: 35, client: { language: 'en' } },
      ],
    });

    await service.updateLoyaltySettings('m1', { accumulationLimit: 30, forceCapClients: true });
    await flushPromises();

    // forceCapClients is not a DB column
    expect(tx.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { accumulationLimit: 30 } }),
    );
    expect(loyaltyCardRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantId: 'm1', stamps: { gt: 30 } } }),
    );
    expect(loyaltyCardRepo.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1', 'c2'] } },
      data: { stamps: 30 },
    });

    const createdTx = transactionRepoDelegate.createMany.mock.calls[0][0].data;
    expect(createdTx).toEqual([
      expect.objectContaining({ clientId: 'cl1', type: 'ADJUST_STAMPS', stamps: -10, amount: 0 }),
      expect.objectContaining({ clientId: 'cl2', type: 'ADJUST_STAMPS', stamps: -5, amount: 0 }),
    ]);
    expect(createdTx[0].note).toContain('tampons');

    expect(notifications.sendToClient).toHaveBeenCalledTimes(2);
    expect(notifications.sendToClient.mock.calls[0][4]).toEqual({
      event: 'stamps_updated',
      merchantId: 'm1',
      newBalance: '30',
    });
  });
});
