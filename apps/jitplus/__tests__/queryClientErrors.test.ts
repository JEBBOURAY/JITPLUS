import * as Sentry from '@sentry/react-native';

jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));

import { isClientNetworkError, isServerOrNetworkError } from '@/services/queryClient';

const axiosError = (code: string, message = code) => Object.assign(new Error(message), { code, isAxiosError: true });
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

describe('isClientNetworkError', () => {
  it('matches axios errors with no response and a network code', () => {
    expect(isClientNetworkError(axiosError('ECONNABORTED', 'timeout of 15000ms exceeded'))).toBe(true);
    expect(isClientNetworkError(axiosError('ETIMEDOUT'))).toBe(true);
    expect(isClientNetworkError(axiosError('ERR_NETWORK', 'Network Error'))).toBe(true);
    expect(isClientNetworkError(axiosError('ERR_CANCELED'))).toBe(true);
  });

  it('does not match server responses or plain errors', () => {
    expect(isClientNetworkError(httpError(500))).toBe(false);
    expect(isClientNetworkError(Object.assign(httpError(504), { code: 'ERR_BAD_RESPONSE' }))).toBe(false);
    expect(isClientNetworkError(new Error('boom'))).toBe(false);
    expect(isClientNetworkError(null)).toBe(false);
  });
});

describe('isServerOrNetworkError (Sentry reporting predicate)', () => {
  it('skips the user\'s own connectivity failures', () => {
    expect(isServerOrNetworkError(axiosError('ECONNABORTED', 'timeout of 15000ms exceeded'))).toBe(false);
    expect(isServerOrNetworkError(axiosError('ERR_NETWORK', 'Network Error'))).toBe(false);
  });

  it('skips expected 4xx and gateway statuses', () => {
    expect(isServerOrNetworkError(httpError(401))).toBe(false);
    expect(isServerOrNetworkError(httpError(404))).toBe(false);
    expect(isServerOrNetworkError(httpError(502))).toBe(false);
    expect(isServerOrNetworkError(httpError(503))).toBe(false);
    expect(isServerOrNetworkError(httpError(504))).toBe(false);
  });

  it('still reports API 5xx and unknown errors', () => {
    expect(isServerOrNetworkError(httpError(500))).toBe(true);
    expect(isServerOrNetworkError(new Error('Unexpected token < in JSON'))).toBe(true);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
