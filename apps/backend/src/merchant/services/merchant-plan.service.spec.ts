import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { MerchantPlanService, PLAN_LIMITS } from './merchant-plan.service';
import {
  MERCHANT_REPOSITORY,
  LOYALTY_CARD_REPOSITORY,
} from '../../common/repositories';
import { PUSH_PROVIDER } from '../../common/interfaces';
import { ClientReferralService } from '../../client-auth/client-referral.service';
import { MerchantReferralService } from './merchant-referral.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MERCHANT_ID = 'merchant-uuid-1';

const baseMerchant = {
  id: MERCHANT_ID,
  plan: 'FREE' as const,
  planExpiresAt: null as Date | null,
  planActivatedByAdmin: false,
  trialStartedAt: null as Date | null,
};

function futureDate(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

function pastDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  merchant: {
    findUniqueOrThrow: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  loyaltyCard: {
    count: jest.fn(),
  },
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockFirebase = {
  sendToMerchant: jest.fn(),
};

const mockClientReferralService = {
  creditReferralReward: jest.fn().mockResolvedValue(undefined),
  creditClientForMerchant: jest.fn().mockResolvedValue(undefined),
};

const mockMerchantReferralService = {
  creditReferralReward: jest.fn().mockResolvedValue(undefined),
  creditReferrerOnPayment: jest.fn().mockResolvedValue(undefined),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('MerchantPlanService', () => {
  let service: MerchantPlanService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantPlanService,
        { provide: MERCHANT_REPOSITORY, useValue: mockPrisma.merchant },
        { provide: LOYALTY_CARD_REPOSITORY, useValue: mockPrisma.loyaltyCard },
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: PUSH_PROVIDER, useValue: mockFirebase },
        { provide: ClientReferralService, useValue: mockClientReferralService },
        { provide: MerchantReferralService, useValue: mockMerchantReferralService },
      ],
    }).compile();

    service = module.get<MerchantPlanService>(MerchantPlanService);
    jest.clearAllMocks();
  });

  // ── PLAN_LIMITS ────────────────────────────────────────────────────────────

  describe('PLAN_LIMITS constant', () => {
    it('FREE plan has correct limits', () => {
      expect(PLAN_LIMITS.FREE.maxClients).toBe(20);
      expect(PLAN_LIMITS.FREE.maxStores).toBe(1);
      expect(PLAN_LIMITS.FREE.whatsappBlasts).toBe(false);
      expect(PLAN_LIMITS.FREE.emailBlasts).toBe(false);
    });

    it('PREMIUM plan has unlimited clients', () => {
      expect(PLAN_LIMITS.PREMIUM.maxClients).toBe(Infinity);
      expect(PLAN_LIMITS.PREMIUM.whatsappBlasts).toBe(true);
      expect(PLAN_LIMITS.PREMIUM.emailBlasts).toBe(true);
    });
  });

  // ── getTrialData ───────────────────────────────────────────────────────────

  describe('getTrialData()', () => {
    it('returns PREMIUM plan data with 30-day expiry', () => {
      const before = new Date();
      const result = service.getTrialData();
      const after = new Date();

      expect(result.plan).toBe('PREMIUM');
      expect(result.planActivatedByAdmin).toBe(false);
      expect(result.trialStartedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());

      const expectedExpiry = new Date(before);
      expectedExpiry.setDate(expectedExpiry.getDate() + 30);
      // Allow 1-second tolerance
      expect(Math.abs(result.planExpiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(1000);
    });
  });

  // ── resolveEffectivePlan ───────────────────────────────────────────────────

  describe('resolveEffectivePlan()', () => {
    it('returns cached result when available', async () => {
      const cached = {
        plan: 'PREMIUM',
        planExpiresAt: null,
        planActivatedByAdmin: true,
        trialStartedAt: null,
        isTrial: false,
        daysRemaining: null,
      };
      mockCache.get.mockResolvedValue(cached);

      const result = await service.resolveEffectivePlan(MERCHANT_ID);

      expect(result.plan).toBe('PREMIUM');
      expect(mockPrisma.merchant.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('returns permanent PREMIUM for admin-activated merchant', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue({
        ...baseMerchant,
        plan: 'PREMIUM',
        planActivatedByAdmin: true,
        planExpiresAt: null,
      });

      const result = await service.resolveEffectivePlan(MERCHANT_ID);

      expect(result.plan).toBe('PREMIUM');
      expect(result.isTrial).toBe(false);
      expect(result.daysRemaining).toBeNull();
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('returns trial PREMIUM when trial is still active', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue({
        ...baseMerchant,
        plan: 'PREMIUM',
        planActivatedByAdmin: false,
        planExpiresAt: futureDate(30),
      });

      const result = await service.resolveEffectivePlan(MERCHANT_ID);

      expect(result.plan).toBe('PREMIUM');
      expect(result.isTrial).toBe(true);
      expect(result.daysRemaining).toBeGreaterThan(0);
    });

    it('auto-downgrades to FREE when trial has expired', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue({
        ...baseMerchant,
        plan: 'PREMIUM',
        planActivatedByAdmin: false,
        planExpiresAt: pastDate(5),
      });
      mockPrisma.merchant.update.mockResolvedValue({});

      const result = await service.resolveEffectivePlan(MERCHANT_ID);

      expect(result.plan).toBe('FREE');
      expect(result.daysRemaining).toBe(0);
      expect(mockPrisma.merchant.update).toHaveBeenCalledWith({
        where: { id: MERCHANT_ID },
        data: { plan: 'FREE' },
      });
    });

    it('returns FREE plan for a FREE merchant', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(baseMerchant);

      const result = await service.resolveEffectivePlan(MERCHANT_ID);

      expect(result.plan).toBe('FREE');
      expect(result.isTrial).toBe(false);
    });
  });

  // ── isPremium ──────────────────────────────────────────────────────────────

  describe('isPremium()', () => {
    it('returns true for PREMIUM merchant', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue({
        ...baseMerchant,
        plan: 'PREMIUM',
        planActivatedByAdmin: true,
      });

      expect(await service.isPremium(MERCHANT_ID)).toBe(true);
    });

    it('returns false for FREE merchant', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(baseMerchant);

      expect(await service.isPremium(MERCHANT_ID)).toBe(false);
    });
  });

  // ── assertCanAddClient ────────────────────────────────────────────────────

  describe('assertCanAddClient()', () => {
    it('does not throw for a PREMIUM merchant', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue({
        ...baseMerchant,
        plan: 'PREMIUM',
        planActivatedByAdmin: true,
      });

      await expect(service.assertCanAddClient(MERCHANT_ID)).resolves.not.toThrow();
      expect(mockPrisma.loyaltyCard.count).not.toHaveBeenCalled();
    });

    it('does not throw for FREE merchant under the limit', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(baseMerchant);
      mockPrisma.loyaltyCard.count.mockResolvedValue(10);

      await expect(service.assertCanAddClient(MERCHANT_ID)).resolves.not.toThrow();
    });

    it('throws ForbiddenException for FREE merchant at the limit', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(baseMerchant);
      mockPrisma.loyaltyCard.count.mockResolvedValue(20); // FREE_MAX_CLIENTS = 20

      await expect(service.assertCanAddClient(MERCHANT_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── getMaxStores ──────────────────────────────────────────────────────────

  describe('getMaxStores()', () => {
    it('returns 1 for FREE merchant', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(baseMerchant);

      expect(await service.getMaxStores(MERCHANT_ID)).toBe(1);
    });

    it('returns 10 for PREMIUM merchant', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue({
        ...baseMerchant,
        plan: 'PREMIUM',
        planActivatedByAdmin: true,
      });

      expect(await service.getMaxStores(MERCHANT_ID)).toBe(10);
    });
  });

  // ── adminActivatePremium ──────────────────────────────────────────────────

  describe('adminActivatePremium()', () => {
    it('sets plan to PREMIUM, clears cache, and sends push if token exists', async () => {
      mockPrisma.merchant.update.mockResolvedValue({ pushToken: 'expo-token-abc' });

      await service.adminActivatePremium(MERCHANT_ID);

      expect(mockPrisma.merchant.update).toHaveBeenCalledWith({
        where: { id: MERCHANT_ID },
        data: {
          plan: 'PREMIUM',
          planActivatedByAdmin: true,
          planExpiresAt: null,
          referralMonthsEarned: 0,
        },
        select: { pushToken: true },
      });
      expect(mockCache.del).toHaveBeenCalledWith(`plan:v1:${MERCHANT_ID}`);
      expect(mockFirebase.sendToMerchant).toHaveBeenCalled();
    });

    it('does not send push notification when merchant has no pushToken', async () => {
      mockPrisma.merchant.update.mockResolvedValue({ pushToken: null });

      await service.adminActivatePremium(MERCHANT_ID);

      expect(mockFirebase.sendToMerchant).not.toHaveBeenCalled();
    });
  });

  // ── adminRevokePremium ────────────────────────────────────────────────────

  describe('adminRevokePremium()', () => {
    it('sets plan to FREE and clears cache', async () => {
      mockPrisma.merchant.update.mockResolvedValue({ pushToken: null });

      await service.adminRevokePremium(MERCHANT_ID);

      expect(mockPrisma.merchant.update).toHaveBeenCalledWith({
        where: { id: MERCHANT_ID },
        data: { plan: 'FREE', planActivatedByAdmin: false, planExpiresAt: null },
        select: { pushToken: true },
      });
      expect(mockCache.del).toHaveBeenCalledWith(`plan:v1:${MERCHANT_ID}`);
    });
  });

  // ── applyEarnedReferralMonths ─────────────────────────────────────────────

  describe('applyEarnedReferralMonths()', () => {
    it('applies referral months correctly', async () => {
      const months = 2;
      mockPrisma.merchant.findUnique.mockResolvedValue({ referralMonthsEarned: months });
      mockPrisma.merchant.update.mockResolvedValue({});

      const result = await service.applyEarnedReferralMonths(MERCHANT_ID);

      expect(result.monthsApplied).toBe(months);
      expect(result.planExpiresAt).toBeInstanceOf(Date);
      expect(mockPrisma.merchant.update).toHaveBeenCalledWith({
        where: { id: MERCHANT_ID },
        data: expect.objectContaining({
          plan: 'PREMIUM',
          planActivatedByAdmin: false,
          referralMonthsEarned: 0,
        }),
      });
    });

    it('throws when merchant has no earned months', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ referralMonthsEarned: 0 });

      await expect(service.applyEarnedReferralMonths(MERCHANT_ID)).rejects.toThrow(
        'Aucun mois gratuit disponible',
      );
    });

    it('throws when merchant does not exist', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.applyEarnedReferralMonths(MERCHANT_ID)).rejects.toThrow(
        'Aucun mois gratuit disponible',
      );
    });
  });

  // ── invalidatePlanCache ────────────────────────────────────────────────────

  describe('invalidatePlanCache()', () => {
    it('deletes the cache entry for the given merchant', async () => {
      await service.invalidatePlanCache(MERCHANT_ID);
      expect(mockCache.del).toHaveBeenCalledWith(`plan:v1:${MERCHANT_ID}`);
    });
  });
});
