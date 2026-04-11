import { Injectable, ForbiddenException, Inject } from '@nestjs/common';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../common/repositories';
import { Merchant } from '@prisma/client';

@Injectable()
export class EmailQuotaService {
  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(TRANSACTION_RUNNER) private readonly txRunner: ITransactionRunner,
  ) {}

  /**
   * Returns current email quota for a merchant without modifying it.
   * Resets the monthly quota if a new period has started.
   */
  async getQuota(merchantId: string): Promise<Merchant> {
    const merchant = await this.merchantRepo.findUniqueOrThrow({
      where: { id: merchantId },
      select: {
        id: true,
        emailQuotaUsed: true,
        emailQuotaMax: true,
        emailQuotaResetAt: true,
        nom: true,
      },
    }) as Merchant;

    const now = new Date();
    if (now > merchant.emailQuotaResetAt) {
      const nextResetDate = new Date(now);
      nextResetDate.setMonth(nextResetDate.getMonth() + 1);
      nextResetDate.setDate(1);
      nextResetDate.setHours(0, 0, 0, 0);

      return this.merchantRepo.update({
        where: { id: merchantId },
        data: { emailQuotaUsed: 0, emailQuotaResetAt: nextResetDate },
      });
    }

    return merchant;
  }

  /**
   * Checks if a merchant can send a certain number of emails and updates their quota.
   * Resets the monthly quota if a new period has started.
   *
   * @param merchantId The ID of the merchant.
   * @param emailsToSend The number of emails the merchant intends to send.
   * @returns The updated merchant with the new quota usage.
   * @throws An error with name 'EmailQuotaExceededError' if the quota is exceeded.
   */
  async checkAndIncrementQuota(
    merchantId: string,
    emailsToSend: number,
  ): Promise<Merchant> {
    return this.txRunner.run(async (tx) => {
      let merchant = await tx.merchant.findUniqueOrThrow({
        where: { id: merchantId },
      });

      const now = new Date();
      // Reset quota if the reset date is in the past
      if (now > merchant.emailQuotaResetAt) {
        const nextResetDate = new Date(now);
        nextResetDate.setMonth(nextResetDate.getMonth() + 1);
        nextResetDate.setDate(1);
        nextResetDate.setHours(0, 0, 0, 0);

        merchant = await tx.merchant.update({
          where: { id: merchantId },
          data: {
            emailQuotaUsed: 0,
            emailQuotaResetAt: nextResetDate,
          },
        });
      }

      // Check if the new emails exceed the quota
      if (
        merchant.emailQuotaUsed + emailsToSend >
        merchant.emailQuotaMax
      ) {
        throw new ForbiddenException(
          `Quota email dépassé. Utilisé: ${merchant.emailQuotaUsed}, Max: ${merchant.emailQuotaMax}`,
        );
      }

      // Increment the quota and return the updated merchant
      const updatedMerchant = await tx.merchant.update({
        where: { id: merchantId },
        data: {
          emailQuotaUsed: {
            increment: emailsToSend,
          },
        },
      });

      return updatedMerchant;
    });
  }
}
