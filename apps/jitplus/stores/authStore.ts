import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Client } from '@/types';

/** Persists guest mode so a relaunch doesn't send the guest back to the welcome screen. */
export const GUEST_MODE_KEY = 'guest_mode';

function persistGuestMode(isGuest: boolean) {
  const op = isGuest
    ? AsyncStorage.setItem(GUEST_MODE_KEY, '1')
    : AsyncStorage.removeItem(GUEST_MODE_KEY);
  op.catch(() => { /* non-fatal: guest mode just won't survive a relaunch */ });
}

export interface AuthState {
  // ── State ──
  client: Client | null;
  loading: boolean;
  needsPasswordSetup: boolean;
  /** Guest mode — user is browsing without authentication */
  isGuest: boolean;

  // ── Actions ──
  setClient: (client: Client | null) => void;
  setLoading: (loading: boolean) => void;
  setNeedsPasswordSetup: (needs: boolean) => void;
  setGuest: (isGuest: boolean) => void;
  reset: () => void;
}

const initialState = {
  client: null as Client | null,
  loading: true,
  needsPasswordSetup: false,
  isGuest: false,
};

/**
 * Zustand store for auth state.
 * Components can subscribe to individual slices to avoid unnecessary re-renders:
 *   const client = useAuthStore((s) => s.client);
 *   const loading = useAuthStore((s) => s.loading);
 */
export const useAuthStore = create<AuthState>()((set) => ({
  ...initialState,

  setClient: (client) =>
    set((s) => {
      if (client && s.isGuest) persistGuestMode(false);
      return { client, isGuest: client ? false : s.isGuest };
    }),
  setLoading: (loading) => set({ loading }),
  setNeedsPasswordSetup: (needsPasswordSetup) => set({ needsPasswordSetup }),
  setGuest: (isGuest) => {
    persistGuestMode(isGuest);
    set({ isGuest });
  },
  // Keep loading=false on logout reset, otherwise SplashGate can block on logo screen.
  reset: () => {
    persistGuestMode(false);
    set({ ...initialState, loading: false });
  },
}));
