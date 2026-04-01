import { getServerBaseUrl } from '@/services/api';

/**
 * Resolve an image URL for display.
 * - Absolute URLs (http/https) are returned as-is after validation.
 * - Relative paths are prepended with the server base URL.
 * - Rejects private/internal IPs in production to prevent SSRF.
 */

function isPrivateHostname(hostname: string): boolean {
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '[::]' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) return true;

  // IPv4 private ranges
  const parts = hostname.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p))) {
    const [a, b] = parts.map(Number);
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
  }

  // IPv6 private ranges (bracketed notation used in URLs)
  const ipv6Match = hostname.match(/^\[(.+)\]$/);
  if (ipv6Match) {
    const addr = ipv6Match[1].toLowerCase();
    if (addr === '::' || addr === '::1') return true;
    // fc00::/7 — Unique local addresses
    if (addr.startsWith('fc') || addr.startsWith('fd')) return true;
    // fe80::/10 — Link-local addresses
    if (addr.startsWith('fe80') || addr.startsWith('fe90') ||
        addr.startsWith('fea0') || addr.startsWith('feb0')) return true;
    // ff00::/8 — Multicast
    if (addr.startsWith('ff')) return true;
    // ::ffff:0:0/96 — IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1, ::ffff:10.0.0.1)
    const v4mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4mapped) {
      // Recurse into the IPv4 portion
      return isPrivateHostname(v4mapped[1]);
    }
    // 100::/64 — Discard prefix
    if (addr.startsWith('100::')) return true;
    // 2001:db8::/32 — Documentation prefix
    if (addr.startsWith('2001:db8')) return true;
  }

  return false;
}

export function resolveImageUrl(path: string): string {
  if (path.startsWith('http')) {
    try {
      const url = new URL(path);
      if (isPrivateHostname(url.hostname) && !__DEV__) {
        return '';
      }
      if (url.protocol !== 'https:' && !__DEV__) {
        return '';
      }
      return path;
    } catch {
      if (__DEV__) console.warn('[imageUrl] invalid URL:', path);
      return '';
    }
  }
  const encoded = encodeURI(path);
  return `${getServerBaseUrl()}${encoded}`;
}
