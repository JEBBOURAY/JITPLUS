// ── Types ─────────────────────────────────────────────────────────────────────

import type { MerchantPlan, Pagination } from '@jitplus/shared';
export type { MerchantPlan, Pagination } from '@jitplus/shared';

export interface AdminInfo {
  id: string;
  email: string;
  nom: string;
  role: 'ADMIN';
}

export interface MerchantRow {
  id: string;
  nom: string;
  email: string;
  phoneNumber: string | null;
  categorie: string;
  ville: string | null;
  plan: MerchantPlan;
  planExpiresAt: string | null;
  planActivatedByAdmin: boolean;
  trialStartedAt: string | null;
  isActive: boolean;
  createdAt: string;
  clientCount: number;
  storeCount: number;
  profileViews: number;
  deletedAt?: string | null;
  /** Only on list/detail endpoints, not on recentMerchants */
  isTrial?: boolean;
  lastActivityAt?: string | null;
  transactions30d?: number;
}

export interface MerchantDetail extends MerchantRow {
  phoneNumber: string | null;
  socialLinks: { website?: string; instagram?: string; tiktok?: string; facebook?: string; snapchat?: string; youtube?: string } | null;
  notificationCount: number;
  transactionCount: number;
}

export interface SubscriptionHistoryEvent {
  id: string;
  action: string;
  createdAt: string;
  adminEmail: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
}

export interface MerchantSubscriptionHistoryResponse {
  merchant: {
    id: string;
    nom: string;
    email: string;
    plan: MerchantPlan;
    planActivatedByAdmin: boolean;
    planExpiresAt: string | null;
    trialStartedAt: string | null;
    createdAt: string;
  };
  events: SubscriptionHistoryEvent[];
}

// Pagination re-exported from @jitplus/shared above

export interface MerchantsResponse {
  merchants: MerchantRow[];
  pagination: Pagination;
}

export interface TrendPoint {
  label: string;
  merchants: number;
  transactions: number;
}

export interface AuditLogBrief {
  id: string;
  /** null for merchant-initiated actions */
  adminEmail: string | null;
  action: string;
  targetType: string;
  targetLabel: string | null;
  createdAt: string;
  ipAddress: string | null;
}

export interface GlobalStats {
  merchants: {
    total: number;
    active: number;
    banned: number;
    free: number;
    premium: number;
  };
  clients: { total: number; newThisMonth: number };
  transactions: {
    total: number;
    thisMonth: number;
    earnStamps: number;
    redeemReward: number;
    adjustStamps: number;
  };
  rewards: { total: number };
  notifications: {
    total: number;
    totalSent: number;
    totalSuccess: number;
    successRate: number;
    pushCount: number;
    whatsappCount: number;
    emailCount: number;
  };
  trends: TrendPoint[];
  recentMerchants: MerchantRow[];
  recentAuditLogs: AuditLogBrief[];
}

export interface AuditLogRow {
  id: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetLabel: string | null;
  createdAt: string;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditLogsResponse {
  logs: AuditLogRow[];
  pagination: Pagination;
}

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  channel: string | null;
  audience: string | null;
  recipientCount: number;
  successCount: number;
  failureCount: number;
  isBroadcast: boolean;
  createdAt: string;
  merchant: {
    id: string;
    nom: string;
    email: string;
  } | null;
  /** In-app inbox entries created for this notification, and how many were opened */
  inboxDelivered: number;
  inboxRead: number;
}

export interface NotificationsResponse {
  notifications: NotificationRow[];
  pagination: Pagination;
}

// ── Client types ─────────────────────────────────────────────────────────────

export interface ClientRow {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  countryCode: string;
  createdAt: string;
  merchantCount: number;
  isAnonymous: boolean;
  deletedAt: string | null;
  pushReachable: boolean;
  lastActivityAt: string | null;
  transactionCount: number;
}

export interface ClientsResponse {
  clients: ClientRow[];
  pagination: Pagination;
}

export interface ClientLoyaltyCard {
  id: string;
  stamps: number;
  deactivatedAt: string | null;
  createdAt: string;
  merchant: {
    id: string;
    nom: string;
    categorie: string;
    logoUrl: string | null;
  };
}

export interface ClientDetail {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  countryCode: string;
  emailVerified: boolean;
  telephoneVerified: boolean;
  dateNaissance: string | null;
  notifPush: boolean;
  notifEmail: boolean;
  notifWhatsapp: boolean;
  shareInfoMerchants: boolean;
  termsAccepted: boolean;
  referralCode: string | null;
  referralBalance: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  merchantCount: number;
  transactionCount: number;
  notificationCount: number;
  loyaltyCards: ClientLoyaltyCard[];
}

// ── Referral types ─────────────────────────────────────────────────────────

