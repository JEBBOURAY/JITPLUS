import * as SecureStore from 'expo-secure-store';
import { clearAuth, getStoredToken, persistSession, persistTokens, setRememberMe } from '@/services/api/storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));

const setItem = SecureStore.setItemAsync as jest.Mock;
const writtenKeys = () => setItem.mock.calls.map(([key]) => key);

// Forgot-password flow: the OTP session must not reach the disk before the
// new password is saved, so killing the app midway leaves the user logged out.
describe('forgot-password session storage', () => {
  beforeEach(async () => {
    await clearAuth();
    setItem.mockClear();
  });

  it('keeps the OTP session in memory only', async () => {
    await setRememberMe(false);
    await persistTokens({ access_token: 'access', refresh_token: 'refresh' });

    expect(await getStoredToken()).toBe('access');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('writes the session to SecureStore once the password is reset', async () => {
    await setRememberMe(false);
    await persistTokens({ access_token: 'access', refresh_token: 'refresh' });
    await persistSession();

    expect(setItem).toHaveBeenCalledWith('auth_token', 'access');
    expect(setItem).toHaveBeenCalledWith('refresh_token', 'refresh');
    expect(writtenKeys()).toContain('rememberMe');
  });

  it('drops the session when the reset is abandoned', async () => {
    await setRememberMe(false);
    await persistTokens({ access_token: 'access', refresh_token: 'refresh' });
    await clearAuth();

    expect(await getStoredToken()).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
  });
});
