import type { MerchantCategory, MerchantPlan, SocialLinks, OpeningHours } from '@jitplus/shared';
export { MerchantCategory, MERCHANT_BADGE_CODES, type MerchantPlan, type SocialLinks, type OpeningHours, type MerchantBadge } from '@jitplus/shared';

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
  secondaryCategories?: MerchantCategory[];
  description?: string;
  tagline?: string | null;
  badges?: string[];
  gallery?: string[];
  openingHours?: OpeningHours | null;
  ville?: string;
  quartier?: string;
  adresse?: string;
  latitude?: number;
  longitude?: number;
  countryCode?: string;
  phoneNumber?: string;
  logoUrl?: string;
  coverUrl?: string;
  themeColor?: string | null;
  themeIcon?: string | null;
  cardBackgroundUrl?: string | null;
  cardBackgroundColor?: string | null;
  cardTextColor?: 'LIGHT' | 'DARK' | null;
  socialLinks?: SocialLinks | null;
  googleId?: string | null;
  appleId?: string | null;
  amountPerStamp?: number;
  stampsForReward?: number;
  stampEarningMode?: 'PER_VISIT' | 'PER_AMOUNT';
  accumulationLimit?: number | null;
  /** Stamps reset after this many days without a visit; null = never expire. */
  stampValidityDays?: number | null;
  plan?: MerchantPlan;
  planExpiresAt?: string | null;
  planActivatedByAdmin?: boolean;
  trialStartedAt?: string | null;
  isActive?: boolean;
  emailVerified?: boolean;
  onboardingCompleted?: boolean;
  welcomeGuideVisible?: boolean;
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
  telephone?: string | null;
  email?: string | null;
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
  imageUrl?: string | null;
}

export type TransactionType = 'EARN_STAMPS' | 'REDEEM_REWARD' | 'ADJUST_STAMPS' | 'LOYALTY_PROGRAM_CHANGE' | 'LUCKY_WHEEL_WIN' | 'COUPON_REDEEM';
export type GiftStatus = 'PENDING' | 'FULFILLED';

export interface DashboardKpis {
  totalClients: number;
  totalStamps: number;
  totalRedeemedStamps: number;
  totalTransactions: number;
  totalRewardsGiven: number;
  profileViews: number;
  luckyWheelPlays: number;
  luckyWheelWins: number;
}

export type RewardDistribution = { rewardId: string | null; title: string; count: number }[];

export interface DashboardGames {
  scratch: {
    campaigns: number;
    activeCampaigns: number;
    sent: number;
    scratched: number;
    redeemed: number;
    revenue: number;
    discountGiven: number;
  };
  wheel: {
    campaigns: number;
    activeCampaigns: number;
    plays: number;
    wins: number;
    pending: number;
    fulfilled: number;
  };
  topPrizes: { label: string; source: 'SCRATCH' | 'WHEEL'; count: number }[];
}

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
  amount: number;
  stamps: number;
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
  isAnonymous?: boolean;
  stamps: number;
  rewardThreshold: number;
  hasReward: boolean;
  memberSince: string;
  transactions: ClientDetailTransaction[];
  stampsForReward?: number;
  termsAccepted?: boolean;
}

export interface CustomerStatus {
  id: string;
  prenom?: string | null;
  nom: string;
  email: string;
  stamps: number;
  hasReward: boolean;
  rewardThreshold: number;
  stampsForReward?: number;
  isBirthday?: boolean;
}

export interface Transaction {
  id: string;
  clientId: string;
  type: TransactionType;
  amount: number;
  stamps: number;
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

export interface ReferredMerchant {
  id: string;
  nom: string;
  categorie: string;
  ville: string | null;
  createdAt: string;
  validated: boolean;
}

export interface ReferralStats {
  referralMonthsEarned: number;
  referralCode: string;
  referredCount: number;
  referrals: ReferredMerchant[];
}

export interface ClientListItem {
  id: string;
  prenom?: string | null;
  nom: string;
  email: string;
  telephone?: string | null;
  stamps: number;
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
  telephone?: string | null;
  email?: string | null;
  logoUrl?: string;
  coverUrl?: string;
  socialLinks?: SocialLinks | null;
  isActive?: boolean;
}

export interface RecordTransactionPayload {
  clientId: string;
  type: TransactionType;
  amount?: number;
  stamps?: number;
  rewardId?: string;
  note?: string;
  /** Optional: supply to override auto-generated Idempotency-Key (advanced). */
  idempotencyKey?: string;
}
