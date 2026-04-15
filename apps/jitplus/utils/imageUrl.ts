import { getServerBaseUrl } from '@/services/api';
import { resolveImageUrl as resolveShared } from '@jitplus/shared';

/**
 * Resolve an image URL for display.
 * Delegates to shared implementation with app-specific server base URL.
 */
export function resolveImageUrl(path: string): string {
  return resolveShared(path, getServerBaseUrl(), __DEV__);
}
