import { BookingNotifyService, type NotifiableBooking } from './booking-notify.service';
import { isCategoryEnabled, isMarketing } from '../merchant-inbox/merchant-notif-policy';

const booking: NotifiableBooking = {
  id: 'b1',
  merchantId: 'm1',
  clientId: 'c1',
  clientName: null,
  status: 'PENDING',
  startsAt: new Date('2030-03-04T10:00:00.000Z'),
  serviceNameSnapshot: 'Coupe',
};

function setup() {
  const prisma = {
    merchant: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'm1', pushToken: 'token', notifPush: true, notifPrefs: null, language: 'fr', countryCode: 'MA', nom: 'Test',
      }),
    },
    client: { findUnique: jest.fn().mockResolvedValue({ prenom: 'Amine', nom: null, language: 'fr' }) },
  };
  const merchantNotifier = { notify: jest.fn().mockResolvedValue('sent') };
  const notifications = { sendToClient: jest.fn().mockResolvedValue(undefined) };
  const service = new BookingNotifyService(prisma as never, merchantNotifier as never, notifications as never, {} as never, {} as never);
  return { service, merchantNotifier, notifications };
}

describe('BookingNotifyService', () => {
  it.each([
    ['newPending', 'Demande de rendez-vous à valider'],
    ['newConfirmed', 'Nouveau rendez-vous'],
    ['cancelledByClient', 'Rendez-vous annulé'],
    ['requestExpired', 'Demande de rendez-vous expirée'],
  ] as const)('tells the merchant about %s and opens that booking', async (kind, title) => {
    const { service, merchantNotifier } = setup();
    await service.toMerchant(booking, kind);
    expect(merchantNotifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1', pushToken: 'token' }),
      expect.objectContaining({
        category: 'BOOKING',
        title,
        body: expect.stringContaining('Amine'),
        event: 'booking',
        action: 'open_agenda',
        data: { bookingId: 'b1' },
      }),
    );
  });

  it('does not let the marketing limits or preferences hold back a booking', () => {
    expect(isMarketing('BOOKING')).toBe(false);
    expect(isCategoryEnabled({ news: false, tips: false, reminders: false, reports: false }, 'BOOKING')).toBe(true);
  });

  it('sends client bookings on the transactions channel', async () => {
    const { service, notifications } = setup();
    await service.toClient(booking, 'pending');
    expect(notifications.sendToClient).toHaveBeenCalledWith(
      'm1',
      'c1',
      expect.stringContaining('Test'),
      expect.stringContaining('Coupe'),
      expect.objectContaining({ event: 'booking', action: 'open_booking', bookingId: 'b1' }),
      'jit-transactions',
    );
  });
});

describe('BookingNotifyService — client name in the merchant push', () => {
  function withClient(client: Record<string, unknown>) {
    const prisma = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'm1', pushToken: 'token', notifPush: true, notifPrefs: null, language: 'fr', countryCode: 'MA', nom: 'Test',
        }),
      },
      client: { findUnique: jest.fn().mockResolvedValue(client) },
    };
    const merchantNotifier = { notify: jest.fn().mockResolvedValue('sent') };
    const service = new BookingNotifyService(prisma as never, merchantNotifier as never, {} as never, {} as never, {} as never);
    return { service, body: () => merchantNotifier.notify.mock.calls[0][1].body as string };
  }

  it('hides the family name unless the client shares their details, as the agenda does', async () => {
    const hidden = withClient({ prenom: 'Amine', nom: 'Alaoui', shareInfoMerchants: false });
    await hidden.service.toMerchant(booking, 'newConfirmed');
    expect(hidden.body()).toContain('Amine');
    expect(hidden.body()).not.toContain('Alaoui');

    const shared = withClient({ prenom: 'Amine', nom: 'Alaoui', shareInfoMerchants: true });
    await shared.service.toMerchant(booking, 'newConfirmed');
    expect(shared.body()).toContain('Amine Alaoui');
  });
});
