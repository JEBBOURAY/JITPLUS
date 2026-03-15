import { create } from 'zustand';
import { Client } from '@/types';

interface AuthState {
  // ── State ──
  client: Client | null;
  loading: boolean;
  needsPasswordSetup: boolean;
  /** Guest mode — user is browsing without authentication */
  isGuest: boolean;

  // ── Actions ──
  setClient: (client: Client | null) => void;
  updateClient: (data: Partial<Client>) => void;
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

  setClient: (client) => set({ client, isGuest: false }),
  updateClient: (data) =>
    set((s) => ({ client: s.client ? { ...s.client, ...data } : s.client })),
  setLoading: (loading) => set({ loading }),
  setNeedsPasswordSetup: (needsPasswordSetup) => set({ needsPasswordSetup }),
  setGuest: (isGuest) => set({ isGuest }),
  reset: () => set(initialState),
}));
