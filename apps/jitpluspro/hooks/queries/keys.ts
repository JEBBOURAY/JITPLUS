import type { ClientListSort, ClientListView, TransactionFilters } from '@/types';

export const queryKeys = {
  stores: ['stores'] as const,
  rewards: ['rewards'] as const,
  plan: ['plan'] as const,
  referral: ['referral'] as const,
  dashboardKpis: ['dashboard-kpis'] as const,
  // Root of every period of the trends chart.
  dashboardTrendsRoot: ['dashboard-trends'] as const,
  dashboardTrends: (period: string) => ['dashboard-trends', period] as const,
  dashboardDistribution: ['dashboard-distribution'] as const,
  dashboardGames: ['dashboard-games'] as const,
  // Root of every history list: invalidating it refreshes all the filtered lists.
  transactions: ['transactions'] as const,
  transactionList: (f: TransactionFilters) => ['transactions', 'list', f.kind, f.period, f.staff ?? '', f.search] as const,
  homeStats: ['home-stats'] as const,
  // Roots of every client's detail / till status (a loyalty settings change moves all balances).
  clientDetailRoot: ['client-detail'] as const,
  clientDetail: (id: string) => ['client-detail', id] as const,
  clientStatusRoot: ['client-status'] as const,
  clientStatus: (id: string) => ['client-status', id] as const,
  clientsRoot: ['clients'] as const,
  // Under `clientsRoot` / `notificationHistory`, so the same invalidations refresh the probes.
  clientsExist: ['clients', 'exists'] as const,
  clientList: (search: string, view: ClientListView, sort: ClientListSort | null) =>
    ['clients', 'list', view, sort ?? '', search] as const,
  clientSegments: ['clients', 'segments'] as const,
  notificationHistory: ['notification-history'] as const,
  notificationSent: ['notification-history', 'exists'] as const,
  broadcastStatus: ['broadcast-status'] as const,
  adminNotifications: ['admin-notifications'] as const,
  adminNotificationFeed: ['admin-notifications', 'feed'] as const,
  adminNotifUnreadCount: ['admin-notif-unread-count'] as const,
  notificationPrefs: ['notification-prefs'] as const,
  teamMembers: ['team-members'] as const,
  luckyWheelCampaigns: ['lucky-wheel-campaigns'] as const,
  luckyWheelPendingPrizes: ['lucky-wheel-pending-prizes'] as const,
  // Under `luckyWheelPendingPrizes`, so fulfilling a prize refreshes the till list too.
  luckyWheelClientPrizes: (clientId: string) => ['lucky-wheel-pending-prizes', clientId] as const,
  luckyWheelFulfilledPrizes: ['lucky-wheel-fulfilled-prizes'] as const,
  luckyWheelActiveInfo: ['lucky-wheel-active-info'] as const,
  merchantDeals: ['merchant-deals'] as const,
  merchantDeal: (id: string) => ['merchant-deals', id] as const,
  stampCodeQuota: ['stamp-codes', 'quota'] as const,
  stampCodeBatches: ['stamp-codes', 'batches'] as const,
  stampCodeBatch: (id: string) => ['stamp-codes', 'batches', id] as const,
  // Booking: everything under `bookingRoot`, so a 'booking:changed' event refreshes it all.
  bookingRoot: ['booking'] as const,
  bookingSetup: ['booking', 'setup'] as const,
  bookingAgendaRoot: ['booking', 'agenda'] as const,
  bookingAgenda: (from: string, to: string) => ['booking', 'agenda', from, to] as const,
  bookingPending: ['booking', 'pending'] as const,
  booking: (id: string) => ['booking', 'detail', id] as const,
} as const;

/** Stale times (ms), from the most volatile data (client status) to the most stable (plan, referral). */
export const STALE = {
  /** Till data for one client: fresh at each visit, long enough to reuse the scan-time prefetch. */
  TILL: 10 * 1000,
  FAST: 30 * 1000,
  SHORT: 60 * 1000,
  MEDIUM: 2 * 60 * 1000,
  LONG: 3 * 60 * 1000,
  SLOW: 5 * 60 * 1000,
} as const;

// Per-client queries are dropped soon after leaving the screen instead of the default 4h cache (gcTime in app/_layout.tsx).
export const GC = {
  FAST: 5 * 60 * 1000,
  SHORT: 10 * 60 * 1000,
} as const;