export interface ReferralStats {
  merchantToMerchant: {
    total: number;
    totalMonthsEarned: number;
  };
  clientToMerchant: {
    total: number;
    pending: number;
    validated: number;
    totalBalance: number;
  };
}

export interface MerchantReferralRow {
  id: string;
  nom: string;
  email: string;
  categorie: string;
  ville: string | null;
  plan: MerchantPlan;
  bonusCredited: boolean;
  createdAt: string;
  referrer: {
    id: string;
    nom: string;
    email: string;
    referralCode: string | null;
    monthsEarned: number;
  } | null;
}

export interface MerchantReferralsResponse {
  referrals: MerchantReferralRow[];
  pagination: Pagination;
}

export interface ClientReferralRow {
  id: string;
  status: 'PENDING' | 'VALIDATED';
  amount: number;
  createdAt: string;
  validatedAt: string | null;
  client: {
    id: string;
    prenom: string | null;
    nom: string | null;
    email: string | null;
    referralCode: string | null;
    referralBalance: number;
  };
  merchant: {
    id: string;
    nom: string;
    email: string;
    categorie: string;
    plan: MerchantPlan;
  };
}

export interface ClientReferralsResponse {
  referrals: ClientReferralRow[];
  pagination: Pagination;
}

export interface TopReferrer {
  id: string;
  nom: string;
  email: string;
  referralCode: string | null;
  monthsEarned: number;
  referredCount: number;
  plan: MerchantPlan;
}

// ── Payout types ─────────────────────────────────────────────────────────

export type PayoutStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
export type PayoutMethod = 'BANK_TRANSFER' | 'CASH';

export interface PayoutRequestRow {
  id: string;
  amount: number;
  status: PayoutStatus;
  method: PayoutMethod;
  accountDetails: unknown;
  rejectionReason: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  client: {
    id: string;
    nom: string | null;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
    referralBalance: number;
  };
}

export interface PayoutRequestsResponse {
  requests: PayoutRequestRow[];
  total: number;
  page: number;
  totalPages: number;
}

// ── List filters ─────────────────────────────────────────────────────────────

export interface MerchantListParams {
  page?: number;
  limit?: number;
  search?: string;
  plan?: '' | 'FREE' | 'PREMIUM' | 'TRIAL' | 'PAID';
  status?: '' | 'active' | 'banned' | 'deleted';
  categorie?: string;
  ville?: string;
  activity?: '' | 'active30' | 'dormant' | 'never';
  sort?: '' | 'recent' | 'oldest' | 'name' | 'clients' | 'views' | 'expiring';
}

export interface ClientListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: '' | 'active' | 'deactivated' | 'deleted';
  activity?: '' | 'active30' | 'inactive' | 'never';
  type?: '' | 'registered' | 'anonymous';
  sort?: '' | 'recent' | 'oldest' | 'name' | 'cards';
}

export interface NotificationListParams {
  page?: number;
  limit?: number;
  channel?: string;
  search?: string;
  sender?: '' | 'admin' | 'merchant';
  merchantId?: string;
}

export interface MerchantFacets {
  cities: { value: string; count: number }[];
  categories: { value: string; count: number }[];
}

// ── Merchant activity (GET /admin/merchants/:id/activity) ────────────────────

export interface MerchantActivity {
  settings: {
    stampEarningMode: string;
    stampsForReward: number;
    amountPerStamp: number;
    accumulationLimit: number | null;
    stampValidityDays: number | null;
    language: string;
    onboardingCompleted: boolean;
    emailVerified: boolean;
    quartier: string | null;
    adresse: string | null;
    deletedAt: string | null;
  };
  profile: {
    checks: Record<'logo' | 'cover' | 'location' | 'description' | 'openingHours' | 'socialLinks' | 'reward' | 'pushEnabled', boolean>;
    score: number;
    galleryCount: number;
  };
  quotas: { whatsapp: { used: number; max: number }; email: { used: number; max: number } };
  referral: { code: string | null; monthsEarned: number; referrals: number; referredBy: { id: string; nom: string } | null };
  transactions: {
    total: number;
    cancelled: number;
    cancelRate: number;
    byType: { earn: number; redeem: number; adjust: number; wheel: number; coupon: number };
    stampsGiven: number;
    amount: number;
    last30: number;
    prev30: number;
    pendingGifts: number;
    firstAt: string | null;
    lastAt: string | null;
  };
  clients: {
    cards: number;
    active: number;
    new30: number;
    active30: number;
    returning: number;
    returningRate: number;
    rewardReady: number;
    avgStamps: number;
    blocks: number;
  };
  daily: { date: string; transactions: number; clients: number; newCards: number }[];
  topClients: {
    id: string;
    name: string | null;
    telephone: string | null;
    isAnonymous: boolean;
    deleted: boolean;
    stamps: number;
    visits: number;
    amount: number;
    lastAt: string | null;
  }[];
  recentTransactions: {
    id: string;
    type: string;
    status: string;
    stamps: number;
    amount: number;
    createdAt: string;
    performedBy: string | null;
    giftStatus: string | null;
    reward: string | null;
    client: { id: string; name: string | null };
  }[];
  rewards: { id: string; titre: string; cout: number; redeemed: number }[];
  team: { id: string; nom: string; role: string; isActive: boolean; transactions: number }[];
  stores: { id: string; nom: string; ville: string | null; quartier: string | null; isActive: boolean }[];
  features: {
    scratchCampaigns: number;
    scratchCards: number;
    scratchScratched: number;
    wheelCampaigns: number;
    wheelActive: number;
    coupons: number;
    couponsRedeemed: number;
    claims: number;
    claimsConsumed: number;
    views30: number;
  };
  notifications: { channel: string; campaigns: number; recipients: number; success: number; successRate: number; lastAt: string | null }[];
}

