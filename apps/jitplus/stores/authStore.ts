import { create } from 'zustand';
import { Client } from '@/types';

export interface AuthState {
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
    set((s) => {
      if (!s.client) return { client: s.client };
      // Shallow + one-level nested merge so updating one nested field
      // (e.g. settings.foo) doesn't erase sibling fields.
      const current = s.client as unknown as Record<string, unknown>;
      const patch = data as unknown as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...current };
      for (const key of Object.keys(patch)) {
        const nextVal = patch[key];
        const prevVal = current[key];
        if (
          nextVal &&
          typeof nextVal === 'object' &&
          !Array.isArray(nextVal) &&
          prevVal &&
          typeof prevVal === 'object' &&
          !Array.isArray(prevVal)
        ) {
          merged[key] = { ...(prevVal as object), ...(nextVal as object) };
        } else {
          merged[key] = nextVal;
        }
      }
      return { client: merged as unknown as Client };
    }),
  setLoading: (loading) => set({ loading }),
  setNeedsPasswordSetup: (needsPasswordSetup) => set({ needsPasswordSetup }),
  setGuest: (isGuest) => set({ isGuest }),
  // Keep loading=false on logout reset, otherwise SplashGate can block on logo screen.
  reset: () => set({ ...initialState, loading: false }),
}));
