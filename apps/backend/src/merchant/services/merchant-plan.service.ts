import { Injectable, Logger, ForbiddenException, BadRequestException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
} from '../../common/repositories';
import { IPushProvider, PUSH_PROVIDER } from '../../common/interfaces';
import { ClientReferralService } from '../../client-auth/client-referral.service';
import { MerchantReferralService } from './merchant-referral.service';
import { MerchantPlan } from '@prisma/client';
import {
  FREE_MAX_CLIENTS,
  FREE_MAX_STORES,
  PREMIUM_MAX_STORES,
  MS_PER_DAY,
  PLAN_CACHE_TTL,
  TRIAL_DURATION_DAYS,
} from '../../common/constants';

/** Plan limits by tier */
export const PLAN_LIMITS = {
  FREE: {
    maxClients: FREE_MAX_CLIENTS,
    maxStores: FREE_MAX_STORES,
    maxLoyaltyPrograms: 1,
    pushNotifications: true,
    whatsappBlasts: false,
    emailBlasts: false,
    advancedDashboard: false,
    price: '0 DH/mois',
  },
  PREMIUM: {
    maxClients: Infinity,
    maxStores: PREMIUM_MAX_STORES,
    maxLoyaltyPrograms: Infinity,
    pushNotifications: true,
    whatsappBlasts: true,
    emailBlasts: true,
    advancedDashboard: true,
    price: 'Premium',
  },
} as const;

// ── Localized plan push messages ──
type PlanLang = 'fr' | 'en' | 'ar';
function planLang(v?: string | null): PlanLang {
  return v === 'en' || v === 'ar' ? v : 'fr';
}

const PLAN_MESSAGES = {
  activated: {
    fr: {
      title: '🎉 Plan Premium activé !',
      body: 'Félicitations ! Votre abonnement JitPlus Premium est maintenant actif. Profitez de toutes les fonctionnalités sans limite.',
    },
    en: {
      title: '🎉 Premium Plan activated!',
      body: 'Congratulations! Your JitPlus Premium subscription is now active. Enjoy all features with no limits.',
    },
    ar: {
      title: '🎉 بلان بريميوم تفعل!',
      body: 'مبروك! الاشتراك ديالك فـ JitPlus Premium ولا نشيط. استافد من كاع الميزات بلا حدود.',
    },
  },
  revoked: {
    fr: {
      title: '📋 Plan modifié — Gratuit',
      body: 'Votre accès Premium a été désactivé. Votre commerce fonctionne désormais avec le plan Gratuit.',
    },
    en: {
      title: '📋 Plan changed — Free',
      body: 'Your Premium access has been deactivated. Your business now runs on the Free plan.',
    },
    ar: {
      title: '📋 البلان تبدل — مجاني',
      body: 'الأكسي بريميوم تعطل. الكومرس ديالك دابا خدام بالبلان المجاني.',
    },
  },
} as const;

@Injectable()
export class MerchantPlanService {
  private readonly logger = new Logger(MerchantPlanService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private readonly loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
    private readonly clientReferralService: ClientReferralService,
    private readonly merchantReferralService: MerchantReferralService,
  ) {}

  /** Cache key for a merchant's effective plan */
  private planCacheKey(merchantId: string): string {
    return `plan:v1:${merchantId}`;
  }

  /** Invalidate the plan cache entry for a merchant (call after any plan mutation) */
  async invalidatePlanCache(merchantId: string): Promise<void> {
    await this.cache.del(this.planCacheKey(merchantId));
  }

