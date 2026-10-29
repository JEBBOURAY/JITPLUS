/**
 * Rules of the public merchant page ("fiche commerce").
 *
 * The client page (jitplus `app/merchant/[id].tsx`) and its preview in
 * JitPlus Pro (`components/FichePreviewModal.tsx`) both render from these
 * helpers, so a merchant always previews exactly what customers see.
 * Pure TypeScript: safe for every app, including admin and backend.
 */
import { MERCHANT_BADGE_CODES } from './types';
import type { MerchantBadge, OpeningHours, OpeningHoursDay, SocialLinks, WeekDay } from './types';

// ── Opening hours ───────────────────────────────────────────────────────────

export const WEEK_DAYS: readonly WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const MINUTES_PER_DAY = 24 * 60;
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
/** Format stored by the backend (OpeningSlotDto). */
const HHMM_STRICT = /^([01]\d|2[0-3]):[0-5]\d$/;

interface Slot {
  open: number;
  /** Minutes from the day's midnight; above 1440 when the slot runs past midnight. */
  close: number;
  openLabel: string;
  closeLabel: string;
}

function toMinutes(value: string | undefined): number | null {
  const match = HHMM.exec(value?.trim() ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function slotsOf(day: OpeningHoursDay | undefined): Slot[] {
  if (!day || day.closed || !day.slots?.length) return [];
  const slots: Slot[] = [];
  for (const s of day.slots) {
    const open = toMinutes(s.open);
    const close = toMinutes(s.close);
    if (open == null || close == null || open === close) continue;
    slots.push({
      open,
      close: close < open ? close + MINUTES_PER_DAY : close,
      openLabel: s.open.trim(),
      closeLabel: s.close.trim(),
    });
  }
  return slots.sort((a, b) => a.open - b.open);
}

/** Monday-first weekday key for a date. */
export function weekDayOf(date: Date): WeekDay {
  return WEEK_DAYS[(date.getDay() + 6) % 7];
}

export function hasOpeningHours(hours: OpeningHours | null | undefined): hours is OpeningHours {
  return !!hours && WEEK_DAYS.some((d) => !!hours[d]);
}

/** "09:00 – 12:30 · 14:00 – 19:00", or null when closed that day. */
export function formatDaySlots(day: OpeningHoursDay | undefined): string | null {
  const slots = slotsOf(day);
  if (!slots.length) return null;
  return slots.map((s) => `${s.openLabel} – ${s.closeLabel}`).join(' · ');
}

export interface OpenStatus {
  isOpen: boolean;
  /** Set when open. */
  closesAt?: string;
  /** Set when closed and a next opening exists within the week. */
  opensAt?: string;
  opensInDays?: number;
  opensDay?: WeekDay;
}

/** Live open/closed state, including slots that run past midnight. */
export function getOpenStatus(hours: OpeningHours | null | undefined, now: Date = new Date()): OpenStatus | null {
  if (!hasOpeningHours(hours)) return null;
  const todayIdx = (now.getDay() + 6) % 7;
  const current = now.getHours() * 60 + now.getMinutes();

  const yesterday = slotsOf(hours[WEEK_DAYS[(todayIdx + 6) % 7]]);
  for (const s of yesterday) {
    if (s.close > MINUTES_PER_DAY && current < s.close - MINUTES_PER_DAY) {
      return { isOpen: true, closesAt: s.closeLabel };
    }
  }

  const today = slotsOf(hours[WEEK_DAYS[todayIdx]]);
  for (const s of today) {
    if (current >= s.open && current < s.close) return { isOpen: true, closesAt: s.closeLabel };
  }

  const laterToday = today.find((s) => s.open > current);
  if (laterToday) {
    return { isOpen: false, opensAt: laterToday.openLabel, opensInDays: 0, opensDay: WEEK_DAYS[todayIdx] };
  }
  for (let offset = 1; offset <= 7; offset++) {
    const key = WEEK_DAYS[(todayIdx + offset) % 7];
    const first = slotsOf(hours[key])[0];
    if (first) return { isOpen: false, opensAt: first.openLabel, opensInDays: offset, opensDay: key };
  }
  return { isOpen: false };
}

export type Translate = (scope: string, options?: Record<string, unknown>) => string;

/**
 * "Ouvert · ferme à 19:00", "Fermé · ouvre demain à 09:00"…
 * `ns` is the i18n namespace holding the keys (`merchant` in jitplus, `fiche` in Pro).
 */
export function describeOpenStatus(status: OpenStatus, t: Translate, ns: 'merchant' | 'fiche'): string {
  if (status.isOpen) return t(`${ns}.openUntil`, { time: status.closesAt });
  if (!status.opensAt) return t(`${ns}.closedNow`);
  if (status.opensInDays === 0) return t(`${ns}.closedOpensAt`, { time: status.opensAt });
  if (status.opensInDays === 1) return t(`${ns}.closedOpensTomorrow`, { time: status.opensAt });
  return t(`${ns}.closedOpensDay`, { day: t(`${ns}.days.${status.opensDay}`), time: status.opensAt });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Se termine dans 3 j", "Se termine demain"… for the lucky wheel campaign. */
export function describeWheelEnd(endsAt: string, t: Translate, ns: 'merchant' | 'fiche', now: number = Date.now()): string {
  const days = Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / DAY_MS));
  if (days === 0) return t(`${ns}.luckyWheelEndsToday`);
  if (days === 1) return t(`${ns}.luckyWheelEndsTomorrow`);
  return t(`${ns}.luckyWheelEndsIn`, { days });
}

export type OpeningHoursError = 'format' | 'empty';

/**
 * Editor-side check. A slot may run past midnight (18:00 – 02:00): it is
 * shown as such on the page. Only an empty slot (open = close) is rejected.
 */
export function validateOpeningHours(hours: OpeningHours): OpeningHoursError | null {
  for (const d of WEEK_DAYS) {
    const day = hours[d];
    if (!day || day.closed) continue;
    for (const s of day.slots ?? []) {
      if (!HHMM_STRICT.test(s.open) || !HHMM_STRICT.test(s.close)) return 'format';
      if (s.open === s.close) return 'empty';
    }
  }
  return null;
}

// ── Links ───────────────────────────────────────────────────────────────────

/** Accepts "@user", "user" or a full profile URL and returns the bare handle. */
function toHandle(raw: string | null | undefined, domain: string): string {
  if (!raw) return '';
  const prefix = new RegExp(`^https?://(www\\.|m\\.)?${domain.replace(/\./g, '\\.')}/@?`, 'i');
  return raw.trim().replace(prefix, '').replace(/^@/, '').replace(/[/?#].*$/, '').trim();
}

/** Absolute http(s) URL, or null for anything else (javascript:, data:…). */
export function toWebsite(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.') ? parsed.href : null;
  } catch {
    return null;
  }
}

function toWhatsappUrl(raw: string | null | undefined): string | null {
  const digits = raw?.replace(/\D/g, '');
  return digits && digits.length >= 6 ? `https://wa.me/${digits}` : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function toMailto(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  return value && EMAIL_RE.test(value) ? `mailto:${value}` : null;
}

/** `tel:` keeps the leading + and the digits only. */
export function toTel(raw: string | null | undefined): string | null {
  const value = raw?.replace(/[^\d+]/g, '');
  return value && /\d{6,}/.test(value) ? `tel:${value}` : null;
}

export type SocialNetwork = 'instagram' | 'tiktok' | 'facebook' | 'snapchat' | 'youtube';

/** Display order of the social profiles on the page. */
const SOCIAL_NETWORKS: readonly SocialNetwork[] = ['instagram', 'tiktok', 'facebook', 'snapchat', 'youtube'];

export interface SocialProfile {
  network: SocialNetwork;
  handle: string;
  /** Tried in order: native app first, web next. */
  urls: string[];
}

/** Social profiles with the URLs to open. WhatsApp and website are contact actions. */
export function getSocialProfiles(links: SocialLinks | null | undefined): SocialProfile[] {
  const out: SocialProfile[] = [];
  if (!links) return out;
  for (const network of SOCIAL_NETWORKS) {
    let handle = toHandle(links[network], `${network}.com`);
    if (network === 'snapchat') handle = handle.replace(/^add\//, '');
    if (!handle) continue;
    const h = encodeURIComponent(handle);
    const web: Record<SocialNetwork, string> = {
      instagram: `https://www.instagram.com/${h}`,
      tiktok: `https://www.tiktok.com/@${h}`,
      facebook: `https://www.facebook.com/${h}`,
      snapchat: `https://www.snapchat.com/add/${h}`,
      youtube: `https://www.youtube.com/@${h}`,
    };
    const urls = network === 'instagram' ? [`instagram://user?username=${h}`, web.instagram] : [web[network]];
    out.push({ network, handle, urls });
  }
  return out;
}

export interface FicheStoreContact {
  nom?: string | null;
  telephone?: string | null;
  email?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function hasCoords<T extends { latitude?: number | null; longitude?: number | null }>(
  value: T,
): value is T & { latitude: number; longitude: number } {
  return typeof value.latitude === 'number' && typeof value.longitude === 'number'
    && Number.isFinite(value.latitude) && Number.isFinite(value.longitude);
}

export type FicheContact =
  | { key: 'directions'; latitude: number; longitude: number; label: string }
  | { key: 'call' | 'whatsapp' | 'website' | 'email'; url: string };

/**
 * One-tap contact row under the hero, in display order. `stores` must be
 * sorted with the store to use first (nearest to the customer).
 */
export function getFicheContacts(merchant: {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  socialLinks?: SocialLinks | null;
  stores: readonly FicheStoreContact[];
}): FicheContact[] {
  const out: FicheContact[] = [];
  const first = merchant.stores[0];
  const target = first && hasCoords(first) ? first : hasCoords(merchant) ? merchant : null;
  if (target) {
    out.push({ key: 'directions', latitude: target.latitude, longitude: target.longitude, label: first?.nom || merchant.name });
  }
  const call = toTel(first?.telephone || merchant.stores.find((s) => !!s.telephone)?.telephone);
  if (call) out.push({ key: 'call', url: call });
  const whatsapp = toWhatsappUrl(merchant.socialLinks?.whatsapp);
  if (whatsapp) out.push({ key: 'whatsapp', url: whatsapp });
  const website = toWebsite(merchant.socialLinks?.website);
  if (website) out.push({ key: 'website', url: website });
  const email = toMailto(first?.email || merchant.stores.find((s) => !!s.email)?.email);
  if (email) out.push({ key: 'email', url: email });
  return out;
}

// ── Description: clickable links ────────────────────────────────────────────

export interface TextPart {
  text: string;
  /** Set on links: http(s), mailto: or tel: only. */
  url?: string;
}

// URLs, e-mails, then international (+212 6…, 00212…) or Moroccan local (06…, 05…) phones.
const LINK_RE = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|((?:\+|00)\d{1,3}(?:[\s.-]?\d){8,11}|\b0[5-8](?:[\s.-]?\d){8}\b)/g;
const TRAILING_PUNCT = /[.,;:!?)\]}'"»]+$/;

/** Splits free text so URLs, e-mails and phone numbers can be rendered as links. */
export function linkifyText(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_RE)) {
    let raw = match[0];
    const start = match.index ?? 0;
    let url: string | null = null;
    if (match[1]) {
      raw = raw.replace(TRAILING_PUNCT, '');
      url = toWebsite(raw);
    } else if (match[2]) {
      url = toMailto(raw);
    } else {
      url = toTel(raw.replace(/^00/, '+'));
    }
    if (!url) continue;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: raw, url });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

// ── Page tabs ───────────────────────────────────────────────────────────────

export type FicheTab = 'overview' | 'loyalty' | 'deals' | 'info' | 'photos';

/** Tabs of the page in display order; a section with nothing to show gets no tab. */
export function getFicheTabs({ hasDeals, photoCount }: { hasDeals: boolean; photoCount: number }): FicheTab[] {
  const tabs: FicheTab[] = ['overview', 'loyalty'];
  if (hasDeals) tabs.push('deals');
  tabs.push('info');
  if (photoCount > 0) tabs.push('photos');
  return tabs;
}

// ── Loyalty, badges, counts ─────────────────────────────────────────────────

export const DEFAULT_STAMPS_GOAL = 10;

/** `_one` / `_other` key for a count, the convention of both apps' locale files. */
export function pluralKey(key: string, count: number): string {
  return `${key}_${count === 1 ? 'one' : 'other'}`;
}

export interface FicheReward {
  id: string;
  titre: string;
  cout: number;
  description?: string | null;
  imageUrl?: string | null;
}

/** Rewards by cost; a programme without rewards shows one gift at the stamp goal. */
export function getFicheRewards(
  rewards: readonly FicheReward[] | null | undefined,
  stampsForReward: number | null | undefined,
  defaultTitle: string,
): FicheReward[] {
  const list = (rewards ?? []).filter((r) => r.cout > 0).sort((a, b) => a.cout - b.cout);
  if (list.length) return list;
  return [{ id: 'default', titre: defaultTitle, cout: stampsForReward || DEFAULT_STAMPS_GOAL }];
}

/** Badge codes the apps know how to display, in the merchant's order. */
export function getKnownBadges(codes: readonly string[] | null | undefined): MerchantBadge[] {
  return (codes ?? []).filter((c): c is MerchantBadge => (MERCHANT_BADGE_CODES as readonly string[]).includes(c));
}

/** Below this the member count reads as a weakness rather than social proof. */
export const MIN_MEMBERS_SHOWN = 10;

export function formatCompactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export const CATEGORY_EMOJI: Record<string, string> = {
  CAFE: '☕',
  RESTAURANT: '🍽️',
  EPICERIE: '🛒',
  BOULANGERIE: '🥖',
  PHARMACIE: '💊',
  LIBRAIRIE: '📚',
  VETEMENTS: '👗',
  ELECTRONIQUE: '📱',
  COIFFURE: '💇',
  BEAUTE: '💄',
  SPORT: '⚽',
  SUPERMARCHE: '🏪',
  BOUCHERIE: '🥩',
  PATISSERIE: '🍰',
  FASTFOOD: '🍔',
  HAMMAM: '🧖',
  ANIMALERIE: '🐾',
  FLEURISTE: '💐',
  BIJOUTERIE: '💍',
  OPTIQUE: '👓',
  TELEPHONE: '📱',
  BRICOLAGE: '🔧',
  AUTO: '🚗',
  HOTEL: '🏨',
  PARFUMERIE: '🌸',
  TRAITEUR: '🍱',
  LOCATION_VOITURE: '🚙',
  SALLE_JEU: '🎮',
  AUTRE: '🏷️',
};

/** Logo stand-in when the merchant has neither a logo nor a theme icon. */
export function getCategoryEmoji(category: string | null | undefined): string {
  return (category && CATEGORY_EMOJI[category.toUpperCase()]) || '🏪';
}
