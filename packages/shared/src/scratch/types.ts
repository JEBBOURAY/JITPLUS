// ── Scratch cards & coupons — types shared by JitPlus and JitPlus Pro ────────
// The value lists mirror the Prisma enums of apps/backend/prisma/schema.prisma.
// apps/backend/src/scratch-card/scratch-enums.spec.ts fails if they drift.

export const SCRATCH_CAMPAIGN_STATUSES = ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'ENDED', 'CANCELLED'] as const;
export type ScratchCampaignStatus = (typeof SCRATCH_CAMPAIGN_STATUSES)[number];

export const SCRATCH_CARD_STATUSES = ['PENDING', 'SCRATCHED', 'EXPIRED', 'CANCELLED'] as const;
export type ScratchCardStatus = (typeof SCRATCH_CARD_STATUSES)[number];

export const SCRATCH_AUDIENCE_TYPES = ['ALL_CLIENTS', 'ACTIVE_SINCE', 'INACTIVE_SINCE', 'MIN_STAMPS', 'NEW_SINCE'] as const;
export type ScratchAudienceType = (typeof SCRATCH_AUDIENCE_TYPES)[number];

export const COUPON_REWARD_TYPES = ['PERCENT_DISCOUNT', 'FIXED_DISCOUNT', 'FREE_PRODUCT', 'BONUS_STAMPS'] as const;
export type CouponRewardType = (typeof COUPON_REWARD_TYPES)[number];

export const COUPON_STATUSES = ['ACTIVE', 'REDEEMED', 'EXPIRED', 'CANCELLED'] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];

export const COUPON_SOURCES = ['SCRATCH_CARD', 'LUCKY_WHEEL', 'MANUAL'] as const;
export type CouponSource = (typeof COUPON_SOURCES)[number];

/** Usage conditions copied onto a coupon when it is won. */
export interface CouponConditions {
  minPurchaseAmount?: number | null;
  /** Bitmask Monday=1 … Sunday=64 (null = every day) */
  allowedWeekdays?: number | null;
  /** Minutes since midnight, Morocco time */
  allowedFromMin?: number | null;
  allowedToMin?: number | null;
}

// ── Merchant (JitPlus Pro) ───────────────────────────────────────────────────

export interface ScratchRewardInput extends CouponConditions {
  type: CouponRewardType;
  label: string;
  value?: number | null;
  maxDiscount?: number | null;
  rewardId?: string | null;
  weight: number;
  /** null / undefined = unlimited */
  totalStock?: number | null;
  minDelayHours?: number;
}

export interface ScratchCampaignInput {
  name: string;
  message?: string | null;
  designId?: string;
  audienceType: ScratchAudienceType;
  audienceValue?: number | null;
  /** YYYY-MM-DD, interpreted as the end of that day in Morocco */
  cardExpiresOn: string;
  couponExpiresOn: string;
  rewards: ScratchRewardInput[];
  /** Planned send time (ISO), only used to validate the dates; null = now */
  sendAt?: string | null;
}

export interface ScratchRewardDto extends ScratchRewardInput {
  id: string;
  remaining: number | null;
}

export interface ScratchCampaignDto {
  id: string;
  name: string;
  message: string | null;
  designId: string;
  status: ScratchCampaignStatus;
  audienceType: ScratchAudienceType;
  audienceValue: number | null;
  sendAt: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  cardExpiresAt: string;
  couponExpiresAt: string;
  /** Same dates as YYYY-MM-DD in Morocco time */
  cardExpiresOn: string;
  couponExpiresOn: string;
  recipientCount: number;
  pushSuccessCount: number;
  createdAt: string;
  rewards: ScratchRewardDto[];
}

export interface ScratchCampaignListItem extends ScratchCampaignDto {
  scratchedCount: number;
  redeemedCount: number;
}

export interface ScratchClientWithoutApp {
  cardId: string;
  status: ScratchCardStatus;
  expiresAt: string;
  client: { id: string; prenom: string | null; nom: string | null; telephone: string | null };
}

export interface MerchantCouponDto extends CouponDto {
  purchaseAmount: number | null;
  discountAmount: number | null;
  redeemedByName: string | null;
  campaign: { id: string; name: string } | null;
  client: { id: string; prenom: string | null; nom: string | null };
}

export interface MerchantCouponsPage {
  coupons: MerchantCouponDto[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface AudienceEstimate {
  total: number;
  reachableByPush: number;
  withoutApp: number;
}

export interface ScratchRewardStats {
  rewardId: string;
  label: string;
  type: CouponRewardType;
  won: number;
  redeemed: number;
  remaining: number | null;
}

export interface ScratchCampaignStats {
  sent: number;
  pushDelivered: number;
  opened: number;
  scratched: number;
  redeemed: number;
  cancelledCards: number;
  cancelledCoupons: number;
  withoutApp: number;
  convertedFromGhost: number;
  revenue: number;
  discountGiven: number;
  bonusStamps: number;
  rewards: ScratchRewardStats[];
}

export interface CancelPreview {
  pendingCards: number;
  activeCoupons: number;
  redeemedCoupons: number;
}

export type CouponCheckKey = 'status' | 'dates' | 'weekday' | 'hours' | 'minPurchase';

export interface CouponCheck {
  key: CouponCheckKey;
  /** null = cannot be decided yet (purchase amount still unknown) */
  ok: boolean | null;
  detail?: Record<string, unknown>;
}

export interface CouponCheckResult {
  coupon: CouponDto;
  client: { id: string; prenom: string | null; nom: string | null };
  checks: CouponCheck[];
  canRedeem: boolean;
}

/** A coupon of the scanned client, listed at the till. */
export type ClientCouponAtTill = Omit<CouponCheckResult, 'client'>;

export interface CouponRedeemResult {
  coupon: CouponDto;
  discountAmount: number;
  paidAmount: number;
  stampsEarned: number;
  bonusStamps: number;
  newBalance: number;
  /** True when the same Idempotency-Key was already processed */
  replayed?: boolean;
}

// ── Client (JitPlus) ─────────────────────────────────────────────────────────

export interface ScratchMerchantInfo {
  id: string;
  nom: string;
  logoUrl: string | null;
}

/** What the client sees before scratching: never weights, stocks or rewards. */
export interface ScratchCardDto {
  id: string;
  status: ScratchCardStatus;
  expiresAt: string;
  scratchedAt: string | null;
  campaign: { id: string; name: string; message: string | null; designId: string };
  merchant: ScratchMerchantInfo;
  coupon?: CouponDto | null;
}

export interface CouponDto {
  id: string;
  source: CouponSource;
  code: string;
  type: CouponRewardType;
  label: string;
  value: number | null;
  maxDiscount: number | null;
  conditions: CouponConditions;
  status: CouponStatus;
  validFrom: string;
  expiresAt: string;
  redeemedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  merchant?: ScratchMerchantInfo;
  /** Only returned to the owner of the coupon */
  qrToken?: string;
}
