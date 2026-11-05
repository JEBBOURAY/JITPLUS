import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { EmailQuotaService, nextQuotaResetDate } from './email-quota.service';
import { MERCHANT_REPOSITORY } from '../common/repositories';

const MERCHANT_ID = 'merchant-uuid-1';

function makeQuota(overrides: Partial<{ emailQuotaUsed: number; emailQuotaMax: number; emailQuotaResetAt: Date }> = {}) {
  return {
    emailQuotaUsed: 0,
    emailQuotaMax: 200,
    emailQuotaResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // future
    ...overrides,
  };
}

const merchantRepo = {
  findUniqueOrThrow: jest.fn(),
  updateMany: jest.fn(),
};

describe('EmailQuotaService', () => {
  let service: EmailQuotaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailQuotaService, { provide: MERCHANT_REPOSITORY, useValue: merchantRepo }],
    }).compile();
    service = module.get(EmailQuotaService);
  });

  describe('checkAndIncrementQuota()', () => {
    it('reserves the emails with a conditional increment bounded by the quota', async () => {
      merchantRepo.findUniqueOrThrow.mockResolvedValue(makeQuota({ emailQuotaUsed: 50 }));
      merchantRepo.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.checkAndIncrementQuota(MERCHANT_ID, 10);

      expect(merchantRepo.updateMany).toHaveBeenCalledWith({
        where: { id: MERCHANT_ID, emailQuotaMax: 200, emailQuotaUsed: { lte: 190 } },
        data: { emailQuotaUsed: { increment: 10 } },
      });
      expect(result.emailQuotaUsed).toBe(60);
    });

    it('throws ForbiddenException when the conditional increment matches no row', async () => {
      merchantRepo.findUniqueOrThrow.mockResolvedValue(makeQuota({ emailQuotaUsed: 190 }));
      merchantRepo.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.checkAndIncrementQuota(MERCHANT_ID, 20)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a concurrent blast that lost the race (row changed after the read)', async () => {
      // Both requests read used=100; the other one already reserved 100.
      merchantRepo.findUniqueOrThrow
        .mockResolvedValueOnce(makeQuota({ emailQuotaUsed: 100 }))
        .mockResolvedValueOnce(makeQuota({ emailQuotaUsed: 200 }));
      merchantRepo.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.checkAndIncrementQuota(MERCHANT_ID, 100)).rejects.toThrow('Utilisé: 200');
    });

    it('resets the period first (conditional on the old reset date) when it has passed', async () => {
      const pastResetAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
      merchantRepo.findUniqueOrThrow
        .mockResolvedValueOnce(makeQuota({ emailQuotaUsed: 195, emailQuotaResetAt: pastResetAt }))
        .mockResolvedValueOnce(makeQuota({ emailQuotaUsed: 0 }));
      merchantRepo.updateMany.mockResolvedValue({ count: 1 });

      await service.checkAndIncrementQuota(MERCHANT_ID, 5);

      expect(merchantRepo.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: MERCHANT_ID, emailQuotaResetAt: pastResetAt },
        data: expect.objectContaining({ emailQuotaUsed: 0 }),
      });
      expect(merchantRepo.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
        where: expect.objectContaining({ emailQuotaUsed: { lte: 195 } }),
      }));
    });
  });

  describe('nextQuotaResetDate()', () => {
    it('does not skip February when called on January 31', () => {
      expect(nextQuotaResetDate(new Date('2026-01-31T12:00:00Z')).toISOString()).toBe('2026-02-01T00:00:00.000Z');
    });

    it('rolls over the year in December', () => {
      expect(nextQuotaResetDate(new Date('2026-12-31T23:00:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });
  });
});
