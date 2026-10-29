import { createAuthMethods, resetPushTokenDedup } from '@/services/api/auth';

jest.mock('@/services/api/storage', () => ({ persistTokens: jest.fn() }));

function setup() {
  const patch = jest.fn().mockResolvedValue({ data: { success: true } });
  const methods = createAuthMethods({ patch } as never);
  return { patch, methods };
}

describe('updatePushToken dedup', () => {
  let now = 1_000_000;

  beforeEach(() => {
    resetPushTokenDedup();
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => jest.restoreAllMocks());

  it('sends a token once and skips exact repeats', async () => {
    const { patch, methods } = setup();
    await methods.updatePushToken('T1');
    now += 60_000;
    await methods.updatePushToken('T1');
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it('collapses a burst of different tokens within 10s', async () => {
    const { patch, methods } = setup();
    await methods.updatePushToken('T1');
    now += 5_000;
    await methods.updatePushToken('T2');
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it('always sends the unregister call, even right after registering', async () => {
    const { patch, methods } = setup();
    await methods.updatePushToken('T1');
    now += 1_000;
    await methods.updatePushToken('');
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch).toHaveBeenLastCalledWith('/client-auth/push-token', { pushToken: '' });
  });

  it('re-sends the same token for the next account after a reset', async () => {
    const { patch, methods } = setup();
    await methods.updatePushToken('T1');
    resetPushTokenDedup();
    now += 1_000;
    await methods.updatePushToken('T1');
    expect(patch).toHaveBeenCalledTimes(2);
  });

  it('lets a retry through after a failed request', async () => {
    const { patch, methods } = setup();
    patch.mockRejectedValueOnce(new Error('Network Error'));
    await expect(methods.updatePushToken('T1')).rejects.toThrow('Network Error');
    now += 2_000;
    await methods.updatePushToken('T1');
    expect(patch).toHaveBeenCalledTimes(2);
  });
});
