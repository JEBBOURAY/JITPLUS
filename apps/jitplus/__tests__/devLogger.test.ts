import { logApiError, logApiResponse } from '@jitplus/shared/src/devLogger';

/**
 * Dev console noise seen on 2026-11-21: with the backend still starting, a
 * network error showed as two red errors with stack traces, and every request
 * replayed after a token refresh was logged twice.
 */
describe('dev API logging', () => {
  let log: jest.SpyInstance, warn: jest.SpyInstance, error: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('logs a retried response once', () => {
    const res = { status: 200, config: { method: 'get', url: '/client/stamps' } };
    logApiResponse('API', res);
    logApiResponse('API', res);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0].join(' ')).toContain('GET /client/stamps → 200');
  });

  it('reports an unreachable server as one warning, not an error', () => {
    const err = Object.assign(new Error('Network Error'), { config: { method: 'get', url: '/client-auth/profile' } });
    logApiError('API', err);
    logApiError('API', err);
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0].join(' ')).toContain('GET /client-auth/profile → NETWORK_ERROR');
  });

  it('still reports a server error as an error, once', () => {
    const err = Object.assign(new Error('Request failed'), {
      config: { method: 'post', url: '/x' },
      response: { status: 500, data: { message: 'boom' } },
    });
    logApiError('API', err);
    logApiError('API', err);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0].join(' ')).toContain('POST /x → 500');
  });
});
