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
  pointsRate?: number;
  loyaltyType?: LoyaltyType;
  conversionRate?: number;
  stampsForReward?: number;
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
  onboardingCompleted?: boolean;
  termsAccepted?: boolean;
  createdAt?: string;
  stores?: Store[];
}

export interface Store {
  id: string;
  merchantId: string;
  nom: string;
  categorie?: MerchantCategory;
  ville?: string;
  quartier?: string;
  adresse?: string;
  latitude?: number;
  longitude?: number;
  telephone?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeviceSession {
  id: string;
  deviceName: string;
  deviceOS?: string;
  userType?: string;
  userEmail?: string;
  userName?: string;
  lastActiveAt: string;
  ipAddress?: string;
  isCurrentDevice: boolean;
  createdAt: string;
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
