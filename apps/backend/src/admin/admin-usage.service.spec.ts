import { AdminUsageService } from './admin-usage.service';

type Sql = TemplateStringsArray;

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

const merchant = (over: Record<string, unknown> = {}) => ({
  id: 'm1', nom: 'Café', email: 'c@x.ma', phone: null, ville: 'Rabat', categorie: 'CAFE',
  plan: 'PREMIUM', admin_plan: true, premium_grant: 'PAID', expires_at: null,
  created_at: new Date('2026-10-01T00:00:00Z'), onboarded: true, clients: 12n, last_app_at: null,
  stores: 2n, per_amount: false, stamp_expiry: true, welcome_on: true, booking_on: false,
  has_reward: true, has_team: false, scratch_live: false, wheel_live: true, collection_live: false, deal_live: false,
  ...over,
});

describe('AdminUsageService', () => {
  it('merges event rows into each merchant and lists what is switched on', async () => {
    const last = new Date('2026-11-20T10:00:00Z');
    const runner = makeRunner([
      { match: 'FROM merchants m', rows: [merchant(), merchant({ id: 'm2', plan: 'FREE', stores: 1n })] },
      {
        match: 'GROUP BY merchant_id, f',
        rows: [
          { merchant_id: 'm1', f: 'stamps', cur: 40n, prev: 10n, ever: 300n, last_at: last },
          { merchant_id: 'm1', f: 'wheel', cur: 0n, prev: 3n, ever: 3n, last_at: last },
          { merchant_id: 'm1', f: 'unknown', cur: 1n, prev: 0n, ever: 1n, last_at: last },
        ],
      },
    ]);
    const svc = new AdminUsageService(runner as never, makeCache() as never);

    const r = (await svc.getUsage(30)) as any;

    expect(r.merchants).toHaveLength(2);
    const m1 = r.merchants[0];
    expect(m1.planKind).toBe('PAID');
    expect(m1.clients).toBe(12);
    expect(m1.usage.stamps).toEqual({ n: 40, prev: 10, ever: 300, last: last.toISOString() });
    expect(m1.usage.wheel.n).toBe(0);
    expect(m1.usage).not.toHaveProperty('unknown');
    expect(m1.live).toEqual(['rewards', 'welcome', 'wheel']);
    expect(m1.settings).toEqual({ perAmount: false, stampExpiry: true, multiStore: true });
    expect(r.merchants[1]).toMatchObject({ planKind: 'FREE', usage: {}, settings: { multiStore: false } });
    expect(r.truncated).toBe(false);
  });

  it('caches per period', async () => {
    const runner = makeRunner([]);
    const cache = makeCache();
    const svc = new AdminUsageService(runner as never, cache as never);

    await svc.getUsage(7);
    await svc.getUsage(7);
    expect(runner.queryRaw).toHaveBeenCalledTimes(2);
    await svc.getUsage(90);
    expect(runner.queryRaw).toHaveBeenCalledTimes(4);
    expect(cache.set).toHaveBeenCalledWith('admin:usage:90', expect.any(Object), expect.any(Number));
  });
});
