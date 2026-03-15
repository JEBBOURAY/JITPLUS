import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import api from '@/services/api';
import type { Store, PlanInfo, Merchant } from '@/types';

// ── Centralized query keys ──────────────────────────────────────
export const queryKeys = {
  stores: ['stores'] as const,
  rewards: ['rewards'] as const,
  plan: ['plan'] as const,
  referral: ['referral'] as const,
  dashboardStats: (period: string) => ['dashboard-stats', period] as const,
  dashboardTrends: (period: string) => ['dashboard-trends', period] as const,
  transactions: ['transactions'] as const,
  profile: ['profile'] as const,
  clientDetail: (id: string) => ['client-detail', id] as const,
  clientStatus: (id: string) => ['client-status', id] as const,
} as const;

// ── Stores ──────────────────────────────────────────────────────
export function useStores(enabled = true) {
  return useQuery<Store[]>({
    queryKey: queryKeys.stores,
    queryFn: async () => {
      const res = await api.get('/merchant/stores');
      return res.data;
    },
    staleTime: 2 * 60 * 1000,
    enabled,
  });
}

export function useCreateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post('/merchant/stores', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stores }),
  });
}

export function useUpdateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const res = await api.patch(`/merchant/stores/${id}`, payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stores }),
  });
}

export function useDeleteStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/merchant/stores/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stores }),
  });
}

// ── Rewards ─────────────────────────────────────────────────────
interface Reward {
  id: string;
  titre: string;
  cout: number;
  description?: string;
}

export function useRewards(enabled = true) {
  return useQuery<Reward[]>({
    queryKey: queryKeys.rewards,
    queryFn: async () => {
      const res = await api.get('/rewards');
      return res.data;
    },
    staleTime: 2 * 60 * 1000,
    enabled,
  });
}

export function useCreateReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { titre: string; cout: number; description?: string }) => {
      const res = await api.post('/rewards', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rewards }),
  });
}

export function useDeleteReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/rewards/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rewards }),
  });
}

// ── Plan & Referral ─────────────────────────────────────────────
export function usePlan(enabled = true) {
  return useQuery<PlanInfo>({
    queryKey: queryKeys.plan,
    queryFn: async () => {
      const res = await api.get('/merchant/plan');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

interface ReferralStats {
  referralMonthsEarned: number;
  referralCode: string;
  referredCount: number;
}

export function useReferral(enabled = true) {
  return useQuery<ReferralStats | null>({
    queryKey: queryKeys.referral,
    queryFn: async () => {
      const res = await api.get('/merchant/referral');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useApplyReferralMonths() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post('/merchant/referral/apply-months');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.plan });
      qc.invalidateQueries({ queryKey: queryKeys.referral });
    },
  });
}

// ── Dashboard ───────────────────────────────────────────────────
interface DashboardStats {
  totalClients: number;
  totalPoints: number;
  totalRedeemedPoints: number;
  totalTransactions: number;
  profileViews: number;
  rewardsDistribution: { rewardId: string | null; title: string; count: number }[];
  loyaltyType: 'POINTS' | 'STAMPS';
}

interface TrendPoint { bucket: string; count: number }

interface TrendResponse {
  period: string;
  transactions: TrendPoint[];
  newClients: TrendPoint[];
  rewardsGiven: TrendPoint[];
  pointsEarned: TrendPoint[];
  pointsSpent: TrendPoint[];
}

export function useDashboardStats(period: string, enabled = true) {
  return useQuery<DashboardStats>({
    queryKey: queryKeys.dashboardStats(period),
    queryFn: async () => {
      const res = await api.get(`/merchant/dashboard-stats?period=${period}`);
      return res.data;
    },
    staleTime: 3 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useDashboardTrends(period: string, enabled = true) {
  return useQuery<TrendResponse>({
    queryKey: queryKeys.dashboardTrends(period),
    queryFn: async () => {
      const res = await api.get(`/merchant/dashboard-trends?period=${period}`);
      return res.data;
    },
    staleTime: 3 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

// ── Client Detail ───────────────────────────────────────────────
interface ClientDetail {
  id: string;
  nom: string;
  email: string;
  telephone?: string | null;
  points: number;
  rewardThreshold: number;
  hasReward: boolean;
  memberSince: string;
  transactions: {
    id: string;
    type: 'EARN_POINTS' | 'REDEEM_REWARD' | 'ADJUST_POINTS' | 'LOYALTY_PROGRAM_CHANGE';
    loyaltyType?: 'POINTS' | 'STAMPS' | null;
    amount: number;
    points: number;
    status: 'ACTIVE' | 'CANCELLED';
    createdAt: string;
    reward?: { id: string; titre: string; cout: number } | null;
    note?: string | null;
  }[];
  loyaltyType?: 'POINTS' | 'STAMPS';
  stampsForReward?: number;
  termsAccepted?: boolean;
}

export function useClientDetail(id: string | undefined, enabled = true) {
  return useQuery<ClientDetail>({
    queryKey: queryKeys.clientDetail(id!),
    queryFn: async () => {
      const res = await api.get(`/merchant/client/${id}/detail`);
      return res.data;
    },
    staleTime: 60 * 1000,
    enabled: !!id && enabled,
  });
}

export function useAdjustPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { clientId: string; points: number; note?: string }) => {
      const res = await api.post('/merchant/transactions/adjust', payload);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.clientDetail(variables.clientId) });
      qc.invalidateQueries({ queryKey: queryKeys.clientStatus(variables.clientId) });
    },
  });
}

// ── Client Status (transaction screen) ──────────────────────────
interface CustomerStatus {
  id: string;
  nom: string;
  email: string;
  points: number;
  hasReward: boolean;
  rewardThreshold: number;
  loyaltyType?: 'POINTS' | 'STAMPS';
  stampsForReward?: number;
}

export function useClientStatus(clientId: string | undefined, enabled = true) {
  return useQuery<CustomerStatus>({
    queryKey: queryKeys.clientStatus(clientId!),
    queryFn: async () => {
      const res = await api.get(`/merchant/client/${clientId}/status`);
      return res.data;
    },
    staleTime: 30 * 1000,
    enabled: !!clientId && enabled,
  });
}

export function useRecordTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post('/merchant/transactions', payload);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      const clientId = variables.clientId as string | undefined;
      if (clientId) {
        qc.invalidateQueries({ queryKey: queryKeys.clientStatus(clientId) });
        qc.invalidateQueries({ queryKey: queryKeys.clientDetail(clientId) });
      }
      qc.invalidateQueries({ queryKey: queryKeys.transactions });
    },
  });
}

