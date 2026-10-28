import { resolveIncomingUrl } from '@/utils/deepLinks';

/**
 * Single entry point for links opening the app: expo-router calls this for the
 * launch URL and for every URL received while running, so links are routed
 * exactly once.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return resolveIncomingUrl(path) ?? path;
  } catch {
    return path;
  }
}
