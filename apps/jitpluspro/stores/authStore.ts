import { create } from 'zustand';
import { Merchant, TeamMember } from '@/types';

interface AuthState {
  merchant: Merchant | null;
  loading: boolean;
  isTeamMember: boolean;
  teamMember: TeamMember | null;

  setMerchant: (merchant: Merchant | null) => void;
  updateMerchant: (data: Partial<Merchant>) => void;
  setLoading: (loading: boolean) => void;
  setTeamMember: (isTeam: boolean, member: TeamMember | null) => void;
  reset: () => void;
}

const initialState: Pick<AuthState, 'merchant' | 'loading' | 'isTeamMember' | 'teamMember'> = {
  merchant: null,
  loading: true,
  isTeamMember: false,
  teamMember: null,
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
  setLoading: (loading) => set({ loading }),
  setTeamMember: (isTeamMember, teamMember) => set({ isTeamMember, teamMember }),
  reset: () => set(initialState),
}));
