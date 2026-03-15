/**
 * Real-time event type definitions.
 * Shared between WebSocket gateway, FCM push enrichment, and frontend hooks.
 */

// ── Event names ─────────────────────────────────────────────────
export const WS_EVENTS = {
  // Server → Client (jitplus app)
  POINTS_UPDATED: 'points:updated',
  NOTIFICATION_NEW: 'notification:new',

  // Server → Merchant (jitpluspro app)
  TRANSACTION_RECORDED: 'transaction:recorded',
} as const;

// ── Payload types ───────────────────────────────────────────────

export interface PointsUpdatedPayload {
  clientId: string;
  merchantId: string;
  merchantName: string;
  loyaltyType: 'POINTS' | 'STAMPS';
  points: number;
  newBalance: number;
  type: 'EARN_POINTS' | 'REDEEM_REWARD' | 'ADJUST_POINTS';
  rewardTitle?: string;
}

export interface NotificationNewPayload {
  clientId: string;
  notificationId: string;
  merchantId: string;
  title: string;
  body: string;
}

export interface TransactionRecordedPayload {
  merchantId: string;
  clientId: string;
  clientName: string;
  transactionId: string;
  type: 'EARN_POINTS' | 'REDEEM_REWARD' | 'ADJUST_POINTS';
  points: number;
  newBalance: number;
}
