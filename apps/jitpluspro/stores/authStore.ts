import { create } from 'zustand';
import { Merchant, TeamMember } from '@/types';

interface AuthState {
  // ── State ──
  merchant: Merchant | null;
  token: string | null;
  loading: boolean;
  isTeamMember: boolean;
  teamMember: TeamMember | null;
  onboardingCompleted: boolean;

  // ── Actions ──
  setMerchant: (merchant: Merchant | null) => void;
  updateMerchant: (data: Partial<Merchant>) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setTeamMember: (isTeam: boolean, member: TeamMember | null) => void;
  setOnboardingCompleted: (completed: boolean) => void;
  reset: () => void;
}

const initialState: Pick<AuthState, 'merchant' | 'token' | 'loading' | 'isTeamMember' | 'teamMember' | 'onboardingCompleted'> = {
  merchant: null,
  token: null,
  loading: true,
  isTeamMember: false,
  teamMember: null,
  onboardingCompleted: false,
};

/**
 * Zustand store for auth state.
 * Components can subscribe to individual slices to avoid unnecessary re-renders:
 *   const merchant = useAuthStore((s) => s.merchant);
 *   const loading = useAuthStore((s) => s.loading);
 */
export const useAuthStore = create<AuthState>()((set) => ({
  ...initialState,

  setMerchant: (merchant) => set({ merchant }),
  updateMerchant: (data) =>
    set((s) => ({ merchant: s.merchant ? { ...s.merchant, ...data } : s.merchant })),
  setToken: (token) => set({ token }),
  setLoading: (loading) => set({ loading }),
  setTeamMember: (isTeamMember, teamMember) => set({ isTeamMember, teamMember }),
  setOnboardingCompleted: (onboardingCompleted) => set({ onboardingCompleted }),
  reset: () => set(initialState),
}));
