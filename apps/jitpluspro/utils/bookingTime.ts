import { Platform } from 'react-native';
import { wallParts } from '@jitplus/shared/src/zoneTime';
// Wall-clock helpers for the booking agenda. Bookings are stored in UTC, working
// hours are local minutes in the merchant's zone. That zone comes from the API
// (`timeZone` of GET booking/merchant/setup and /agenda): see useBookingTz.

/** Used only when the phone cannot tell its own zone. */
const DEFAULT_BOOKING_TZ ='Africa/Casablanca';

/** The phone's IANA zone: a stand-in for the shop's zone until the API gives it. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_BOOKING_TZ;
  } catch {
    return DEFAULT_BOOKING_TZ;
  }
}

interface WallParts { y: number; m: number; d: number; h: number; mi: number }

/** Wall-clock parts of an instant in `tz`, or null when the zone is unknown (Hermes-safe, see zoneTime). */
function partsIn(date: Date, tz: string): WallParts | null {
  const p = wallParts(date, tz);
  return p ? { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute } : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD of an instant in `tz` (device date as a fallback). */
export function ymdIn(date: Date, tz: string): string {
  const p = partsIn(date, tz);
  if (!p) return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Local minutes since midnight of an instant in `tz`. */
export function minutesIn(date: Date, tz: string): number {
  const p = partsIn(date, tz);
  return p ? p.h * 60 + p.mi : date.getHours() * 60 + date.getMinutes();
}

/** Instant (ISO UTC) of a wall-clock time in `tz`; two passes so DST edges resolve. */
export function wallTimeToIso(ymd: string, minutes: number, tz: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, 0, minutes);
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), tz);
    if (!p) return new Date(y, m - 1, d, 0, minutes).toISOString();
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    guess += asUtc - seen;
  }
  return new Date(guess).toISOString();
}

/** Noon of a calendar day in `tz`, to format that day in `tz` (UTC noon is already tomorrow east of UTC+12). */
export function ymdToDate(ymd: string, tz: string): Date {
  return new Date(wallTimeToIso(ymd, 12 * 60, tz));
}

/** Monday (YYYY-MM-DD) of the week holding `ymd`. */
export const MS_PER_MIN = 60_000;

/** 1 = Monday … 7 = Sunday of a calendar day. */
export function isoWeekday(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay() || 7;
}

export function mondayOf(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

/** 'HH:MM' typed by the merchant → minutes, or null. Accepts '9', '930', '9:30', '9h30'. */
/** Keyboard of an "HH:MM" field. "numbers-and-punctuation" is iOS-only: Android fell back to the full text keyboard. parseTimeInput reads "930". */
export const TIME_KEYBOARD = Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'number-pad';

export function parseTimeInput(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace('h', ':');
  let h: number;
  let mi: number;
  const colon = /^(\d{1,2}):?(\d{2})?$/.exec(s);
  const compact = /^(\d{1,2})(\d{2})$/.exec(s);
  if (compact) {
    h = Number(compact[1]);
    mi = Number(compact[2]);
  } else if (colon) {
    h = Number(colon[1]);
    mi = colon[2] ? Number(colon[2]) : 0;
  } else {
    return null;
  }
  if (mi > 59 || h > 24 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}
