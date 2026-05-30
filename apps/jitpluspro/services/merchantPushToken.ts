import type { AxiosInstance } from 'axios';

// Module-level dedup for PATCH /merchant/push-token. On Android Expo SDK 54,
// `Notifications.addPushTokenListener`'s callback calls `getExpoPushTokenAsync`,
// which can internally re-fire the listener (FCM rotation), creating an
// infinite loop that spams the backend, hits the throttler (429), and freezes
// the JS thread. AuthContext + the listener both PATCH this endpoint — they
// all route through this helper so a single dedup gate protects every path.
let lastSentToken: string | null = null;
let lastSentAt = 0;
const COOLDOWN_MS = 10_000;

export async function sendMerchantPushToken(
  api: AxiosInstance,
  pushToken: string,
  language: string,
): Promise<void> {
  const now = Date.now();
  if (pushToken && pushToken === lastSentToken) return;
  if (pushToken && now - lastSentAt < COOLDOWN_MS) return;
  lastSentToken = pushToken;
  lastSentAt = now;
  await api.patch('/merchant/push-token', { pushToken, language });
}
