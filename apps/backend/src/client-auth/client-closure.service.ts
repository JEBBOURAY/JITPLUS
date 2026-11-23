import { Inject, Injectable } from '@nestjs/common';
import { TRANSACTION_RUNNER, type ITransactionRunner, type TransactionClient } from '../common/repositories';
import { BookingNotifyService, type NotifiableBooking } from '../booking/booking-notify.service';
import { rememberWelcomeHistoryInTx } from '../merchant/utils/welcome-bonus-identity';

/**
 * Deleting a client account, from the app or the admin: same closure both ways.
 * What is still open with merchants ends at once: it frees their slots and codes
 * and keeps a deleted account out of their lists. History stays until the purge.
 */
@Injectable()
export class ClientClosureService {
  constructor(
    @Inject(TRANSACTION_RUNNER) private readonly txRunner: ITransactionRunner,
    private readonly notify: BookingNotifyService,
  ) {}

  /** `anonymise` runs in the same transaction, so an account is never left half closed. */
  async close(clientId: string, anonymise: (tx: TransactionClient, now: Date) => Promise<unknown>): Promise<void> {
    const now = new Date();
    const bookings = await this.txRunner.run(async (tx) => {
      // Before the identity is erased: signing up again with the same email or
      // phone must not reopen the welcome gift at merchants already visited.
      await rememberWelcomeHistoryInTx(tx, clientId);
      await anonymise(tx, now);
      await tx.clientSession.deleteMany({ where: { clientId } });
      // Cards cannot be deleted: transactions reference them.
      await tx.loyaltyCard.updateMany({ where: { clientId, deactivatedAt: null }, data: { deactivatedAt: now } });
      return this.endOpenActivity(tx, clientId, now);
    });

    this.announce(bookings);
  }

  /**
   * The client blocked this merchant: what they had booked there is cancelled,
   * so the slot is free again and no reminder is sent for a visit that will not
   * happen. The merchant is told, like for any cancellation by the client.
   */
  async cancelUpcomingAt(clientId: string, merchantId: string): Promise<number> {
    const now = new Date();
    const bookings = await this.txRunner.run((tx) => this.cancelUpcomingBookings(tx, clientId, now, merchantId));
    this.announce(bookings);
    return bookings.length;
  }

  private announce(bookings: NotifiableBooking[]): void {
    for (const booking of bookings) {
      this.notify.changed(booking, 'status');
      void this.notify.toMerchant(booking, 'cancelledByClient');
    }
  }

  /** Started or past bookings are left to the agenda's own closing rules. */
  private async cancelUpcomingBookings(
    tx: TransactionClient,
    clientId: string,
    now: Date,
    merchantId?: string,
  ): Promise<NotifiableBooking[]> {
    const where = {
      clientId,
      ...(merchantId ? { merchantId } : {}),
      status: { in: ['PENDING', 'CONFIRMED'] as ('PENDING' | 'CONFIRMED')[] },
      startsAt: { gt: now },
    };
    const bookings = await tx.booking.findMany({
      where,
      select: { id: true, merchantId: true, clientId: true, clientName: true, startsAt: true, serviceNameSnapshot: true },
    });
    if (bookings.length === 0) return [];
    await tx.booking.updateMany({
      where: { id: { in: bookings.map((b) => b.id) }, status: where.status },
      data: { status: 'CANCELLED_CLIENT', cancelledAt: now },
    });
    return bookings.map((b) => ({ ...b, status: 'CANCELLED_CLIENT' as const }));
  }

  private async endOpenActivity(tx: TransactionClient, clientId: string, now: Date): Promise<NotifiableBooking[]> {
    const bookings = await this.cancelUpcomingBookings(tx, clientId, now);

    await tx.coupon.updateMany({ where: { clientId, status: 'ACTIVE' }, data: { status: 'CANCELLED', cancelledAt: now } });
    await tx.scratchCard.updateMany({ where: { clientId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    await tx.luckyWheelDraw.updateMany({ where: { fulfilment: 'PENDING', ticket: { clientId } }, data: { fulfilment: 'EXPIRED' } });
    await tx.luckyWheelTicket.deleteMany({ where: { clientId, used: false } });
    await tx.clientClaim.deleteMany({ where: { clientId, consumedAt: null } });

    return bookings;
  }
}
