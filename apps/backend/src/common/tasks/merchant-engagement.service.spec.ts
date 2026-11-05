import { MerchantEngagementService } from './merchant-engagement.service';

describe('MerchantEngagementService.lastScans', () => {
  it('reads one latest scan per merchant through a LATERAL, 1000 merchants per query', async () => {
    const at = new Date('2026-10-01T10:00:00Z');
    const raw = {
      queryRaw: jest.fn(async (_s: TemplateStringsArray, ids: string[]) =>
        ids.filter((id) => id !== 'm1').map((id) => ({ merchant_id: id, last_scan_at: at }))),
      executeRaw: jest.fn(),
    };
    const svc = new MerchantEngagementService({} as never, raw as never, {} as never);
    const ids = Array.from({ length: 1001 }, (_, i) => `m${i}`);

    const map = await svc.lastScans(ids);

    expect(raw.queryRaw).toHaveBeenCalledTimes(2);
    const sql = (raw.queryRaw.mock.calls[0][0] as unknown as string[]).join('?');
    expect(sql).toContain('CROSS JOIN LATERAL');
    expect(sql).toContain('ORDER BY t.created_at DESC');
    expect(sql).toContain('LIMIT 1');
    expect(map.size).toBe(1000);
    expect(map.has('m1')).toBe(false); // never scanned
    expect(map.get('m1000')).toBe(at);
  });
});
