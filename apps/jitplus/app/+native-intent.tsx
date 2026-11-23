import { resolveIncomingUrl, stripAutoActionParams } from '@/utils/deepLinks';

/**
 * Single entry point for links opening the app: expo-router calls this for the
 * launch URL and for every URL received while running, so links are routed
 * exactly once.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  // Unmatched URLs go to expo-router as-is, but never with params that act on
  // arrival (e.g. join=1): those are in-app only.
  try {
    return resolveIncomingUrl(path) ?? stripAutoActionParams(path);
  } catch {
    return '/';
  }
}
