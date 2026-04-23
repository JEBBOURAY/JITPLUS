import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Scheduled task: permanently purge soft-deleted accounts (clients + merchants)
 * after 30 days.
 *
 * Apple App Store (guideline 5.1.1) and Moroccan Law 09-08 require permanent
 * data deletion on user request. The CGU promises deletion within 30 days.
 *
 * Runs daily at 03:00 UTC to minimise database load.
 */
@Injectable()
export class AccountPurgeService {
  private readonly logger = new Logger(AccountPurgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeDeletedAccounts(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await this.purgeClients(cutoff);
    await this.purgeMerchants(cutoff);
  }

  private async purgeClients(cutoff: Date): Promise<void> {
    try {
      const clients = await this.prisma.client.findMany({
        where: { deletedAt: { lte: cutoff } },
        select: { id: true },
      });

      if (clients.length === 0) return;

      const ids = clients.map((c: any) => c.id);

      for (const clientId of ids) {
        try {
          await this.prisma.$transaction(async (tx) => {
            // Delete Lucky-wheel tickets (onDelete: Cascade, but explicit for safety)
            await tx.luckyWheelTicket.deleteMany({ where: { clientId } });
            // Delete transactions (onDelete: Restrict — must delete explicitly)
            await tx.transaction.deleteMany({ where: { clientId } });
            // Delete loyalty cards (onDelete: Restrict — must delete explicitly)
            await tx.loyaltyCard.deleteMany({ where: { clientId } });
            // Delete remaining cascade-able records
            await tx.clientNotificationStatus.deleteMany({ where: { clientId } });
            await tx.profileView.deleteMany({ where: { clientId } });
            await tx.clientReferral.deleteMany({ where: { clientId } });
            await tx.payoutRequest.deleteMany({ where: { clientId } });
            // Finally, hard-delete the client record
            await tx.client.delete({ where: { id: clientId } });
          });
        } catch (error) {
          this.logger.error(`Failed to purge client ${clientId}`, error);
        }
      }

      this.logger.log(`Purged ${ids.length} client account(s) deleted before ${cutoff.toISOString()}`);
    } catch (error) {
      this.logger.error('Client purge job failed', error);
    }
  }

  private async purgeMerchants(cutoff: Date): Promise<void> {
    try {
      const merchants = await this.prisma.merchant.findMany({
        where: { deletedAt: { lte: cutoff } },
        select: { id: true },
      });

      if (merchants.length === 0) return;

      const ids = merchants.map((m: any) => m.id);

      for (const merchantId of ids) {
        try {
          await this.prisma.$transaction(async (tx) => {
            // Delete LuckyWheel-related data
            await tx.luckyWheelTicket.deleteMany({
              where: { campaign: { merchantId } },
            });
            await tx.luckyWheelPrize.deleteMany({
              where: { campaign: { merchantId } },
            });
            await tx.luckyWheelCampaign.deleteMany({ where: { merchantId } });
            // Delete transactions (onDelete: Restrict)
            await tx.transaction.deleteMany({ where: { merchantId } });
            // Delete loyalty cards (onDelete: Restrict)
            await tx.loyaltyCard.deleteMany({ where: { merchantId } });
            // Delete rewards
            await tx.reward.deleteMany({ where: { merchantId } });
            // Delete stores
            await tx.store.deleteMany({ where: { merchantId } });
            // Delete team members
            await tx.teamMember.deleteMany({ where: { merchantId } });
            // Delete device sessions
            await tx.deviceSession.deleteMany({ where: { merchantId } });
            // Delete notifications
            await tx.merchantNotificationRead.deleteMany({ where: { merchantId } });
            await tx.notification.deleteMany({ where: { merchantId } });
            // Delete profile views
            await tx.profileView.deleteMany({ where: { merchantId } });
            // Delete referrals
            await tx.clientReferral.deleteMany({ where: { merchantId } });
            // Finally, hard-delete the merchant record
            await tx.merchant.delete({ where: { id: merchantId } });
          });
        } catch (error) {
          this.logger.error(`Failed to purge merchant ${merchantId}`, error);
        }
      }

      this.logger.log(`Purged ${ids.length} merchant account(s) deleted before ${cutoff.toISOString()}`);
    } catch (error) {
      this.logger.error('Merchant purge job failed', error);
    }
  }
}
