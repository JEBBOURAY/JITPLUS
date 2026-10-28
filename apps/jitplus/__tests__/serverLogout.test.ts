import { api } from '@/services/api';
import { notifyServerLogout } from '@/services/serverLogout';

jest.mock('@/services/api', () => ({
  api: { updatePushToken: jest.fn(), logout: jest.fn() },
}));

const updatePushToken = api.updatePushToken as jest.Mock;
const logout = api.logout as jest.Mock;

describe('notifyServerLogout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    updatePushToken.mockResolvedValue({ success: true });
    logout.mockResolvedValue(undefined);
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('clears the push token before revoking the session', async () => {
    const order: string[] = [];
    updatePushToken.mockImplementation(async () => { order.push('push'); return { success: true }; });
    logout.mockImplementation(async () => { order.push('logout'); });
    await notifyServerLogout();
    expect(updatePushToken).toHaveBeenCalledWith('');
    expect(order).toEqual(['push', 'logout']);
  });

  it('retries the logout call once after a failure', async () => {
    logout.mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce(undefined);
    const p = notifyServerLogout();
    await jest.advanceTimersByTimeAsync(1000);
    await p;
    expect(logout).toHaveBeenCalledTimes(2);
  });

  it('gives up at the deadline when the network hangs', async () => {
    updatePushToken.mockReturnValue(new Promise(() => {}));
    const p = notifyServerLogout(4000);
    let done = false;
    p.then(() => { done = true; });
    await jest.advanceTimersByTimeAsync(3999);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    expect(logout).not.toHaveBeenCalled();
  });

  it('starts no retry once the deadline has passed', async () => {
    logout.mockRejectedValue(new Error('offline'));
    const p = notifyServerLogout(500);
    await jest.advanceTimersByTimeAsync(500);
    await p;
    await jest.advanceTimersByTimeAsync(2000);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('never rejects, even when every call fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    updatePushToken.mockRejectedValue(new Error('x'));
    logout.mockRejectedValue(new Error('y'));
    const p = notifyServerLogout();
    await jest.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBeUndefined();
  });
});
