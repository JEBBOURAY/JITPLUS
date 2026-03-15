import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { MerchantReferralService } from './merchant-referral.service';
import { MERCHANT_REPOSITORY } from '../../common/repositories';
import { MAIL_PROVIDER } from '../../common/interfaces';

// â”€â”€ Fixtures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MERCHANT_ID = 'merchant-uuid-1';
const REFERRER_ID = 'referrer-uuid-1';
const REFERRAL_CODE = 'ABCD1234';

const baseMerchantWithCode = {
  referralCode: REFERRAL_CODE,
  referralMonthsEarned: 0,
  referrals: [],
};

// â”€â”€ Mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const mockMerchantRepo = {
  findUnique: jest.fn(),
  update: jest.fn(),
};

const mockCache = {
  del: jest.fn(),
};

const mockMailProvider = {
  sendReferralBonus: jest.fn().mockResolvedValue(undefined),
};

// â”€â”€ Suite â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('MerchantReferralService', () => {
  let service: MerchantReferralService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantReferralService,
        { provide: MERCHANT_REPOSITORY, useValue: mockMerchantRepo },
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: MAIL_PROVIDER, useValue: mockMailProvider },
      ],
    }).compile();

    service = module.get<MerchantReferralService>(MerchantReferralService);
    jest.clearAllMocks();
  });

  // â”€â”€ getReferralStats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('getReferralStats()', () => {
    it('returns stats when referral code already exists', async () => {
      mockMerchantRepo.findUnique.mockResolvedValue({
        ...baseMerchantWithCode,
        referrals: [{ id: 'ref1', nom: 'New Merchant', categorie: 'CAFE', ville: 'Rabat', createdAt: new Date() }],
      });

      const result = await service.getReferralStats(MERCHANT_ID);

      expect(result.referralCode).toBe(REFERRAL_CODE);
      expect(result.referredCount).toBe(1);
      expect(result.referralMonthsEarned).toBe(0);
      expect(mockMerchantRepo.update).not.toHaveBeenCalled();
    });

    it('generates and saves a referral code when none exists', async () => {
      mockMerchantRepo.findUnique
        .mockResolvedValueOnce({ ...baseMerchantWithCode, referralCode: null }) // getReferralStats call
        .mockResolvedValue(null); // generateUniqueCode uniqueness check â†’ null means available

      mockMerchantRepo.update.mockResolvedValue({});

      const result = await service.getReferralStats(MERCHANT_ID);

      expect(mockMerchantRepo.update).toHaveBeenCalledWith({
        where: { id: MERCHANT_ID },
        data: { referralCode: expect.any(String) },
      });
      expect(result.referralCode).toBeTruthy();
      expect(result.referralCode).toHaveLength(8);
    });

    it('throws NotFoundException when merchant does not exist', async () => {
      mockMerchantRepo.findUnique.mockResolvedValue(null);

      await expect(service.getReferralStats(MERCHANT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // â”€â”€ validateCode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('validateCode()', () => {
    it('returns referrer info for a valid code', async () => {
      mockMerchantRepo.findUnique.mockResolvedValue({ id: REFERRER_ID, nom: 'Ref Commerce' });

      const result = await service.validateCode(REFERRAL_CODE);

      expect(result).toEqual({ id: REFERRER_ID, nom: 'Ref Commerce' });
      expect(mockMerchantRepo.findUnique).toHaveBeenCalledWith({
        where: { referralCode: REFERRAL_CODE },
        select: { id: true, nom: true },
      });
    });

    it('throws NotFoundException for an invalid code', async () => {
      mockMerchantRepo.findUnique.mockResolvedValue(null);

      await expect(service.validateCode('BADCODE1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for an empty code', async () => {
      await expect(service.validateCode('')).rejects.toThrow(NotFoundException);
    });

    it('trims and uppercases the code before lookup', async () => {
      mockMerchantRepo.findUnique.mockResolvedValue({ id: REFERRER_ID, nom: 'Test' });

      await service.validateCode('  abcd1234  ');

      expect(mockMerchantRepo.findUnique).toHaveBeenCalledWith({
        where: { referralCode: 'ABCD1234' },
        select: { id: true, nom: true },
      });
    });
  });

  // â”€â”€ creditReferrer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('creditReferrer()', () => {
    it('records +1 earned month for admin-activated PREMIUM referrer', async () => {
      mockMerchantRepo.findUnique.mockResolvedValue({
        email: 'ref@jitplus.com',
        nom: 'Ref Commerce',
        plan: 'PREMIUM',
        planExpiresAt: null,
        planActivatedByAdmin: true,
      });
      mockMerchantRepo.update.mockResolvedValue({});

      await service.creditReferrer(REFERRER_ID, 'New Merchant');

      expect(mockMerchantRepo.update).toHaveBeenCalledWith({
        where: { id: REFERRER_ID },
        data: { referralMonthsEarned: { increment: 1 } },
      });
    });

    it('extends planExpiresAt for a trial PREMIUM referrer', async () => {
      const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      mockMerchantRepo.findUnique.mockResolvedValue({
        email: 'ref@jitplus.com',
        nom: 'Ref Commerce',
        plan: 'PREMIUM',
        planExpiresAt: futureExpiry,
        planActivatedByAdmin: false,
      });
      mockMerchantRepo.update.mockResolvedValue({});

      await service.creditReferrer(REFERRER_ID, 'New Merchant');

      const updateCall = mockMerchantRepo.update.mock.calls[0][0];
      expect(updateCall.data.planExpiresAt).toBeDefined();
      // New expiry should be ~30 days further than the current expiry
      const diff = updateCall.data.planExpiresAt.getTime() - futureExpiry.getTime();
      expect(diff).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
      expect(mockCache.del).toHaveBeenCalledWith(`plan:v1:${REFERRER_ID}`);
    });

    it('activates PREMIUM for a FREE merchant referrer', async () => {
      mockMerchantRepo.findUnique.mockResolvedValue({
        email: 'free@jitplus.com',
        nom: 'Free Commerce',
        plan: 'FREE',
        planExpiresAt: null,
        planActivatedByAdmin: false,
      });
      mockMerchantRepo.update.mockResolvedValue({});

      await service.creditReferrer(REFERRER_ID, 'New Merchant');

      expect(mockMerchantRepo.update).toHaveBeenCalledWith({
        where: { id: REFERRER_ID },
        data: expect.objectContaining({
          plan: 'PREMIUM',
          planActivatedByAdmin: false,
          referralMonthsEarned: { increment: 1 },
        }),
      });
      expect(mockCache.del).toHaveBeenCalledWith(`plan:v1:${REFERRER_ID}`);
    });

    it('silently returns when referrer does not exist', async () => {
      mockMerchantRepo.findUnique.mockResolvedValue(null);

      await expect(service.creditReferrer(REFERRER_ID, 'New')).resolves.not.toThrow();
      expect(mockMerchantRepo.update).not.toHaveBeenCalled();
    });
  });
});
