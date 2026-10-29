/**
 * Pure helpers shared by the "Ma boutique" hub and its section screens.
 */
import {
  DEFAULT_COUNTRY, WEEK_DAYS, isValidPhoneForCountry, normalizePhone, validateOpeningHours, weekDayOf,
  type WeekDay,
} from '@jitplus/shared';
import { palette } from '@/contexts/ThemeContext';
import type { Merchant, OpeningHours, SocialLinks, Store } from '@/types';
import type { ColorPreset } from '@/components/stores/FicheControls';

export type StoreSection = 'identity' | 'locations' | 'contact' | 'hours' | 'services' | 'appearance';

export const STORE_SECTIONS: readonly StoreSection[] = ['identity', 'locations', 'contact', 'hours', 'services', 'appearance'];

export function parseSection(value?: string | string[]): StoreSection | null {
  const v = Array.isArray(value) ? value[0] : value;
  return (STORE_SECTIONS as readonly string[]).includes(v ?? '') ? (v as StoreSection) : null;
}

export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_COLOR = palette.violet;
export const PRESET_COLORS: readonly ColorPreset[] = [
  { hex: '#7C3AED', nameKey: 'colorViolet' },
  { hex: '#2563EB', nameKey: 'colorBlue' },
  { hex: '#0EA5E9', nameKey: 'colorSky' },
  { hex: '#10B981', nameKey: 'colorEmerald' },
  { hex: '#F59E0B', nameKey: 'colorAmber' },
  { hex: '#EF4444', nameKey: 'colorRed' },
  { hex: '#EC4899', nameKey: 'colorPink' },
  { hex: '#111827', nameKey: 'colorDark' },
];

export function brandColor(input?: string | null): string {
  return input && HEX_RE.test(input) ? input : DEFAULT_COLOR;
}

/** Map center used when no location is known yet (Casablanca). */
export const DEFAULT_MAP_CENTER = { latitude: 33.5731, longitude: -7.5898 } as const;

/** Warm ivory map with violet-tinted water, matching the jitplus Discover map. */
export const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#FAFAF8' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#78716C' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FAFAF8' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#F5F5F0' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#F0EFEB' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DDD6FE' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#A78BFA' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#EDE9FE' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#DDD6FE' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#F5F5F0' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#8B7E74' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#78716C' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#A8A29E' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#57534E' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.stroke', stylers: [{ color: '#FAFAF8' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#A8A29E' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#A8A29E' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#D6D3D1' }] },
];

export { WEEK_DAYS };
export type WeekDayKey = WeekDay;

/** Every day present, with copied slots so the draft can be edited freely. */
export function normalizeHours(input?: OpeningHours | null): OpeningHours {
  const out = {} as OpeningHours;
  for (const d of WEEK_DAYS) {
    const day = input?.[d];
    out[d] = {
      closed: !!day?.closed,
      slots: Array.isArray(day?.slots) ? day.slots.map((s) => ({ open: s.open, close: s.close })) : [],
    };
  }
  return out;
}

export function hoursHasAny(h?: OpeningHours | null): boolean {
  return !!h && WEEK_DAYS.some((d) => h[d]?.closed || (h[d]?.slots?.length ?? 0) > 0);
}

/**
 * i18n key of the first validation error, or null when the hours are valid.
 * Same rules as the public page: a slot may close after midnight (18:00 – 02:00).
 */
export function validateHours(h: OpeningHours): string | null {
  const error = validateOpeningHours(h);
  if (error === 'format') return 'storePreview.hoursInvalidFormat';
  if (error === 'empty') return 'storePreview.hoursInvalidRange';
  return null;
}

/** An open day without any slot reads "Fermé" on the page: store it as closed. */
export function finalizeHours(h: OpeningHours): OpeningHours {
  const out = {} as OpeningHours;
  for (const d of WEEK_DAYS) {
    const slots = h[d]?.closed ? [] : h[d]?.slots ?? [];
    out[d] = { closed: slots.length === 0, slots };
  }
  return out;
}

export function todayKey(): WeekDayKey {
  return weekDayOf(new Date());
}

export type SocialKey = keyof Required<SocialLinks>;

/** Display order of the brand links, shared by the editor and the summaries. */
export const SOCIAL_KEYS: readonly SocialKey[] = ['whatsapp', 'instagram', 'tiktok', 'facebook', 'snapchat', 'youtube', 'website'];

const PROFILE_URL_RE = /^https?:\/\/(www\.|m\.)?(instagram|tiktok|facebook|snapchat|youtube)\.com\/(add\/)?@?/i;

/** Turns what the merchant typed into the value stored by the backend. */
export function normalizeSocial(key: SocialKey, raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (key === 'website') return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  if (key === 'whatsapp') {
    // Local Moroccan numbers (06…, 6…, 212…) get +212; "00" is the international prefix.
    const compact = value.replace(/[^\d+]/g, '').replace(/^00/, '+');
    return /\d/.test(compact) ? normalizePhone(compact, DEFAULT_COUNTRY.dial) : '';
  }
  return value.replace(PROFILE_URL_RE, '').replace(/^@/, '').replace(/[/?#].*$/, '');
}

/** Same rules as the backend SocialLinksDto, so errors show before saving. */
export function isValidSocial(key: SocialKey, value: string): boolean {
  if (!value) return true;
  if (key === 'website') return /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(value) && value.length <= 200;
  if (key === 'whatsapp') {
    if (!/^\+?[0-9]{6,15}$/.test(value)) return false;
    // Moroccan numbers must also follow the ANRT format (9 digits after +212).
    return !value.startsWith(DEFAULT_COUNTRY.dial)
      || isValidPhoneForCountry(value.slice(DEFAULT_COUNTRY.dial.length), DEFAULT_COUNTRY);
  }
  return /^@?[A-Za-z0-9._-]{1,100}$/.test(value);
}

export function countSocials(links?: SocialLinks | null): number {
  return links ? SOCIAL_KEYS.filter((k) => !!links[k]).length : 0;
}

export function sectionDone(section: StoreSection, merchant: Merchant, stores: Store[]): boolean {
  switch (section) {
    case 'identity':
      return !!merchant.description?.trim() && (!!merchant.coverUrl || !!merchant.logoUrl);
    case 'locations':
      return stores.some((s) => s.isActive !== false && s.latitude != null && s.longitude != null);
    case 'contact':
      return countSocials(merchant.socialLinks) > 0 || stores.some((s) => !!s.telephone);
    case 'hours':
      return hoursHasAny(merchant.openingHours);
    case 'services':
      return (merchant.badges?.length ?? 0) > 0 || (merchant.gallery?.length ?? 0) > 0;
    case 'appearance':
      return !!merchant.themeIcon || HEX_RE.test(merchant.themeColor ?? '');
  }
}

export function sameMembers<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v));
}
