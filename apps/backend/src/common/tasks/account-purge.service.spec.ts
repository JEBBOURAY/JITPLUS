import {
  AccountPurgeService,
  CAMPAIGN_TRACKER_PURGE_BATCH,
  PURGE_ACCOUNT_BATCH,
  PURGE_ROW_CHUNK,
  PURGEABLE_CAMPAIGN_PATTERNS,
} from './account-purge.service';

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${String(i).padStart(4, '0')}` }));

/** A Prisma-like delegate recording calls; findMany pages through `rows` by chunk. */
function delegate(rowCount = 0) {
  let left = rowCount;
  return {
    findMany: jest.fn(async (args: { take: number }) => {
      const n = Math.min(args.take, left);
      left -= n;
      return ids('row', n);
    }),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  };
}

function makeTx(overrides: Record<string, ReturnType<typeof delegate>> = {}) {
  const models = [
    'luckyWheelTicket', 'transaction', 'loyaltyCard', 'clientNotificationStatus', 'profileView', 'clientReferral',
    'payoutRequest', 'luckyWheelPrize', 'luckyWheelCampaign', 'reward', 'store', 'teamMember', 'deviceSession',
    'merchantNotificationRead', 'merchantInboxNotification', 'notification',
  ];
  const tx: Record<string, ReturnType<typeof delegate>> = {};
  for (const m of models) tx[m] = overrides[m] ?? delegate();
  tx.client = { findMany: jest.fn(), deleteMany: jest.fn(async (a: any) => ({ count: a.where.id.in.length })) } as never;
  tx.merchant = { findMany: jest.fn(), deleteMany: jest.fn(async (a: any) => ({ count: a.where.id.in.length })) } as never;
  return tx;
}

describe('AccountPurgeService', () => {
  const runner = (tx: unknown) => ({ run: jest.fn((fn: (t: unknown) => unknown, _opts?: unknown) => fn(tx)), batch: jest.fn() });

  it('purges clients by batches of ids, draining big child tables in chunks', async () => {
    const tx = makeTx({ transaction: delegate(PURGE_ROW_CHUNK + 3) });
    const txRunner = runner(tx);
    const clientRepo = {
      findMany: jest.fn()
        .mockResolvedValueOnce(ids('c', PURGE_ACCOUNT_BATCH))
        .mockResolvedValueOnce(ids('d', 2)),
    };
    const merchantRepo = { findMany: jest.fn().mockResolvedValue([]) };
    const svc = new AccountPurgeService(clientRepo as never, merchantRepo as never, txRunner as never, {} as never);

    await svc.purgeDeletedAccounts();

    // Keyset paging over soft-deleted clients.
    expect(clientRepo.findMany).toHaveBeenCalledTimes(2);
    expect(clientRepo.findMany.mock.calls[0][0]).toMatchObject({ orderBy: { id: 'asc' }, take: PURGE_ACCOUNT_BATCH });
    expect(clientRepo.findMany.mock.calls[1][0].where.id).toEqual({ gt: `c${String(PURGE_ACCOUNT_BATCH - 1).padStart(4, '0')}` });

    // Children are filtered with IN (batch ids), not one account at a time.
    const firstWhere = (tx.luckyWheelTicket.findMany.mock.calls[0] as any[])[0].where;
    expect(firstWhere.clientId.in).toHaveLength(PURGE_ACCOUNT_BATCH);
    // transactions: 2003 rows of batch 1 → 2 chunked deletes; batch 2 → nothing left.
    expect(tx.transaction.deleteMany).toHaveBeenCalledTimes(2);
    expect((tx.transaction.deleteMany.mock.calls[0] as any[])[0].where.id.in).toHaveLength(PURGE_ROW_CHUNK);

    // Parents: one deleteMany per batch, still guarded by deletedAt.
    expect(tx.client.deleteMany).toHaveBeenCalledTimes(2);
    expect((tx.client.deleteMany as jest.Mock).mock.calls[0][0].where.deletedAt).toEqual({ lte: expect.any(Date) });
    // Every transaction runs with an explicit timeout.
    for (const call of txRunner.run.mock.calls) expect(call[1]).toEqual(expect.objectContaining({ timeout: expect.any(Number) }));
  });

  it('deletes children in FK order before the parent', async () => {
    const tx = makeTx();
    const order: string[] = [];
    for (const [name, d] of Object.entries(tx)) {
      (d.findMany as jest.Mock).mockImplementation(async () => { order.push(name); return []; });
      (d.deleteMany as jest.Mock).mockImplementation(async (a: any) => { order.push(`${name}:delete`); return { count: a?.where?.id?.in?.length ?? 0 }; });
    }
    const merchantRepo = { findMany: jest.fn().mockResolvedValueOnce(ids('m', 1)) };
    const svc = new AccountPurgeService({ findMany: jest.fn().mockResolvedValue([]) } as never, merchantRepo as never, runner(tx) as never, {} as never);

    await svc.purgeDeletedAccounts();

    expect(order).toEqual([
      'luckyWheelTicket', 'luckyWheelPrize', 'luckyWheelCampaign', 'transaction', 'loyaltyCard', 'reward', 'store',
      'teamMember', 'deviceSession', 'merchantNotificationRead:delete', 'clientNotificationStatus',
      'merchantInboxNotification', 'notification', 'profileView', 'clientReferral', 'merchant:delete',
    ]);
  });

  it('falls back to one account at a time when the batch parent delete fails', async () => {
    const tx = makeTx();
    (tx.client.deleteMany as jest.Mock).mockImplementation(async (a: any) => {
      if (a.where.id.in.length > 1 || a.where.id.in[0] === 'c0001') throw new Error('FK');
      return { count: 1 };
    });
    const clientRepo = { findMany: jest.fn().mockResolvedValueOnce(ids('c', 3)) };
    const svc = new AccountPurgeService(clientRepo as never, { findMany: jest.fn().mockResolvedValue([]) } as never, runner(tx) as never, {} as never);

    await svc.purgeDeletedAccounts();

    // 1 batch attempt + 3 single attempts; c0000 and c0002 still purged.
    expect(tx.client.deleteMany).toHaveBeenCalledTimes(4);
  });

  describe('purgeCampaignTrackers', () => {
    it('walks old rows by (sent_at, id) batches and only deletes period-scoped campaigns', async () => {
      const last = new Date('2026-01-01T00:00:00Z');
      const raw = {
        queryRaw: jest.fn()
          .mockResolvedValueOnce([{ last_sent_at: last, last_id: 'x9', deleted: 4000, scanned: CAMPAIGN_TRACKER_PURGE_BATCH }])
          .mockResolvedValueOnce([{ last_sent_at: last, last_id: 'y1', deleted: 10, scanned: 12 }]),
        executeRaw: jest.fn(),
      };
      const svc = new AccountPurgeService({} as never, {} as never, {} as never, raw as never);
      const now = new Date('2026-11-05T03:30:00Z');

      await expect(svc.purgeCampaignTrackers(now)).resolves.toBe(4010);

      expect(raw.queryRaw).toHaveBeenCalledTimes(2);
      const [strings, cutoff, , , firstId, , patterns] = raw.queryRaw.mock.calls[0];
      expect(strings.join('?')).toContain('LIKE ANY');
      expect(cutoff).toBe(new Date(now.getTime() - 120 * 86_400_000).toISOString());
      expect(firstId).toBe('');
      expect(patterns).toEqual([...PURGEABLE_CAMPAIGN_PATTERNS]);
      // Second batch resumes after the last row of the first one.
      expect(raw.queryRaw.mock.calls[1][2]).toBe(last.toISOString());
      expect(raw.queryRaw.mock.calls[1][4]).toBe('x9');
    });

    it('keeps lifetime dedup keys (never matched by the purge patterns)', () => {
      const like = (p: string) => new RegExp('^' + p.replace(/\\_/g, '_').replace(/%/g, '.*') + '$');
      const purgeable = (id: string) => PURGEABLE_CAMPAIGN_PATTERNS.some((p) => like(p).test(id));
      for (const id of ['welcome_push_day1', 'reengagement_inactive30d_2026-01-01', 'merchant_first_scan_7d', 'merchant_tip_scan', 'merchant_plan_expired_20260101', 'merchant_news_1']) {
        expect(purgeable(id)).toBe(false);
      }
      for (const id of ['reward_stamps_almost_m1_2026-01-01', 'weekly_digest_push_w2900', 'friday_referralPush_2026-W01', 'deals_digest_20260101', 'merchant_weekly_perf_2026-W01']) {
        expect(purgeable(id)).toBe(true);
      }
    });

    it('stops when nothing is older than the cutoff', async () => {
      const raw = { queryRaw: jest.fn().mockResolvedValue([]), executeRaw: jest.fn() };
      const svc = new AccountPurgeService({} as never, {} as never, {} as never, raw as never);
      await expect(svc.purgeCampaignTrackers()).resolves.toBe(0);
      expect(raw.queryRaw).toHaveBeenCalledTimes(1);
    });
  });
});
