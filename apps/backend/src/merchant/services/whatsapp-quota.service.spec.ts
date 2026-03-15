import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { WhatsappQuotaService } from './whatsapp-quota.service';
import { MERCHANT_REPOSITORY, TRANSACTION_RUNNER } from '../../common/repositories';

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MERCHANT_ID = 'merchant-uuid-1';

function makeMerchant(overrides: Partial<{
  whatsappQuotaUsed: number;
  whatsappQuotaMax: number;
  whatsappQuotaResetAt: Date;
}> = {}) {
  return {
    id: MERCHANT_ID,
    whatsappQuotaUsed: 0,
    whatsappQuotaMax: 100,
    whatsappQuotaResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

function buildTxMock(merchant: ReturnType<typeof makeMerchant>) {
  return {
    merchant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(merchant),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...merchant, ...data }),
      ),
    },
  };
}

// â”€â”€ Mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const mockTxRunner = {
  run: jest.fn(),
};

// â”€â”€ Suite â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('WhatsappQuotaService', () => {
  let service: WhatsappQuotaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappQuotaService,
        { provide: MERCHANT_REPOSITORY, useValue: {} },
        { provide: TRANSACTION_RUNNER, useValue: mockTxRunner },
      ],
    }).compile();

    service = module.get<WhatsappQuotaService>(WhatsappQuotaService);
    jest.clearAllMocks();
  });

  describe('checkAndIncrementQuota()', () => {
    it('increments quota when under the limit', async () => {
      const merchant = makeMerchant({ whatsappQuotaUsed: 30, whatsappQuotaMax: 100 });
      const tx = buildTxMock(merchant);
      mockTxRunner.run.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      await service.checkAndIncrementQuota(MERCHANT_ID, 5);

      expect(tx.merchant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { whatsappQuotaUsed: { increment: 5 } },
        }),
      );
    });

    it('throws ForbiddenException when quota would be exceeded', async () => {
      const merchant = makeMerchant({ whatsappQuotaUsed: 96, whatsappQuotaMax: 100 });
      const tx = buildTxMock(merchant);
      mockTxRunner.run.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      await expect(service.checkAndIncrementQuota(MERCHANT_ID, 5)).rejects.toThrow(
        ForbiddenException,
      );
      // update should not be called after a quota error
      expect(tx.merchant.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { whatsappQuotaUsed: { increment: 5 } } }),
      );
    });

    it('throws ForbiddenException at exact limit', async () => {
      const merchant = makeMerchant({ whatsappQuotaUsed: 100, whatsappQuotaMax: 100 });
      const tx = buildTxMock(merchant);
      mockTxRunner.run.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      await expect(service.checkAndIncrementQuota(MERCHANT_ID, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('resets quota when reset date has passed before checking', async () => {
      const pastResetAt = new Date(Date.now() - 1000);
      const merchant = makeMerchant({
        whatsappQuotaUsed: 99,
        whatsappQuotaMax: 100,
        whatsappQuotaResetAt: pastResetAt,
      });
      const tx = {
        merchant: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(merchant),
          update: jest.fn()
            .mockResolvedValueOnce({ ...merchant, whatsappQuotaUsed: 0, whatsappQuotaResetAt: new Date() })
            .mockResolvedValueOnce({ ...merchant, whatsappQuotaUsed: 3 }),
        },
      };
      mockTxRunner.run.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      await service.checkAndIncrementQuota(MERCHANT_ID, 3);

      expect(tx.merchant.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({ whatsappQuotaUsed: 0 }),
        }),
      );
    });

    it('allows sending exactly at remaining limit', async () => {
      const merchant = makeMerchant({ whatsappQuotaUsed: 90, whatsappQuotaMax: 100 });
      const tx = buildTxMock(merchant);
      mockTxRunner.run.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      await expect(service.checkAndIncrementQuota(MERCHANT_ID, 10)).resolves.not.toThrow();
    });
  });
});
