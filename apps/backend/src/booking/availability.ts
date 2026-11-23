import { isoWeekdayOfYmd, wallTimeToUtc } from './booking-time';

/** Half-open interval [start, end) in epoch ms. */
export type Interval = [number, number];

export interface ResourceDay {
  id: string;
  /** Weekly hours, local minutes since midnight */
  hours: { weekday: number; startMin: number; endMin: number }[];
  /** Exceptions of this resource and merchant-wide ones */
  exceptions: { type: 'CLOSED' | 'OPEN'; startsAt: Date; endsAt: Date }[];
  /** Active bookings: startsAt → blockedUntil (service + buffer) */
  busy: { startsAt: Date; blockedUntil: Date }[];
}

export interface SlotQuery {
  tz: string;
  /** Local calendar day, YYYY-MM-DD */
  ymd: string;
  durationMin: number;
  bufferMin: number;
  stepMin: number;
  /** Earliest bookable instant (now + minimum notice) */
  notBefore: Date;
}

export interface Slot {
  startsAt: Date;
  endsAt: Date;
  /** Resources free for the whole service + buffer at that start */
  resourceIds: string[];
}

export interface WeeklyRange {
  /** 1 = Monday … 7 = Sunday */
  weekday: number;
  startMin: number;
  endMin: number;
}

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Converts the fiche's openingHours JSON ({ mon: { slots: [{open, close}] } }) to weekly ranges. */
export function rangesFromOpeningHours(json: unknown): WeeklyRange[] {
  if (!json || typeof json !== 'object') return [];
  const toMin = (hhmm: unknown) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? ''));
    if (!m) return null;
    const v = Number(m[1]) * 60 + Number(m[2]);
    return v >= 0 && v <= 1440 ? v : null;
  };
  const out: WeeklyRange[] = [];
  WEEKDAY_KEYS.forEach((key, i) => {
    const day = (json as Record<string, { closed?: boolean; slots?: { open: string; close: string }[] }>)[key];
    if (!day || day.closed || !Array.isArray(day.slots)) return;
    for (const s of day.slots) {
      const a = toMin(s?.open);
      let b = toMin(s?.close);
      if (a === null || b === null) continue;
      if (b === 0) b = 1440; // "00:00" closing = midnight
      if (b > a) out.push({ weekday: i + 1, startMin: a, endMin: b });
    }
  });
  return out;
}

/** Sorts and merges overlapping or touching intervals. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const [a, b] of sorted) {
    const last = out.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** `base` minus every interval of `cut`. */
export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  let result = mergeIntervals(base);
  for (const [ca, cb] of mergeIntervals(cut)) {
    const next: Interval[] = [];
    for (const [a, b] of result) {
      if (cb <= a || ca >= b) {
        next.push([a, b]);
        continue;
      }
      if (ca > a) next.push([a, ca]);
      if (cb < b) next.push([cb, b]);
    }
    result = next;
  }
  return result;
}

/** Free time of one resource on the local day `ymd`. */
export function freeIntervals(resource: ResourceDay, tz: string, ymd: string): Interval[] {
  const weekday = isoWeekdayOfYmd(ymd);
  const dayStart = wallTimeToUtc(tz, ymd, 0).getTime();
  const dayEnd = wallTimeToUtc(tz, ymd, 1440).getTime();
  const clip = ([a, b]: Interval): Interval => [Math.max(a, dayStart), Math.min(b, dayEnd)];

  const open: Interval[] = resource.hours
    .filter((h) => h.weekday === weekday && h.endMin > h.startMin)
    .map((h) => [wallTimeToUtc(tz, ymd, h.startMin).getTime(), wallTimeToUtc(tz, ymd, h.endMin).getTime()]);
  for (const e of resource.exceptions) {
    if (e.type === 'OPEN') open.push(clip([e.startsAt.getTime(), e.endsAt.getTime()]));
  }

  const closed: Interval[] = resource.exceptions
    .filter((e) => e.type === 'CLOSED')
    .map((e) => [e.startsAt.getTime(), e.endsAt.getTime()]);
  for (const b of resource.busy) closed.push([b.startsAt.getTime(), b.blockedUntil.getTime()]);

  return subtractIntervals(open, closed);
}

/**
 * Bookable starts of one service on a local day, across resources.
 * A start is kept when it sits on the local step grid (09:00, 09:15…), is
 * after `notBefore`, and service + buffer fit entirely in a resource's free time.
 */
export function computeSlots(resources: ResourceDay[], q: SlotQuery): Slot[] {
  const needMs = (q.durationMin + q.bufferMin) * 60_000;
  const step = Math.max(5, q.stepMin);
  const notBefore = q.notBefore.getTime();
  const free = resources.map((r) => ({ id: r.id, intervals: freeIntervals(r, q.tz, q.ymd) }));
  if (free.every((f) => f.intervals.length === 0)) return [];

  // wallTimeToUtc costs two Intl calls. On a day without a clock change (all
  // but two a year) local minutes map linearly to UTC, so resolve the day once:
  // a 180-day window on a 5-minute grid went from ~100,000 Intl calls (about a
  // second of blocked event loop on a public endpoint) to 360.
  const dayStart = wallTimeToUtc(q.tz, q.ymd, 0).getTime();
  const regularDay = wallTimeToUtc(q.tz, q.ymd, 1440).getTime() - dayStart === 1440 * 60_000;

  const slots: Slot[] = [];
  const seen = new Set<number>();
  for (let m = 0; m < 1440; m += step) {
    const start = regularDay ? dayStart + m * 60_000 : wallTimeToUtc(q.tz, q.ymd, m).getTime();
    // A DST jump can map two local times to one instant: keep it once.
    if (start < notBefore || seen.has(start)) continue;
    seen.add(start);
    const end = start + needMs;
    const ids = free
      .filter((f) => f.intervals.some(([a, b]) => a <= start && end <= b))
      .map((f) => f.id);
    if (ids.length) {
      slots.push({ startsAt: new Date(start), endsAt: new Date(start + q.durationMin * 60_000), resourceIds: ids });
    }
  }
  return slots;
}
