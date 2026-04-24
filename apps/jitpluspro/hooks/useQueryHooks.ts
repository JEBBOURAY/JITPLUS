import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import api from '@/services/api';
import i18n from '@/i18n';
import type {
  Store,
  PlanInfo,
  Merchant,
  Reward,
  DashboardKpis,
  RewardDistribution,
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
  TeamMember,
} from '@/types';

// Re-export types for backward compatibility
export type { NotificationRecord, Reward, ClientListItem, Transaction, TransactionsPage } from '@/types';

// ── Centralized query keys ──────────────────────────────────────
export const queryKeys = {
  stores: ['stores'] as const,
  rewards: ['rewards'] as const,
  plan: ['plan'] as const,
  referral: ['referral'] as const,
  dashboardKpis: ['dashboard-kpis'] as const,
  dashboardTrends: (period: string) => ['dashboard-trends', period] as const,
  dashboardDistribution: ['dashboard-distribution'] as const,
  transactions: ['transactions'] as const,
  profile: ['profile'] as const,
  clientDetail: (id: string) => ['client-detail', id] as const,
  clientStatus: (id: string) => ['client-status', id] as const,
  clients: (search: string) => ['clients', search] as const,
  notificationHistory: ['notification-history'] as const,
  adminNotifications: ['admin-notifications'] as const,
  adminNotifUnreadCount: ['admin-notif-unread-count'] as const,
  whatsappQuota: ['whatsapp-quota'] as const,
  emailQuota: ['email-quota'] as const,
  pendingGifts: ['pending-gifts'] as const,
  teamMembers: ['team-members'] as const,
  luckyWheelCampaigns: ['lucky-wheel-campaigns'] as const,
  luckyWheelPendingPrizes: ['lucky-wheel-pending-prizes'] as const,
  luckyWheelFulfilledPrizes: ['lucky-wheel-fulfilled-prizes'] as const,
  luckyWheelCampaignStats: (id: string) => ['lucky-wheel-campaign-stats', id] as const,
  luckyWheelActiveInfo: ['lucky-wheel-active-info'] as const,
} as const;

// ── Stale time constants (ms) ───────────────────────────────────
const STALE = {
  FAST: 30 * 1000,        // 30s — frequently changing data (client status)
  SHORT: 60 * 1000,       // 1m  — per-client views, transactions
  MEDIUM: 2 * 60 * 1000,  // 2m  — stores, rewards, lists
  LONG: 3 * 60 * 1000,    // 3m  — dashboard stats/trends
  SLOW: 5 * 60 * 1000,    // 5m  — plan, referral, profile
} as const;

// Garbage-collection time — ephemeral queries don't need 24h in-memory cache
const GC = {
  FAST: 5 * 60 * 1000,        // 5min — client status (navigated away = GC)
  SHORT: 10 * 60 * 1000,      // 10min — per-client detail, transactions
} as const;

// ── Stores ──────────────────────────────────────────────────────
export function useStores(enabled = true) {
  return useQuery<Store[]>({
    queryKey: queryKeys.stores,
    queryFn: async () => {
      const res = await api.get('/merchant/stores');
      return Array.isArray(res.data) ? res.data : [];
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
      return Array.isArray(res.data) ? res.data : [];
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
export function useDashboardKpis(enabled = true) {
  return useQuery<DashboardKpis>({
    queryKey: queryKeys.dashboardKpis,
    queryFn: async () => {
      const res = await api.get('/merchant/dashboard-kpis');
      return res.data;
    },
    staleTime: STALE.LONG,
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

export function useDashboardDistribution(enabled = true) {
  return useQuery<RewardDistribution>({
    queryKey: queryKeys.dashboardDistribution,
    queryFn: async () => {
      const res = await api.get('/merchant/dashboard-distribution');
      return res.data;
    },
    staleTime: STALE.LONG,
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
    gcTime: GC.SHORT,
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
    gcTime: GC.FAST,
    enabled: !!clientId && enabled,
  });
}

export function useRecordTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RecordTransactionPayload) => {
      // Idempotency-Key: protects against double-submits (retry, double-tap,
      // flaky network). Generated client-side per submission; the backend
      // de-duplicates on (merchantId, idempotencyKey).
      const idempotencyKey = payload.idempotencyKey ?? Crypto.randomUUID();
      const { idempotencyKey: _omit, ...body } = payload;
      const res = await api.post('/merchant/transactions', body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      const clientId = variables.clientId;
      if (clientId) {
        qc.invalidateQueries({ queryKey: queryKeys.clientStatus(clientId) });
        qc.invalidateQueries({ queryKey: queryKeys.clientDetail(clientId) });
      }
      qc.invalidateQueries({ queryKey: queryKeys.transactions });
      // Redemptions create a PENDING gift — refresh the pending-gifts badge/list immediately.
      if (variables.type === 'REDEEM_REWARD') {
        qc.invalidateQueries({ queryKey: queryKeys.pendingGifts });
      }
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
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.transactions.length === 20 ? (lastPageParam as number) + 1 : undefined,
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

import {
  ALLOWED_LOGO_MIMES,
  MAX_LOGO_SIZE_BYTES,
} from '@/constants/app';

// ── Logo mutations ──────────────────────────────────────────────
export function useUploadMerchantLogo() {
  return useMutation({
    mutationFn: async (asset: { uri: string; mimeType?: string | null; merchantName?: string; fileSize?: number | null }) => {
      // Validate file size before uploading
      if (asset.fileSize && asset.fileSize > MAX_LOGO_SIZE_BYTES) {
        throw new Error(i18n.t('upload.fileTooLarge'));
      }
      const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const mime = asset.mimeType ?? `image/${ext}`;
      if (!ALLOWED_LOGO_MIMES.has(mime)) {
        throw new Error(i18n.t('upload.unsupportedFileType', { mime }));
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

// ── Team Members ────────────────────────────────────────────────
export function useTeamMembers(enabled = true) {
  return useQuery<TeamMember[]>({
    queryKey: queryKeys.teamMembers,
    queryFn: async () => {
      const res = await api.get('/merchant/team');
      return res.data;
    },
    staleTime: STALE.MEDIUM,
    enabled,
  });
}

export function useCreateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { nom: string; email: string; password: string }) => {
      const res = await api.post('/merchant/team', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teamMembers }),
  });
}

export function useUpdateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, string | boolean> }) => {
      const res = await api.patch(`/merchant/team/${id}`, payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teamMembers }),
  });
}

export function useDeleteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/merchant/team/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teamMembers }),
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

// ── Admin notifications (received from admin dashboard) ─────────
export interface AdminNotification {
  id: string;
  title: string;
  body: string;
  channel: string | null;
  createdAt: string;
  isRead: boolean;
}

export function useAdminNotifications(page = 1, enabled = true) {
  return useQuery<{ notifications: AdminNotification[]; pagination: { total: number; page: number; limit: number; totalPages: number } }>({
    queryKey: [...queryKeys.adminNotifications, page],
    queryFn: async () => {
      const res = await api.get('/merchant/admin-notifications', { params: { page, limit: 20 } });
      return res.data;
    },
    staleTime: STALE.MEDIUM,
    enabled,
  });
}

export function useAdminNotifUnreadCount(enabled = true) {
  return useQuery<{ count: number }>({
    queryKey: queryKeys.adminNotifUnreadCount,
    queryFn: async () => {
      const res = await api.get('/merchant/admin-notifications/unread-count');
      return res.data;
    },
    staleTime: STALE.FAST,
    enabled,
  });
}

export function useMarkAdminNotifsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.patch('/merchant/admin-notifications/mark-read');
    },
    onSuccess: () => {
      qc.setQueryData(queryKeys.adminNotifUnreadCount, { count: 0 });
      qc.invalidateQueries({ queryKey: queryKeys.adminNotifUnreadCount });
      qc.invalidateQueries({ queryKey: queryKeys.adminNotifications });
    },
  });
}

export function useMarkSingleAdminNotifRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      await api.patch(`/merchant/admin-notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminNotifications });
      qc.invalidateQueries({ queryKey: queryKeys.adminNotifUnreadCount });
    },
  });
}

// ── LuckyWheel ─────────────────────────────────────────────────────

export function useLuckyWheelCampaigns() {
  return useQuery<any[]>({
    queryKey: queryKeys.luckyWheelCampaigns,
    queryFn: async () => {
      const res = await api.get('/lucky-wheel/merchant/campaigns');
      return Array.isArray(res.data) ? res.data : [];
    },
    staleTime: STALE.MEDIUM,
  });
}

export function useLuckyWheelCampaignStats(campaignId: string) {
  return useQuery<any>({
    queryKey: queryKeys.luckyWheelCampaignStats(campaignId),
    queryFn: async () => {
      const res = await api.get(`/lucky-wheel/merchant/campaigns/${campaignId}/stats`);
      return res.data;
    },
    staleTime: STALE.SHORT,
    enabled: !!campaignId,
  });
}

export function useLuckyWheelPendingPrizes() {
  return useQuery<any[]>({
    queryKey: queryKeys.luckyWheelPendingPrizes,
    queryFn: async () => {
      const res = await api.get('/lucky-wheel/merchant/pending-prizes');
      return Array.isArray(res.data) ? res.data : [];
    },
    staleTime: STALE.SHORT,
  });
}

export function useLuckyWheelFulfilledPrizes() {
  return useQuery<any[]>({
    queryKey: queryKeys.luckyWheelFulfilledPrizes,
    queryFn: async () => {
      const res = await api.get('/lucky-wheel/merchant/fulfilled-prizes');
      return Array.isArray(res.data) ? res.data : [];
    },
    staleTime: STALE.SHORT,
  });
}

export function useCreateLuckyWheelCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/lucky-wheel/merchant/campaigns', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.luckyWheelCampaigns }),
  });
}

export function useUpdateLuckyWheelStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await api.patch(`/lucky-wheel/merchant/campaigns/${id}/status`, { status });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.luckyWheelCampaigns }),
  });
}

export function useUpdateLuckyWheelCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: any }) => {
      const res = await api.patch(`/lucky-wheel/merchant/campaigns/${id}`, data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.luckyWheelCampaigns }),
  });
}

export function useDeleteLuckyWheelCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/lucky-wheel/merchant/campaigns/${id}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.luckyWheelCampaigns }),
  });
}

export function useFulfilLuckyWheelPrize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (drawId: string) => {
      const res = await api.post('/lucky-wheel/merchant/fulfil', { drawId });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.luckyWheelPendingPrizes });
      qc.invalidateQueries({ queryKey: queryKeys.luckyWheelFulfilledPrizes });
      qc.invalidateQueries({ queryKey: queryKeys.luckyWheelCampaigns });
    },
  });
}

export function useLuckyWheelActiveInfo() {
  return useQuery({
    queryKey: queryKeys.luckyWheelActiveInfo,
    queryFn: async () => {
      const res = await api.get('/lucky-wheel/merchant/active-info');
      return res.data as { hasActiveLuckyWheel: boolean; minSpendAmount: number; campaignName: string | null };
    },
    staleTime: STALE.SHORT,
  });
}
