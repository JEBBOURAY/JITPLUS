import { ConflictException, NotFoundException } from '@nestjs/common';
import { attachVisitTransaction, creditBookingVisitInTx, type VisitBooking } from './booking-visit';

const HOUR = 3_600_000;

function visit(over: Partial<VisitBooking> = {}): VisitBooking {
  return {
    id: 'b1',
    merchantId: 'm1',
    clientId: 'c1',
    clientName: null,
    status: 'CONFIRMED',
    startsAt: new Date(Date.now() - HOUR),
    serviceNameSnapshot: 'Coupe',
    checkedInAt: null,
    checkInTransactionId: null,
    ...over,
  };
}

function db(found: VisitBooking | null, count = 1) {
  return {
    booking: {
      findFirst: jest.fn().mockResolvedValue(found),
      updateMany: jest.fn().mockResolvedValue({ count }),
    },
  };
}

const credit = (tx: ReturnType<typeof db>, complete = false) =>
  creditBookingVisitInTx(tx as never, { booking: { id: 'b1', complete }, merchantId: 'm1', clientId: 'c1', transactionId: 'tx1' });

describe('creditBookingVisitInTx', () => {
  it('checks a confirmed booking in and ties the transaction to it, once', async () => {
    const tx = db(visit());
    const linked = await credit(tx);
    expect(linked).toMatchObject({ status: 'CHECKED_IN', checkInTransactionId: 'tx1' });
    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', status: 'CONFIRMED', checkInTransactionId: null },
      data: { status: 'CHECKED_IN', checkedInAt: expect.any(Date), checkInTransactionId: 'tx1' },
    });
  });

  it('only reads a booking of this merchant and this client', async () => {
    const tx = db(null);
    await expect(credit(tx)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.booking.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'b1', merchantId: 'm1', clientId: 'c1' } }));
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
  });

  it('closes the booking when asked, keeping the arrival time already recorded', async () => {
    const checkedInAt = new Date(Date.now() - HOUR);
    const tx = db(visit({ status: 'CHECKED_IN', checkedInAt }));
    await expect(credit(tx, true)).resolves.toMatchObject({ status: 'COMPLETED', checkedInAt });
  });

  it('gives a visit closed without stamps its stamps, still closed', async () => {
    await expect(credit(db(visit({ status: 'COMPLETED' })))).resolves.toMatchObject({ status: 'COMPLETED' });
  });

  it.each([
    ['already credited', visit({ checkInTransactionId: 'tx0' }), 'error.booking.alreadyCredited'],
    ['a no-show', visit({ status: 'NO_SHOW' }), 'error.booking.badTransition'],
    ['cancelled', visit({ status: 'CANCELLED_CLIENT' }), 'error.booking.badTransition'],
    ['still a request', visit({ status: 'PENDING' }), 'error.booking.badTransition'],
    ['days ahead', visit({ startsAt: new Date(Date.now() + 48 * HOUR) }), 'error.booking.notStartedYet'],
  ])('refuses a booking that is %s', async (_label, booking, key) => {
    const tx = db(booking);
    await expect(credit(tx)).rejects.toThrow(new ConflictException(key));
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
  });

  it('refuses when another device credited the booking meanwhile', async () => {
    await expect(credit(db(visit(), 0))).rejects.toThrow(new ConflictException('error.booking.changed'));
  });
});

describe('attachVisitTransaction', () => {
  it('returns null when the booking changed meanwhile', async () => {
    await expect(attachVisitTransaction(db(null, 0) as never, visit(), 'tx1')).resolves.toBeNull();
  });
});
