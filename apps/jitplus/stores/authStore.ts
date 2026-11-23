import { create } from 'zustand';
import { Client } from '@/types';

/** Signed in but sign-up unfinished: first name missing or terms never accepted (the last name is optional). */
export function isProfileComplete(client: Client | null): boolean {
  return !!client?.prenom && client?.termsAccepted !== false;
}

export interface AuthState {
  // ── State ──
  client: Client | null;
  loading: boolean;
  needsPasswordSetup: boolean;
  /** Terms ticked on the sign-up screen of this run; memory only, so a relaunch asks again. */
  signupTermsAccepted: boolean;

  // ── Actions ──
  setClient: (client: Client | null) => void;
  setLoading: (loading: boolean) => void;
  setNeedsPasswordSetup: (needs: boolean) => void;
  setSignupTermsAccepted: (accepted: boolean) => void;
  reset: () => void;
}

const initialState = {
  client: null as Client | null,
  loading: true,
  needsPasswordSetup: false,
  signupTermsAccepted: false,
};

/**
 * Zustand store for auth state.
 * Components can subscribe to individual slices to avoid unnecessary re-renders:
 *   const client = useAuthStore((s) => s.client);
 *   const loading = useAuthStore((s) => s.loading);
 */
export const useAuthStore = create<AuthState>()((set) => ({
  ...initialState,

  setClient: (client) => set({ client }),
  setLoading: (loading) => set({ loading }),
  setNeedsPasswordSetup: (needsPasswordSetup) => set({ needsPasswordSetup }),
  setSignupTermsAccepted: (signupTermsAccepted) => set({ signupTermsAccepted }),
  // Keep loading=false on logout reset, otherwise SplashGate can block on logo screen.
  reset: () => set({ ...initialState, loading: false }),
}));
