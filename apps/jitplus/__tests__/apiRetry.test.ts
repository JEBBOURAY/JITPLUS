import type { AxiosAdapter, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { createApiClient, shouldAutoRetry } from '@jitplus/shared/src/apiFactory';

describe('shouldAutoRetry', () => {
  it('retries reads on network errors and 5xx', () => {
    expect(shouldAutoRetry({ method: 'get' }, undefined)).toBe(true);
    expect(shouldAutoRetry({ method: 'GET' }, 503)).toBe(true);
    expect(shouldAutoRetry({ method: 'head' }, 502)).toBe(true);
  });

  it('never retries client errors', () => {
    expect(shouldAutoRetry({ method: 'get' }, 400)).toBe(false);
    expect(shouldAutoRetry({ method: 'get' }, 404)).toBe(false);
  });

  it('does not replay plain writes after a timeout or a 5xx', () => {
    expect(shouldAutoRetry({ method: 'post' }, undefined)).toBe(false);
    expect(shouldAutoRetry({ method: 'post' }, 504)).toBe(false);
    expect(shouldAutoRetry({ method: 'patch' }, 500)).toBe(false);
    expect(shouldAutoRetry({ method: 'delete' }, undefined)).toBe(false);
  });

  it('replays writes the backend de-duplicates', () => {
    expect(shouldAutoRetry({ method: 'post', idempotent: true }, 504)).toBe(true);
    expect(shouldAutoRetry({ method: 'post', headers: { 'Idempotency-Key': 'abc' } }, undefined)).toBe(true);
    expect(shouldAutoRetry({ method: 'post', headers: { 'Idempotency-Key': '  ' } }, 500)).toBe(false);
  });

  it('retries any method on 429', () => {
    expect(shouldAutoRetry({ method: 'post' }, 429)).toBe(true);
  });
});

describe('createApiClient retry interceptor', () => {
  function client() {
    return createApiClient({
      envUrl: 'http://api.test',
      isDev: true,
      timeout: 1000,
      getToken: async () => null,
      setToken: async () => {},
      refreshToken: async () => { throw new Error('unused'); },
      onAuthFailure: () => {},
    });
  }

  function failingAdapter(status: number) {
    const calls: string[] = [];
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      calls.push(String(config.method));
      const error = new Error(`HTTP ${status}`) as AxiosError;
      error.config = config;
      error.isAxiosError = true;
      error.response = { status, data: {}, headers: {}, statusText: '', config } as AxiosError['response'];
      throw error;
    };
    return { adapter, calls };
  }

  it('sends a failing POST only once', async () => {
    const { adapter, calls } = failingAdapter(504);
    await expect(client().post('/client/referral/payout', { amount: 100 }, { adapter })).rejects.toThrow();
    expect(calls).toEqual(['post']);
  });

  it('retries a failing GET once', async () => {
    const { adapter, calls } = failingAdapter(503);
    await expect(client().get('/client/referral', { adapter })).rejects.toThrow();
    expect(calls).toEqual(['get', 'get']);
  });

  it('retries a POST marked idempotent', async () => {
    const { adapter, calls } = failingAdapter(502);
    await expect(client().post('/scratch/client/cards/c1/scratch', undefined, { adapter, idempotent: true })).rejects.toThrow();
    expect(calls).toEqual(['post', 'post']);
  });
});
