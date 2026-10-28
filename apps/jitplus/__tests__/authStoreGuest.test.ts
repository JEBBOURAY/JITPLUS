import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore, GUEST_MODE_KEY } from '@/stores/authStore';
import type { Client } from '@/types';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

const setItem = AsyncStorage.setItem as jest.Mock;
const removeItem = AsyncStorage.removeItem as jest.Mock;

describe('authStore guest mode persistence', () => {
  beforeEach(() => {
    useAuthStore.setState({ client: null, isGuest: false, loading: false, needsPasswordSetup: false });
    jest.clearAllMocks();
  });

  it('persists guest mode when entering it', () => {
    useAuthStore.getState().setGuest(true);
    expect(useAuthStore.getState().isGuest).toBe(true);
    expect(setItem).toHaveBeenCalledWith(GUEST_MODE_KEY, '1');
  });

  it('drops guest mode once a client signs in', () => {
    useAuthStore.getState().setGuest(true);
    useAuthStore.getState().setClient({ id: 'c1' } as Client);
    expect(useAuthStore.getState().isGuest).toBe(false);
    expect(removeItem).toHaveBeenCalledWith(GUEST_MODE_KEY);
  });

  it('keeps guest mode when the client is cleared', () => {
    useAuthStore.getState().setGuest(true);
    useAuthStore.getState().setClient(null);
    expect(useAuthStore.getState().isGuest).toBe(true);
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('clears guest mode on reset', () => {
    useAuthStore.getState().setGuest(true);
    useAuthStore.getState().reset();
    expect(useAuthStore.getState().isGuest).toBe(false);
    expect(removeItem).toHaveBeenCalledWith(GUEST_MODE_KEY);
  });
});
