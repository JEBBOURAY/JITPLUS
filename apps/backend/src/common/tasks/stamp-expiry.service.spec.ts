import { Test, TestingModule } from '@nestjs/testing';
import { StampExpiryService } from './stamp-expiry.service';
import { MERCHANT_REPOSITORY, LOYALTY_CARD_REPOSITORY, TRANSACTION_RUNNER } from '../repositories';
import { NotificationsService } from '../../notifications/notifications.service';

const DAY = 86_400_000;
const NOW = new Date('2026-10-08T10:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const mockMerchantRepo = { findMany: jest.fn() };
const mockCardRepo = { findMany: jest.fn(), updateMany: jest.fn() };
const mockTx = {
  loyaltyCard: { updateMany: jest.fn() },
  transaction: { create: jest.fn() },
};
const mockTxRunner = { run: jest.fn((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)) };
const mockNotifications = { sendToClient: jest.fn() };

const merchant = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  nom: 'Café Atlas',
  stampValidityDays: 90,
  stampValiditySince: daysAgo(365),
  ...over,
});

const card = (id: string, lastVisitAt: Date, stamps = 4) => ({
  id,
  clientId: `c-${id}`,
  stamps,
  lastVisitAt,
  client: { language: 'fr' },
});

/** First findMany call = reminder candidates, second = expiry candidates. */
function cards(reminders: unknown[], expiries: unknown[]) {
  mockCardRepo.findMany.mockResolvedValueOnce(reminders).mockResolvedValueOnce(expiries);
}

describe('StampExpiryService', () => {
  let service: StampExpiryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StampExpiryService,
        { provide: MERCHANT_REPOSITORY, useValue: mockMerchantRepo },
        { provide: LOYALTY_CARD_REPOSITORY, useValue: mockCardRepo },
        { provide: TRANSACTION_RUNNER, useValue: mockTxRunner },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get(StampExpiryService);
    mockCardRepo.updateMany.mockResolvedValue({ count: 1 });
    mockTx.loyaltyCard.updateMany.mockResolvedValue({ count: 1 });
  });

  it('does nothing when no merchant has a validity rule', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([]);
    await expect(service.process(NOW)).resolves.toEqual({ reminded: 0, expired: 0 });
    expect(mockCardRepo.findMany).not.toHaveBeenCalled();
  });

  it('sends a reminder to cards expiring within 7 days', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([merchant()]);
    cards([card('a', daysAgo(85), 3)], []);

    const res = await service.process(NOW);

    expect(res).toEqual({ reminded: 1, expired: 0 });
    expect(mockCardRepo.updateMany).toHaveBeenCalledWith({
      where: { id: 'a', expiryReminderSentAt: null, lastVisitAt: daysAgo(85) },
      data: { expiryReminderSentAt: NOW },
    });
    expect(mockNotifications.sendToClient).toHaveBeenCalledWith(
      'm1',
      'c-a',
      expect.any(String),
      expect.stringContaining('3 tampons'),
      expect.objectContaining({ event: 'stamps_expiring', merchantId: 'm1' }),
    );
  });

  it('does not remind twice when another instance already claimed the card', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([merchant()]);
    cards([card('a', daysAgo(85))], []);
    mockCardRepo.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await service.process(NOW);

    expect(res.reminded).toBe(0);
    expect(mockNotifications.sendToClient).not.toHaveBeenCalled();
  });

  it('counts the delay from stampValiditySince when the rule was enabled after the last visit', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([merchant({ stampValiditySince: daysAgo(10) })]);
    mockCardRepo.findMany.mockResolvedValueOnce([card('a', daysAgo(200))]);

    const res = await service.process(NOW);

    // Expires 80 days from now: no reminder, and the expiry pass is skipped entirely.
    expect(res).toEqual({ reminded: 0, expired: 0 });
    expect(mockCardRepo.updateMany).not.toHaveBeenCalled();
    expect(mockCardRepo.findMany).toHaveBeenCalledTimes(1);
  });

  it('resets expired cards and logs an ADJUST_STAMPS transaction', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([merchant()]);
    cards([], [card('b', daysAgo(95), 6)]);

    const res = await service.process(NOW);

    expect(res).toEqual({ reminded: 0, expired: 1 });
    expect(mockTx.loyaltyCard.updateMany).toHaveBeenCalledWith({
      where: { id: 'b', stamps: 6, lastVisitAt: daysAgo(95) },
      data: { stamps: 0, expiryReminderSentAt: null },
    });
    expect(mockTx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'c-b',
        merchantId: 'm1',
        type: 'ADJUST_STAMPS',
        amount: 0,
        stamps: -6,
        note: expect.stringContaining('90'),
      }),
    });
  });

  it('skips a card that changed (new visit) between the read and the reset', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([merchant()]);
    cards([], [card('b', daysAgo(95))]);
    mockTx.loyaltyCard.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await service.process(NOW);

    expect(res.expired).toBe(0);
    expect(mockTx.transaction.create).not.toHaveBeenCalled();
  });

  it('keeps processing other merchants when one fails', async () => {
    mockMerchantRepo.findMany.mockResolvedValue([merchant({ id: 'bad' }), merchant({ id: 'm2' })]);
    mockCardRepo.findMany
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([card('c', daysAgo(120))]);

    const res = await service.process(NOW);

    expect(res.expired).toBe(1);
  });
});
