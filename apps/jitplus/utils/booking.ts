import { intlLocaleTag } from '@jitplus/shared/src/currency';
import { addDaysToYmd, ymdInZone, type BookingStatus } from '@jitplus/shared/src/booking';
import { isNotFoundError } from '@/utils/errorMessage';

/** Client-side cap, same as the API (note ≤ 200 chars). */
export const BOOKING_NOTE_MAX = 200;

/** Unique enough for one client's attempts (the API scopes keys per client, ≤ 64 chars). */
export function makeIdempotencyKey(now = Date.now(), rand: () => number = Math.random): string {
  const r = () => Math.floor(rand() * 0x100000000).toString(36);
  return `bk-${now.toString(36)}-${r()}${r()}${r()}`;
}

/** Bookable days in the merchant zone: today, then `maxAdvanceDays` more. */
export function bookableDays(timeZone: string, maxAdvanceDays: number, now = new Date()): string[] {
  const today = ymdInZone(now, timeZone);
  const count = Math.max(0, Math.min(Math.floor(maxAdvanceDays), 365)) + 1;
  return Array.from({ length: count }, (_, i) => addDaysToYmd(today, i));
}

/** Noon UTC of a calendar day: formatting it with timeZone UTC never shifts the date. */
function ymdToUtcNoon(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

type DayPart = 'weekday' | 'day' | 'month' | 'long';
const DAY_PART_OPTIONS: Record<DayPart, Intl.DateTimeFormatOptions> = {
  weekday: { weekday: 'short', timeZone: 'UTC' },
  day: { day: 'numeric', timeZone: 'UTC' },
  month: { month: 'short', timeZone: 'UTC' },
  long: { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' },
};
// Building an Intl.DateTimeFormat is slow on Hermes and the day strip formats ~120 parts per render.
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
function dayFormatter(locale: string, part: DayPart): Intl.DateTimeFormat {
  const tag = intlLocaleTag(locale);
  const key = `${tag}|${part}`;
  let f = dayFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(tag, DAY_PART_OPTIONS[part]);
    dayFormatters.set(key, f);
  }
  return f;
}

/** Parts of a calendar day for the day strip ("lun.", "24"). */
export function dayChipParts(ymd: string, locale: string): { weekday: string; day: string; month: string } {
  const date = ymdToUtcNoon(ymd);
  return {
    weekday: dayFormatter(locale, 'weekday').format(date),
    day: dayFormatter(locale, 'day').format(date),
    month: dayFormatter(locale, 'month').format(date),
  };
}

/** "lundi 24 novembre" of a calendar day. */
export function formatYmdLong(ymd: string, locale: string): string {
  return dayFormatter(locale, 'long').format(ymdToUtcNoon(ymd));
}

/** "lundi 24 novembre" of an instant, read in the merchant zone. */
export function formatBookingDay(iso: string, timeZone: string, locale: string): string {
  return formatYmdLong(ymdInZone(new Date(iso), timeZone), locale);
}

export type BookingTone = 'success' | 'warning' | 'danger' | 'muted';

export function bookingStatusTone(status: BookingStatus): BookingTone {
  switch (status) {
    case 'CONFIRMED':
    case 'CHECKED_IN':
    case 'COMPLETED':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'CANCELLED_MERCHANT':
    case 'DECLINED':
    case 'NO_SHOW':
      return 'danger';
    default:
      return 'muted';
  }
}

export type BookingErrorKind = 'slotTaken' | 'conflict' | 'verify' | 'other';

/**
 * What a failed booking means for the flow. The backend sends a stable
 * `code` (error.booking.*); the message test is a fallback for older servers.
 */
export function classifyBookingError(
  status: number | undefined,
  message: string | undefined,
  code?: string,
): BookingErrorKind {
  if (code === 'error.booking.slotTaken') return 'slotTaken';
  if (code === 'error.booking.verifyAccount') return 'verify';
  if (status === 403) return 'verify';
  if (status === 409) return !code && /cr[ée]neau/i.test(message ?? '') ? 'slotTaken' : 'conflict';
  return 'other';
}

/** The booking does not exist (or is not this client's): retrying will not help. */
export function isBookingNotFound(err: unknown): boolean {
  return isNotFoundError(err);
}

export type DayPeriod = 'morning' | 'afternoon' | 'evening';

/**
 * Slot indexes grouped by part of the day, in order, from "HH:MM" labels
 * (24 h, merchant time): before 12:00, before 17:00, then the evening.
 */
export function groupSlotsByPeriod(labels: string[]): { period: DayPeriod; indexes: number[] }[] {
  const groups: { period: DayPeriod; indexes: number[] }[] = [];
  labels.forEach((label, i) => {
    const hour = Number(label.slice(0, 2));
    const period: DayPeriod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const last = groups[groups.length - 1];
    if (last?.period === period) last.indexes.push(i);
    else groups.push({ period, indexes: [i] });
  });
  return groups;
}
