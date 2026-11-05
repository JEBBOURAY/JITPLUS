import { Injectable, ForbiddenException, Inject } from '@nestjs/common';
import { MERCHANT_REPOSITORY, type IMerchantRepository } from '../common/repositories';

export interface EmailQuota {
  emailQuotaUsed: number;
  emailQuotaMax: number;
  emailQuotaResetAt: Date;
}

const QUOTA_SELECT = { emailQuotaUsed: true, emailQuotaMax: true, emailQuotaResetAt: true } as const;

/** First day of the month following `now`, at 00:00 UTC (no month overflow). */
export function nextQuotaResetDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

@Injectable()
export class EmailQuotaService {
  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
  ) {}

  /**
   * Returns the merchant's current email quota, resetting it first when a new
   * monthly period has started.
   */
  async getQuota(merchantId: string): Promise<EmailQuota> {
    return this.loadQuota(merchantId);
  }

  /**
   * Reserves `emailsToSend` emails from the merchant's monthly quota.
   *
   * The increment is a conditional UPDATE (`emailQuotaUsed <= max - n`), so two
   * concurrent blasts cannot both pass the check and overshoot the quota.
   *
   * @throws ForbiddenException when the quota would be exceeded.
   */
  async checkAndIncrementQuota(merchantId: string, emailsToSend: number): Promise<EmailQuota> {
    const quota = await this.loadQuota(merchantId);

    const reserved = await this.merchantRepo.updateMany({
      where: {
        id: merchantId,
        emailQuotaMax: quota.emailQuotaMax,
        emailQuotaUsed: { lte: quota.emailQuotaMax - emailsToSend },
      },
      data: { emailQuotaUsed: { increment: emailsToSend } },
    });

    if (reserved.count !== 1) {
      const current = await this.merchantRepo.findUniqueOrThrow({ where: { id: merchantId }, select: QUOTA_SELECT });
      throw new ForbiddenException(
        `Quota email dépassé. Utilisé: ${current.emailQuotaUsed}, Max: ${current.emailQuotaMax}`,
      );
    }

    return { ...quota, emailQuotaUsed: quota.emailQuotaUsed + emailsToSend };
  }

  /** Reads the quota, applying the monthly reset when its date has passed. */
  private async loadQuota(merchantId: string): Promise<EmailQuota> {
    const quota = await this.merchantRepo.findUniqueOrThrow({ where: { id: merchantId }, select: QUOTA_SELECT });

    const now = new Date();
    if (now <= quota.emailQuotaResetAt) return quota;

    // Conditional on the old reset date: when two requests race on the reset,
    // only one zeroes the counter — the other must not wipe emails already
    // reserved in the new period.
    const nextReset = nextQuotaResetDate(now);
    await this.merchantRepo.updateMany({
      where: { id: merchantId, emailQuotaResetAt: quota.emailQuotaResetAt },
      data: { emailQuotaUsed: 0, emailQuotaResetAt: nextReset },
    });
    return this.merchantRepo.findUniqueOrThrow({ where: { id: merchantId }, select: QUOTA_SELECT });
  }
}