  /**
   * Resolve the effective plan for a merchant.
   * If the trial has expired and the admin hasn't activated premium,
   * auto-downgrade to FREE and persist the change.
   */
  async resolveEffectivePlan(merchantId: string): Promise<{
    plan: MerchantPlan;
    planExpiresAt: Date | null;
    planActivatedByAdmin: boolean;
    trialStartedAt: Date | null;
    isTrial: boolean;
    daysRemaining: number | null;
  }> {
    const cacheKey = this.planCacheKey(merchantId);
    const cached = await this.cache.get<{
      plan: MerchantPlan;
      planExpiresAt: string | null;
      planActivatedByAdmin: boolean;
      trialStartedAt: string | null;
      isTrial: boolean;
      daysRemaining: number | null;
    }>(cacheKey);

    if (cached) {
      return {
        ...cached,
        planExpiresAt: cached.planExpiresAt ? new Date(cached.planExpiresAt) : null,
        trialStartedAt: cached.trialStartedAt ? new Date(cached.trialStartedAt) : null,
      };
    }

    const merchant = await this.merchantRepo.findUniqueOrThrow({
      where: { id: merchantId },
      select: {
        plan: true,
        planExpiresAt: true,
        planActivatedByAdmin: true,
        trialStartedAt: true,
      },
    });

    // Admin-activated PREMIUM — permanent or time-limited paid subscription
    if (merchant.planActivatedByAdmin && merchant.plan === 'PREMIUM') {
      // Time-limited paid subscription: check if it has expired
      if (merchant.planExpiresAt) {
        const now = new Date();
        if (now > merchant.planExpiresAt) {
          await this.merchantRepo.update({
            where: { id: merchantId },
            data: { plan: 'FREE', planActivatedByAdmin: false },
          });
          this.logger.log(`Merchant ${merchantId} paid subscription expired — downgraded to FREE`);
          const expiredResult = {
            plan: 'FREE' as MerchantPlan,
            planExpiresAt: merchant.planExpiresAt,
            planActivatedByAdmin: false,
            trialStartedAt: merchant.trialStartedAt,
            isTrial: false,
            daysRemaining: 0 as number | null,
          };
          await this.cache.set(cacheKey, expiredResult, PLAN_CACHE_TTL);
          return expiredResult;
        }
        const msRemaining = merchant.planExpiresAt.getTime() - now.getTime();
        const daysRemaining = Math.ceil(msRemaining / MS_PER_DAY);
        const timedResult = {
          plan: 'PREMIUM' as MerchantPlan,
          planExpiresAt: merchant.planExpiresAt,
          planActivatedByAdmin: true,
          trialStartedAt: merchant.trialStartedAt,
          isTrial: false,
          daysRemaining,
        };
        await this.cache.set(cacheKey, timedResult, PLAN_CACHE_TTL);
        return timedResult;
      }
      // Permanent admin premium (no expiry)
      const adminResult = {
        plan: 'PREMIUM' as MerchantPlan,
        planExpiresAt: null as Date | null,
        planActivatedByAdmin: true,
        trialStartedAt: merchant.trialStartedAt,
        isTrial: false,
        daysRemaining: null as number | null,
      };
      await this.cache.set(cacheKey, adminResult, PLAN_CACHE_TTL);
      return adminResult;
    }

    // Trial PREMIUM — planActivatedByAdmin is false, expiry set by registration
    if (merchant.plan === 'PREMIUM' && merchant.planExpiresAt) {
      const now = new Date();
      if (now > merchant.planExpiresAt) {
        // Trial expired — downgrade to FREE
        await this.merchantRepo.update({
          where: { id: merchantId },
          data: { plan: 'FREE' },
        });
        this.logger.log(`Merchant ${merchantId} trial expired — downgraded to FREE`);
        const expiredResult = {
          plan: 'FREE' as MerchantPlan,
          planExpiresAt: merchant.planExpiresAt,
          planActivatedByAdmin: false,
          trialStartedAt: merchant.trialStartedAt,
          isTrial: false,
          daysRemaining: 0 as number | null,
        };
        await this.cache.set(cacheKey, expiredResult, PLAN_CACHE_TTL);
        return expiredResult;
      }
      // Trial still active
      const msRemaining = merchant.planExpiresAt.getTime() - now.getTime();
      const daysRemaining = Math.ceil(msRemaining / MS_PER_DAY);
      const trialResult = {
        plan: 'PREMIUM' as MerchantPlan,
        planExpiresAt: merchant.planExpiresAt,
        planActivatedByAdmin: false,
        trialStartedAt: merchant.trialStartedAt,
        isTrial: true,
        daysRemaining,
      };
      await this.cache.set(cacheKey, trialResult, PLAN_CACHE_TTL);
      return trialResult;
    }

    // Already FREE
    const result = {
      plan: merchant.plan,
      planExpiresAt: merchant.planExpiresAt,
      planActivatedByAdmin: merchant.planActivatedByAdmin,
      trialStartedAt: merchant.trialStartedAt,
      isTrial: false,
      daysRemaining: null as number | null,
    };
    await this.cache.set(cacheKey, result, PLAN_CACHE_TTL);
    return result;
  }

