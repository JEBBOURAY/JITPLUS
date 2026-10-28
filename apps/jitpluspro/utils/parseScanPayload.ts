import { COUPON_QR_PREFIX } from '@jitplus/shared/src/scratch';
import { isValidUUID } from '@/utils/validation';

const SIGNED_PREFIX = 'jitplus://scan/';
const LEGACY_CLIENT_PREFIX = 'jitplus://client/';

/** Hosts accepted when a QR encodes an http(s) URL; any other host is rejected to block QR-phishing. */
export const QR_ALLOWED_HOSTS: ReadonlySet<string> = new Set<string>([
  'jitplus.com',
  'www.jitplus.com',
  'jitplus.app',
  'yams.app',
  'www.yams.app',
]);

export type ScanPayload =
  /** Coupon QR (`jitplus://coupon/{token}` or a bare `c1.` token); `token` is the raw scanned data. */
  | { kind: 'coupon'; token: string }
  /** Signed client QR `jitplus://scan/{JWT}`. */
  | { kind: 'signed'; token: string }
  | { kind: 'missingToken' }
  /** Legacy, unsigned client id: must still be verified server-side. */
  | { kind: 'legacyClient'; clientId: string }
  | { kind: 'invalid' };

function extractLegacyClientId(data: string): string | undefined {
  if (data.startsWith(LEGACY_CLIENT_PREFIX)) {
    return data.replace(LEGACY_CLIENT_PREFIX, '').trim();
  }
  if (data.startsWith('http://') || data.startsWith('https://')) {
    try {
      const url = new URL(data);
      if (!QR_ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return undefined;
      return (url.searchParams.get('clientId') || url.pathname.split('/').pop() || '').trim();
    } catch {
      return undefined;
    }
  }
  if (data.includes('clientId=')) {
    return data.match(/clientId=([^&]+)/)?.[1]?.trim();
  }
  return data.trim();
}

export function parseScanPayload(data: string): ScanPayload {
  if (data.startsWith(COUPON_QR_PREFIX) || data.startsWith('c1.')) {
    return { kind: 'coupon', token: data };
  }

  if (data.startsWith(SIGNED_PREFIX)) {
    const token = data.replace(SIGNED_PREFIX, '').trim();
    return token ? { kind: 'signed', token } : { kind: 'missingToken' };
  }

  const clientId = extractLegacyClientId(data);
  if (!clientId || !isValidUUID(clientId)) return { kind: 'invalid' };
  return { kind: 'legacyClient', clientId };
}
