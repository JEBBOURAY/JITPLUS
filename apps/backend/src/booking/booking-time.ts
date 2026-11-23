// Wall-clock helpers for any IANA zone. Hours are typed by the merchant in
// local time; everything is stored and compared in UTC. Same two-pass method
// as common/utils/morocco-time.ts, so DST and Morocco's Ramadan switch to
// UTC+0 resolve correctly.

/** Main IANA zone per country code (the merchant's countryCode). */
const COUNTRY_TZ: Record<string, string> = {
  MA: 'Africa/Casablanca', DZ: 'Africa/Algiers', TN: 'Africa/Tunis', LY: 'Africa/Tripoli', EG: 'Africa/Cairo',
  MR: 'Africa/Nouakchott', SN: 'Africa/Dakar', ML: 'Africa/Bamako', BF: 'Africa/Ouagadougou', NE: 'Africa/Niamey',
  CI: 'Africa/Abidjan', GN: 'Africa/Conakry', TG: 'Africa/Lome', BJ: 'Africa/Porto-Novo', GH: 'Africa/Accra',
  NG: 'Africa/Lagos', CM: 'Africa/Douala', GA: 'Africa/Libreville', CG: 'Africa/Brazzaville', CD: 'Africa/Kinshasa',
  MG: 'Indian/Antananarivo', ZA: 'Africa/Johannesburg',
  FR: 'Europe/Paris', BE: 'Europe/Brussels', CH: 'Europe/Zurich', LU: 'Europe/Luxembourg', DE: 'Europe/Berlin',
  ES: 'Europe/Madrid', PT: 'Europe/Lisbon', IT: 'Europe/Rome', NL: 'Europe/Amsterdam', GB: 'Europe/London',
  IE: 'Europe/Dublin', AT: 'Europe/Vienna', DK: 'Europe/Copenhagen', SE: 'Europe/Stockholm', NO: 'Europe/Oslo',
  FI: 'Europe/Helsinki', PL: 'Europe/Warsaw', CZ: 'Europe/Prague', RO: 'Europe/Bucharest', GR: 'Europe/Athens',
  UA: 'Europe/Kyiv', RU: 'Europe/Moscow', TR: 'Europe/Istanbul',
  AE: 'Asia/Dubai', SA: 'Asia/Riyadh', QA: 'Asia/Qatar', KW: 'Asia/Kuwait', BH: 'Asia/Bahrain', OM: 'Asia/Muscat',
  JO: 'Asia/Amman', LB: 'Asia/Beirut', IL: 'Asia/Jerusalem', IQ: 'Asia/Baghdad',
  IN: 'Asia/Kolkata', PK: 'Asia/Karachi', BD: 'Asia/Dhaka', CN: 'Asia/Shanghai', JP: 'Asia/Tokyo', KR: 'Asia/Seoul',
  SG: 'Asia/Singapore', MY: 'Asia/Kuala_Lumpur', TH: 'Asia/Bangkok', VN: 'Asia/Ho_Chi_Minh', PH: 'Asia/Manila',
  ID: 'Asia/Jakarta', AU: 'Australia/Sydney', NZ: 'Pacific/Auckland',
  US: 'America/New_York', CA: 'America/Toronto', MX: 'America/Mexico_City', BR: 'America/Sao_Paulo',
  AR: 'America/Argentina/Buenos_Aires', CL: 'America/Santiago', CO: 'America/Bogota', PE: 'America/Lima',
};

const DEFAULT_TZ = 'Africa/Casablanca';

export function timeZoneForCountry(countryCode: string | null | undefined): string {
  return (countryCode && COUNTRY_TZ[countryCode.toUpperCase()]) || DEFAULT_TZ;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** YYYY-MM-DD */
  ymd: string;
}

export function zonedParts(tz: string, date: Date): ZonedParts {
  const map: Record<string, string> = {};
  for (const p of formatterFor(tz).formatToParts(date)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
    ymd: `${map.year}-${map.month}-${map.day}`,
  };
}

function offsetMinutes(tz: string, date: Date): number {
  const p = zonedParts(tz, date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

export function parseYmd(ymd: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return [y, mo, d];
}

/** UTC instant of local wall-clock `minutes` (0–1440) on day `ymd` in `tz`. */
export function wallTimeToUtc(tz: string, ymd: string, minutes: number): Date {
  const parts = parseYmd(ymd);
  if (!parts) throw new Error(`Invalid date: ${ymd}`);
  const [y, mo, d] = parts;
  const naive = Date.UTC(y, mo - 1, d, 0, 0, 0) + minutes * 60_000;
  let guess = naive - offsetMinutes(tz, new Date(naive)) * 60_000;
  guess = naive - offsetMinutes(tz, new Date(guess)) * 60_000;
  return new Date(guess);
}

/** ISO weekday (1 = Monday) of a calendar day, independent of any zone. */
export function isoWeekdayOfYmd(ymd: string): number {
  const parts = parseYmd(ymd);
  if (!parts) throw new Error(`Invalid date: ${ymd}`);
  const js = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
  return js === 0 ? 7 : js;
}

/** `ymd` shifted by `days` calendar days. */
export function addDaysYmd(ymd: string, days: number): string {
  const parts = parseYmd(ymd);
  if (!parts) throw new Error(`Invalid date: ${ymd}`);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days)).toISOString().slice(0, 10);
}

/** 'HH:MM' local time of `date` in `tz`, for push texts. */
export function formatLocalTime(tz: string, date: Date): string {
  const p = zonedParts(tz, date);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** 'DD/MM' local date of `date` in `tz`, for push texts. */
export function formatLocalDayMonth(tz: string, date: Date): string {
  const p = zonedParts(tz, date);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}`;
}
