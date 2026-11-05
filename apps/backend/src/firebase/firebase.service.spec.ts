import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FirebaseService,
  EXPO_CHUNK_CONCURRENCY,
  EXPO_MAX_RETRIES,
  EXPO_TIMEOUT_MS,
} from './firebase.service';

type FakeResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get: (k: string) => string | null };
  json: () => Promise<unknown>;
};

function res(status: number, body?: unknown, headers: Record<string, string> = {}): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
  };
}

const okTickets = (n: number) => ({ data: Array.from({ length: n }, () => ({ status: 'ok', id: 'x' })) });
const expoTokens = (n: number) => Array.from({ length: n }, (_, i) => `ExponentPushToken[t${i}]`);
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body) as Array<{ to: string }>;

describe('FirebaseService — Expo push', () => {
  let service: FirebaseService;
  let fetchMock: jest.Mock;
  let sleepMock: jest.Mock;
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    service = new FirebaseService({ get: () => undefined } as unknown as ConfigService);
    sleepMock = jest.fn().mockResolvedValue(undefined);
    (service as unknown as { sleep: jest.Mock }).sleep = sleepMock;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('sends chunks of 100 with bounded concurrency and preserves counts and invalid-token order', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      const msgs = JSON.parse(init.body) as Array<{ to: string }>;
      return res(200, {
        data: msgs.map((m) =>
          /t(5|150|420)\]$/.test(m.to)
            ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
            : /t7\]$/.test(m.to)
              ? { status: 'error', details: { error: 'MessageRateExceeded' } }
              : { status: 'ok' },
        ),
      });
    });

    const result = await service.sendMulticast(expoTokens(950), 'T', 'B');

    expect(fetchMock).toHaveBeenCalledTimes(10);
    for (const call of fetchMock.mock.calls) expect(bodyOf(call).length).toBeLessThanOrEqual(100);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(EXPO_CHUNK_CONCURRENCY);
    expect(result).toEqual({
      successCount: 946,
      failureCount: 4,
      invalidTokens: ['ExponentPushToken[t5]', 'ExponentPushToken[t150]', 'ExponentPushToken[t420]'],
    });
  });

  it('passes a per-attempt timeout signal to fetch', async () => {
    fetchMock.mockResolvedValue(res(200, okTickets(1)));
    await service.sendMulticast(expoTokens(1), 'T', 'B');
    const init = fetchMock.mock.calls[0][1] as { signal?: AbortSignal };
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(EXPO_TIMEOUT_MS).toBe(10_000);
  });

  it('retries a 429 and honours Retry-After', async () => {
    fetchMock
      .mockResolvedValueOnce(res(429, undefined, { 'retry-after': '2' }))
      .mockResolvedValueOnce(res(200, okTickets(3)));

    const result = await service.sendMulticast(expoTokens(3), 'T', 'B');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(2000);
    expect(result).toEqual({ successCount: 3, failureCount: 0, invalidTokens: [] });
  });

  it('retries 5xx with exponential backoff + jitter, then fails the chunk after the retry budget', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    fetchMock.mockResolvedValue(res(503));

    const result = await service.sendMulticast(expoTokens(4), 'T', 'B');

    expect(fetchMock).toHaveBeenCalledTimes(EXPO_MAX_RETRIES + 1);
    expect(sleepMock.mock.calls.map((c) => c[0])).toEqual([500, 1000]);
    expect(result).toEqual({ successCount: 0, failureCount: 4, invalidTokens: [] });
  });

  it('keeps backoff jitter within [50%, 100%] of the exponential step', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    fetchMock.mockResolvedValue(res(500));
    await service.sendMulticast(expoTokens(1), 'T', 'B');
    expect(sleepMock.mock.calls.map((c) => c[0])).toEqual([250, 500]);
  });

  it('retries network errors and timeouts', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(res(200, okTickets(2)));

    const result = await service.sendMulticast(expoTokens(2), 'T', 'B');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ successCount: 2, failureCount: 0, invalidTokens: [] });
  });

  it('does not retry non-429 4xx', async () => {
    fetchMock.mockResolvedValue(res(400));
    const result = await service.sendMulticast(expoTokens(2), 'T', 'B');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.failureCount).toBe(2);
  });

  it('only fails the affected chunk when one chunk exhausts retries', async () => {
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      const msgs = JSON.parse(init.body) as Array<{ to: string }>;
      if (msgs[0].to === 'ExponentPushToken[t100]') return res(502);
      return res(200, okTickets(msgs.length));
    });
    const result = await service.sendMulticast(expoTokens(250), 'T', 'B');
    expect(result).toEqual({ successCount: 150, failureCount: 100, invalidTokens: [] });
  });

  it('treats malformed 2xx bodies as failures without throwing or retrying', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS' }] }));
    expect(await service.sendMulticast(expoTokens(2), 'T', 'B')).toEqual({
      successCount: 0,
      failureCount: 2,
      invalidTokens: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(res(200)); // invalid JSON
    expect((await service.sendMulticast(expoTokens(3), 'T', 'B')).failureCount).toBe(3);

    // Short ticket array: missing tickets count as failures.
    fetchMock.mockResolvedValueOnce(res(200, { data: [{ status: 'ok' }, null] }));
    expect(await service.sendMulticast(expoTokens(3), 'T', 'B')).toEqual({
      successCount: 1,
      failureCount: 2,
      invalidTokens: [],
    });
  });

  describe('sendToMerchant (Expo)', () => {
    it('flags DeviceNotRegistered as invalid', async () => {
      fetchMock.mockResolvedValue(res(200, { data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }));
      await expect(service.sendToMerchant('ExponentPushToken[m]', 'T', 'B')).resolves.toEqual({ invalidToken: true });
    });

    it('guards an empty ticket array', async () => {
      fetchMock.mockResolvedValue(res(200, { data: [] }));
      await expect(service.sendToMerchant('ExponentPushToken[m]', 'T', 'B')).resolves.toEqual({ invalidToken: false });
    });

    it('retries then gives up without throwing', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      await expect(service.sendToMerchant('ExponentPushToken[m]', 'T', 'B')).resolves.toEqual({ invalidToken: false });
      expect(fetchMock).toHaveBeenCalledTimes(EXPO_MAX_RETRIES + 1);
    });
  });
});
