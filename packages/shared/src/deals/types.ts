// ── Bons plans — types shared by JitPlus, JitPlus Pro and the admin ──────────
// The value lists mirror the Prisma enums of apps/backend/prisma/schema.prisma.
// apps/backend/src/deals/deal-enums.spec.ts fails if they drift.

export const DEAL_TYPES = ['BUY_X_GET_Y', 'PERCENT_OFF', 'PRICE_DROP', 'FREE_ITEM', 'OTHER'] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export const DEAL_SCOPES = ['LOCAL', 'ONLINE'] as const;
export type DealScope = (typeof DEAL_SCOPES)[number];

export const DEAL_STATUSES = ['ACTIVE', 'ENDED', 'REMOVED', 'DELETED'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

/** Status shown in the apps, derived from `status` and the dates */
export type DealDisplayStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'REMOVED';

export const DEAL_REPORT_REASONS = ['INAPPROPRIATE', 'MISLEADING', 'OFF_TOPIC', 'EXPIRED', 'OTHER'] as const;
export type DealReportReason = (typeof DEAL_REPORT_REASONS)[number];

export const DEAL_FEED_TABS = ['nearby', 'new', 'ending', 'online'] as const;
export type DealFeedTab = (typeof DEAL_FEED_TABS)[number];

/** Client events counted in the merchant's stats (views are counted by the detail endpoint) */
export const DEAL_EVENT_TYPES = ['LINK_CLICK', 'DIRECTIONS', 'SHARE'] as const;
export type DealEventType = (typeof DEAL_EVENT_TYPES)[number];

/** Offer fields; which ones apply depends on `type` */
export interface DealOffer {
  type: DealType;
  originalPrice?: number | null;
  dealPrice?: number | null;
  percentOff?: number | null;
  buyQty?: number | null;
  freeQty?: number | null;
}

// ── Merchant (JitPlus Pro) ───────────────────────────────────────────────────

export interface DealInput extends DealOffer {
  scope: DealScope;
  title: string;
  description?: string | null;
  conditions?: string | null;
  imageUrl?: string | null;
  /** Required (https) for ONLINE */
  linkUrl?: string | null;
  allStores?: boolean;
  /** Used when allStores = false */
  storeIds?: string[];
  /** YYYY-MM-DD, Morocco time; omitted = today */
  startsOn?: string | null;
  /** YYYY-MM-DD, the deal ends at 23:59:59 Morocco time that day */
  endsOn: string;
}

export interface DealStats {
  views: number;
  linkClicks: number;
  directions: number;
  shares: number;
}

export interface MerchantDealDto extends Required<DealOffer> {
  id: string;
  scope: DealScope;
  title: string;
  description: string | null;
  conditions: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  allStores: boolean;
  storeIds: string[];
  startsAt: string;
  endsAt: string;
  startsOn: string;
  endsOn: string;
  status: DealStatus;
  displayStatus: DealDisplayStatus;
  endedReason: string | null;
  stats: DealStats;
  createdAt: string;
}

export interface MerchantDealLimits {
  activeCount: number;
  maxActive: number;
  createdToday: number;
  maxPerDay: number;
  /** At least one active store has GPS coordinates (required for LOCAL deals) */
  hasLocatedStore: boolean;
}

export interface MerchantDealListResponse {
  deals: MerchantDealDto[];
  limits: MerchantDealLimits;
}

// ── Client (JitPlus) ─────────────────────────────────────────────────────────

export interface DealMerchantSummary {
  id: string;
  nom: string;
  logoUrl: string | null;
  coverUrl: string | null;
  categorie: string;
  themeColor: string | null;
}

export interface ClientDealSummary extends Required<DealOffer> {
  id: string;
  scope: DealScope;
  title: string;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string;
  isPopular: boolean;
  hasLink: boolean;
  /** Distance to the closest store concerned, when the client sent a position */
  distanceKm: number | null;
  merchant: DealMerchantSummary;
}

export interface ClientDealStore {
  id: string;
  nom: string;
  ville: string | null;
  quartier: string | null;
  adresse: string | null;
  latitude: number | null;
  longitude: number | null;
  telephone: string | null;
  distanceKm: number | null;
}

export interface ClientDealDetail extends ClientDealSummary {
  description: string | null;
  conditions: string | null;
  linkUrl: string | null;
  /** Ended or expired: the app shows "Ce bon plan est terminé" */
  isOver: boolean;
  stores: ClientDealStore[];
  merchantPhone: string | null;
}

export interface DealFeedResponse {
  items: ClientDealSummary[];
  /** Opaque cursor of the next page, null at the end */
  nextCursor: string | null;
  /** City used for the results (chosen or derived from the position) */
  cityKey: string | null;
}

/** Live deals per merchant category for a tab and an area; categories without deals are absent. */
export interface DealCategoryCountsResponse {
  counts: Record<string, number>;
}

export interface DealTeaserResponse {
  count: number;
  cityKey: string | null;
  /** Up to 3 image URLs, blurred by the app */
  thumbs: string[];
}

export interface DealCityDto {
  key: string;
  dealCount: number;
}

export interface DealCitiesResponse {
  cities: DealCityDto[];
  /** Closest city to the position sent, if any */
  suggestedCityKey: string | null;
}

/** Added to each entry of /client/merchants (topDeal is null for guests) */
export interface MerchantDealBadge {
  activeDealCount: number;
  topDeal: { id: string; title: string } & Required<Pick<DealOffer, 'type' | 'percentOff' | 'buyQty' | 'freeQty'>> | null;
}

export interface DealAlertPreferences {
  enabled: boolean;
  cityKey: string | null;
  categories: string[];
  online: boolean;
}
