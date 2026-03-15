/**
 * Real-time event constants and payload types.
 * Shared between backend (emitter) and mobile apps (consumer).
 *
 * Import directly:
 *   import { WS_EVENTS, PointsUpdatedPayload } from '@jitplus/shared/src/realtime';
 */

// ── Event names ─────────────────────────────────────────────────
export const WS_EVENTS = {
  POINTS_UPDATED: 'points:updated',
  NOTIFICATION_NEW: 'notification:new',
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
