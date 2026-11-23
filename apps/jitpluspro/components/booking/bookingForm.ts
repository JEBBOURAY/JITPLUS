// Pure form helpers of the booking setup screens.

export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

/** '25,5' or '25.5' → 25.5; '' → null; invalid → NaN. */
export function parsePrice(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (!s) return null;
  return /^\d+(\.\d{1,2})?$/.test(s) && Number(s) <= 1_000_000 ? Number(s) : NaN;
}

/** Whole minutes between 5 and 720 (backend limits), or null. */
export function parseDuration(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 5 && n <= 720 ? n : null;
}

export interface MinuteRange { startMin: number; endMin: number }

/**
 * Starts (minutes of the day, on the step grid) where the service and its buffer
 * fit inside `open` without touching `busy`.
 */
export function freeStartMinutes({ open, busy, stepMin, needMin, notBefore }: {
  open: MinuteRange[];
  busy: MinuteRange[];
  stepMin: number;
  needMin: number;
  notBefore: number;
}): number[] {
  const step = Math.max(5, stepMin);
  const starts: number[] = [];
  for (const range of [...open].sort((a, b) => a.startMin - b.startMin)) {
    const first = Math.ceil(Math.max(range.startMin, notBefore) / step) * step;
    for (let m = first; m + needMin <= range.endMin; m += step) {
      if (!busy.some((b) => b.startMin < m + needMin && b.endMin > m)) starts.push(m);
    }
  }
  return starts;
}

/**
 * Stretches where at least `capacity` of `busy` overlap: the calendar is full
 * there. With a capacity of 1 it is the union of `busy`.
 */
export function fullRanges(busy: MinuteRange[], capacity: number): MinuteRange[] {
  const events = busy.flatMap((b) => [{ at: b.startMin, d: 1 }, { at: b.endMin, d: -1 }]);
  // At the same minute, an end comes before a start: back-to-back bookings do not overlap.
  events.sort((a, b) => a.at - b.at || a.d - b.d);
  const full: MinuteRange[] = [];
  let count = 0;
  let from = 0;
  for (const e of events) {
    const before = count;
    count += e.d;
    if (before < capacity && count >= capacity) from = e.at;
    else if (before >= capacity && count < capacity && e.at > from) {
      const last = full[full.length - 1];
      if (last && last.endMin === from) last.endMin = e.at;
      else full.push({ startMin: from, endMin: e.at });
    }
  }
  return full;
}

/**
 * Free stretches of the day (minutes of the day) inside `open` where fewer
 * than `capacity` bookings of `busy` overlap, at least `minMin` long: what the
 * agenda shows between bookings. Starts before `notBefore` are cut to it
 * (today: the past is not free time).
 */
export function freeGaps({ open, busy, closed = [], minMin, notBefore = 0, capacity = 1 }: {
  open: MinuteRange[];
  busy: MinuteRange[];
  /** Closures: never free, whatever the capacity. */
  closed?: MinuteRange[];
  minMin: number;
  notBefore?: number;
  /** Bookings the shop takes at the same time. */
  capacity?: number;
}): MinuteRange[] {
  const blocks = [...fullRanges(busy, Math.max(1, capacity)), ...closed].sort((a, b) => a.startMin - b.startMin);
  const gaps: MinuteRange[] = [];
  for (const range of [...open].sort((a, b) => a.startMin - b.startMin)) {
    let cursor = Math.max(range.startMin, notBefore);
    for (const b of blocks) {
      if (b.endMin <= cursor || b.startMin >= range.endMin) continue;
      if (b.startMin > cursor) gaps.push({ startMin: cursor, endMin: Math.min(b.startMin, range.endMin) });
      cursor = Math.max(cursor, b.endMin);
    }
    if (cursor < range.endMin) gaps.push({ startMin: cursor, endMin: range.endMin });
  }
  return gaps.filter((g) => g.endMin - g.startMin >= minMin);
}
