import { getErrorMessage, getErrorStatus, isNetworkError } from '@jitplus/shared';

const axiosError = (fields: Record<string, unknown>) => ({ isAxiosError: true, message: 'Request failed', ...fields });

describe('isNetworkError', () => {
  it('is true when the server never answered', () => {
    expect(isNetworkError(axiosError({ message: 'Network Error' }))).toBe(true);
    expect(isNetworkError(axiosError({ code: 'ECONNABORTED', response: { status: 0 } }))).toBe(true);
    expect(isNetworkError(axiosError({ code: 'ERR_NETWORK', response: { status: 0 } }))).toBe(true);
    expect(isNetworkError(axiosError({}))).toBe(true); // no response at all
  });

  it('is false for an HTTP error response or a non-Axios error', () => {
    expect(isNetworkError(axiosError({ response: { status: 409 } }))).toBe(false);
    expect(isNetworkError(new Error('boom'))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe('getErrorMessage (unchanged behaviour)', () => {
  it('falls back on network errors', () => {
    expect(getErrorMessage(axiosError({ message: 'Network Error' }), 'fallback')).toBe('fallback');
  });

  it('uses the server message on HTTP errors', () => {
    const error = axiosError({ response: { status: 409, data: { message: 'Un compte commerçant avec cet email existe déjà' } } });
    expect(getErrorMessage(error, 'fallback')).toBe('Un compte commerçant avec cet email existe déjà');
    expect(getErrorStatus(error)).toBe(409);
  });
});
