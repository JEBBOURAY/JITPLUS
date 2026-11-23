/**
 * Wall-clock time of an instant in an IANA zone, safe on any engine.
 *
 * Morocco left UTC+1 on 2026-09-20 (02:00 → 01:00) and has been on UTC+0 all
 * year since; tzdata carries this from 2026c. Phones and JS engines ship their
 * own copy of tzdata, and an older one still shows Morocco at UTC+1, so the
 * same booking read one hour apart on two phones. Morocco therefore never goes
 * through Intl: it reads the transitions below. Other zones use the phone clock
 * when the phone is in that zone, else Intl.
 */

const MOROCCO_ZONES = new Set(['Africa/Casablanca', 'Africa/El_Aaiun']);

/**
 * [UTC ms, offset in minutes] at each change from 2024, generated from tzdata
 * 2026c (Node Intl, hourly scan). Before the first row: +60. The last row is
 * the move to permanent UTC+0 (2026-09-20T01:00Z): it holds from then on.
 * Update this table if Morocco changes its time again.
 */
const MOROCCO_OFFSETS: readonly (readonly [number, number])[] = [
  [1704067200000, 60], [1710036000000, 0], [1713060000000, 60], [1740276000000, 0],
  [1743904800000, 60], [1771120800000, 0], [1774144800000, 60], [1789866000000, 0],
];

function moroccoOffset(ms: number): number {
  let offset = 60;
  for (const [at, value] of MOROCCO_OFFSETS) {
    if (at > ms) break;
    offset = value;
  }
  return offset;
}

let deviceZone: string | null | undefined;
function phoneZone(): string | null {
  if (deviceZone === undefined) {
    try {
      deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      deviceZone = null;
    }
  }
  return deviceZone;
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();
function intlOffset(timeZone: string, date: Date): number | null {
  try {
    let f = partFormatters.get(timeZone);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      partFormatters.set(timeZone, f);
    }
    const p: Record<string, string> = {};
    for (const part of f.formatToParts(date)) p[part.type] = part.value;
    const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
    const minuteStart = date.getTime() - (date.getTime() % 60_000);
    return Math.round((wall - minuteStart) / 60_000);
  } catch {
    return null;
  }
}

/** Minutes to add to UTC to get the wall clock of `timeZone` at `date`; null when the zone is unknown. */
export function zoneOffsetMinutes(timeZone: string, date: Date): number | null {
  if (MOROCCO_ZONES.has(timeZone)) return moroccoOffset(date.getTime());
  if (timeZone === 'UTC' || timeZone === 'Etc/UTC') return 0;
  if (timeZone === phoneZone()) return -date.getTimezoneOffset();
  return intlOffset(timeZone, date);
}

export interface WallParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

/**
 * A Date whose UTC fields are the wall clock of `date` in `timeZone`. Format it
 * with `timeZone: 'UTC'` to print local text (weekday, month name) safely.
 */
export function toZoneWall(date: Date, timeZone: string): Date | null {
  const offset = zoneOffsetMinutes(timeZone, date);
  return offset == null ? null : new Date(date.getTime() + offset * 60_000);
}

/** Wall-clock parts of `date` in `timeZone`, or null when the zone is unknown. */
export function wallParts(date: Date, timeZone: string): WallParts | null {
  const wall = toZoneWall(date, timeZone);
  if (!wall || Number.isNaN(wall.getTime())) return null;
  return {
    year: wall.getUTCFullYear(),
    month: wall.getUTCMonth() + 1,
    day: wall.getUTCDate(),
    hour: wall.getUTCHours(),
    minute: wall.getUTCMinutes(),
    weekday: wall.getUTCDay(),
  };
}
