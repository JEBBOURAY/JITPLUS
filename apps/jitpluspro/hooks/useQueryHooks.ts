import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import api from '@/services/api';
import type {
  Store,
  PlanInfo,
  Merchant,
  Reward,
  DashboardStats,
  TrendResponse,
  ClientDetail,
  CustomerStatus,
  TransactionsPage,
  ReferralStats,
  ClientListItem,
  NotificationRecord,
  CreateStorePayload,
  RecordTransactionPayload,
  PendingGift,
} from '@/types';

// Re-export types for backward compatibility
export type { NotificationRecord, Reward, ClientListItem, Transaction, TransactionsPage } from '@/types';

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
  clients: (search: string) => ['clients', search] as const,
  notificationHistory: ['notification-history'] as const,
  whatsappQuota: ['whatsapp-quota'] as const,
  emailQuota: ['email-quota'] as const,
  pendingGifts: ['pending-gifts'] as const,
} as const;

// ── Stale time constants (ms) ───────────────────────────────────
const STALE = {
  FAST: 30 * 1000,        // 30s — frequently changing data (client status)
  SHORT: 60 * 1000,       // 1m  — per-client views, transactions
  MEDIUM: 2 * 60 * 1000,  // 2m  — stores, rewards, lists
  LONG: 3 * 60 * 1000,    // 3m  — dashboard stats/trends
  SLOW: 5 * 60 * 1000,    // 5m  — plan, referral, profile
} as const;

// ── Stores ──────────────────────────────────────────────────────
export function useStores(enabled = true) {
  return useQuery<Store[]>({
    queryKey: queryKeys.stores,
    queryFn: async () => {
      const res = await api.get('/merchant/stores');
      return res.data;
    },
    staleTime: STALE.MEDIUM,
    enabled,
  });
}

export function useCreateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateStorePayload) => {
      const res = await api.post('/merchant/stores', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stores }),
  });
}

