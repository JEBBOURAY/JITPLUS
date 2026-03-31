import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getServerBaseUrl } from '@/services/api';

// ── Semantic version helpers ──────────────────────────────────────────────────

function parseSemver(version: string): [number, number, number] {
  const parts = version.replace(/[^0-9.]/g, '').split('.').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isBelow(current: string, minimum: string): boolean {
  const [cMaj, cMin, cPatch] = parseSemver(current);
  const [mMaj, mMin, mPatch] = parseSemver(minimum);

  if (cMaj !== mMaj) return cMaj < mMaj;
  if (cMin !== mMin) return cMin < mMin;
  return cPatch < mPatch;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ForceUpdateStatus =
  | 'checking'
  | 'ok'
  | 'update'
  | 'maintenance';

export interface ForceUpdateState {
  status: ForceUpdateStatus;
  storeUrl: string;
}

// ── Store URL helpers ─────────────────────────────────────────────────────────

const ANDROID_PACKAGE = 'com.jitplus.client';
const IOS_APP_ID = '6744903766';

function getStoreUrl(): string {
  if (Platform.OS === 'android') {
    return `market://details?id=${ANDROID_PACKAGE}`;
  }
  return `https://apps.apple.com/app/id${IOS_APP_ID}`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

export function useForceUpdate(): ForceUpdateState {
  const [status, setStatus] = useState<ForceUpdateStatus>('checking');
  const storeUrl = useMemo(() => getStoreUrl(), []);
  const cancelledRef = useRef(false);

  const check = useCallback(async () => {
    try {
      const baseUrl = getServerBaseUrl();
      const res = await fetch(`${baseUrl}/health/version`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json() as {
        api_version: string;
        min_ios_version: string;
        min_android_version: string;
        maintenance: boolean;
      };

      if (cancelledRef.current) return;

      const { min_ios_version, min_android_version, maintenance } = data;

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