// ── Client activity (GET /admin/clients/:id/activity) ────────────────────────

export interface ClientActivity {
  isAnonymous: boolean;
  pushReachable: boolean;
  language: string;
  transactions: {
    total: number;
    cancelled: number;
    earn: number;
    redeem: number;
    stampsEarned: number;
    amount: number;
    last30: number;
    merchantsVisited: number;
    firstAt: string | null;
    lastAt: string | null;
  };
  cards: {
    id: string;
    merchant: { id: string; nom: string; categorie: string };
    stamps: number;
    stampsForReward: number;
    visits: number;
    lastVisitAt: string | null;
    deactivatedAt: string | null;
    createdAt: string;
  }[];
  recentTransactions: {
    id: string;
    type: string;
    status: string;
    stamps: number;
    amount: number;
    createdAt: string;
    reward: string | null;
    merchant: { id: string; nom: string };
  }[];
  games: { scratchTotal: number; scratchScratched: number; couponsTotal: number; couponsRedeemed: number; couponsActive: number; wheelTickets: number };
  notifications: { received: number; read: number; readRate: number };
  referrals: number;
  blocks: { merchantId: string; nom: string; createdAt: string }[];
}

// ── Notification stats (GET /admin/notifications/stats) ──────────────────────

export interface NotificationStats {
  period: { days: InsightPeriod; since: string; generatedAt: string };
  totals: {
    campaigns: number;
    campaignsPrev: number;
    adminCampaigns: number;
    senders: number;
    recipients: number;
    recipientsPrev: number;
    success: number;
    successRate: number;
    inboxDelivered: number;
    inboxRead: number;
    readRate: number;
    blocks: number;
  };
  channels: { channel: string; campaigns: number; recipients: number; success: number; failure: number; successRate: number }[];
  audiences: { audience: string; campaigns: number; recipients: number }[];
  daily: { date: string; campaigns: number; recipients: number; success: number }[];
  topSenders: {
    id: string;
    nom: string;
    campaigns: number;
    recipients: number;
    successRate: number;
    readRate: number;
    blocks: number;
    lastAt: string | null;
  }[];
}

// ── Alerts (GET /admin/alerts) ───────────────────────────────────────────────

export interface AdminAlerts {
  generatedAt: string;
  payoutsPending: number;
  payoutsPendingAmount: number;
  referralsPending: number;
  trialsEnding7d: number;
  paidEnding7d: number;
  stuckNewMerchants: number;
  newMerchants24h: number;
  newClients24h: number;
  notifRecipients24h: number;
  notifSuccessRate24h: number | null;
  cancelled24h: number;
  transactions24h: number;
}

// ── Insights (GET /admin/stats/insights) ─────────────────────────────────────

export type InsightPeriod = 7 | 30 | 90;

export interface InsightDailyPoint {
  date: string;
  merchants: number;
  clients: number;
  transactions: number;
  activeClients: number;
}

export interface InsightMerchantContact {
  id: string;
  nom: string;
  email: string;
  phone: string | null;
  clients: number;
  transactions: number;
}

