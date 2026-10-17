import { Linking, Platform } from 'react-native';

/** Opens the first URL the device can handle (native app first, web fallback next). */
export async function openFirst(urls: string[]): Promise<boolean> {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch { /* try the next url */ }
  }
  return false;
}

/** Accepts "@user", "user" or a full profile URL and returns the bare handle. */
export function toHandle(raw: string | undefined, domain: string): string {
  if (!raw) return '';
  const prefix = new RegExp(`^https?://(www\\.|m\\.)?${domain.replace('.', '\\.')}/@?`, 'i');
  return raw.trim().replace(prefix, '').replace(/^@/, '').replace(/[/?#].*$/, '').trim();
}

export function toWebsite(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const url = /^https?:\/\//i.test(raw) ? raw.trim() : `https://${raw.trim()}`;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

export function toWhatsappUrl(raw: string | undefined): string | null {
  const digits = raw?.replace(/[^\d]/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}

export function openDirections(latitude: number, longitude: number, label: string): Promise<boolean> {
  const name = encodeURIComponent(label);
  const native = Platform.select({
    ios: `maps:0,0?q=${name}@${latitude},${longitude}`,
    default: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${name})`,
  });
  return openFirst([native, `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`]);
}

export function callPhone(phone: string): Promise<boolean> {
  return openFirst([`tel:${phone.replace(/[^\d+]/g, '')}`]);
}