  /**
   * Initialize a new merchant with a free trial (30 days PREMIUM).
   * Called during registration.
   */
  getTrialData(): {
    plan: MerchantPlan;
    planExpiresAt: Date;
    trialStartedAt: Date;
    planActivatedByAdmin: boolean;
  } {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + TRIAL_DURATION_DAYS);

    return {
      plan: 'PREMIUM',
      planExpiresAt: expiresAt,
      trialStartedAt: now,
      planActivatedByAdmin: false,
    };
  }

  /**
   * Admin activates premium for a merchant (permanent until admin revokes).
   * Also resets any pending referral months (superseded by permanent premium).
   */
  async adminActivatePremium(merchantId: string): Promise<void> {
    const merchant = await this.merchantRepo.update({
      where: { id: merchantId },
      data: {
        plan: 'PREMIUM',
        planActivatedByAdmin: true,
        planExpiresAt: null,
        referralMonthsEarned: 0,
      },
      select: { pushToken: true, language: true },
    });
    await this.invalidatePlanCache(merchantId);
    this.logger.log(`Admin activated PREMIUM for merchant ${merchantId}`);

    // Credit client referrer if this merchant was referred by a client (fire-and-forget)
    this.clientReferralService.creditClientForMerchant(merchantId)
      .catch((err) => this.logger.error(`Client referral credit failed for merchant ${merchantId}`, err?.stack));
    // Credit merchant referrer now that this merchant has paid (fire-and-forget)
    this.merchantReferralService.creditReferrerOnPayment(merchantId)
      .catch((err) => this.logger.error(`Merchant referral credit failed for merchant ${merchantId}`, err?.stack));
    // ── Push notification ────────────────────────────────────────
    if (merchant?.pushToken) {
      const msg = PLAN_MESSAGES.activated[planLang(merchant.language)];
      await this.pushProvider.sendToMerchant(
        merchant.pushToken,
        msg.title,
        msg.body,
        { action: 'open_plan' },
      );
    }
  }

  /**
   * Convert a FREE merchant's earned referral months into a time-limited PREMIUM plan.
   * Called when a FREE merchant "upgrades" using their accumulated referral bonus.
   * Throws if the merchant has no earned months.
   */
  async applyEarnedReferralMonths(merchantId: string): Promise<{ planExpiresAt: Date; monthsApplied: number }> {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { referralMonthsEarned: true },
    });

    if (!merchant || merchant.referralMonthsEarned <= 0) {
      throw new Error('Aucun mois gratuit disponible');
    }

    const months = merchant.referralMonthsEarned;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + months * 30);

    await this.merchantRepo.update({
      where: { id: merchantId },
      data: {
        plan: 'PREMIUM',
        planActivatedByAdmin: false,
        planExpiresAt: expiresAt,
        referralMonthsEarned: 0,
      },
    });
    await this.invalidatePlanCache(merchantId);
    this.logger.log(`Applied ${months} referral months for merchant ${merchantId}, expires ${expiresAt.toISOString()}`);

    // Note: referral months are free — do NOT credit the referrer here.
    // Referrer bonus is only granted when the referred merchant pays for PREMIUM.

    return { planExpiresAt: expiresAt, monthsApplied: months };
  }

  /**
   * Admin revokes premium — merchant goes back to FREE.
   */
  async adminRevokePremium(merchantId: string): Promise<void> {
    const merchant = await this.merchantRepo.update({
      where: { id: merchantId },
      data: {
        plan: 'FREE',
        planActivatedByAdmin: false,
        planExpiresAt: null,
      },
      select: { pushToken: true, language: true },
    });
    await this.invalidatePlanCache(merchantId);
    this.logger.log(`Admin revoked PREMIUM for merchant ${merchantId}`);

    // ── Push notification ────────────────────────────────────────────
    if (merchant?.pushToken) {
      const msg = PLAN_MESSAGES.revoked[planLang(merchant.language)];
      await this.pushProvider.sendToMerchant(
        merchant.pushToken,
        msg.title,
        msg.body,
        { action: 'open_plan' },
      );
    }
  }

  /**
   * Check if a merchant currently has PREMIUM access (trial or admin).
   */
  async isPremium(merchantId: string): Promise<boolean> {
    const { plan } = await this.resolveEffectivePlan(merchantId);
    return plan === 'PREMIUM';
  }

  /**
   * Get the plan limits for a merchant based on their effective plan.
   */
  async getPlanLimits(merchantId: string) {
    const effective = await this.resolveEffectivePlan(merchantId);
    const limits = PLAN_LIMITS[effective.plan];
    return { ...effective, limits };
  }

  /**
   * Assert the merchant can add a new client.
   * No-op for PREMIUM; throws ForbiddenException for FREE over limit.
   */
  async assertCanAddClient(merchantId: string): Promise<void> {
    const { plan } = await this.resolveEffectivePlan(merchantId);
    if (plan === 'PREMIUM') return;

    const count = await this.loyaltyCardRepo.count({
      where: { merchantId, deactivatedAt: null },
    });

    if (count >= FREE_MAX_CLIENTS) {
      throw new ForbiddenException(
        `Limite de ${FREE_MAX_CLIENTS} clients atteinte sur le plan Gratuit. Passez au plan Pro pour des clients illimités — contactez notre équipe sur WhatsApp.`,
      );
    }
  }

  /**
   * Get the maximum number of stores allowed for a merchant.
   */
  async getMaxStores(merchantId: string): Promise<number> {
    const { plan } = await this.resolveEffectivePlan(merchantId);
    return plan === 'PREMIUM' ? PREMIUM_MAX_STORES : FREE_MAX_STORES;
  }

  /**
   * Admin manually sets subscription start / end dates.
   * - If endDate is provided → merchant is promoted to time-limited PREMIUM
   * - If startDate is provided → trialStartedAt is updated
   */
  async adminSetPlanDates(
    merchantId: string,
    dto: { startDate?: string; endDate?: string },
  ): Promise<void> {
    const data: Record<string, unknown> = {};

    if (dto.startDate !== undefined) {
      const d = new Date(dto.startDate);
      if (isNaN(d.getTime())) throw new BadRequestException('Date de début invalide');
      data.trialStartedAt = d;
    }
    if (dto.endDate !== undefined) {
      const d = new Date(dto.endDate);
      if (isNaN(d.getTime())) throw new BadRequestException('Date de fin invalide');
      data.planExpiresAt = d;
      data.plan = 'PREMIUM';
      // Mark as admin-validated paid subscription (not trial)
      data.planActivatedByAdmin = true;
    }

    if (Object.keys(data).length === 0) return;

    await this.merchantRepo.update({ where: { id: merchantId }, data });
    await this.invalidatePlanCache(merchantId);
    this.logger.log(`Admin manually set plan dates for merchant ${merchantId}: ${JSON.stringify(dto)}`);

    // Credit referrers when admin sets plan to PREMIUM (fire-and-forget)
    if (data.plan === 'PREMIUM') {
      this.clientReferralService.creditClientForMerchant(merchantId)
        .catch((err) => this.logger.error(`Client referral credit failed for merchant ${merchantId}`, err?.stack));
      this.merchantReferralService.creditReferrerOnPayment(merchantId)
        .catch((err) => this.logger.error(`Merchant referral credit failed for merchant ${merchantId}`, err?.stack));
    }
  }
}
