import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import axios from 'axios';
import { getServerBaseUrl } from '@/services/api';
import { ANDROID_PACKAGE, IOS_APP_ID } from '@/constants';

// ── Semantic version helpers ──────────────────────────────────────────────────

function parseSemver(version: string): [number, number, number] {
  const parts = version.replace(/[^0-9.]/g, '').split('.').map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
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

// ── Store URL helper ──────────────────────────────────────────────────────────

function getStoreUrl(): string {
  if (Platform.OS === 'android') {
    return `market://details?id=${ANDROID_PACKAGE}`;
  }
  if (IOS_APP_ID) {
    return `https://apps.apple.com/app/id${IOS_APP_ID}`;
  }
  return `https://apps.apple.com/search?term=jitplus`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h — version changes are rare, no need to poll every 30min

export function useForceUpdate(): ForceUpdateState {
  const [status, setStatus] = useState<ForceUpdateStatus>('checking');
  const storeUrl = useMemo(() => getStoreUrl(), []);
  const cancelledRef = useRef(false);

  const check = useCallback(async () => {
    try {
      const response = await axios.get<{
        api_version: string;
        min_ios_version: string;
        min_android_version: string;
        maintenance: boolean;
      }>(`${getServerBaseUrl()}/health/version`);

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
