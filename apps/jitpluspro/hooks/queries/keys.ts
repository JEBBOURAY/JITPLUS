import type { ClientListView } from '@/types';

export const queryKeys = {
  stores: ['stores'] as const,
  rewards: ['rewards'] as const,
  plan: ['plan'] as const,
  referral: ['referral'] as const,
  dashboardKpis: ['dashboard-kpis'] as const,
  dashboardTrends: (period: string) => ['dashboard-trends', period] as const,
  dashboardDistribution: ['dashboard-distribution'] as const,
  dashboardGames: ['dashboard-games'] as const,
  transactions: ['transactions'] as const,
  homeStats: ['home-stats'] as const,
  clientDetail: (id: string) => ['client-detail', id] as const,
  clientStatus: (id: string) => ['client-status', id] as const,
  clientsRoot: ['clients'] as const,
  clients: (search: string) => ['clients', search] as const,
  clientList: (search: string, view: ClientListView) => ['clients', 'list', view, search] as const,
  notificationHistory: ['notification-history'] as const,
  adminNotifications: ['admin-notifications'] as const,
  adminNotifUnreadCount: ['admin-notif-unread-count'] as const,
  emailQuota: ['email-quota'] as const,
  teamMembers: ['team-members'] as const,
  luckyWheelCampaigns: ['lucky-wheel-campaigns'] as const,
  luckyWheelPendingPrizes: ['lucky-wheel-pending-prizes'] as const,
  luckyWheelFulfilledPrizes: ['lucky-wheel-fulfilled-prizes'] as const,
  luckyWheelActiveInfo: ['lucky-wheel-active-info'] as const,
  merchantDeals: ['merchant-deals'] as const,
  merchantDeal: (id: string) => ['merchant-deals', id] as const,
} as const;

/** Stale times (ms), from the most volatile data (client status) to the most stable (plan, referral). */
export const STALE = {
  FAST: 30 * 1000,
  SHORT: 60 * 1000,
  MEDIUM: 2 * 60 * 1000,
  LONG: 3 * 60 * 1000,
  SLOW: 5 * 60 * 1000,
} as const;

// Per-client queries are dropped soon after leaving the screen instead of the default 24h cache.
export const GC = {
  FAST: 5 * 60 * 1000,
  SHORT: 10 * 60 * 1000,
} as const;