export function useUpdateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<CreateStorePayload> }) => {
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
export function useRewards(enabled = true) {
  return useQuery<Reward[]>({
    queryKey: queryKeys.rewards,
    queryFn: async () => {
      const res = await api.get('/rewards');
      return res.data;
    },
    staleTime: STALE.MEDIUM,
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
    staleTime: STALE.SLOW,
    enabled,
  });
}

export function useReferral(enabled = true) {
  return useQuery<ReferralStats | null>({
    queryKey: queryKeys.referral,
    queryFn: async () => {
      const res = await api.get('/merchant/referral');
      return res.data;
    },
    staleTime: STALE.SLOW,
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
export function useDashboardStats(period: string, enabled = true) {
  return useQuery<DashboardStats>({
    queryKey: queryKeys.dashboardStats(period),
    queryFn: async () => {
      const res = await api.get(`/merchant/dashboard-stats?period=${period}`);
      return res.data;
    },
    staleTime: STALE.LONG,
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
    staleTime: STALE.LONG,
    placeholderData: keepPreviousData,
    enabled,
  });
}

// ── Client Detail ───────────────────────────────────────────────
export function useClientDetail(id: string | undefined, enabled = true) {
  return useQuery<ClientDetail>({
    queryKey: queryKeys.clientDetail(id ?? ''),
    queryFn: async () => {
      const res = await api.get(`/merchant/client/${id}/detail`);
      return res.data;
    },
    staleTime: STALE.SHORT,
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
export function useClientStatus(clientId: string | undefined, enabled = true) {
  return useQuery<CustomerStatus>({
    queryKey: queryKeys.clientStatus(clientId ?? ''),
    queryFn: async () => {
      const res = await api.get(`/merchant/client/${clientId}/status`);
      return res.data;
    },
    staleTime: STALE.FAST,
    enabled: !!clientId && enabled,
  });
}

export function useRecordTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RecordTransactionPayload) => {
      const res = await api.post('/merchant/transactions', payload);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      const clientId = variables.clientId;
      if (clientId) {
        qc.invalidateQueries({ queryKey: queryKeys.clientStatus(clientId) });
        qc.invalidateQueries({ queryKey: queryKeys.clientDetail(clientId) });
      }
      qc.invalidateQueries({ queryKey: queryKeys.transactions });
    },
  });
}

// ── Transactions (infinite scroll) ──────────────────────────────
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
    staleTime: STALE.SHORT,
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
    staleTime: STALE.SLOW,
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

// ── Clients ─────────────────────────────────────────────────────
export function useClients(search: string, enabled = true) {
  return useQuery<ClientListItem[]>({
    queryKey: queryKeys.clients(search),
    queryFn: async () => {
      const res = await api.get('/merchant/clients', {
        params: search ? { search: search.trim() } : undefined,
      });
      const data = res.data;
      return Array.isArray(data) ? data : data?.clients ?? [];
    },
    staleTime: STALE.MEDIUM,
    placeholderData: keepPreviousData,
    enabled,
  });
}

// ── Notification History ────────────────────────────────────────
export function useNotificationHistory(enabled = true) {
  return useQuery<NotificationRecord[]>({
    queryKey: queryKeys.notificationHistory,
    queryFn: async () => {
      const res = await api.get('/notifications/history?limit=50');
      return res.data.notifications ?? [];
    },
    staleTime: STALE.SHORT,
    enabled,
  });
}

// ── WhatsApp Quota ──────────────────────────────────────────────
export function useWhatsappQuota(enabled = true) {
  return useQuery<{ used: number; max: number }>({
    queryKey: queryKeys.whatsappQuota,
    queryFn: async () => {
      const res = await api.get('/merchant/whatsapp/quota');
      return { used: res.data.whatsappQuotaUsed, max: res.data.whatsappQuotaMax };
    },
    staleTime: STALE.MEDIUM,
    enabled,
  });
}

// ── Email Quota ─────────────────────────────────────────────────
export function useEmailQuota(enabled = true) {
  return useQuery<{ used: number; max: number }>({
    queryKey: queryKeys.emailQuota,
    queryFn: async () => {
      const res = await api.get('/notifications/email-quota');
      return { used: res.data.emailQuotaUsed, max: res.data.emailQuotaMax };
    },
    staleTime: STALE.MEDIUM,
    enabled,
  });
}

// ── Pending Gifts ───────────────────────────────────────────────
export function usePendingGifts(enabled = true) {
  return useQuery<PendingGift[]>({
    queryKey: queryKeys.pendingGifts,
    queryFn: async () => {
      const res = await api.get('/merchant/pending-gifts');
      return res.data;
    },
    staleTime: STALE.SHORT,
    enabled,
  });
}

export function useFulfillGift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transactionId: string) => {
      const res = await api.patch(`/merchant/transactions/${transactionId}/fulfill`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pendingGifts });
      qc.invalidateQueries({ queryKey: queryKeys.transactions });
    },
  });
}

// ── Logo mutations ──────────────────────────────────────────────
const ALLOWED_LOGO_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]);

export function useUploadMerchantLogo() {
  return useMutation({
    mutationFn: async (asset: { uri: string; mimeType?: string | null; merchantName?: string }) => {
      const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const mime = asset.mimeType ?? `image/${ext}`;
      if (!ALLOWED_LOGO_MIMES.has(mime)) {
        throw new Error(`Type de fichier non supporté: ${mime}`);
      }
      const safeName = (asset.merchantName ?? 'commerce')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `logo_${safeName}_${dateStr}.${ext}`;
      const formData = new FormData();
      formData.append('file', { uri: asset.uri, name: fileName, type: mime } as any);
      const res = await api.post('/merchant/upload-image?type=logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data as { url: string };
    },
  });
}

export function useDeleteMerchantLogo() {
  return useMutation({
    mutationFn: async () => {
      await api.patch('/merchant/profile', { logoUrl: null });
    },
  });
}

// ── Notification send mutations ─────────────────────────────────
export function useSendPushNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title: string; body: string }) => {
      const res = await api.post('/notifications/send-to-all', payload);
      return res.data as { recipientCount: number; successCount: number; failureCount: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notificationHistory });
    },
  });
}

export function useSendWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { body: string }) => {
      const res = await api.post('/notifications/send-whatsapp-to-all', payload);
      return res.data as { recipientCount: number; successCount: number; failureCount: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.whatsappQuota });
      qc.invalidateQueries({ queryKey: queryKeys.notificationHistory });
    },
  });
}

export function useSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { subject: string; body: string }) => {
      const res = await api.post('/notifications/send-email-to-all', payload);
      return res.data as { recipientCount: number; successCount: number; failureCount: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.emailQuota });
      qc.invalidateQueries({ queryKey: queryKeys.notificationHistory });
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
