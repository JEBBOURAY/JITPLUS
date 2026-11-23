import { ClientClosureService } from './client-closure.service';

describe('ClientClosureService.cancelUpcomingAt', () => {
  const rows = [
    { id: 'b1', merchantId: 'm1', clientId: 'c1', clientName: null, startsAt: new Date(Date.now() + 3_600_000), serviceNameSnapshot: 'Coupe' },
  ];

  function setup(found = rows) {
    const tx = {
      booking: {
        findMany: jest.fn().mockResolvedValue(found),
        updateMany: jest.fn().mockResolvedValue({ count: found.length }),
      },
    };
    const txRunner = { run: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
    const notify = { changed: jest.fn(), toMerchant: jest.fn().mockResolvedValue(undefined) };
    const service = new ClientClosureService(txRunner as never, notify as never);
    return { service, tx, notify };
  }

  it('cancels only the upcoming open bookings at that merchant and tells the merchant', async () => {
    const { service, tx, notify } = setup();

    await expect(service.cancelUpcomingAt('c1', 'm1')).resolves.toBe(1);

    const { where } = tx.booking.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ clientId: 'c1', merchantId: 'm1', status: { in: ['PENDING', 'CONFIRMED'] } });
    expect(where.startsAt.gt).toBeInstanceOf(Date);
    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['b1'] }, status: { in: ['PENDING', 'CONFIRMED'] } },
      data: { status: 'CANCELLED_CLIENT', cancelledAt: expect.any(Date) },
    });
    expect(notify.changed).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', status: 'CANCELLED_CLIENT' }), 'status');
    expect(notify.toMerchant).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }), 'cancelledByClient');
  });

  it('does nothing when the client has no booking there', async () => {
    const { service, tx, notify } = setup([]);

    await expect(service.cancelUpcomingAt('c1', 'm1')).resolves.toBe(0);

    expect(tx.booking.updateMany).not.toHaveBeenCalled();
    expect(notify.toMerchant).not.toHaveBeenCalled();
  });
});
