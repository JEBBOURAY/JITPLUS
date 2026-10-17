import { NotFoundException } from '@nestjs/common';
import { AdminDetailsService } from './admin-details.service';
import { moroccoParts } from '../common/utils/morocco-time';

type Sql = TemplateStringsArray;

/** Route each raw query to a fixture by a marker found in its SQL text. */
function makeRunner(fixtures: { match: string; rows: unknown[] }[]) {
  return {
    queryRaw: jest.fn(async (strings: Sql) => {
      const sql = strings.join('?');
      const hit = fixtures.find((f) => sql.includes(f.match));
      return hit ? hit.rows : [];
    }),
    executeRaw: jest.fn(),
  };
}

function makeCache() {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(async (k: string) => store.get(k)),
    set: jest.fn(async (k: string, v: unknown) => { store.set(k, v); }),
  };
}

const today = () => moroccoParts(new Date()).ymd;

describe('AdminDetailsService', () => {
  describe('getAlerts', () => {
    it('normalises counts and computes the 24 h notification success rate', async () => {
      const runner = makeRunner([
        {
          match: 'AS payouts_pending',
          rows: [{
            payouts_pending: 2n, payouts_amount: '150.50', referrals_pending: 1n, trials_ending: 3n, paid_ending: 0n,
            stuck_new_merchants: 4n, new_merchants_24h: 1n, new_clients_24h: 5n, notif_recipients_24h: 200n,
            notif_success_24h: 150n, cancelled_24h: 0n, tx_24h: 40n,
          }],
        },
      ]);
      const svc = new AdminDetailsService(runner as never, makeCache() as never);

      const r = (await svc.getAlerts()) as any;

      expect(r).toMatchObject({
        payoutsPending: 2,
        payoutsPendingAmount: 150.5,
        trialsEnding7d: 3,
        stuckNewMerchants: 4,
        notifRecipients24h: 200,
        notifSuccessRate24h: 75,
        transactions24h: 40,
      });
    });

    it('reports no success rate when nothing was sent, and serves the next call from cache', async () => {
      const runner = makeRunner([{ match: 'AS payouts_pending', rows: [{ notif_recipients_24h: 0n, notif_success_24h: 0n }] }]);
      const cache = makeCache();
      const svc = new AdminDetailsService(runner as never, cache as never);

      const first = (await svc.getAlerts()) as any;
      expect(first.notifSuccessRate24h).toBeNull();
      expect(first.payoutsPending).toBe(0);

      await svc.getAlerts();
      expect(runner.queryRaw).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledWith('admin:alerts', expect.any(Object), expect.any(Number));
    });
  });

  describe('getMerchantActivity', () => {
    it('throws NotFound for an unknown merchant', async () => {
      const svc = new AdminDetailsService(makeRunner([]) as never, makeCache() as never);
      await expect(svc.getMerchantActivity('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('builds 90 daily buckets, the profile score and the cancel rate', async () => {
      const runner = makeRunner([
        {
          match: 'AS has_logo',
          rows: [{
            id: 'm1', stamps_for_reward: 10, stamp_earning_mode: 'PER_VISIT', amount_per_stamp: null, accumulation_limit: null,
            stamp_validity_days: null, language: 'fr', onboarding_completed: true, email_verified: true,
            has_logo: true, has_cover: false, has_location: true, has_description: true, has_hours: false,
            has_socials: false, has_push: true, gallery_count: 2, referrals: 1n, deleted_at: new Date('2024-05-01T10:00:00Z'),
          }],
        },
        { match: 'AS stamps_given', rows: [{ total: 90n, cancelled: 10n, earn: 80n, redeem: 10n, amount: '99.6', last30: 12n, prev30: 6n }] },
        { match: 'AS reward_ready', rows: [{ total: 20n, active: 18n, returning: 5n, avg_stamps: '3.456' }] },
        { match: "'newCards'", rows: [{ k: 'transactions', d: today(), n: 4n }, { k: 'newCards', d: '1999-01-01', n: 9n }] },
        { match: 'AS redeemed', rows: [{ id: 'r1', titre: 'Café offert', cout: 10, redeemed: 3n }] },
      ]);
      const svc = new AdminDetailsService(runner as never, makeCache() as never);

      const r = await svc.getMerchantActivity('m1');

      expect(r.daily).toHaveLength(90);
      expect(r.daily[89]).toEqual({ date: today(), transactions: 4, clients: 0, newCards: 0 });
      expect(r.daily.every((d) => d.newCards === 0)).toBe(true);
      // logo, location, description, reward, push = 5 of 8 checks
      expect(r.profile.score).toBe(63);
      expect(r.transactions.cancelRate).toBe(10);
      expect(r.transactions.amount).toBe(100);
      expect(r.clients.returningRate).toBe(25);
      expect(r.clients.avgStamps).toBe(3.5);
      expect(r.rewards).toEqual([{ id: 'r1', titre: 'Café offert', cout: 10, redeemed: 3 }]);
      expect(r.settings.deletedAt).toBe('2024-05-01T10:00:00.000Z');
    });
  });

  describe('getClientActivity', () => {
    it('throws NotFound for an unknown client', async () => {
      const svc = new AdminDetailsService(makeRunner([]) as never, makeCache() as never);
      await expect(svc.getClientActivity('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps cards and the notification read rate', async () => {
      const runner = makeRunner([
        { match: 'AS has_push', rows: [{ id: 'c1', is_anonymous: false, has_push: true, language: null }] },
        {
          match: 'AS last_tx_at',
          rows: [{
            id: 'lc1', merchant_id: 'm1', nom: 'Café', categorie: 'CAFE', stamps: 4, stamps_for_reward: 8, visits: 6n,
            last_tx_at: null, last_visit_at: '2024-03-02T08:00:00Z', deactivated_at: null, created_at: '2024-01-01T00:00:00Z',
          }],
        },
        { match: 'AS notif_received', rows: [{ notif_received: 8n, notif_read: 2n, referrals: 1n }] },
      ]);
      const svc = new AdminDetailsService(runner as never, makeCache() as never);

      const r = await svc.getClientActivity('c1');

      expect(r.pushReachable).toBe(true);
      expect(r.language).toBe('fr');
      expect(r.cards[0]).toMatchObject({ stamps: 4, stampsForReward: 8, visits: 6, lastVisitAt: '2024-03-02T08:00:00.000Z' });
      expect(r.notifications).toEqual({ received: 8, read: 2, readRate: 25 });
      expect(r.referrals).toBe(1);
    });
  });

  describe('getNotificationStats', () => {
    it('fills one bucket per day and caches per period', async () => {
      const runner = makeRunner([
        { match: 'AS failure', rows: [{ channel: 'PUSH', campaigns: 3n, recipients: 100n, success: 90n, failure: 10n }] },
        { match: 'AS campaigns_prev', rows: [{ campaigns: 3n, campaigns_prev: 1n, recipients: 100n, delivered_inbox: 50n, read_inbox: 20n }] },
        { match: "'YYYY-MM-DD') AS d", rows: [{ d: today(), campaigns: 2n, recipients: 60n, success: 55n }] },
      ]);
      const cache = makeCache();
      const svc = new AdminDetailsService(runner as never, cache as never);

      const r = (await svc.getNotificationStats(7)) as any;

      expect(r.daily).toHaveLength(7);
      expect(r.daily[6]).toEqual({ date: today(), campaigns: 2, recipients: 60, success: 55 });
      expect(r.totals).toMatchObject({ campaigns: 3, campaignsPrev: 1, recipients: 100, success: 90, successRate: 90, readRate: 40 });
      expect(r.channels[0]).toMatchObject({ channel: 'PUSH', successRate: 90 });

      const calls = runner.queryRaw.mock.calls.length;
      await svc.getNotificationStats(7);
      expect(runner.queryRaw.mock.calls.length).toBe(calls);
      expect(cache.set).toHaveBeenCalledWith('admin:notif-stats:7', expect.any(Object), expect.any(Number));
    });
  });

  it('skips the query when enriching an empty list', async () => {
    const runner = makeRunner([]);
    const svc = new AdminDetailsService(runner as never, makeCache() as never);

    expect((await svc.merchantActivityByIds([])).size).toBe(0);
    expect((await svc.clientActivityByIds([])).size).toBe(0);
    expect(runner.queryRaw).not.toHaveBeenCalled();
  });
});
