import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { api } from '@/services/api';
import { resetPushTokenDedup } from '@/services/api/auth';
import { clearLocalSession } from '@/services/localSession';
import { savePendingDeal, takePendingDeal } from '@/services/pendingDeal';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { removeItem: jest.fn(() => Promise.resolve()), setItem: jest.fn(() => Promise.resolve()) },
}));
jest.mock('expo-secure-store', () => ({ deleteItemAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@/services/api', () => ({ api: { clearAuth: jest.fn(() => Promise.resolve()) } }));
jest.mock('@/services/api/auth', () => ({ resetPushTokenDedup: jest.fn() }));
jest.mock('@/utils/queryPersister', () => ({ QUERY_CACHE_KEY: 'jitplus-query-cache' }));

const clearAuth = api.clearAuth as jest.Mock;

function setup() {
  const queryClient = { clear: jest.fn() };
  const resetStore = jest.fn();
  return { queryClient, resetStore, run: () => clearLocalSession(queryClient as never, resetStore) };
}

describe('clearLocalSession', () => {
  beforeEach(() => jest.clearAllMocks());

  it('wipes tokens, caches, pending claim and store', async () => {
    const { queryClient, resetStore, run } = setup();
    await run();

    expect(resetPushTokenDedup).toHaveBeenCalledTimes(1);
    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    expect(resetStore).toHaveBeenCalledTimes(1);

    const asyncKeys = (AsyncStorage.removeItem as jest.Mock).mock.calls.map((c) => c[0]);
    expect(asyncKeys).toEqual(expect.arrayContaining([
      'jitplus-query-cache', 'profile_draft', 'showWelcome', 'guest_mode', '@jitplus_deal_alert_card_dismissed_at',
    ]));
    const secureKeys = (SecureStore.deleteItemAsync as jest.Mock).mock.calls.map((c) => c[0]);
    expect(secureKeys).toEqual(expect.arrayContaining(['pendingClaimToken', 'qr_permanent_token']));
  });

  it('forgets the deal a guest opened before logging in', async () => {
    savePendingDeal('3f2b8c1e-9a4d-4e2b-8f1a-0c5d6e7f8a9b');
    await setup().run();
    expect(takePendingDeal()).toBeNull();
  });

  it('shares a single run between concurrent callers', async () => {
    const { resetStore, run } = setup();
    const first = run();
    const second = run();
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(resetStore).toHaveBeenCalledTimes(1);

    await run();
    expect(clearAuth).toHaveBeenCalledTimes(2);
  });

  it('still clears the cache and the store when token removal fails', async () => {
    clearAuth.mockRejectedValueOnce(new Error('keychain locked'));
    const { queryClient, resetStore, run } = setup();
    await run();
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    expect(resetStore).toHaveBeenCalledTimes(1);
  });
});
