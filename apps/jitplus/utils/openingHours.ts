import type { OpeningHours, OpeningHoursDay, WeekDay } from '@jitplus/shared';

export const WEEK_DAYS: readonly WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const MINUTES_PER_DAY = 24 * 60;
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

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
    if (open == null || close == null) continue;
    slots.push({
      open,
      close: close <= open ? close + MINUTES_PER_DAY : close,
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

type Translate = (scope: string, options?: Record<string, unknown>) => string;

export function describeOpenStatus(status: OpenStatus, t: Translate): string {
  if (status.isOpen) return t('merchant.openUntil', { time: status.closesAt });
  if (!status.opensAt) return t('merchant.closedNow');
  if (status.opensInDays === 0) return t('merchant.closedOpensAt', { time: status.opensAt });
  if (status.opensInDays === 1) return t('merchant.closedOpensTomorrow', { time: status.opensAt });
  return t('merchant.closedOpensDay', { day: t(`merchant.days.${status.opensDay}`), time: status.opensAt });
}
