/**
 * Real-time event type definitions.
 * Shared between WebSocket gateway, FCM push enrichment, and frontend hooks.
 */

// ── Event names ─────────────────────────────────────────────────
export const WS_EVENTS = {
  // Server → Client (jitplus app)
  STAMPS_UPDATED: 'stamps:updated',
  NOTIFICATION_NEW: 'notification:new',
  SCRATCH_CARDS_CHANGED: 'scratch:cards_changed',
  COUPON_UPDATED: 'coupon:updated',
  COLLECTION_UPDATED: 'collection:updated',
  CLIENT_BOOKING_CHANGED: 'booking:client_changed',

  // Server → Merchant (jitpluspro app)
  TRANSACTION_RECORDED: 'transaction:recorded',
  COUPON_REDEEMED: 'coupon:redeemed',
  BOOKING_CHANGED: 'booking:changed',
} as const;

/** Sent to the client when one of their coupons changes (used, cancelled, extended). */
export interface CouponUpdatedPayload {
  couponId: string;
  merchantId: string;
  status: 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED';
  reason?: 'redeemed' | 'cancelled' | 'extended';
}

/** Sent to the client when an item of a collection is ticked for them at the till. */
export interface CollectionUpdatedPayload {
  merchantId: string;
  collectionId: string;
  checked: number;
  total: number;
  /** Gift coupon when this tick completed the collection */
  couponId?: string;
}

/** Sent to the client when their list of scratch cards changes. */
export interface ScratchCardsChangedPayload {
  merchantId: string;
  reason: 'received' | 'cancelled' | 'extended';
}

/** Sent to the merchant room (multi-device cashiers) after a coupon redemption. */
export interface CouponRedeemedPayload {
  merchantId: string;
  couponId: string;
  clientId: string;
}

/** Sent to the merchant room (agenda) and to the client when a booking is created or changes status. */
export interface BookingChangedPayload {
  bookingId: string;
  merchantId: string;
  status: string;
  startsAt: string;
  reason: 'created' | 'status';
}

// ── Payload types ───────────────────────────────────────────────

export interface StampsUpdatedPayload {
  clientId: string;
  merchantId: string;
  merchantName: string;
  stamps: number;
  newBalance: number;
  type: 'EARN_STAMPS' | 'REDEEM_REWARD' | 'ADJUST_STAMPS';
  rewardTitle?: string;
  /** Part of `stamps` that comes from the welcome gift */
  welcomeBonus?: number;
}

export interface NotificationNewPayload {
  clientId: string;
  notificationId: string;
  merchantId: string | null;
  title: string;
  body: string;
}

export interface TransactionRecordedPayload {
  merchantId: string;
  clientId: string;
  clientName: string;
  transactionId: string;
  type: 'EARN_STAMPS' | 'REDEEM_REWARD' | 'ADJUST_STAMPS' | 'PURCHASE';
  stamps: number;
  newBalance: number;
}