// ── Transactions (infinite scroll) ──────────────────────────────
interface Transaction {
  id: string;
  clientId: string;
  type: 'EARN_POINTS' | 'REDEEM_REWARD' | 'ADJUST_POINTS' | 'LOYALTY_PROGRAM_CHANGE';
  loyaltyType?: 'POINTS' | 'STAMPS' | null;
  amount: number;
  points: number;
  status: 'ACTIVE' | 'CANCELLED';
  createdAt: string;
  note?: string | null;
  performedByName?: string | null;
  teamMember?: { id: string; nom: string } | null;
  reward?: { id: string; titre: string; cout: number } | null;
  client: { id: string; nom: string; email: string };
}

interface TransactionsPage {
  transactions: Transaction[];
}

export function useTransactions(enabled = true) {
  return useInfiniteQuery<TransactionsPage>({
    queryKey: queryKeys.transactions,
    queryFn: async ({ pageParam }) => {
      const res = await api.get(`/merchant/transactions?page=${pageParam}&limit=20`);
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.transactions.length === 20 ? allPages.length + 1 : undefined,
    staleTime: 1 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

// ── Profile (merchant) ──────────────────────────────────────────
export function useMerchantProfile(enabled = true) {
  return useQuery<Merchant>({
    queryKey: queryKeys.profile,
    queryFn: async () => {
      const res = await api.get('/merchant/profile');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useUpdateLoyaltySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      loyaltyType: 'POINTS' | 'STAMPS';
      pointsRate: number;
      conversionRate: number;
      stampsForReward: number;
    }) => {
      const res = await api.patch('/merchant/loyalty-settings', payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profile });
      qc.invalidateQueries({ queryKey: queryKeys.rewards });
    },
  });
}

// ── Invalidation helpers ────────────────────────────────────────
export function useInvalidateQueries() {
  const qc = useQueryClient();
  return {
    invalidateStores: () => qc.invalidateQueries({ queryKey: queryKeys.stores }),
    invalidateRewards: () => qc.invalidateQueries({ queryKey: queryKeys.rewards }),
    invalidatePlan: () => qc.invalidateQueries({ queryKey: queryKeys.plan }),
    invalidateTransactions: () => qc.invalidateQueries({ queryKey: queryKeys.transactions }),
    invalidateProfile: () => qc.invalidateQueries({ queryKey: queryKeys.profile }),
    invalidateAll: () => qc.invalidateQueries(),
  };
}
