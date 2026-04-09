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
}

export interface MerchantDetail extends MerchantRow {
  phoneNumber: string | null;
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
  adminEmail: string;
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
    earnPoints: number;
    redeemReward: number;
    adjustPoints: number;
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
}

export interface ClientsResponse {
  clients: ClientRow[];
  pagination: Pagination;
}

export interface ClientLoyaltyCard {
  id: string;
  points: number;
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
