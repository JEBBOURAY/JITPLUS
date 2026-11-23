import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import type { TransactionClient } from '../common/repositories';
import { CHECKIN_WINDOW_MS } from './booking.constants';

/** Statuses of a visit that can still receive its stamps. */
export const CREDITABLE_BOOKING_STATUSES: BookingStatus[] = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'];

export const VISIT_BOOKING_SELECT = {
  id: true,
  merchantId: true,
  clientId: true,
  clientName: true,
  status: true,
  startsAt: true,
  serviceNameSnapshot: true,
  checkedInAt: true,
  checkInTransactionId: true,
} satisfies Prisma.BookingSelect;

export type VisitBooking = Prisma.BookingGetPayload<{ select: typeof VISIT_BOOKING_SELECT }>;

/** The booking a till transaction pays for, as the Pro app names it. */
export interface BookingVisitRef {
  id: string;
  /** Also close the booking ("Terminer" answered by giving the stamps) */
  complete: boolean;
}

type BookingDb = Pick<TransactionClient, 'booking'>;

/**
 * Ties a stamp transaction to a booking, which is credited once: the write is
 * conditional on the booking being unchanged and still without a transaction.
 * A confirmed booking becomes checked in, `complete` closes it. Returns the
 * booking as written, or null when it changed meanwhile.
 */
export async function attachVisitTransaction(
  db: BookingDb,
  booking: VisitBooking,
  transactionId: string,
  complete = false,
): Promise<VisitBooking | null> {
  const status: BookingStatus = complete ? 'COMPLETED' : booking.status === 'CONFIRMED' ? 'CHECKED_IN' : booking.status;
  const checkedInAt = booking.checkedInAt ?? new Date();
  const { count } = await db.booking.updateMany({
    where: { id: booking.id, status: booking.status, checkInTransactionId: null },
    data: { status, checkedInAt, checkInTransactionId: transactionId },
  });
  return count ? { ...booking, status, checkedInAt, checkInTransactionId: transactionId } : null;
}

/**
 * The till was opened from a booking: credits that booking inside the stamp
 * transaction, so a refusal here (other client, already credited, not started)
 * rolls the stamps back.
 */
export async function creditBookingVisitInTx(
  tx: BookingDb,
  p: { booking: BookingVisitRef; merchantId: string; clientId: string; transactionId: string },
): Promise<VisitBooking> {
  const booking = await tx.booking.findFirst({
    where: { id: p.booking.id, merchantId: p.merchantId, clientId: p.clientId },
    select: VISIT_BOOKING_SELECT,
  });
  if (!booking) throw new NotFoundException('error.booking.notFound');
  if (booking.checkInTransactionId) throw new ConflictException('error.booking.alreadyCredited');
  if (!CREDITABLE_BOOKING_STATUSES.includes(booking.status)) throw new ConflictException('error.booking.badTransition');
  if (booking.startsAt.getTime() > Date.now() + CHECKIN_WINDOW_MS) throw new ConflictException('error.booking.notStartedYet');

  const linked = await attachVisitTransaction(tx, booking, p.transactionId, p.booking.complete);
  if (!linked) throw new ConflictException('error.booking.changed');
  return linked;
}
