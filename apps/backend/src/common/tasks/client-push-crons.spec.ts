import { ClientWeeklyDigestService } from './client-weekly-digest.service';
import { ClientReengagementService } from './client-reengagement.service';
import { ClientRewardReminderService } from './client-reward-reminder.service';
import { ClientWelcomeService } from './client-welcome.service';
import { CLIENT_CAMPAIGN_CHUNK } from './client-campaign';

const DAY = 86_400_000;
// Wednesday 12:00 UTC = 13:00 Maroc: outside quiet hours.
const NOW = new Date('2026-11-04T12:00:00Z');

/** Claim runner: every claim wins unless `taken` holds "client|campaign". */
function rawRunner(taken = new Set<string>(), selectRows: unknown[] = []) {
  return {
    queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (sql.includes('INSERT INTO campaign_sent_trackers')) {
        const [, clientIds, campaignIds] = values as string[][];
        return clientIds
          .map((c, i) => ({ client_id: c, campaign_id: campaignIds[i] }))
          .filter((r) => !taken.has(`${r.client_id}|${r.campaign_id}`));
      }
      return selectRows;
    }),
    executeRaw: jest.fn(),
  };
}

const pushProvider = () => ({
  sendMulticast: jest.fn().mockResolvedValue({ successCount: 1, failureCount: 0, invalidTokens: [] }),
});

const client = (id: string, language = 'fr') => ({ id, pushToken: `tok-${id}`, language });
const page = (prefix: string, n: number, language = 'fr') =>
  Array.from({ length: n }, (_, i) => client(`${prefix}${String(i).padStart(5, '0')}`, language));

