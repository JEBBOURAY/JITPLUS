import { getServerBaseUrl } from '@/services/api';

/**
 * Resolve an image URL for display.
 * - If the path is already an absolute URL (GCS, CDN, etc.), return it as-is
 *   after validating it uses HTTPS (or HTTP in __DEV__).
 * - Otherwise, prepend the server base URL (for legacy relative paths).
 * - Rejects private/internal IPs to prevent SSRF.
 */

/** Returns true if the hostname is a private/internal network address */
function isPrivateHostname(hostname: string): boolean {
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '[::]' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname === '0:0:0:0:0:0:0:1' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) return true;

  // Check IPv6 loopback variants (bracketed or bare)
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (bare === '::1' || bare === '::' || bare === '0:0:0:0:0:0:0:1' || bare === '0:0:0:0:0:0:0:0') return true;

  // Check IPv4 private ranges
  const parts = hostname.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p))) {
    const [a, b] = parts.map(Number);
    if (a === 127) return true;                    // 127.0.0.0/8
    if (a === 10) return true;                     // 10.0.0.0/8
    if (a === 192 && b === 168) return true;       // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 169 && b === 254) return true;       // 169.254.0.0/16 (link-local)
    if (a === 0) return true;                      // 0.0.0.0/8
  }

  return false;
}

export function resolveImageUrl(path: string): string {
  if (path.startsWith('http')) {
    try {
      const url = new URL(path);
      if (isPrivateHostname(url.hostname)) {
        if (!__DEV__) return ''; // Block in production, allow in dev
      }
      // Enforce HTTPS in production
      if (!__DEV__ && url.protocol !== 'https:') return '';
      return path;
    } catch {
      return ''; // Invalid URL
    }
  }
  // Encode special characters in relative paths (spaces, unicode, etc.)
  const encoded = encodeURI(path);
  return `${getServerBaseUrl()}${encoded}`;
}
