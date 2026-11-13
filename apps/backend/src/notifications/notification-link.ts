/** Push payload keys the client app needs to open the screen a notification points at. */
const LINK_KEYS = ['event', 'action', 'merchantId', 'couponId', 'cardId', 'campaignId', 'dealId'] as const;

/**
 * Deep link stored on an in-app notification: the routing keys of its push
 * payload, without the display extras (logo, socials, balances).
 */
export function notificationLink(data?: Record<string, string> | null): Record<string, string> | undefined {
  if (!data) return undefined;
  const link: Record<string, string> = {};
  for (const key of LINK_KEYS) {
    if (typeof data[key] === 'string' && data[key]) link[key] = data[key];
  }
  return Object.keys(link).length > 0 ? link : undefined;
}
