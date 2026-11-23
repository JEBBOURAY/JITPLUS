import { wallParts } from '../zoneTime';
import { normalizeSearch } from '../search';

// Booking: API shapes and pure helpers shared by JitPlus (client) and JitPlus Pro.
// Mirrors apps/backend/src/booking (controllers + services). Times are ISO UTC
// strings; local display uses the merchant's IANA zone returned by the API.

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'CANCELLED_CLIENT'
  | 'CANCELLED_MERCHANT'
  | 'DECLINED'
  | 'EXPIRED'
  | 'NO_SHOW';

export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];

/** Merchant status actions: POST booking/merchant/bookings/:id/:action */
export type MerchantBookingAction = 'confirm' | 'decline' | 'cancel' | 'no-show' | 'check-in' | 'complete';

export interface BookingSettings {
  enabled: boolean;
  autoConfirm: boolean;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  cancelDeadlineHours: number;
  /** One of BOOKING_SLOT_STEPS */
  slotStepMinutes: number;
  /** Bookings taken at the same time, 1-10 (absent on older servers = 1). */
  capacity?: number;
  noShowLimit: number;
}

export const BOOKING_SLOT_STEPS = [5, 10, 15, 20, 30, 60];

/** An unanswered request expires this long after it was made, or at its start (backend PENDING_EXPIRY_HOURS). */
export const BOOKING_PENDING_EXPIRY_HOURS = 12;
/** Stamps can be given for a booking from this long before its start (backend CHECKIN_WINDOW_MS). */
const BOOKING_CHECKIN_WINDOW_MS = 2 * 3_600_000;

/** The Pro app offers "give the stamps" on this booking: a member's visit, due or done, without stamps yet. */
export function bookingAwaitsStamps(b: Pick<MerchantBooking, 'status' | 'startsAt' | 'client' | 'stampsGiven'>, now = Date.now()): boolean {
  return (
    !!b.client?.member &&
    !b.stampsGiven &&
    (b.status === 'CONFIRMED' || b.status === 'CHECKED_IN' || b.status === 'COMPLETED') &&
    new Date(b.startsAt).getTime() <= now + BOOKING_CHECKIN_WINDOW_MS
  );
}

/** When a PENDING request expires if the merchant does not answer. */
export function pendingExpiresAt(b: { createdAt: string; startsAt: string }): Date {
  return new Date(Math.min(
    new Date(b.createdAt).getTime() + BOOKING_PENDING_EXPIRY_HOURS * 3_600_000,
    new Date(b.startsAt).getTime(),
  ));
}

export interface HourRange {
  /** 1 = Monday … 7 = Sunday */
  weekday: number;
  /** Local minutes since midnight */
  startMin: number;
  endMin: number;
}

export interface BookableService {
  id: string;
  merchantId: string;
  /** null = custom service created by the merchant */
  templateId: string | null;
  isCustom: boolean;
  nom: string;
  description: string | null;
  durationMin: number;
  bufferMin: number;
  priceFrom: number | null;
  isActive: boolean;
  order: number;
}

export interface ServiceTemplate {
  id: string;
  category: string;
  nom: string;
  description: string | null;
}

