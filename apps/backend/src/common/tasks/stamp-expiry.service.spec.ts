import { Test, TestingModule } from '@nestjs/testing';
import { StampExpiryService } from './stamp-expiry.service';
import { MERCHANT_REPOSITORY, LOYALTY_CARD_REPOSITORY, TRANSACTION_RUNNER, RAW_QUERY_RUNNER } from '../repositories';
import { NotificationsService } from '../../notifications/notifications.service';

const DAY = 86_400_000;
const NOW = new Date('2026-10-08T10:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const mockMerchantRepo = { findMany: jest.fn() };
const mockCardRepo = { findMany: jest.fn() };

/** Claim / reset UPDATE … FROM unnest(ids, …) RETURNING: every listed card is returned unless `skip` has it. */
const updateReturning = (skip: string[] = []) =>
  jest.fn(async (_s: TemplateStringsArray, ...values: unknown[]) =>
    (values.find((v) => Array.isArray(v)) as string[]).filter((id) => !skip.includes(id)).map((id) => ({ id })));

const mockRaw = { queryRaw: updateReturning(), executeRaw: jest.fn() };
const mockTx = {
  $queryRaw: updateReturning(),
  transaction: { createMany: jest.fn() },
};
const mockTxRunner = { run: jest.fn((fn: (tx: typeof mockTx) => unknown, _opts?: unknown) => fn(mockTx)) };
const mockNotifications = { sendToClients: jest.fn() };

const merchant = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  nom: 'Café Atlas',
  stampValidityDays: 90,
  stampValiditySince: daysAgo(365),
  ...over,
});

const card = (id: string, lastVisitAt: Date, stamps = 4) => ({
  id,
  clientId: `c-${id}`,
  stamps,
  lastVisitAt,
  client: { language: 'fr' },
});

/** First findMany call = reminder candidates, second = expiry candidates. */
function cards(reminders: unknown[], expiries: unknown[]) {
  mockCardRepo.findMany.mockResolvedValueOnce(reminders).mockResolvedValueOnce(expiries);
}

