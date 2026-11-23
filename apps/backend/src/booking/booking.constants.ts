import { BookingStatus } from '@prisma/client';

/** Statuses that hold a slot (mirrors the bookings_no_overlap constraint). */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];

/** Upcoming active bookings a client may hold at one merchant. */
export const MAX_UPCOMING_PER_CLIENT = 3;
/** A request the merchant leaves unanswered expires after this. */
export const PENDING_EXPIRY_HOURS = 12;

/** The merchant is reminded of an unanswered request this long before it expires. */
export const PENDING_REMINDER_BEFORE_MS = 2 * 3_600_000;
/** A stamp scan this close to a confirmed booking's start checks it in. */
export const CHECKIN_WINDOW_MS = 2 * 3_600_000;
/** A confirmed booking never checked in is closed as COMPLETED this long after its end. */
export const AUTO_COMPLETE_AFTER_MS = 24 * 3_600_000;
/** Longest agenda range one request may read. */
export const MAX_AGENDA_DAYS = 31;
/**
 * Upper bound of blockedUntil - startsAt (service ≤ 720 + buffer ≤ 240 min,
 * bookable_services_duration_check). Range queries on startsAt use it as a
 * lower bound so they stay on the (…, starts_at) indexes.
 */
export const MAX_BOOKING_SPAN_MS = 24 * 3_600_000;

export const MAX_SERVICES = 60;
export const MAX_HOUR_RANGES = 42;
export const SLOT_STEPS = [5, 10, 15, 20, 30, 60];

export const DEFAULT_SETTINGS = {
  enabled: false,
  autoConfirm: true,
  minNoticeMinutes: 60,
  maxAdvanceDays: 30,
  cancelDeadlineHours: 2,
  slotStepMinutes: 15,
  noShowLimit: 3,
  capacity: 1,
};

/** Most bookings a merchant can take at the same time (seats of the calendar). */
export const MAX_BOOKING_CAPACITY = 10;

/**
 * A booking can always be undone this long after it was made, even inside the
 * merchant's cancel deadline: with the default settings (1 h notice, 2 h
 * deadline) a visit booked 90 minutes ahead could never be cancelled, not even
 * to fix a wrong day.
 */
export const CANCEL_GRACE_MS = 15 * 60_000;

/** The one rule for "may the client cancel in the app": the API check and the `cancellable` flag. */
export function clientCanCancel(
  b: { status: BookingStatus; startsAt: Date; createdAt: Date },
  cancelDeadlineHours: number,
  now = Date.now(),
): boolean {
  // A pending request can always be withdrawn.
  if (b.status === 'PENDING') return true;
  if (b.status !== 'CONFIRMED') return false;
  const untilStart = b.startsAt.getTime() - now;
  if (untilStart >= cancelDeadlineHours * 3_600_000) return true;
  return untilStart > 0 && now - b.createdAt.getTime() <= CANCEL_GRACE_MS;
}

/** Overlap constraint name from the 20261117120000_booking migration. */
const OVERLAP_CONSTRAINT = 'bookings_no_overlap';

export function isOverlapViolation(err: unknown): boolean {
  const e = err as { message?: string; code?: string; meta?: { code?: string; message?: string } } | null;
  const text = `${e?.message ?? ''} ${e?.meta?.message ?? ''}`;
  return text.includes(OVERLAP_CONSTRAINT) || e?.meta?.code === '23P01' || text.includes('23P01');
}
