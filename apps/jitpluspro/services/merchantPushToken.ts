import type { AxiosInstance } from 'axios';

// Module-level dedup for PATCH /merchant/push-token. On Android Expo SDK 54,
// `Notifications.addPushTokenListener`'s callback calls `getExpoPushTokenAsync`,
// which can internally re-fire the listener (FCM rotation), creating an
// infinite loop that spams the backend, hits the throttler (429), and freezes
// the JS thread. AuthContext + the listener both PATCH this endpoint — they
// all route through this helper so a single dedup gate protects every path.
//
// `lastSentToken` only records tokens the backend accepted: recording it before
// the request would make a single network failure block every later retry.
let lastSentToken: string | null = null;
let lastAttemptAt = 0;
let inFlight: { token: string; promise: Promise<void> } | null = null;
let trailing: { timer: ReturnType<typeof setTimeout>; token: string } | null = null;
let generation = 0;
const COOLDOWN_MS = 10_000;

function cancelTrailing() {
  if (trailing) {
    clearTimeout(trailing.timer);
    trailing = null;
  }
}

/** Forget what was sent, e.g. on sign-out, so the next account re-registers this device. */
export function resetMerchantPushTokenCache(): void {
  cancelTrailing();
  generation += 1;
  lastSentToken = null;
  lastAttemptAt = 0;
  inFlight = null;
}

export async function sendMerchantPushToken(
  api: AxiosInstance,
  pushToken: string,
  language: string,
): Promise<void> {
  if (!pushToken) {
    resetMerchantPushTokenCache();
    await api.patch('/merchant/push-token', { pushToken, language });
    return;
  }
  if (pushToken === lastSentToken) return;
  if (inFlight?.token === pushToken) return inFlight.promise;

  const wait = COOLDOWN_MS - (Date.now() - lastAttemptAt);
  if (wait > 0) {
    // Burst protection, but a rotated token must not be lost: send the most
    // recent one once the cooldown expires.
    cancelTrailing();
    const timer = setTimeout(() => {
      trailing = null;
      sendMerchantPushToken(api, pushToken, language).catch(() => {});
    }, wait);
    trailing = { timer, token: pushToken };
    return;
  }

  cancelTrailing();
  lastAttemptAt = Date.now();
  const gen = generation;
  const promise = api
    .patch('/merchant/push-token', { pushToken, language })
    .then(() => {
      // A sign-out during the request invalidates this result.
      if (gen === generation) lastSentToken = pushToken;
    })
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
  inFlight = { token: pushToken, promise };
  return promise;
}
