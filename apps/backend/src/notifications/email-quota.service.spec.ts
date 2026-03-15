import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { EmailQuotaService } from './email-quota.service';
import { MERCHANT_REPOSITORY, TRANSACTION_RUNNER } from '../common/repositories';

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MERCHANT_ID = 'merchant-uuid-1';

function makeMerchant(overrides: Partial<{
  emailQuotaUsed: number;
  emailQuotaMax: number;
  emailQuotaResetAt: Date;
}> = {}) {
  return {
    id: MERCHANT_ID,
    emailQuotaUsed: 0,
    emailQuotaMax: 200,
    emailQuotaResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // future
    ...overrides,
  };
}

// â”€â”€ Mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const mockTxRunner = {
  run: jest.fn(),
};

function buildTxMock(merchant: ReturnType<typeof makeMerchant>) {
  return {
    merchant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(merchant),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...merchant, ...data })),
    },
  };
}

// â”€â”€ Suite â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('EmailQuotaService', () => {
  let service: EmailQuotaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailQuotaService,
        { provide: MERCHANT_REPOSITORY, useValue: {} },
        { provide: TRANSACTION_RUNNER, useValue: mockTxRunner },
      ],
    }).compile();

    service = module.get<EmailQuotaService>(EmailQuotaService);
    jest.clearAllMocks();
  });

  // â”€â”€ checkAndIncrementQuota â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('checkAndIncrementQuota()', () => {
    it('increments quota when under the limit', async () => {
      const merchant = makeMerchant({ emailQuotaUsed: 50, emailQuotaMax: 200 });
      const tx = buildTxMock(merchant);
      mockTxRunner.run.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      await service.checkAndIncrementQuota(MERCHANT_ID, 10);

      expect(tx.merchant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MERCHANT_ID },
          data: { emailQuotaUsed: { increment: 10 } },
        }),
      );
    });

    it('throws ForbiddenException when quota would be exceeded', async () => {
      const merchant = makeMerchant({ emailQuotaUsed: 190, emailQuotaMax: 200 });
      const tx = buildTxMock(merchant);
      mockTxRunner.run.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      await expect(service.checkAndIncrementQuota(MERCHANT_ID, 20)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when quota is exactly at limit', async () => {
      const merchant = makeMerchant({ emailQuotaUsed: 200, emailQuotaMax: 200 });
      const tx = buildTxMock(merchant);
      mockTxRunner.run.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      await expect(service.checkAndIncrementQuota(MERCHANT_ID, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('resets quota and then allows sending when reset date is in the past', async () => {
      const pastResetAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
      const merchant = makeMerchant({
        emailQuotaUsed: 195, // would exceed if not reset
        emailQuotaMax: 200,
        emailQuotaResetAt: pastResetAt,
      });

      let currentMerchant = { ...merchant };
      const tx = {
        merchant: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(currentMerchant),
          update: jest.fn().mockImplementation(({ data }) => {
            currentMerchant = { ...currentMerchant, ...data, emailQuotaUsed: data.emailQuotaUsed ?? (data.emailQuotaUsed as { increment: number })?.increment ?? 0 };
            return Promise.resolve(currentMerchant);
          }),
        },
      };

      // First update resets quota, second increments
      tx.merchant.update
        .mockResolvedValueOnce({ ...merchant, emailQuotaUsed: 0, emailQuotaResetAt: new Date() })
        .mockResolvedValueOnce({ ...merchant, emailQuotaUsed: 5 });

      mockTxRunner.run.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      await service.checkAndIncrementQuota(MERCHANT_ID, 5);

      // First call should reset the quota
      expect(tx.merchant.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({ emailQuotaUsed: 0 }),
        }),
      );
    });

    it('allows sending exactly at the remaining limit', async () => {
      const merchant = makeMerchant({ emailQuotaUsed: 180, emailQuotaMax: 200 });
      const tx = buildTxMock(merchant);
      mockTxRunner.run.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      await expect(service.checkAndIncrementQuota(MERCHANT_ID, 20)).resolves.not.toThrow();
    });
  });
});