export interface AvailabilityException {
  id: string;
  merchantId: string;
  type: 'CLOSED' | 'OPEN';
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

/** GET booking/merchant/setup */
export interface BookingSetup {
  settings: BookingSettings;
  currency: string;
  /** IANA zone of the merchant */
  timeZone: string;
  services: BookableService[];
  /** Hours specific to bookings; empty = follows `openingHours` */
  hours: HourRange[];
  openingHours: HourRange[];
  templates: ServiceTemplate[];
  exceptions: AvailabilityException[];
}

/** One booking as the merchant sees it (agenda, pending list, detail). */
export interface MerchantBooking {
  id: string;
  status: BookingStatus;
  source: 'APP' | 'MERCHANT';
  startsAt: string;
  endsAt: string;
  blockedUntil: string;
  serviceId: string;
  serviceName: string;
  price: number | null;
  note: string | null;
  /**
   * Last name and phone are null unless the client shares them with merchants.
   * `member`: has an active loyalty card here, so stamps can be given without scanning their QR code.
   */
  client: { id: string; prenom: string | null; nom: string | null; telephone: string | null; member: boolean } | null;
  /** A stamp transaction is tied to this visit */
  stampsGiven: boolean;
  /** Phone / walk-in booking typed by the merchant */
  clientName: string | null;
  clientPhone: string | null;
  cancelReason: string | null;
  createdAt: string;
}

/** GET booking/merchant/agenda?from&to (max 31 days) */
export interface MerchantAgenda {
  timeZone: string;
  bookings: MerchantBooking[];
  exceptions: AvailabilityException[];
}

/** GET booking/merchants/:merchantId/offer (public) */
/** One shop of the booking search (GET booking/client/search, booking/merchants/search). */
export interface BookingSearchShop {
  merchantId: string;
  nom: string;
  logoUrl: string | null;
  categorie: string;
  ville: string | null;
  currency: string;
  /** Nearest active store, when the app sent a position. */
  distanceKm: number | null;
  /** The client holds a loyalty card there: listed first. */
  hasCard: boolean;
  services: {
    id: string;
    nom: string;
    /** Catalogue name ("Coupe homme"), shared across shops: used for the filter chips. */
    templateNom: string | null;
    durationMin: number;
    priceFrom: number | null;
  }[];
}

/** Used to match a search against service names (see search.ts). */
export { normalizeSearch };

/**
 * Shops and services matching a free-text query and/or a chip (a normalized
 * service label). A shop stays when its name matches (all its services) or when
 * at least one service matches (only those). Order is kept: own shops, then nearest.
 */
export function filterBookingShops(shops: BookingSearchShop[], query: string, chip: string | null): BookingSearchShop[] {
  const q = normalizeSearch(query);
  if (!q && !chip) return shops;
  const out: BookingSearchShop[] = [];
  for (const shop of shops) {
    const byChip = chip
      ? shop.services.filter((s) => normalizeSearch(s.templateNom ?? s.nom) === chip || normalizeSearch(s.nom) === chip)
      : shop.services;
    if (byChip.length === 0) continue;
    if (!q || normalizeSearch(shop.nom).includes(q)) {
      out.push(byChip === shop.services ? shop : { ...shop, services: byChip });
      continue;
    }
    const matching = byChip.filter((s) => normalizeSearch(s.nom).includes(q) || (!!s.templateNom && normalizeSearch(s.templateNom).includes(q)));
    if (matching.length > 0) out.push({ ...shop, services: matching });
  }
  return out;
}

/** Most offered services across the shops, as filter chips: `key` is normalized, `label` as written by a shop. */
export function bookingChips(shops: BookingSearchShop[], max = 8): { key: string; label: string }[] {
  const counts = new Map<string, { label: string; shops: Set<string> }>();
  for (const shop of shops) {
    for (const s of shop.services) {
      const label = (s.templateNom ?? s.nom).trim();
      const key = normalizeSearch(label);
      if (!key) continue;
      const entry = counts.get(key) ?? { label, shops: new Set<string>() };
      entry.shops.add(shop.merchantId);
      counts.set(key, entry);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].shops.size - a[1].shops.size || a[1].label.localeCompare(b[1].label))
    .slice(0, max)
    .map(([key, v]) => ({ key, label: v.label }));
}

export interface MerchantBookingOffer {
  enabled: boolean;
  currency?: string;
  timeZone?: string;
  maxAdvanceDays?: number;
  cancelDeadlineHours?: number;
  /** false: each request waits for the merchant (absent on older servers = confirmed). */
  autoConfirm?: boolean;
  services: {
    id: string;
    nom: string;
    description: string | null;
    durationMin: number;
    priceFrom: number | null;
  }[];
}

/** GET booking/merchants/:merchantId/availability?serviceId&date (public) */
/** GET booking/merchants/:id/availability/days?serviceId: days of the bookable window with a free slot. */
export interface AvailableDays {
  timeZone: string;
  days: string[];
}

export interface DayAvailability {
  date: string;
  timeZone: string;
  slots: { startsAt: string; endsAt: string }[];
}

/** A booking as the client sees it (create, list, cancel responses). */
export interface ClientBooking {
  id: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  /** To book the same service again */
  serviceId: string;
  serviceName: string;
  price: number | null;
  note: string | null;
  /** The merchant's reason when they declined or cancelled */
  cancelReason: string | null;
  /** Stamps this visit earned, 0 when none */
  stampsEarned: number;
  merchant: {
    id: string;
    nom: string;
    logoUrl: string | null;
    adresse: string | null;
    ville: string | null;
    phoneNumber: string | null;
    latitude: number | null;
    longitude: number | null;
    currency: string;
  };
  /** IANA zone of the merchant: show times in it */
  timeZone: string;
  cancelDeadlineHours: number;
  cancellable: boolean;
  createdAt: string;
}

/** Socket.IO events (apps/backend/src/events/events.types.ts) */
export const BOOKING_WS_EVENTS = {
  /** merchant room */
  CHANGED: 'booking:changed',
  /** client room */
  CLIENT_CHANGED: 'booking:client_changed',
} as const;

export interface BookingChangedPayload {
  bookingId: string;
  merchantId: string;
  status: BookingStatus;
  startsAt: string;
  reason: 'created' | 'status';
}

// ── Pure helpers ──────────────────────────────────────────────

/** 'HH:MM' of local minutes (540 → '09:00'; 1440 → '24:00'). */
export function minutesToHhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * '45 min', '1 h', '1 h 30'. With the app's `t`, the units come from the
 * `booking.durationFmt.{min,h,hm}` keys of both apps (Arabic: '45 د', '1 س 30');
 * without it, the French/English units.
 */
export function formatDuration(
  min: number,
  t?: (scope: string, options?: Record<string, unknown>) => string,
): string {
  const h = Math.floor(min / 60);
  const m = String(min % 60).padStart(2, '0');
  if (t) {
    if (min < 60) return t('booking.durationFmt.min', { min });
    return min % 60 ? t('booking.durationFmt.hm', { h, m }) : t('booking.durationFmt.h', { h });
  }
  if (min < 60) return `${min} min`;
  return min % 60 ? `${h} h ${m}` : `${h} h`;
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

/** Creating an Intl formatter is slow on Hermes and lists format many times: one per use and zone. */
function zoneFormatter(locale: string, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  // Options are part of the key: two formats of one zone must not share a formatter.
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
  let formatter = zoneFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone });
    zoneFormatters.set(key, formatter);
  }
  return formatter;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 'HH:MM' of an ISO instant in the merchant's zone (Hermes-safe, see zoneTime). */
export function formatBookingTime(iso: string, timeZone: string): string {
  const p = wallParts(new Date(iso), timeZone);
  if (p) return `${pad2(p.hour)}:${pad2(p.minute)}`;
  return zoneFormatter('fr-FR', timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** YYYY-MM-DD of an instant in `timeZone` (Hermes-safe, see zoneTime). */
export function ymdInZone(date: Date, timeZone: string): string {
  const p = wallParts(date, timeZone);
  if (p) return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  return zoneFormatter('en-CA', timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).slice(0, 10);
}

/** `ymd` shifted by `days` calendar days. */
export function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function isActiveBooking(status: BookingStatus): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(status);
}

/** Display name of a booking's client for the merchant. */
export function bookingClientLabel(b: Pick<MerchantBooking, 'client' | 'clientName'>): string {
  if (b.client) return [b.client.prenom, b.client.nom].filter(Boolean).join(' ') || 'Client';
  return b.clientName || 'Client';
}
