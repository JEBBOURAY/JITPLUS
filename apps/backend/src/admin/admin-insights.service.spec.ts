import { AdminInsightsService } from './admin-insights.service';
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

describe('AdminInsightsService', () => {
  it('normalises bigint counts and computes rates', async () => {
    const runner = makeRunner([
      { match: 'AS funnel_paid', rows: [{ total: 10n, paid: 2n, trial_active: 3n, trials_finished: 4n, trials_converted: 1n, with_reward: 8n, funnel_tx: 6n }] },
      { match: 'AS push_reachable', rows: [{ registered: 20n, active_prev: 10n, retained: 4n }] },
      { match: 'AS merchant_mau', rows: [{ dau: 5n, mau: 20n }] },
      { match: 'AS amount_tracked_prev', rows: [{ total: 95n, cancelled: 5n, amount_tracked: '1234.6' }] },
    ]);
    const svc = new AdminInsightsService(runner as never, makeCache() as never);

    const r = (await svc.getInsights(30)) as any;

    expect(r.merchants.total).toBe(10);
    expect(r.merchants.plans.free).toBe(5);
    expect(r.merchants.plans.trialConversionRate).toBe(25);
    expect(r.merchants.funnel).toMatchObject({ registered: 10, withReward: 8, firstTransaction: 6 });
    expect(r.clients.retentionRate).toBe(40);
    expect(r.activity.stickiness).toBe(25);
    expect(r.transactions.cancelRate).toBe(5);
    expect(r.transactions.amountTracked).toBe(1235);
  });

  it('builds one daily bucket per day and a 7×24 heatmap', async () => {
    const today = moroccoParts(new Date()).ymd;
    const runner = makeRunner([
      { match: "'activeClients'", rows: [{ k: 'transactions', d: today, n: 7n }, { k: 'clients', d: '1999-01-01', n: 3n }] },
      { match: 'ISODOW', rows: [{ dow: 3, h: 14, n: 9n }, { dow: 9, h: 2, n: 1n }] },
    ]);
    const svc = new AdminInsightsService(runner as never, makeCache() as never);

    const r = (await svc.getInsights(7)) as any;

    expect(r.daily).toHaveLength(7);
    expect(r.daily[6]).toEqual({ date: today, merchants: 0, clients: 0, transactions: 7, activeClients: 0 });
    expect(r.daily.every((p: { clients: number }) => p.clients === 0)).toBe(true);
    expect(r.heatmap).toHaveLength(7);
    expect(r.heatmap[2][14]).toBe(9);
    expect(r.heatmap.flat().reduce((a: number, b: number) => a + b, 0)).toBe(9);
  });

  it('serves repeated calls for the same period from cache', async () => {
    const runner = makeRunner([]);
    const cache = makeCache();
    const svc = new AdminInsightsService(runner as never, cache as never);

    await svc.getInsights(30);
    const callsAfterFirst = runner.queryRaw.mock.calls.length;
    await svc.getInsights(30);
    expect(runner.queryRaw.mock.calls.length).toBe(callsAfterFirst);

    await svc.getInsights(90);
    expect(runner.queryRaw.mock.calls.length).toBe(callsAfterFirst * 2);
    expect(cache.set).toHaveBeenCalledWith('admin:insights:90', expect.any(Object), expect.any(Number));
  });
});
