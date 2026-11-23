// Collection game: types and limits shared by the apps.
// Same limits as apps/backend/src/collections/collection-rules.ts (the backend
// does not import this package); collection-limits.spec.ts keeps both in sync.

export const COLLECTION_LIMITS = {
  /** Items to buy. The gift comes on top ("le 6e offert" = 5 items + the gift). */
  MIN_ITEMS: 2,
  MAX_ITEMS: 8,
  NAME_MAX: 80,
  LABEL_MAX: 60,
  GIFT_MAX: 80,
  DEFAULT_COUPON_DAYS: 30,
  MAX_COUPON_DAYS: 120,
  MAX_GIFT_DELAY_HOURS: 168,
  MAX_PER_MERCHANT: 50,
} as const;

export type CollectionStatus = 'DRAFT' | 'ACTIVE' | 'ENDED';

/** Body of create / update (draft, or running collection: products can be added, not removed). */
export interface CollectionInput {
  name: string;
  /**
   * `id`: existing product (an edit keeps what clients already collected).
   * `imageUrl`: photo uploaded with type=collection, deleted when the collection ends.
   */
  items: { id?: string; label: string; imageUrl: string | null }[];
  giftLabel: string;
  /** Photo of the gift, same rules as the product photos */
  giftImageUrl: string | null;
  onePerVisit: boolean;
  repeatable: boolean;
  couponValidityDays: number;
  giftDelayHours: number;
  /** YYYY-MM-DD, null = no end */
  endsOn: string | null;
}

export interface CollectionDto {
  id: string;
  name: string;
  giftLabel: string;
  giftImageUrl: string | null;
  status: CollectionStatus;
  onePerVisit: boolean;
  repeatable: boolean;
  couponValidityDays: number;
  giftDelayHours: number;
  endsAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  items: { id: string; label: string; imageUrl: string | null }[];
}

export interface CollectionStats {
  /** Clients who collected at least one product */
  participants: number;
  /** Gifts won */
  completed: number;
}

export type CollectionListItem = CollectionDto & CollectionStats;

export interface CollectionDetail extends Omit<CollectionDto, 'items'>, CollectionStats {
  /** `checks` = how many times the product was collected */
  items: { id: string; label: string; imageUrl: string | null; checks: number }[];
  giftsUsed: number;
}

/** The open collection for one client, as the cashier sees it. */
export interface TillCollection {
  id: string;
  name: string;
  giftLabel: string;
  onePerVisit: boolean;
  /** imageUrl: optional product photo (absent before backend 2026-11-22). */
  items: { id: string; label: string; imageUrl?: string | null; checked: boolean }[];
  checked: number;
  total: number;
  completed: boolean;
  /** false when the collection is complete or the daily product was already ticked */
  canCheck: boolean;
}

export interface CollectionCheckResult {
  collection: TillCollection;
  /** Products newly ticked by this request (0 on a replay) */
  added: number;
  /** Gift coupon when the request completed the collection */
  gift: { id: string; label: string; validFrom: string; expiresAt: string } | null;
}

/** The open collection of a merchant with the caller's own progress (client app). */
export interface ClientCollection {
  id: string;
  name: string;
  giftLabel: string;
  giftImageUrl: string | null;
  endsAt: string | null;
  items: { id: string; label: string; imageUrl: string | null; checked: boolean }[];
  checked: number;
  total: number;
  completed: boolean;
  /** A gift won here and not used yet */
  giftCouponId: string | null;
}

export interface ClientCollectionMerchant {
  id: string;
  nom: string;
  logoUrl: string | null;
}

/**
 * A collection still to complete, in the client's collections screen, with its shop.
 * `giftCouponId` = unused gift won with this collection (an earlier cycle of a repeatable one).
 */
export interface ClientCollectionCard extends ClientCollection {
  merchant: ClientCollectionMerchant;
}

/** A completed collection (one cycle) and the gift coupon it gave. */
export interface ClientCollectionGift {
  /** Id of the completed cycle */
  id: string;
  collectionName: string;
  giftLabel: string;
  completedAt: string;
  merchant: ClientCollectionMerchant;
  /** null when the coupon was deleted */
  coupon: {
    id: string;
    status: 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED';
    validFrom: string;
    expiresAt: string;
    redeemedAt: string | null;
  } | null;
}

/** GET /collections/client: open collections of the client's shops and the gifts won. */
export interface ClientCollectionsOverview {
  collections: ClientCollectionCard[];
  history: ClientCollectionGift[];
}
