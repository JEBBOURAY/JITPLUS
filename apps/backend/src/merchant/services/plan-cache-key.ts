/**
 * Cache key of a merchant's effective plan. Shared by every service that
 * changes a plan so invalidation can never drift from the reader's key.
 */
export function planCacheKey(merchantId: string): string {
  return `plan:v1:${merchantId}`;
}
