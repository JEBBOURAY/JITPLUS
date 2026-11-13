import { Injectable, Logger, ForbiddenException, BadRequestException, ConflictException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../../common/repositories';
import { IMailProvider, MAIL_PROVIDER } from '../../common/interfaces';
import { pickEmailLang } from '../../mail/transactional-i18n';
import { ClientReferralService } from '../../client-auth/client-referral.service';
import { MerchantReferralService } from './merchant-referral.service';
import { planCacheKey } from './plan-cache-key';
import { MerchantNotifierService } from '../../merchant-inbox/merchant-notifier.service';
import { MerchantPlan } from '@prisma/client';
import {
  FOUNDING_MEMBERS_LIMIT,
  FREE_MAX_CLIENTS,
  FREE_MAX_STORES,
  PREMIUM_MAX_STORES,
  MS_PER_DAY,
  PLAN_CACHE_TTL,
  TRIAL_DURATION_DAYS,
} from '../../common/constants';
import { pickAppLang } from '../../common/utils/app-lang';

/** Plan limits by tier */
const PLAN_LIMITS = {
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

/** Plan fields of a founding member: permanent PREMIUM, offered. */
const FOUNDING_PLAN_DATA = {
  foundingMember: true,
  plan: 'PREMIUM' as MerchantPlan,
  planActivatedByAdmin: true,
  planExpiresAt: null,
  premiumGrant: 'OFFERED' as const,
  premiumGrantNote: 'Membre fondateur (500 premiers inscrits)',
};

// ── Localized plan push messages ──
const planLang = pickAppLang;

const PLAN_MESSAGES = {
  activated: {
    fr: {
      title: 'Premium est activé',
      body: 'Toutes les fonctionnalités Premium sont débloquées pour votre commerce. Découvrez-les dès maintenant.',
    },
    en: {
      title: 'Premium is now active',
      body: 'Every Premium feature is now unlocked for your business. Explore them now.',
    },
    ar: {
      title: 'Premium تفعّل',
      body: 'كاع الميزات ديال Premium تحلّو للكومرس ديالك. اكتاشفهم دابا.',
    },
  },
  revoked: {
    fr: {
      title: 'Votre commerce est passé au plan Gratuit',
      body: 'L\'accès Premium a été désactivé. Consultez votre plan pour voir ce qui change.',
    },
    en: {
      title: 'Your business is now on the Free plan',
      body: 'Premium access has been turned off. Check your plan to see what changes.',
    },
    ar: {
      title: 'الكومرس ديالك دوز للبلان المجاني',
      body: 'الأكسي ديال Premium تحيّد. شوف البلان ديالك باش تعرف شنو تبدّل.',
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
    @Inject(MAIL_PROVIDER) private readonly mailProvider: IMailProvider,
    private readonly clientReferralService: ClientReferralService,
    private readonly merchantReferralService: MerchantReferralService,
    private readonly notifier: MerchantNotifierService,
    @Inject(TRANSACTION_RUNNER) private readonly txRunner: ITransactionRunner,
  ) {}

  /** Records the plan change in the merchant inbox, then pushes it when a device is registered. */
  private async notifyPlanChange(
    merchantId: string,
    merchant: { pushToken: string | null; language: string | null; notifPush?: boolean } | null | undefined,
    kind: 'activated' | 'revoked',
  ): Promise<void> {
    if (!merchant) return;
    const msg = PLAN_MESSAGES[kind][planLang(merchant.language)];
    await this.notifier.notify(
      { id: merchantId, pushToken: merchant.pushToken, notifPush: merchant.notifPush },
      {
        category: 'PLAN',
        title: msg.title,
        body: msg.body,
        action: 'open_plan',
        event: kind === 'activated' ? 'plan_activated' : 'plan_revoked',
      },
    );
  }


  /** Invalidate the plan cache entry for a merchant (call after any plan mutation) */
  async invalidatePlanCache(merchantId: string): Promise<void> {
    await this.cache.del(planCacheKey(merchantId));
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
    foundingMember: boolean;
  }> {
    const cacheKey = planCacheKey(merchantId);
    const cached = await this.cache.get<{
      plan: MerchantPlan;
      planExpiresAt: string | null;
      planActivatedByAdmin: boolean;
      trialStartedAt: string | null;
      isTrial: boolean;
      daysRemaining: number | null;
      foundingMember?: boolean;
    }>(cacheKey);

    if (cached) {
      return {
        ...cached,
        foundingMember: cached.foundingMember === true,
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
        foundingMember: true,
      },
    });
    const { foundingMember } = merchant;

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
            foundingMember,
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
          foundingMember,
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
        foundingMember,
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
          foundingMember,
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
        foundingMember,
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
      foundingMember,
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
   * Founding members: the first FOUNDING_MEMBERS_LIMIT sign-ups get permanent,
   * free PREMIUM (and no plan UI in the Pro app). Called right after sign-up.
   * The advisory lock serialises concurrent sign-ups so the cap holds exactly.
   * Returns the plan fields written, or null when every slot is taken.
   */
  async claimFoundingSlot(merchantId: string): Promise<typeof FOUNDING_PLAN_DATA | null> {
    const claimed = await this.txRunner.run(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('founding-members'))`;
      const taken = await tx.merchant.count({ where: { foundingMember: true } });
      if (taken >= FOUNDING_MEMBERS_LIMIT) return false;
      await tx.merchant.update({ where: { id: merchantId }, data: FOUNDING_PLAN_DATA });
      return true;
    });
    if (!claimed) return null;
    await this.invalidatePlanCache(merchantId);
    this.logger.log(`Merchant ${merchantId} is a founding member — permanent free PREMIUM`);
    return FOUNDING_PLAN_DATA;
  }

  /**
   * Admin activates premium for a merchant (permanent until admin revokes).
   * Also resets any pending referral months (superseded by permanent premium).
   */
  async adminActivatePremium(merchantId: string, opts: { creditReferrals?: boolean } = {}): Promise<void> {
    const merchant = await this.merchantRepo.update({
      where: { id: merchantId },
      data: {
        plan: 'PREMIUM',
        planActivatedByAdmin: true,
        planExpiresAt: null,
        referralMonthsEarned: 0,
      },
      select: { pushToken: true, notifPush: true, language: true, email: true },
    });
    await this.invalidatePlanCache(merchantId);
    this.logger.log(`Admin activated PREMIUM for merchant ${merchantId}`);

    // Referrers are rewarded when the merchant pays; an offered (free) PREMIUM skips them.
    if (opts.creditReferrals !== false) {
      // Credit client referrer if this merchant was referred by a client (fire-and-forget)
      this.clientReferralService.creditClientForMerchant(merchantId)
        .catch((err) => this.logger.error(`Client referral credit failed for merchant ${merchantId}`, err?.stack));
      // Credit merchant referrer now that this merchant has paid (fire-and-forget)
      this.merchantReferralService.creditReferrerOnPayment(merchantId)
        .catch((err) => this.logger.error(`Merchant referral credit failed for merchant ${merchantId}`, err?.stack));
    }
    // ── Push notification ────────────────────────────────────────
    await this.notifyPlanChange(merchantId, merchant, 'activated');
    if (merchant?.email) {
      this.mailProvider
        .sendPlanActivated(merchant.email, null, pickEmailLang(merchant.language))
        .catch((err) => this.logger.warn(`Plan-activated email failed: ${err?.message || err}`));
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
      select: { referralMonthsEarned: true, plan: true },
    });

    if (!merchant || merchant.referralMonthsEarned <= 0) {
      throw new BadRequestException('Aucun mois gratuit disponible');
    }
    // A PREMIUM merchant (admin-permanent or trial) already received each
    // referral month when it was earned — converting them would either
    // downgrade a permanent plan to a time-limited one or grant them twice.
    if (merchant.plan !== 'FREE') {
      throw new BadRequestException('Les mois de parrainage ne peuvent être utilisés qu\'avec le plan gratuit');
    }

    const months = merchant.referralMonthsEarned;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + months * 30);

    // Conditional write: a concurrent apply, plan change or newly credited
    // referral month (counter moved) makes count=0 instead of silently
    // overwriting it.
    const claimed = await this.merchantRepo.updateMany({
      where: { id: merchantId, plan: 'FREE', referralMonthsEarned: months },
      data: {
        plan: 'PREMIUM',
        planActivatedByAdmin: false,
        planExpiresAt: expiresAt,
        referralMonthsEarned: 0,
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('Votre plan a été modifié entre-temps, veuillez réessayer');
    }
    const updated = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { pushToken: true, notifPush: true, language: true, email: true },
    });
    await this.invalidatePlanCache(merchantId);
    this.logger.log(`Applied ${months} referral months for merchant ${merchantId}, expires ${expiresAt.toISOString()}`);

    // Note: referral months are free — do NOT credit the referrer here.
    // Referrer bonus is only granted when the referred merchant pays for PREMIUM.

    // ── Push notification: Premium activated via referral months ──
    await this.notifyPlanChange(merchantId, updated, 'activated');
    if (updated?.email) {
      this.mailProvider
        .sendPlanActivated(updated.email, expiresAt, pickEmailLang(updated.language))
        .catch((err) => this.logger.warn(`Plan-activated email failed: ${err?.message || err}`));
    }

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
        premiumGrant: null,
        premiumGrantNote: null,
        // Back on FREE: the plan UI must show again.
        foundingMember: false,
      },
      select: { pushToken: true, notifPush: true, language: true, email: true },
    });
    await this.invalidatePlanCache(merchantId);
    this.logger.log(`Admin revoked PREMIUM for merchant ${merchantId}`);

    // ── Push notification ────────────────────────────────────────
    await this.notifyPlanChange(merchantId, merchant, 'revoked');
    if (merchant?.email) {
      this.mailProvider
        .sendPlanRevoked(merchant.email, pickEmailLang(merchant.language))
        .catch((err) => this.logger.warn(`Plan-revoked email failed: ${err?.message || err}`));
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
   *
   * Inside an interactive transaction, pass `tx` (and the `plan` resolved
   * before the transaction): otherwise this would take a second pool
   * connection while the transaction holds one, and concurrent enrolments
   * could exhaust the pool.
   */
  async assertCanAddClient(
    merchantId: string,
    opts: {
      tx?: {
        loyaltyCard: Pick<ILoyaltyCardRepository, 'count'>;
        $queryRaw?: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
      };
      plan?: MerchantPlan;
    } = {},
  ): Promise<void> {
    const plan = opts.plan ?? (await this.resolveEffectivePlan(merchantId)).plan;
    if (plan === 'PREMIUM') return;

    // Serialise FREE enrolments of one merchant: without the row lock, two
    // concurrent enrolments both count 19 under RepeatableRead (write skew)
    // and the merchant ends above the limit. Held until the caller's tx ends.
    if (opts.tx?.$queryRaw) {
      await opts.tx.$queryRaw`SELECT 1 FROM merchants WHERE id = ${merchantId} FOR UPDATE`;
    }

    const count = await (opts.tx?.loyaltyCard ?? this.loyaltyCardRepo).count({
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
    opts: { creditReferrals?: boolean } = {},
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

    const merchant = await this.merchantRepo.update({
      where: { id: merchantId },
      data,
      select: { pushToken: true, notifPush: true, language: true, email: true },
    });
    await this.invalidatePlanCache(merchantId);
    this.logger.log(`Admin manually set plan dates for merchant ${merchantId}: ${JSON.stringify(dto)}`);

    // Credit referrers when admin sets plan to PREMIUM (fire-and-forget)
    if (data.plan === 'PREMIUM') {
      if (opts.creditReferrals !== false) {
        this.clientReferralService.creditClientForMerchant(merchantId)
          .catch((err) => this.logger.error(`Client referral credit failed for merchant ${merchantId}`, err?.stack));
        this.merchantReferralService.creditReferrerOnPayment(merchantId)
          .catch((err) => this.logger.error(`Merchant referral credit failed for merchant ${merchantId}`, err?.stack));
      }

      // ── Push notification: Premium activated by admin (with end date) ──
      await this.notifyPlanChange(merchantId, merchant, 'activated');
      if (merchant?.email) {
        const expiresAt = (data.planExpiresAt as Date) || null;
        this.mailProvider
          .sendPlanActivated(merchant.email, expiresAt, pickEmailLang(merchant.language))
          .catch((err) => this.logger.warn(`Plan-activated email failed: ${err?.message || err}`));
      }
    }
  }
}
