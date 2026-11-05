import { Logger } from '@nestjs/common';
import { type ClientPush, CLIENT_CAMPAIGN_CHUNK, clearStaleClientTokens, deliverClientPushes } from './client-campaign';

const logger = { log: jest.fn(), warn: jest.fn() } as unknown as Logger;

/** Raw runner whose claim INSERT "wins" only the pairs in `winners` (the rest conflict). */
function claimRunner(winners: (clientId: string, campaignId: string) => boolean) {
  return {
    queryRaw: jest.fn(async (_s: TemplateStringsArray, _ids: string[], clientIds: string[], campaignIds: string[]) =>
      clientIds
        .map((c, i) => ({ client_id: c, campaign_id: campaignIds[i] }))
        .filter((r) => winners(r.client_id, r.campaign_id))),
    executeRaw: jest.fn(),
  };
}

const push = (clientId: string, over: Partial<ClientPush> = {}): ClientPush => ({
  clientId,
  token: `tok-${clientId}`,
  campaignId: 'camp',
  title: 'T',
  body: 'B',
  data: { event: 'e' },
  ...over,
});

describe('deliverClientPushes', () => {
  const provider = { sendMulticast: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    provider.sendMulticast.mockResolvedValue({ successCount: 1, failureCount: 0, invalidTokens: [] });
  });

  it('claims first in bulk and only sends to the rows this run inserted', async () => {
    const raw = claimRunner((c) => c !== 'b');
    const res = await deliverClientPushes({ raw: raw as never, push: provider as never, logger }, [push('a'), push('b'), push('c')]);

    // One INSERT … ON CONFLICT DO NOTHING RETURNING for the batch, before any send.
    expect(raw.queryRaw).toHaveBeenCalledTimes(1);
    const sql = (raw.queryRaw.mock.calls[0][0] as unknown as string[]).join('?');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(sql).toContain('RETURNING client_id, campaign_id');
    expect(raw.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(provider.sendMulticast.mock.invocationCallOrder[0]);

    expect(res.claimed.map((p) => p.clientId)).toEqual(['a', 'c']);
    expect(provider.sendMulticast).toHaveBeenCalledTimes(1);
    expect(provider.sendMulticast).toHaveBeenCalledWith(['tok-a', 'tok-c'], 'T', 'B', undefined, { event: 'e' });
  });

  it('dedups by (client, campaign) and multicasts once per distinct message', async () => {
    const raw = claimRunner(() => true);
    const res = await deliverClientPushes({ raw: raw as never, push: provider as never, logger }, [
      push('a'),
      push('a'), // same pair twice → claimed once
      push('a', { campaignId: 'other', body: 'B2' }),
      push('b', { body: 'B2', campaignId: 'other' }),
    ]);

    const [, , clientIds, campaignIds] = raw.queryRaw.mock.calls[0];
    expect(clientIds).toEqual(['a', 'a', 'b']);
    expect(campaignIds).toEqual(['camp', 'other', 'other']);
    expect(res.claimed).toHaveLength(3);
    expect(provider.sendMulticast).toHaveBeenCalledTimes(2);
    expect(provider.sendMulticast).toHaveBeenCalledWith(['tok-a', 'tok-b'], 'T', 'B2', undefined, { event: 'e' });
  });

  it('claims in chunks of CLIENT_CAMPAIGN_CHUNK rows', async () => {
    const raw = claimRunner(() => true);
    const items = Array.from({ length: CLIENT_CAMPAIGN_CHUNK + 5 }, (_, i) => push(`c${i}`));
    const res = await deliverClientPushes({ raw: raw as never, push: provider as never, logger }, items);

    expect(raw.queryRaw).toHaveBeenCalledTimes(2);
    expect(raw.queryRaw.mock.calls[1][2]).toHaveLength(5);
    expect(res.claimed).toHaveLength(CLIENT_CAMPAIGN_CHUNK + 5);
  });

  it('fails closed: a claim error sends nothing for that chunk', async () => {
    const raw = { queryRaw: jest.fn().mockRejectedValue(new Error('db down')), executeRaw: jest.fn() };
    const res = await deliverClientPushes({ raw: raw as never, push: provider as never, logger }, [push('a')]);

    expect(res.claimed).toEqual([]);
    expect(provider.sendMulticast).not.toHaveBeenCalled();
  });

  it('collects invalid tokens and survives a failed multicast', async () => {
    const raw = claimRunner(() => true);
    provider.sendMulticast
      .mockResolvedValueOnce({ successCount: 0, failureCount: 1, invalidTokens: ['tok-a'] })
      .mockRejectedValueOnce(new Error('fcm'));
    const res = await deliverClientPushes({ raw: raw as never, push: provider as never, logger }, [push('a'), push('b', { body: 'X' })]);

    expect(res.staleTokens).toEqual(['tok-a']);
    expect(res.claimed).toHaveLength(2);
  });

  it('does nothing for an empty batch', async () => {
    const raw = claimRunner(() => true);
    await expect(deliverClientPushes({ raw: raw as never, push: provider as never, logger }, [])).resolves.toEqual({ claimed: [], staleTokens: [] });
    expect(raw.queryRaw).not.toHaveBeenCalled();
  });
});

describe('clearStaleClientTokens', () => {
  it('dedups and clears tokens in chunks', async () => {
    const repo = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    const tokens = Array.from({ length: CLIENT_CAMPAIGN_CHUNK + 1 }, (_, i) => `t${i}`);
    await clearStaleClientTokens(repo as never, [...tokens, 't0'], logger);

    expect(repo.updateMany).toHaveBeenCalledTimes(2);
    expect(repo.updateMany.mock.calls[1][0]).toEqual({ where: { pushToken: { in: [`t${CLIENT_CAMPAIGN_CHUNK}`] } }, data: { pushToken: null } });
  });
});
