import { useMemo } from 'react';
import { useBookingAgenda, useBookingSetup } from '@/hooks/queries/booking';
import { freeStartMinutes, fullRanges, type MinuteRange } from '@/components/booking/bookingForm';
import { MS_PER_MIN, isoWeekday, minutesIn, wallTimeToIso, ymdIn } from '@/utils/bookingTime';
import { addDaysToYmd, isActiveBooking } from '@jitplus/shared/src/booking';

/**
 * Free starts (minutes of the day) of local day `date` for something lasting
 * `needMin` (duration + buffer): the booking hours, minus active bookings and
 * closures. `ignoreId` leaves one booking out, the one being moved.
 */
export function useDayFreeStarts({ date, tz, needMin, ignoreId, enabled }: {
  date: string;
  tz: string;
  needMin: number | null;
  ignoreId?: string;
  enabled: boolean;
}) {
  const { data: setup } = useBookingSetup(enabled);
  const dayStart = useMemo(() => wallTimeToIso(date, 0, tz), [date, tz]);
  const dayEnd = useMemo(() => wallTimeToIso(addDaysToYmd(date, 1), 0, tz), [date, tz]);
  const { data: agenda, isLoading, isError } = useBookingAgenda(dayStart, dayEnd, enabled);

  const freeStarts = useMemo(() => {
    if (!setup || !agenda || !needMin) return [];
    const weekday = isoWeekday(date);
    const origin = new Date(dayStart).getTime();
    const toRange = (from: string, to: string): MinuteRange => ({
      startMin: (new Date(from).getTime() - origin) / MS_PER_MIN,
      endMin: (new Date(to).getTime() - origin) / MS_PER_MIN,
    });
    const now = new Date();
    return freeStartMinutes({
      open: (setup.hours.length ? setup.hours : setup.openingHours).filter((h) => h.weekday === weekday),
      // Same rule as the agenda's free stretches: a time is busy only once
      // `capacity` bookings overlap it. Closures are always busy.
      busy: [
        ...fullRanges(
          agenda.bookings
            .filter((b) => b.id !== ignoreId && isActiveBooking(b.status))
            .map((b) => toRange(b.startsAt, b.blockedUntil)),
          Math.max(1, setup.settings.capacity ?? 1),
        ),
        ...agenda.exceptions.filter((e) => e.type === 'CLOSED').map((e) => toRange(e.startsAt, e.endsAt)),
      ],
      stepMin: setup.settings.slotStepMinutes,
      needMin,
      notBefore: date === ymdIn(now, tz) ? minutesIn(now, tz) + 1 : 0,
    });
  }, [setup, agenda, needMin, date, dayStart, ignoreId, tz]);

  return { freeStarts, loading: isLoading, loadError: isError && !agenda };
}
