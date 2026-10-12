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

  // Server → Merchant (jitpluspro app)
  TRANSACTION_RECORDED: 'transaction:recorded',
  COUPON_REDEEMED: 'coupon:redeemed',
} as const;

/** Sent to the client when one of their coupons changes (used, cancelled, extended). */
export interface CouponUpdatedPayload {
  couponId: string;
  merchantId: string;
  status: 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED';
  reason?: 'redeemed' | 'cancelled' | 'extended';
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

// ── Payload types ───────────────────────────────────────────────

export interface StampsUpdatedPayload {
  clientId: string;
  merchantId: string;
  merchantName: string;
  stamps: number;
  newBalance: number;
  type: 'EARN_STAMPS' | 'REDEEM_REWARD' | 'ADJUST_STAMPS';
  rewardTitle?: string;
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
  type: 'EARN_STAMPS' | 'REDEEM_REWARD' | 'ADJUST_STAMPS';
  stamps: number;
  newBalance: number;
}