describe('StampExpiryService', () => {
  let service: StampExpiryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StampExpiryService,
        { provide: MERCHANT_REPOSITORY, useValue: mockMerchantRepo },
        { provide: LOYALTY_CARD_REPOSITORY, useValue: mockCardRepo },
        { provide: TRANSACTION_RUNNER, useValue: mockTxRunner },
        { provide: RAW_QUERY_RUNNER, useValue: mockRaw },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get(StampExpiryService);
    mockRaw.queryRaw = updateReturning();
    mockTx.$queryRaw = updateReturning();
  });

  it('does nothing when no merchant has a validity rule', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([]);
    await expect(service.process(NOW)).resolves.toEqual({ reminded: 0, expired: 0 });
    expect(mockCardRepo.findMany).not.toHaveBeenCalled();
  });

  it('sends a reminder to cards expiring within 7 days', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([merchant()]);
    cards([card('a', daysAgo(85), 3)], []);

    const res = await service.process(NOW);

    expect(res).toEqual({ reminded: 1, expired: 0 });
    // One conditional claim for the chunk: still un-reminded, same lastVisitAt as read.
    expect(mockRaw.queryRaw).toHaveBeenCalledTimes(1);
    const [sql, sentAt, , ids, lastVisits] = mockRaw.queryRaw.mock.calls[0] as unknown as [string[], string, string, string[], string[]];
    expect(sql.join('?')).toContain('lc.expiry_reminder_sent_at IS NULL');
    expect(sql.join('?')).toContain('lc.last_visit_at = t.last_visit_at::timestamp(3)');
    expect(sentAt).toBe(NOW.toISOString());
    expect(ids).toEqual(['a']);
    expect(lastVisits).toEqual([daysAgo(85).toISOString()]);
    expect(mockNotifications.sendToClients).toHaveBeenCalledWith('m1', [
      expect.objectContaining({
        clientId: 'c-a',
        title: expect.any(String),
        body: expect.stringContaining('3 tampons'),
        data: expect.objectContaining({ event: 'stamps_expiring', merchantId: 'm1' }),
      }),
    ]);
  });

  it('does not remind twice when another instance already claimed the card', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([merchant()]);
    cards([card('a', daysAgo(85))], []);
    mockRaw.queryRaw = updateReturning(['a']);

    const res = await service.process(NOW);

    expect(res.reminded).toBe(0);
    expect(mockNotifications.sendToClients.mock.calls.flatMap((c) => c[1])).toEqual([]);
  });

  it('counts the delay from stampValiditySince when the rule was enabled after the last visit', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([merchant({ stampValiditySince: daysAgo(10) })]);
    mockCardRepo.findMany.mockResolvedValueOnce([card('a', daysAgo(200))]);

    const res = await service.process(NOW);

    // Expires 80 days from now: no reminder, and the expiry pass is skipped entirely.
    expect(res).toEqual({ reminded: 0, expired: 0 });
    expect(mockRaw.queryRaw).not.toHaveBeenCalled();
    expect(mockCardRepo.findMany).toHaveBeenCalledTimes(1);
  });

  it('resets expired cards and logs an ADJUST_STAMPS transaction', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([merchant()]);
    cards([], [card('b', daysAgo(95), 6)]);

    const res = await service.process(NOW);

    expect(res).toEqual({ reminded: 0, expired: 1 });
    const [sql, , ids, stamps, lastVisits] = mockTx.$queryRaw.mock.calls[0] as unknown as [string[], string, string[], number[], string[]];
    expect(sql.join('?')).toContain('SET stamps = 0');
    expect(sql.join('?')).toContain('lc.stamps = t.stamps');
    expect(sql.join('?')).toContain('lc.last_visit_at = t.last_visit_at::timestamp(3)');
    expect(ids).toEqual(['b']);
    expect(stamps).toEqual([6]);
    expect(lastVisits).toEqual([daysAgo(95).toISOString()]);
    expect(mockTx.transaction.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        clientId: 'c-b',
        merchantId: 'm1',
        type: 'ADJUST_STAMPS',
        amount: 0,
        stamps: -6,
        note: expect.stringContaining('90'),
      })],
    });
  });

  it('skips a card that changed (new visit) between the read and the reset', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([merchant()]);
    cards([], [card('b', daysAgo(95))]);
    mockTx.$queryRaw = updateReturning(['b']);

    const res = await service.process(NOW);

    expect(res.expired).toBe(0);
    expect(mockTx.transaction.createMany).not.toHaveBeenCalled();
  });

  it('keeps processing other merchants when one fails', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([merchant({ id: 'bad' }), merchant({ id: 'm2' })]);
    mockCardRepo.findMany
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([card('c', daysAgo(120))]);

    const res = await service.process(NOW);

    expect(res.expired).toBe(1);
  });

  it('resets a whole chunk in one transaction and writes one ledger row per reset card', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([merchant()]);
    cards([], [card('b', daysAgo(95), 6), card('c', daysAgo(100), 2), card('d', daysAgo(120), 3)]);
    mockTx.$queryRaw = updateReturning(['c']); // c got a visit meanwhile

    const res = await service.process(NOW);

    expect(res.expired).toBe(2);
    expect(mockTxRunner.run).toHaveBeenCalledTimes(1);
    expect(mockTxRunner.run.mock.calls[0][1]).toEqual(expect.objectContaining({ timeout: expect.any(Number) }));
    expect(mockTx.transaction.createMany).toHaveBeenCalledTimes(1);
    const rows = mockTx.transaction.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { clientId: string; stamps: number }) => [r.clientId, r.stamps])).toEqual([['c-b', -6], ['c-d', -3]]);
  });

  it('pages cards with an id keyset', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([merchant()]);
    const full = Array.from({ length: 500 }, (_, i) => card(`r${String(i).padStart(3, '0')}`, daysAgo(10)));
    mockCardRepo.findMany.mockResolvedValueOnce(full).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await service.process(NOW);

    expect(mockCardRepo.findMany.mock.calls[1][0].where.id).toEqual({ gt: 'r499' });
  });
});
