import { api } from '@/services/api';
import { loadProfile } from '@/services/profileLoad';

jest.mock('@/services/api', () => ({ api: { getProfile: jest.fn() } }));

const getProfile = api.getProfile as jest.Mock;
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status } });

describe('loadProfile', () => {
  beforeEach(() => getProfile.mockReset());

  it('returns the profile when it has an id', async () => {
    getProfile.mockResolvedValue({ id: 'c1', prenom: 'Sara' });
    expect(await loadProfile()).toEqual({ status: 'ok', profile: { id: 'c1', prenom: 'Sara' } });
  });

  it('reports an answer without a profile', async () => {
    getProfile.mockResolvedValue(null);
    expect(await loadProfile()).toEqual({ status: 'empty' });
    getProfile.mockResolvedValue({});
    expect(await loadProfile()).toEqual({ status: 'empty' });
  });

  it('tells a dead session (401) from other HTTP errors', async () => {
    getProfile.mockRejectedValue(httpError(401));
    expect((await loadProfile()).status).toBe('unauthorized');
    getProfile.mockRejectedValue(httpError(403));
    expect((await loadProfile()).status).toBe('failed');
    getProfile.mockRejectedValue(httpError(500));
    expect((await loadProfile()).status).toBe('failed');
  });

  it('treats a request without an answer as offline (retryable)', async () => {
    const timeout = Object.assign(new Error('timeout'), { isAxiosError: true, code: 'ECONNABORTED' });
    getProfile.mockRejectedValue(timeout);
    expect(await loadProfile()).toEqual({ status: 'offline', error: timeout });
    getProfile.mockRejectedValue(new Error('boom'));
    expect((await loadProfile()).status).toBe('offline');
  });
});
