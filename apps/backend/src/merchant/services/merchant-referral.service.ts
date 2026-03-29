import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { MERCHANT_REPOSITORY, type IMerchantRepository } from '../../common/repositories';
import { IMailProvider, MAIL_PROVIDER } from '../../common/interfaces';
import { errMsg } from '../../common/utils';

import {
  REFERRAL_CODE_CHARS,
  REFERRAL_CODE_LENGTH,
  REFERRAL_BONUS_DAYS,
  REFERRAL_STATS_CACHE_TTL,
} from '../../common/constants';

export interface ReferralStats {
  referralCode: string;
  referredCount: number;
  referralMonthsEarned: number;
  referrals: {
    id: string;
    nom: string;
    categorie: string;
    ville: string | null;
    createdAt: Date;
    validated: boolean;
  }[];
}

@Injectable()
export class MerchantReferralService {
  private readonly logger = new Logger(MerchantReferralService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: IMailProvider,
  ) {}

  /**
   * Get (or auto-generate) the referral code + full stats for a merchant.
   */
  async getReferralStats(merchantId: string): Promise<ReferralStats> {
    const cacheKey = `referral:stats:${merchantId}`;
    const cached = await this.cache.get<ReferralStats>(cacheKey);
    if (cached) return cached;

    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: {
        referralCode: true,
        referralMonthsEarned: true,
        referrals: {
          select: {
            id: true,
            nom: true,
            categorie: true,
            ville: true,
            createdAt: true,
            referralBonusCredited: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!merchant) throw new NotFoundException('Commerce non trouvé');

    let referralCode = merchant.referralCode;

    if (!referralCode) {
      referralCode = await this.generateUniqueCode();
      await this.merchantRepo.update({
        where: { id: merchantId },
        data: { referralCode },
      });
    }

    const result: ReferralStats = {
      referralCode,
      referredCount: merchant.referrals.length,
      referralMonthsEarned: merchant.referralMonthsEarned,
      referrals: merchant.referrals.map((r) => ({
        id: r.id,
        nom: r.nom,
        categorie: r.categorie,
        ville: r.ville,
        createdAt: r.createdAt,
        validated: r.referralBonusCredited,
      })),
    };

    await this.cache.set(cacheKey, result, REFERRAL_STATS_CACHE_TTL);
    return result;
  }

  /** Invalidate referral stats cache for a merchant. */
  private async invalidateReferralCache(merchantId: string): Promise<void> {
    await this.cache.del(`referral:stats:${merchantId}`);
  }

  /**
   * Credit the referrer when a new merchant registers with their code.
   * - Admin-permanent PREMIUM: record the month only (plan is permanent, nothing to extend).
   * - Time-limited PREMIUM: extend planExpiresAt by 30 days automatically.
   * - FREE merchant: automatically activate PREMIUM for 30 days.
   */
  async creditReferrer(referrerId: string, newMerchantNom: string): Promise<void> {
    const referrer = await this.merchantRepo.findUnique({
      where: { id: referrerId },
      select: {
        email: true,
        nom: true,
        plan: true,
        planExpiresAt: true,
        planActivatedByAdmin: true,
      },
    });

    if (!referrer) return;

    const now = new Date();

    // Admin-activated permanent PREMIUM → just record the earned month
    if (referrer.planActivatedByAdmin) {
      await this.merchantRepo.update({
        where: { id: referrerId },
        data: { referralMonthsEarned: { increment: 1 } },
      });
      await this.invalidateReferralCache(referrerId);
      this.logger.log(`Referral bonus: merchant ${referrerId} has permanent admin PREMIUM — recorded +1 month earned`);
      this.mailProvider.sendReferralBonus(referrer.email, referrer.nom, newMerchantNom, null)
        .catch((err) => this.logger.warn('Referral bonus email failed', errMsg(err)));
      return;
    }

    // Time-limited PREMIUM (trial) → extend by 30 days
    if (referrer.plan === 'PREMIUM' && referrer.planExpiresAt) {
      const base = referrer.planExpiresAt > now ? referrer.planExpiresAt : now;
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + REFERRAL_BONUS_DAYS);
      await this.merchantRepo.update({
        where: { id: referrerId },
        data: {
          planExpiresAt: newExpiry,
          referralMonthsEarned: { increment: 1 },
        },
      });
      await this.cache.del(`plan:v1:${referrerId}`);
      await this.invalidateReferralCache(referrerId);
      this.logger.log(`Referral bonus: extended PREMIUM for merchant ${referrerId} until ${newExpiry.toISOString()}`);
      this.mailProvider.sendReferralBonus(referrer.email, referrer.nom, newMerchantNom, newExpiry)
        .catch((err) => this.logger.warn('Referral bonus email failed', errMsg(err)));
      return;
    }

    // FREE merchant → automatically activate PREMIUM for 30 days
    const newExpiry = new Date(now);
    newExpiry.setDate(newExpiry.getDate() + REFERRAL_BONUS_DAYS);
    await this.merchantRepo.update({
      where: { id: referrerId },
      data: {
        plan: 'PREMIUM',
        planActivatedByAdmin: false,
        planExpiresAt: newExpiry,
        referralMonthsEarned: { increment: 1 },
      },
    });
    await this.cache.del(`plan:v1:${referrerId}`);
    await this.invalidateReferralCache(referrerId);
    this.logger.log(`Referral bonus: auto-activated PREMIUM for FREE merchant ${referrerId} until ${newExpiry.toISOString()}`);
    this.mailProvider.sendReferralBonus(referrer.email, referrer.nom, newMerchantNom, newExpiry)
      .catch((err) => this.logger.warn('Referral bonus email failed', errMsg(err)));
  }

  /**
   * Credit the referrer when a referred merchant converts to paid PREMIUM.
   * Called from upgrade-request approval or admin activate-premium.
   * Uses atomic updateMany to prevent double-crediting.
   */
  async creditReferrerOnPayment(newMerchantId: string): Promise<void> {
    // Atomic guard: only update merchants that have a referrer and haven't been credited yet
    const { count } = await this.merchantRepo.updateMany({
      where: { id: newMerchantId, referredById: { not: null }, referralBonusCredited: false },
      data: { referralBonusCredited: true },
    });

    if (count === 0) return; // no referrer or already credited

    const merchant = await this.merchantRepo.findUnique({
      where: { id: newMerchantId },
      select: { referredById: true, nom: true },
    });

    if (!merchant?.referredById) return;

    await this.creditReferrer(merchant.referredById, merchant.nom);
    this.logger.log(`Deferred referral bonus credited for referrer of merchant ${newMerchantId}`);
  }

  /**
   * Validate a referral code before registration.
   * Returns referrer's id + nom, or throws NotFoundException.
   */
  async validateCode(code: string): Promise<{ id: string; nom: string }> {
    if (!code || code.trim().length === 0) {
      throw new NotFoundException('Code de parrainage requis');
    }

    const referrer = await this.merchantRepo.findUnique({
      where: { referralCode: code.trim().toUpperCase() },
      select: { id: true, nom: true },
    });

    if (!referrer) {
      throw new NotFoundException('Code de parrainage invalide ou inexistant');
    }

    return referrer;
  }

  /** Generate a random alphanumeric code that doesn't already exist. */
  private async generateUniqueCode(): Promise<string> {
    let code: string;
    do {
      code = Array.from(
        { length: REFERRAL_CODE_LENGTH },
        () => REFERRAL_CODE_CHARS[Math.floor(Math.random() * REFERRAL_CODE_CHARS.length)],
      ).join('');
    } while (
      await this.merchantRepo.findUnique({
        where: { referralCode: code },
        select: { id: true },
      })
    );
    return code;
  }
}
