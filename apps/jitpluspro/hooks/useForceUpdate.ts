import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import api from '@/services/api';

// ── Semantic version helpers ──────────────────────────────────────────────────

/**
 * Parse a semver string into [major, minor, patch] integers.
 * Any non-numeric segment defaults to 0.
 */
function parseSemver(version: string): [number, number, number] {
  const parts = version.replace(/[^0-9.]/g, '').split('.').map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * Returns true if `current` is strictly below `minimum`.
 * e.g. isBelow('1.1.3', '1.2.0') === true
 */
function isBelow(current: string, minimum: string): boolean {
  const [cMaj, cMin, cPatch] = parseSemver(current);
  const [mMaj, mMin, mPatch] = parseSemver(minimum);

  if (cMaj !== mMaj) return cMaj < mMaj;
  if (cMin !== mMin) return cMin < mMin;
  return cPatch < mPatch;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ForceUpdateStatus =
  | 'checking'   // initial request in progress
  | 'ok'         // version is acceptable
  | 'update'     // hard update required
  | 'maintenance'; // server-side maintenance mode

export interface ForceUpdateState {
  status: ForceUpdateStatus;
  /** Store URL to open for the update CTA */
  storeUrl: string;
}

// ── Store URL helpers ─────────────────────────────────────────────────────────

const ANDROID_PACKAGE = 'com.jitplus.pro';
const IOS_APP_ID = process.env.EXPO_PUBLIC_IOS_APP_ID ?? ''; // Set in .env

function getStoreUrl(): string {
  if (Platform.OS === 'android') {
    return `market://details?id=${ANDROID_PACKAGE}`;
  }
  // iOS — use App Store link with ID if available, else App Store search (never Play Store on iOS)
  if (IOS_APP_ID) {
    return `https://apps.apple.com/app/id${IOS_APP_ID}`;
  }
  return `https://apps.apple.com/search?term=jitplus+pro`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/** Re-check interval: 5 minutes */
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Checks the backend `/health/version` endpoint on mount and periodically,
 * resolving whether a force-update or maintenance screen should be shown.
 *
 * - In __DEV__ mode, `version` checks are skipped (status → 'ok').
 * - Maintenance mode is always respected regardless of __DEV__.
 * - Network errors are silently swallowed — the app always opens.
 * - Re-checks every 5 minutes so maintenance mode is detected while app is open.
 */
export function useForceUpdate(): ForceUpdateState {
  const [status, setStatus] = useState<ForceUpdateStatus>('checking');
  const storeUrl = useMemo(() => getStoreUrl(), []);
  const cancelledRef = useRef(false);

  const check = useCallback(async () => {
    try {
      const response = await api.get<{
        api_version: string;
        min_ios_version: string;
        min_android_version: string;
        maintenance: boolean;
      }>('/health/version');

      if (cancelledRef.current) return;

      const { min_ios_version = '', min_android_version = '', maintenance = false } = response.data ?? {};

      if (maintenance) {
        setStatus('maintenance');
        return;
      }

      if (__DEV__) {
        setStatus('ok');
        return;
      }

      const currentVersion = Constants.expoConfig?.version ?? '0.0.0';
      const minVersion =
        Platform.OS === 'ios' ? min_ios_version : min_android_version;

      setStatus(isBelow(currentVersion, minVersion) ? 'update' : 'ok');
    } catch {
      if (!cancelledRef.current) setStatus('ok');
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    check();

    const interval = setInterval(check, RECHECK_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [check]);

  return { status, storeUrl };
}
