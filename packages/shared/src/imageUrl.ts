/**
 * Image URL resolution with SSRF protection.
 * Shared between JitPlus and JitPlus Pro mobile apps.
 *
 * Usage:
 *   import { resolveImageUrl } from '@jitplus/shared/src/imageUrl';
 *
 * Each app wraps this with its own `getServerBaseUrl()`:
 *   export const resolve = (path: string) => resolveImageUrl(path, getServerBaseUrl(), __DEV__);
 */

/**
 * Returns true if the hostname points to a private/internal network address.
 * Covers IPv4 private ranges, IPv6 ULA/link-local/multicast, and IPv4-mapped IPv6.
 */
export function isPrivateHostname(hostname: string): boolean {
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
    if (a === 127) return true;                       // 127.0.0.0/8
    if (a === 10) return true;                        // 10.0.0.0/8
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 169 && b === 254) return true;          // 169.254.0.0/16 (link-local)
    if (a === 0) return true;                         // 0.0.0.0/8
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
    // ::ffff:0:0/96 — IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
    const v4mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4mapped) {
      return isPrivateHostname(v4mapped[1]);
    }
    // 100::/64 — Discard prefix
    if (addr.startsWith('100::')) return true;
    // 2001:db8::/32 — Documentation prefix
    if (addr.startsWith('2001:db8')) return true;
  }

  return false;
}

/**
 * Resolve an image URL for display.
 * - Absolute URLs (http/https) are returned as-is after SSRF validation.
 * - Relative paths are prepended with {@link serverBaseUrl}.
 * - In production, blocks private IPs and non-HTTPS URLs.
 *
 * @param path - The image path or URL from the API.
 * @param serverBaseUrl - Base URL for resolving relative paths (from app config).
 * @param isDev - Pass `__DEV__` — relaxes security checks for local development.
 */
export function resolveImageUrl(path: string, serverBaseUrl: string, isDev: boolean): string {
  if (path.startsWith('http')) {
    try {
      const url = new URL(path);
      if (isPrivateHostname(url.hostname) && !isDev) {
        return '';
      }
      if (url.protocol !== 'https:' && !isDev) {
        return '';
      }
      return path;
    } catch {
      return '';
    }
  }
  const encoded = encodeURI(path);
  return `${serverBaseUrl}${encoded}`;
}
