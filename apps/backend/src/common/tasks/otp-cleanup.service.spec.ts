import { Test, TestingModule } from '@nestjs/testing';
import { OtpCleanupService } from './otp-cleanup.service';
import { OTP_REPOSITORY } from '../repositories';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockOtpRepo = {
  deleteMany: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('OtpCleanupService', () => {
  let service: OtpCleanupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpCleanupService,
        { provide: OTP_REPOSITORY, useValue: mockOtpRepo },
      ],
    }).compile();

    service = module.get<OtpCleanupService>(OtpCleanupService);
    jest.clearAllMocks();
  });

  // ── cleanupExpiredOtps ─────────────────────────────────────────────────────

  describe('cleanupExpiredOtps()', () => {
    it('deletes OTPs where expiresAt is in the past', async () => {
      mockOtpRepo.deleteMany.mockResolvedValue({ count: 3 });

      await service.cleanupExpiredOtps();

      expect(mockOtpRepo.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: { lt: expect.any(Date) },
          createdAt: { gte: expect.any(Date) },
        },
      });
      // The cutoff date should be close to now (within 1 second)
      const deleteCall = mockOtpRepo.deleteMany.mock.calls[0][0];
      const diff = Math.abs(deleteCall.where.expiresAt.lt.getTime() - Date.now());
      expect(diff).toBeLessThan(1000);
    });

    it('completes without error when no expired OTPs exist', async () => {
      mockOtpRepo.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.cleanupExpiredOtps()).resolves.not.toThrow();
    });

    it('does NOT propagate database errors — swallows them gracefully', async () => {
      mockOtpRepo.deleteMany.mockRejectedValue(new Error('DB timeout'));

      await expect(service.cleanupExpiredOtps()).resolves.not.toThrow();
    });
  });
});
