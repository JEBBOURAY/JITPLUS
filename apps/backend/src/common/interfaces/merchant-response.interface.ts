/**
 * Merchant data returned by login/register endpoints.
 * Matches the shape of MERCHANT_PROFILE_SELECT (excludes password, pushToken).
 */
export interface MerchantResponse {
  id: string;
  nom: string;
  email: string;
  categorie: string;
  description: string | null;
  ville: string | null;
  quartier: string | null;
  adresse: string | null;
  latitude: number | null;
  longitude: number | null;
  logoUrl: string | null;
  coverUrl: string | null;
  pointsRules: unknown;
  pointsRate: number;
  loyaltyType: string;
  conversionRate: number;
  stampsForReward: number;
  activeRewardId: string | null;
  isActive: boolean;
  emailVerified: boolean;
  termsAccepted: boolean;
  plan: string;
  planExpiresAt: Date | null;
  planActivatedByAdmin: boolean;
  trialStartedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  stores?: Array<{
    id: string;
    nom: string;
    categorie: string | null;
    ville: string | null;
    quartier: string | null;
    adresse: string | null;
    latitude: number | null;
    longitude: number | null;
  }>;
}
