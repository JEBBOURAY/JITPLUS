import type { SocialLinks, LoyaltyType, Pagination } from '@jitplus/shared';

export type { SocialLinks, LoyaltyType, Pagination } from '@jitplus/shared';

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
}

// SocialLinks re-exported from @jitplus/shared above

export interface Merchant {
  id: string;
  nomBoutique: string;
  categorie: string;
  adresse?: string;
  description?: string;
  ville?: string;
  latitude?: number | null;
  longitude?: number | null;
  loyaltyType: LoyaltyType;
  conversionRate?: number;
  minRewardCost?: number | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  socialLinks?: SocialLinks | null;
  profileViews?: number;
  clientCount?: number;
  rewards?: MerchantReward[];
  /** Balance du client chez ce marchand (retourné par /merchants/nearby) */
  userPoints?: number;
  /** Whether the client already has a loyalty card with this merchant */
  hasCard?: boolean;
  /** Whether the client's card is deactivated */
  cardDeactivated?: boolean;
  /** Current points/stamps balance on the card */
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

export interface Transaction {
  id: string;
  merchantId: string;
  clientId: string;
  amount: number;
  pointsEarned: number;
  type: 'EARN' | 'REDEEM' | 'ADJUST';
  createdAt: string;
  merchant?: Merchant;
  note?: string | null;
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

export interface PointsOverview {
  totalPoints: number;
  totalCards: number;
  cards: LoyaltyCard[];
}

export interface ClientNotification {
  id: string;
  title: string;
  body: string;
  type: 'reward' | 'promo' | 'info';
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
