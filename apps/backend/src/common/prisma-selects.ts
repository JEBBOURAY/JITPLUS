import { Prisma } from '@prisma/client';

/**
 * Standard merchant profile select — used in getProfile, updateProfile, auth login.
 * Excludes sensitive fields (password, pushToken).
 */
export const MERCHANT_PROFILE_SELECT = {
  id: true,
  nom: true,
  email: true,
  categorie: true,
  description: true,
  ville: true,
  quartier: true,
  adresse: true,
  latitude: true,
  longitude: true,
  logoUrl: true,
  coverUrl: true,
  socialLinks: true,
  pointsRules: true,
  pointsRate: true,
  loyaltyType: true,
  conversionRate: true,
  stampsForReward: true,
  accumulationLimit: true,
  activeRewardId: true,
  countryCode: true,
  phoneNumber: true,
  isActive: true,
  onboardingCompleted: true,
  termsAccepted: true,
  googleId: true,
  plan: true,
  planExpiresAt: true,
  planActivatedByAdmin: true,
  trialStartedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MerchantSelect;

/** Explicit return type for operations that use MERCHANT_PROFILE_SELECT. */
export type MerchantProfileData = Prisma.MerchantGetPayload<{ select: typeof MERCHANT_PROFILE_SELECT }>;

/**
 * Merchant loyalty metadata select — used in getClientStatus, getClientDetail, createTransaction.
 */
export const MERCHANT_LOYALTY_SELECT = {
  pointsRules: true,
  loyaltyType: true,
  conversionRate: true,
  stampsForReward: true,
  accumulationLimit: true,
} satisfies Prisma.MerchantSelect;

/**
 * Merchant login select — includes password for bcrypt comparison.
 */
export const MERCHANT_LOGIN_SELECT = {
  ...MERCHANT_PROFILE_SELECT,
  password: true,
  pushToken: true,
  failedLoginAttempts: true,
  lockedUntil: true,
} satisfies Prisma.MerchantSelect;

/**
 * Merchant public select for team-member login (no password).
 */
export const MERCHANT_OWNER_SELECT = {
  ...MERCHANT_PROFILE_SELECT,
  pushToken: true,
} satisfies Prisma.MerchantSelect;

// ── Client selects ──────────────────────────────────────

/**
 * Client fields returned in auth responses (login, register, verify OTP, etc.).
 * Used by buildAuthResponse + refresh token flows.
 */
export const CLIENT_AUTH_SELECT = {
  id: true,
  prenom: true,
  nom: true,
  email: true,
  telephone: true,
  googleId: true,
  termsAccepted: true,
  shareInfoMerchants: true,
  notifPush: true,
  notifWhatsapp: true,
  dateNaissance: true,
  createdAt: true,
} satisfies Prisma.ClientSelect;

/**
 * Client fields for login (includes password + lockout fields on top of auth).
 */
export const CLIENT_LOGIN_SELECT = {
  ...CLIENT_AUTH_SELECT,
  password: true,
  failedLoginAttempts: true,
  lockedUntil: true,
} satisfies Prisma.ClientSelect;

/**
 * Minimal client fields for scan / search results.
 */
export const CLIENT_SCAN_SELECT = {
  id: true,
  prenom: true,
  nom: true,
  email: true,
  telephone: true,
  shareInfoMerchants: true,
  createdAt: true,
} satisfies Prisma.ClientSelect;
