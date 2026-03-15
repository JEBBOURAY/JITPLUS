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

export interface PendingRequestBrief {
  id: string;
  createdAt: string;
  message: string | null;
  merchant: { id: string; nom: string; email: string; plan: MerchantPlan };
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
  upgradeRequests: { pending: number };
  trends: TrendPoint[];
  recentMerchants: MerchantRow[];
  recentAuditLogs: AuditLogBrief[];
  pendingRequests: PendingRequestBrief[];
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

export interface UpgradeRequestRow {
  id: string;
  merchantId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  message: string | null;
  adminNote: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  merchant: {
    id: string;
    nom: string;
    email: string;
    categorie: string;
    ville: string | null;
    plan: MerchantPlan;
    planExpiresAt: string | null;
    trialStartedAt: string | null;
    isActive: boolean;
  };
}

export interface UpgradeRequestsResponse {
  requests: UpgradeRequestRow[];
  total: number;
  pending: number;
}

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  channel: string | null;
  recipientCount: number;
  successCount: number;
  failureCount: number;
  isBroadcast: boolean;
  createdAt: string;
  merchant: {
    id: string;
    nom: string;
    email: string;
  };
}

export interface NotificationsResponse {
  notifications: NotificationRow[];
  pagination: Pagination;
}
