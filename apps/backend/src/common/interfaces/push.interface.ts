// ── Push Notification Provider Interface ────────────────────────────────────
// Abstract away the push notification backend (Firebase FCM, OneSignal, Expo, APNs).

export interface PushMulticastResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
}

export interface IPushProvider {
  /**
   * Send a push notification to multiple device tokens.
   * Automatically handles batching if needed.
   */
  sendMulticast(
    tokens: string[],
    title: string,
    body: string,
    imageUrl?: string,
    data?: Record<string, string>,
    androidChannelId?: string,
  ): Promise<PushMulticastResult>;

  /**
   * Send a push notification to a single merchant device.
   * Errors are caught internally — never throws.
   */
  sendToMerchant(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void>;
}
