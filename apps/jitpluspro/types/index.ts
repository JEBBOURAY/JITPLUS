export { MerchantCategory, type LoyaltyType, type MerchantPlan, type SocialLinks } from '@jitplus/shared';
import type { MerchantCategory, LoyaltyType, MerchantPlan, SocialLinks } from '@jitplus/shared';

export interface PlanLimits {
  maxClients: number;
  maxStores: number;
  maxLoyaltyPrograms: number;
  pushNotifications: boolean;
  whatsappBlasts: boolean;
  emailBlasts: boolean;
  advancedDashboard: boolean;
  price: string;
}

export interface PlanInfo {
  plan: MerchantPlan;
  planExpiresAt: string | null;
  planActivatedByAdmin: boolean;
  trialStartedAt: string | null;
  isTrial: boolean;
  daysRemaining: number | null;
  limits: PlanLimits;
}

// SocialLinks re-exported from @jitplus/shared above

export interface Merchant {
  id: string;
  nom: string;
  email: string;
  categorie: MerchantCategory;
  description?: string;
  ville?: string;
  quartier?: string;
  adresse?: string;
  latitude?: number;
  longitude?: number;
  countryCode?: string;
  phoneNumber?: string;
  logoUrl?: string;
  coverUrl?: string;
  socialLinks?: SocialLinks | null;
  googleId?: string | null;
  appleId?: string | null;
  pointsRate?: number;
  loyaltyType?: LoyaltyType;
  conversionRate?: number;
  stampsForReward?: number;
  stampEarningMode?: 'PER_VISIT' | 'PER_AMOUNT';
  accumulationLimit?: number | null;
  pointsRules?: {
    pointsPerDirham: number;
    minimumPurchase: number;
  };
  plan?: MerchantPlan;
  planExpiresAt?: string | null;
  planActivatedByAdmin?: boolean;
  trialStartedAt?: string | null;
  isActive?: boolean;
  emailVerified?: boolean;
  onboardingCompleted?: boolean;
  termsAccepted?: boolean;
  createdAt?: string;
  stores?: Store[];
}

export interface Store {
  id: string;
  merchantId: string;
  nom: string;
  description?: string;
  categorie?: MerchantCategory;
  ville?: string;
  quartier?: string;
  adresse?: string;
  latitude?: number;
  longitude?: number;
  telephone?: string;
  email?: string;
  logoUrl?: string;
  coverUrl?: string;
  socialLinks?: SocialLinks | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface TeamMember {
  id: string;
  nom: string;
  email: string;
  role: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  transactionsCount?: number;
  merchantId?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  session_id?: string;
  merchant: Merchant;
  userType: 'merchant' | 'team_member';
  teamMember?: TeamMember;
}

// ── API response types (centralized from useQueryHooks) ─────────

export interface Reward {
  id: string;
  titre: string;
  cout: number;
  description?: string;
}

export type TransactionType = 'EARN_POINTS' | 'REDEEM_REWARD' | 'ADJUST_POINTS' | 'LOYALTY_PROGRAM_CHANGE' | 'LUCKY_WHEEL_WIN';
export type GiftStatus = 'PENDING' | 'FULFILLED';

export interface DashboardKpis {
  totalClients: number;
  totalPoints: number;
  totalRedeemedPoints: number;
  totalTransactions: number;
  totalRewardsGiven: number;
  profileViews: number;
  loyaltyType: 'POINTS' | 'STAMPS';
  luckyWheelPlays: number;
  luckyWheelWins: number;
}

export type RewardDistribution = { rewardId: string | null; title: string; count: number }[];

export interface TrendPoint {
  bucket: string;
  count: number;
}

export interface TrendResponse {
  period: string;
  transactions: TrendPoint[];
  newClients: TrendPoint[];
  rewardsGiven: TrendPoint[];
}

export interface ClientDetailTransaction {
  id: string;
  type: TransactionType;
  loyaltyType?: 'POINTS' | 'STAMPS' | null;
  amount: number;
  points: number;
  status: 'ACTIVE' | 'CANCELLED';
  createdAt: string;
  reward?: { id: string; titre: string; cout: number } | null;
  note?: string | null;
  giftStatus?: GiftStatus | null;
  fulfilledAt?: string | null;
}

export interface ClientDetail {
  id: string;
  prenom?: string | null;
  nom: string;
  email: string;
  telephone?: string | null;
  points: number;
  rewardThreshold: number;
  hasReward: boolean;
  memberSince: string;
  transactions: ClientDetailTransaction[];
  loyaltyType?: 'POINTS' | 'STAMPS';
  stampsForReward?: number;
  termsAccepted?: boolean;
}

export interface CustomerStatus {
  id: string;
  prenom?: string | null;
  nom: string;
  email: string;
  points: number;
  hasReward: boolean;
  rewardThreshold: number;
  loyaltyType?: 'POINTS' | 'STAMPS';
  stampsForReward?: number;
  isBirthday?: boolean;
}

export interface Transaction {
  id: string;
  clientId: string;
  type: TransactionType;
  loyaltyType?: 'POINTS' | 'STAMPS' | null;
  amount: number;
  points: number;
  status: 'ACTIVE' | 'CANCELLED';
  createdAt: string;
  note?: string | null;
  performedByName?: string | null;
  teamMember?: { id: string; nom: string } | null;
  reward?: { id: string; titre: string; cout: number } | null;
  client: { id: string; prenom?: string | null; nom: string; email: string };
  giftStatus?: GiftStatus | null;
  fulfilledAt?: string | null;
}

export interface TransactionsPage {
  transactions: Transaction[];
}

export interface PendingGift {
  id: string;
  clientId: string;
  rewardId: string | null;
  points: number;
  giftStatus: GiftStatus;
  createdAt: string;
  client: { id: string; prenom?: string | null; nom: string; email: string | null };
  reward: { id: string; titre: string; cout: number } | null;
}

export interface ReferralStats {
  referralMonthsEarned: number;
  referralCode: string;
  referredCount: number;
}

export interface ClientListItem {
  id: string;
  prenom?: string | null;
  nom: string;
  email: string;
  telephone?: string | null;
  points: number;
  totalTransactions: number;
  lastVisit: string;
  memberSince: string;
}

export interface NotificationRecord {
  id: string;
  title: string;
  body: string;
  channel?: 'PUSH' | 'WHATSAPP' | 'EMAIL' | null;
  recipientCount: number;
  receivedCount: number;
  successCount: number;
  failureCount: number;
  readCount: number;
  createdAt: string;
}

// ── Mutation payloads (typed replacements for Record<string, any>) ──

export interface CreateStorePayload {
  nom: string;
  description?: string;
  categorie?: string;
  ville?: string;
  quartier?: string;
  adresse?: string;
  latitude?: number;
  longitude?: number;
  telephone?: string;
  email?: string;
  logoUrl?: string;
  coverUrl?: string;
  socialLinks?: SocialLinks | null;
  isActive?: boolean;
}

export interface RecordTransactionPayload {
  clientId: string;
  type: TransactionType;
  amount?: number;
  points?: number;
  rewardId?: string;
  note?: string;
}
