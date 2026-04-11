import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY,
  type IMerchantRepository,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';

/**
 * Scheduled task: send push notification reminders to merchants every 48 hours.
 *
 * Two reminder types:
 * 1. **Setup reminder** — merchant completed onboarding but is missing logo,
 *    loyalty config, or rewards.
 * 2. **Referral reminder** — nudge merchants to share their referral code.
 *
 * Runs every 48 hours (at 10:00 AM UTC on odd days of the month).
 * Only targets active merchants with a valid push token.
 */
@Injectable()
export class MerchantReminderService {
  private readonly logger = new Logger(MerchantReminderService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
  ) {}

  // Every 48 hours: send setup + referral push reminders.
  // Cron: at 10:00 AM every 2nd day.
  @Cron('0 10 */2 * *')
  async sendMerchantReminders(): Promise<void> {
    this.logger.log('Starting merchant push reminders (48h cycle)');

    try {
      const merchants = await this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          pushToken: { not: null },
          onboardingCompleted: true,
        },
        select: {
          id: true,
          pushToken: true,
          logoUrl: true,
          loyaltyType: true,
          _count: { select: { rewards: true } },
        },
      });

      let setupCount = 0;
      let referralCount = 0;

      for (const merchant of merchants) {
        if (!merchant.pushToken) continue;

        // ── Setup reminder ───────────────────────────────────
        const issues: string[] = [];
        if (!merchant.logoUrl) issues.push('logo');
        if (!merchant.loyaltyType) issues.push('fidélité');

        // Use _count from the single query instead of N individual count() calls
        if (merchant._count.rewards === 0) issues.push('récompenses');

        if (issues.length > 0) {
          await this.pushProvider.sendToMerchant(
            merchant.pushToken,
            '⚙️ Configuration incomplète',
            `Il manque : ${issues.join(', ')}. Complétez votre profil pour attirer plus de clients !`,
            { action: 'open_settings' },
          );
          setupCount++;
        } else {
          // Only send referral reminder if setup is complete
          // to avoid double notification spam.
          await this.pushProvider.sendToMerchant(
            merchant.pushToken,
            '🎁 Parrainez et gagnez 1 mois Premium',
            'Parrainez un commerce et recevez +1 mois Premium gratuit dès qu\'il s\'abonne. Partagez votre code !',
            { action: 'open_referral' },
          );
          referralCount++;
        }
      }

      this.logger.log(
        `Merchant reminders sent: ${setupCount} setup, ${referralCount} referral (${merchants.length} merchants)`,
      );
    } catch (error) {
      this.logger.error('Failed to send merchant reminders', error);
    }
  }
}