export interface AdminInsights {
  period: { days: InsightPeriod; since: string; until: string };
  generatedAt: string;
  merchants: {
    total: number;
    activeAccounts: number;
    banned: number;
    newPeriod: number;
    newPrev: number;
    activePeriod: number;
    dormant: number;
    neverUsed: number;
    onboarded: number;
    withTransaction: number;
    /** Strictly nested: each step includes every previous condition */
    funnel: {
      registered: number;
      withReward: number;
      firstTransaction: number;
      tenClients: number;
      paid: number;
    };
    plans: {
      paid: number;
      trialActive: number;
      free: number;
      trialEnding7d: number;
      paidEnding7d: number;
      trialsFinished: number;
      trialsConverted: number;
      trialConversionRate: number;
    };
    profile: {
      logo: number;
      cover: number;
      location: number;
      description: number;
      openingHours: number;
      socialLinks: number;
      pushEnabled: number;
    };
    features: {
      stampExpiry: number;
      perAmountMode: number;
      team: number;
      multiStore: number;
      scratchCards: number;
      luckyWheel: number;
      quickAdd: number;
      notifications: number;
    };
    acquisition: {
      referredByMerchant: number;
      referredByClient: number;
      google: number;
      apple: number;
    };
    avgStampsForReward: number;
  };
  clients: {
    total: number;
    registered: number;
    anonymous: number;
    newPeriod: number;
    newPrev: number;
    activePeriod: number;
    returningPeriod: number;
    activePrev: number;
    retained: number;
    retentionRate: number;
    reachability: { push: number; email: number; whatsapp: number };
    acquisition: { google: number; apple: number; phone: number; email: number };
    cards: { none: number; one: number; twoToThree: number; fourPlus: number; average: number };
    withBirthday: number;
    noShareInfo: number;
  };
  activity: {
    dau: number;
    wau: number;
    mau: number;
    stickiness: number;
    merchantDau: number;
    merchantWau: number;
    merchantMau: number;
  };
  transactions: {
    total: number;
    totalPrev: number;
    earn: number;
    redeem: number;
    redeemPrev: number;
    adjust: number;
    luckyWheelWin: number;
    couponRedeem: number;
    cancelled: number;
    cancelRate: number;
    byTeam: number;
    stampsIssued: number;
    stampsIssuedPrev: number;
    stampsRedeemed: number;
    amountTracked: number;
    amountTrackedPrev: number;
    avgPerActiveMerchant: number;
    avgPerActiveClient: number;
  };
  loyalty: {
    activeCards: number;
    newCards: number;
    newCardsPrev: number;
    rewardsReady: number;
    emptyCards: number;
    inactiveCards: number;
    avgStamps: number;
    pendingGifts: number;
    pendingGiftsOld: number;
  };
  scratch: {
    campaignsPeriod: number;
    scheduled: number;
    live: number;
    cancelled: number;
    cards: number;
    pushed: number;
    opened: number;
    scratched: number;
    expired: number;
    pending: number;
    scratchRate: number;
  };
  luckyWheel: {
    live: number;
    campaignsPeriod: number;
    tickets: number;
    used: number;
    draws: number;
    won: number;
    claimed: number;
    expired: number;
    pendingAll: number;
    outOfStock: number;
    winRate: number;
    claimRate: number;
  };
  coupons: {
    bySource: { source: string; total: number; redeemed: number; expired: number; active: number; discount: number; purchase: number }[];
    byType: { type: string; total: number; redeemed: number; redemptionRate: number }[];
    totals: { total: number; redeemed: number; expired: number; active: number; discount: number; purchase: number; redemptionRate: number };
  };
  engagement: {
    claimsCreated: number;
    claimsConsumed: number;
    claimRate: number;
    profileViews: number;
    profileViewsPrev: number;
    inboxSent: number;
    inboxRead: number;
    inboxReadRate: number;
    merchantCampaigns: number;
    adminCampaigns: number;
    notifRecipients: number;
    notifSuccess: number;
    notifSuccessRate: number;
    clientNotifDelivered: number;
    clientNotifRead: number;
    clientNotifReadRate: number;
    teamMembers: number;
    stores: number;
  };
  moderation: {
    blocksTotal: number;
    blocksPeriod: number;
    topBlocked: { id: string; nom: string; category: string; blocks: number }[];
  };
  ops: {
    payoutsPending: number;
    payoutsPendingAmount: number;
    clientReferralsPending: number;
    merchantReferralsPeriod: number;
  };
  daily: InsightDailyPoint[];
  /** 7 rows (Monday first) × 24 hours, Morocco time */
  heatmap: number[][];
  categories: { category: string; merchants: number; active: number; cards: number; transactions: number }[];
  cities: { city: string; merchants: number; active: number; transactions: number }[];
  languages: { merchants: { language: string; count: number }[]; clients: { language: string; count: number }[] };
  topMerchants: {
    id: string;
    nom: string;
    category: string;
    ville: string | null;
    plan: string;
    paid: boolean;
    transactions: number;
    clients: number;
    redeems: number;
  }[];
  trialsEnding: (InsightMerchantContact & { expiresAt: string })[];
  dormantMerchants: (InsightMerchantContact & { plan: string; lastActivityAt: string })[];
}
