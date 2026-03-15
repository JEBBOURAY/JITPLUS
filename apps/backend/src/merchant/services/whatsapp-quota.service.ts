import { Injectable, ForbiddenException, Inject } from '@nestjs/common';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../../common/repositories';
import { Merchant, Prisma } from '../../generated/client';

@Injectable()
export class WhatsappQuotaService {
  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(TRANSACTION_RUNNER) private readonly txRunner: ITransactionRunner,
  ) {}

  /**
   * Returns the current WhatsApp quota for a merchant without modifying it.
   * Resets the monthly quota if a new period has started.
   */
  async getQuota(merchantId: string): Promise<Merchant> {
    return this.txRunner.run(async (tx: Prisma.TransactionClient) => {
      let merchant = await tx.merchant.findUniqueOrThrow({
        where: { id: merchantId },
      });

      const now = new Date();
      if (now > merchant.whatsappQuotaResetAt) {
        const nextResetDate = new Date(now);
        nextResetDate.setMonth(nextResetDate.getMonth() + 1);
        nextResetDate.setDate(1);
        nextResetDate.setHours(0, 0, 0, 0);

        merchant = await tx.merchant.update({
          where: { id: merchantId },
          data: { whatsappQuotaUsed: 0, whatsappQuotaResetAt: nextResetDate },
        });
      }

      return merchant;
    });
  }

  /**
   * Checks if a merchant can send a certain number of WhatsApp messages and updates their quota.
   * Resets the monthly quota if a new period has started.
   *
   * @param merchantId The ID of the merchant.
   * @param messagesToSend The number of messages the merchant intends to send.
   * @returns The updated merchant with the new quota usage.
   * @throws An error if the quota is exceeded.
   */
  async checkAndIncrementQuota(
    merchantId: string,
    messagesToSend: number,
  ): Promise<Merchant> {
    return this.txRunner.run(async (tx: Prisma.TransactionClient) => {
      let merchant = await tx.merchant.findUniqueOrThrow({
        where: { id: merchantId },
      });

      const now = new Date();
      // Reset quota if the reset date is in the past
      if (now > merchant.whatsappQuotaResetAt) {
        const nextResetDate = new Date(now);
        nextResetDate.setMonth(nextResetDate.getMonth() + 1);
        nextResetDate.setDate(1);
        nextResetDate.setHours(0, 0, 0, 0);

        merchant = await tx.merchant.update({
          where: { id: merchantId },
          data: {
            whatsappQuotaUsed: 0,
            whatsappQuotaResetAt: nextResetDate,
          },
        });
      }

      // Check if the new messages exceed the quota
      if (
        merchant.whatsappQuotaUsed + messagesToSend >
        merchant.whatsappQuotaMax
      ) {
        throw new ForbiddenException(
          `Quota WhatsApp dépassé. Utilisé: ${merchant.whatsappQuotaUsed}, Max: ${merchant.whatsappQuotaMax}`,
        );
      }

      // Increment the quota and return the updated merchant
      const updatedMerchant = await tx.merchant.update({
        where: { id: merchantId },
        data: {
          whatsappQuotaUsed: {
            increment: messagesToSend,
          },
        },
      });

      return updatedMerchant;
    });
  }
}
