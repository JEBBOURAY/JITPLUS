// Morocco wall-clock helpers based on the IANA zone (not a fixed UTC+1 offset):
// Africa/Casablanca switches to UTC+0 during Ramadan.

export const MOROCCO_TZ = 'Africa/Casablanca';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MOROCCO_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

const WEEKDAY_ISO: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export interface MoroccoParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 1 = Monday … 7 = Sunday */
  isoWeekday: number;
  /** Minutes since midnight */
  minutes: number;
  /** YYYY-MM-DD */
  ymd: string;
}

export function moroccoParts(date: Date = new Date()): MoroccoParts {
  const map: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(date)) map[p.type] = p.value;
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour) % 24;
  const minute = Number(map.minute);
  const second = Number(map.second);
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    isoWeekday: WEEKDAY_ISO[map.weekday] ?? 1,
    minutes: hour * 60 + minute,
    ymd: `${map.year}-${map.month}-${map.day}`,
  };
}

/** Offset of Morocco from UTC at `date`, in minutes (60 normally, 0 during Ramadan). */
export function moroccoOffsetMinutes(date: Date): number {
  const p = moroccoParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

function parseYmd(ymd: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return [y, mo, d];
}

export function isValidYmd(ymd: string): boolean {
  return parseYmd(ymd) !== null;
}

/** UTC instant of a Morocco wall-clock time on day `ymd`. */
export function moroccoWallTimeToUtc(ymd: string, hour: number, minute: number, second = 0, ms = 0): Date {
  const parts = parseYmd(ymd);
  if (!parts) throw new Error(`Invalid date: ${ymd}`);
  const [y, mo, d] = parts;
  const naive = Date.UTC(y, mo - 1, d, hour, minute, second, ms);
  // Two passes so a day on which the offset changes still resolves correctly.
  let guess = naive - moroccoOffsetMinutes(new Date(naive)) * 60_000;
  guess = naive - moroccoOffsetMinutes(new Date(guess)) * 60_000;
  return new Date(guess);
}

/** 23:59:59.999 Morocco time on `ymd`, as a UTC Date. */
export function endOfMoroccoDay(ymd: string): Date {
  return moroccoWallTimeToUtc(ymd, 23, 59, 59, 999);
}

/** YYYY-MM-DD of `date` in Morocco. */
export function moroccoYmd(date: Date = new Date()): string {
  return moroccoParts(date).ymd;
}

/** Whole days between two YYYY-MM-DD strings (to − from). */
export function diffDaysYmd(fromYmd: string, toYmd: string): number {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  if (!a || !b) return NaN;
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

/** 'DD/MM' in Morocco time, for push texts. */
export function formatMoroccoDayMonth(date: Date): string {
  const p = moroccoParts(date);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}`;
}