describe('client push crons', () => {
  const env = process.env.ENABLE_CRONS;

  beforeAll(() => {
    process.env.ENABLE_CRONS = 'true';
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'] });
  });
  afterAll(() => {
    process.env.ENABLE_CRONS = env;
    jest.useRealTimers();
  });

  describe('ClientWeeklyDigestService', () => {
    it('feature highlight pages past the first 1000 clients with an id keyset', async () => {
      const first = page('a', CLIENT_CAMPAIGN_CHUNK);
      const clientRepo = {
        findMany: jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce([client('b1', 'ar')]),
        updateMany: jest.fn(),
      };
      const raw = rawRunner();
      const push = pushProvider();
      const svc = new ClientWeeklyDigestService(clientRepo as never, {} as never, raw as never, push as never);

      await svc.sendFeatureHighlight();

      expect(clientRepo.findMany).toHaveBeenCalledTimes(2);
      const [firstArgs, secondArgs] = clientRepo.findMany.mock.calls.map((c) => c[0]);
      expect(firstArgs.where.id).toBeUndefined();
      expect(firstArgs.orderBy).toEqual({ id: 'asc' });
      expect(firstArgs.where.language).toEqual({ in: ['fr', 'en', 'ar'] });
      expect(secondArgs.where.id).toEqual({ gt: first[first.length - 1].id });
      // One claim per page, one multicast per (page, language).
      expect(raw.queryRaw).toHaveBeenCalledTimes(2);
      expect(push.sendMulticast).toHaveBeenCalledTimes(2);
      expect(push.sendMulticast.mock.calls[0][0]).toHaveLength(CLIENT_CAMPAIGN_CHUNK);
      expect(push.sendMulticast.mock.calls[1][0]).toEqual(['tok-b1']);
    });

    it('weekly digest aggregates in SQL and sends the per-client totals', async () => {
      const raw = rawRunner(new Set(['c2|' + `weekly_digest_push_w${Math.floor(NOW.getTime() / (7 * DAY))}`]), [
        { client_id: 'c1', push_token: 'tok-c1', language: 'en', stamps: 5, merchants: 2 },
        { client_id: 'c2', push_token: 'tok-c2', language: 'fr', stamps: 1, merchants: 1 },
      ]);
      const push = pushProvider();
      const svc = new ClientWeeklyDigestService({ updateMany: jest.fn() } as never, {} as never, raw as never, push as never);

      await svc.sendWeeklyDigest();

      const aggregate = (raw.queryRaw.mock.calls[0][0] as unknown as string[]).join('?');
      expect(aggregate).toContain('SUM(t.stamps)');
      expect(aggregate).toContain('COUNT(DISTINCT t.merchant_id)');
      expect(aggregate).toContain('HAVING SUM(t.stamps) > 0');
      // c2 was already claimed this week: only c1 gets its digest.
      expect(push.sendMulticast).toHaveBeenCalledTimes(1);
      expect(push.sendMulticast).toHaveBeenCalledWith(
        ['tok-c1'],
        expect.any(String),
        expect.stringContaining('+5 stamp(s) earned at 2 business(es)'),
        undefined,
        { event: 'weekly_digest', action: 'open_cards' },
      );
    });
  });

  describe('ClientReengagementService', () => {
    it('reads the last transaction once per batch and pages every inactive client', async () => {
      const first = page('a', CLIENT_CAMPAIGN_CHUNK);
      const clientRepo = {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([]) // never-used segment
          .mockResolvedValueOnce(first)
          .mockResolvedValueOnce([client('b1')]),
        updateMany: jest.fn(),
      };
      const lastTx = new Date(NOW.getTime() - 10 * DAY);
      const lastTxPages = [
        [{ client_id: first[0].id, last_at: lastTx }, { client_id: first[1].id, last_at: new Date(NOW.getTime() - DAY) }],
        [{ client_id: 'b1', last_at: new Date(NOW.getTime() - 40 * DAY) }],
      ];
      const raw = rawRunner();
      const claim = raw.queryRaw.getMockImplementation()!;
      raw.queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) =>
        strings.join('?').includes('CROSS JOIN LATERAL') ? lastTxPages.shift()! : claim(strings, ...values),
      );
      const push = pushProvider();
      const svc = new ClientReengagementService(clientRepo as never, raw as never, push as never);

      await svc.sendReengagementPush();

      const lastTxCalls = raw.queryRaw.mock.calls.filter((c) => (c[0] as TemplateStringsArray).join('?').includes('CROSS JOIN LATERAL'));
      expect(lastTxCalls).toHaveLength(2);
      expect(lastTxCalls[0][1]).toHaveLength(CLIENT_CAMPAIGN_CHUNK);
      expect(clientRepo.findMany.mock.calls[2][0].where.id).toEqual({ gt: first[first.length - 1].id });
      const campaigns = raw.queryRaw.mock.calls
        .filter((c) => (c[0] as TemplateStringsArray).join('?').includes('INSERT INTO campaign_sent_trackers'))
        .map((c) => c[3]);
      expect(campaigns).toEqual([
        [`reengagement_inactive7d_${lastTx.toISOString().slice(0, 10)}`],
        [expect.stringMatching(/^reengagement_inactive30d_/)],
      ]);
      expect(push.sendMulticast).toHaveBeenCalledWith(['tok-' + first[0].id], expect.any(String), expect.any(String), undefined, { event: 'reengagement', action: 'open_cards' });
      expect(push.sendMulticast).toHaveBeenCalledWith(['tok-b1'], expect.any(String), expect.any(String), undefined, { event: 'reengagement', action: 'open_explore' });
    });
  });

  describe('ClientWelcomeService', () => {
    it('filters day-3 clients with an active card in SQL and pages each step', async () => {
      const clientRepo = { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() };
      const svc = new ClientWelcomeService(clientRepo as never, rawRunner() as never, pushProvider() as never);

      await svc.sendWelcomeSeries();

      const wheres = clientRepo.findMany.mock.calls.map((c) => c[0].where);
      expect(wheres).toHaveLength(3);
      expect(wheres[0].loyaltyCards).toBeUndefined();
      expect(wheres[1].loyaltyCards).toEqual({ none: { deactivatedAt: null } });
      expect(wheres[2].loyaltyCards).toBeUndefined();
    });
  });

  describe('ClientRewardReminderService', () => {
    const card = (id: string, clientId: string, merchantId: string, stamps: number) => ({
      id,
      stamps,
      clientId,
      merchantId,
      merchant: { nom: `M-${merchantId}` },
      client: { pushToken: `tok-${clientId}`, language: 'fr' },
    });

    it('filters stamps > 0 in SQL and pushes each client once (first qualifying card)', async () => {
      const loyaltyCardRepo = {
        findMany: jest.fn().mockResolvedValueOnce([
          card('1', 'c1', 'm1', 2), // below 80% of 10 → skipped
          card('2', 'c1', 'm2', 9), // almost (9/10)
          card('3', 'c1', 'm1', 10), // c1 already handled
          card('4', 'c2', 'm1', 12), // available
        ]),
      };
      const rewardRepo = {
        findMany: jest.fn().mockResolvedValue([
          { merchantId: 'm1', titre: 'Café', cout: 10 },
          { merchantId: 'm2', titre: 'Thé', cout: 10 },
        ]),
      };
      const raw = rawRunner();
      const push = pushProvider();
      const svc = new ClientRewardReminderService({ updateMany: jest.fn() } as never, loyaltyCardRepo as never, rewardRepo as never, raw as never, push as never);

      await svc.sendRewardReminders();

      expect(loyaltyCardRepo.findMany.mock.calls[0][0].where.stamps).toEqual({ gt: 0 });
      const day = NOW.toISOString().slice(0, 10);
      expect(raw.queryRaw).toHaveBeenCalledTimes(1);
      expect(raw.queryRaw.mock.calls[0][2]).toEqual(['c1', 'c2']);
      expect(raw.queryRaw.mock.calls[0][3]).toEqual([`reward_stamps_almost_m2_${day}`, `reward_stamps_available_m1_${day}`]);
      expect(push.sendMulticast).toHaveBeenCalledTimes(2);
      expect(push.sendMulticast).toHaveBeenCalledWith(['tok-c1'], expect.any(String), expect.stringContaining('Plus que 1 tampon(s) chez M-m2'), undefined, { event: 'reward_reminder', action: 'open_card', merchantId: 'm2' });
    });
  });
});
