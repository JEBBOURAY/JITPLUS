import type { SocialLinks, Pagination, OpeningHours } from '@jitplus/shared';
import type { MerchantDealBadge } from '@jitplus/shared/src/deals';

export type { SocialLinks, Pagination, OpeningHours, MerchantBadge } from '@jitplus/shared';

export interface Client {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  emailVerified?: boolean;
  telephone: string | null;
  telephoneVerified?: boolean;
  countryCode?: string;
  pushToken?: string;
  termsAccepted?: boolean;
  shareInfoMerchants?: boolean;
  notifWhatsapp?: boolean;
  notifPush?: boolean;
  notifEmail?: boolean;
  language?: string;
  dateNaissance?: string | null;
  hasPassword?: boolean;
  createdAt: string;
}

export interface MerchantReward {
  id: string;
  titre: string;
  cout: number;
  description?: string | null;
  imageUrl?: string | null;
}

export interface MerchantActiveLuckyWheel {
  id: string;
  name: string;
  description: string | null;
  endsAt: string;
  minSpendAmount: number;
  globalWinRate: number;
  prizes: { id: string; label: string; description: string | null; weight?: number }[];
}

// SocialLinks re-exported from @jitplus/shared above

export interface Merchant {
  id: string;
  nomBoutique: string;
  categorie: string;
  secondaryCategories?: string[];
  tagline?: string | null;
  badges?: string[];
  gallery?: string[];
  openingHours?: OpeningHours | null;
  adresse?: string;
  description?: string;
  ville?: string;
  latitude?: number | null;
  longitude?: number | null;
  stampsForReward?: number;
  /** PER_VISIT: 1 stamp per visit. PER_AMOUNT: 1 stamp per `amountPerStamp` spent. */
  stampEarningMode?: 'PER_VISIT' | 'PER_AMOUNT';
  amountPerStamp?: number | null;
  /** Stamps reset after this many days without a visit; null = never expire. */
  stampValidityDays?: number | null;
  /** When the client's current stamps expire if they do not come back (ISO). */
  cardStampsExpireAt?: string | null;
  minRewardCost?: number | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  themeColor?: string | null;
  themeIcon?: string | null;
  cardBackgroundUrl?: string | null;
  cardBackgroundColor?: string | null;
  cardTextColor?: 'LIGHT' | 'DARK' | null;
  socialLinks?: SocialLinks | null;
  profileViews?: number;
  clientCount?: number;
  rewards?: MerchantReward[];
  /** Active luckyWheel campaign for this merchant */
  activeLuckyWheel?: MerchantActiveLuckyWheel | null;
  /** Live deals (« Bons plans »), also sent to guests */
  activeDealCount?: number;
  /** Best live deal, list endpoint only; null for guests */
  topDeal?: MerchantDealBadge['topDeal'];
  /** Whether the client already has a loyalty card with this merchant */
  hasCard?: boolean;
  /** Whether the client's card is deactivated */
  cardDeactivated?: boolean;
  /** Current stamps balance on the card */
  cardBalance?: number;
  /** Store ID when this entry represents a specific store location */
  storeId?: string;
  /** Store name when this entry represents a specific store location */
  storeName?: string;
  /** Stores associated with this merchant */
  stores?: {
    id: string;
    nom: string;
    ville?: string;
    quartier?: string;
    adresse?: string;
    latitude?: number;
    longitude?: number;
    telephone?: string;
    email?: string;
  }[];
}

export interface LoyaltyCard {
  id: string;
  merchantId: string;
  clientId: string;
  balance: number;
  createdAt: string;
  updatedAt?: string;
  merchant?: Merchant;
}

export interface OtpResponse {
  message: string;
  success: boolean;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  isNewUser: boolean;
  client: Client;
}

export interface CompleteProfileResponse {
  success: boolean;
  client: Client;
}

export interface StampsOverview {
  totalStamps: number;
  totalCards: number;
  cards: LoyaltyCard[];
}

export interface ClientNotification {
  id: string;
  title: string;
  body: string;
  /** `deals_digest` entries have no merchant (merchantName and merchantCategory are null). */
  type: 'reward' | 'promo' | 'info' | 'deals_digest';
  merchantName: string | null;
  merchantCategory: string | null;
  merchantLogoUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: ClientNotification[];
  pagination: Pagination;
}

export interface QrTokenResponse {
  qr_token: string;
  /** v2 only: unix seconds. Absent for legacy v1 permanent tokens. */
  expiresAt?: number;
}

export interface ClientReferral {
  id: string;
  merchantName: string;
  merchantCategory: string;
  status: 'PENDING' | 'VALIDATED';
  amount: number;
  createdAt: string;
  validatedAt: string | null;
}

export interface ClientReferralStats {
  referralCode: string;
  referralBalance: number;
  referredCount: number;
  referrals: ClientReferral[];
}

// ── Payout ─────────────────────────────────────────────

export type PayoutMethod = 'BANK_TRANSFER' | 'CASH';
export type PayoutStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

export interface PayoutRequest {
  id: string;
  clientId: string;
  amount: number;
  method: PayoutMethod;
  accountDetails: string | null;
  status: PayoutStatus;
  createdAt: string;
  updatedAt: string;
}

// ── LuckyWheel ───────────────────────────────────────────

export interface LuckyWheelPrize {
  id: string;
  label: string;
  description: string | null;
  weight: number;
}

export interface LuckyWheelCampaign {
  id: string;
  name: string;
  merchantId: string;
  globalWinRate: number;
  merchant: { nom: string; logoUrl: string | null };
  prizes: LuckyWheelPrize[];
}

export interface LuckyWheelTicket {
  id: string;
  clientId: string;
  campaignId: string;
  used: boolean;
  createdAt: string;
  campaign: LuckyWheelCampaign;
}

export type LuckyWheelFulfilment = 'PENDING' | 'CLAIMED' | 'EXPIRED';

export interface LuckyWheelDraw {
  id: string;
  ticketId: string;
  prizeId: string | null;
  result: 'WON' | 'LOST';
  fulfilment: LuckyWheelFulfilment | null;
  claimBefore: string | null;
  serverSeed: string;
  createdAt: string;
  prize: LuckyWheelPrize | null;
  ticket: {
    campaign: {
      name: string;
      merchantId: string;
      merchant?: { nom: string; logoUrl: string | null };
    };
  };
}

export type LuckyWheelDrawResult =
  | { result: 'LOST'; draw: LuckyWheelDraw; prize: null }
  | { result: 'WON'; draw: LuckyWheelDraw; prize: LuckyWheelPrize };
