import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY,
  CAMPAIGN_SENT_TRACKER_REPOSITORY,
  type IMerchantRepository,
  type ICampaignSentTrackerRepository,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';
import {
  isCronEnabled,
  dayTag,
  merchantAlreadySent,
  merchantMarkSent,
} from './cron-utils';

// ── Localized issue labels ──
const ISSUE_LABELS: Record<string, Record<string, string>> = {
  logo:        { fr: 'logo',         en: 'logo',           ar: 'اللوغو' },
  loyalty:     { fr: 'fidélité',     en: 'loyalty config', ar: 'برنامج الولاء' },
  rewards:     { fr: 'récompenses',  en: 'rewards',        ar: 'المكافآت' },
};

const SETUP_MESSAGES: Record<string, { title: string; body: (issues: string) => string }> = {
  fr: {
    title: '⚙️ Configuration incomplète',
    body: (issues) => `Il manque : ${issues}. Complétez votre profil pour attirer plus de clients !`,
  },
  en: {
    title: '⚙️ Incomplete setup',
    body: (issues) => `Missing: ${issues}. Complete your profile to attract more clients!`,
  },
  ar: {
    title: '⚙️ الإعداد ما كملش',
    body: (issues) => `ناقص: ${issues}. كمل البروفيل ديالك باش تجلب كثر ديال الكليان!`,
  },
};

const REFERRAL_MESSAGES: Record<string, { title: string; body: string }> = {
  fr: {
    title: '🎁 Parrainez et gagnez 1 mois Premium',
    body: 'Parrainez un commerce et recevez +1 mois Premium gratuit dès qu\'il s\'abonne. Partagez votre code !',
  },
  en: {
    title: '🎁 Refer & earn 1 month Premium',
    body: 'Refer a business and get +1 free Premium month when they subscribe. Share your code!',
  },
  ar: {
    title: '🎁 باريني واربح 1 شهر بريميوم',
    body: 'باريني كومرس واربح +1 شهر بريميوم مجانا ملي يشترك. بارطاجي الكود ديالك!',
  },
};

type Lang = 'fr' | 'en' | 'ar';
function lang(v?: string | null): Lang {
  return v === 'en' || v === 'ar' ? v : 'fr';
}

/**
 * Scheduled task: send push notification reminders to merchants every 48 hours.
 *
 * Two reminder types:
 * 1. **Setup reminder** — merchant completed onboarding but is missing logo,
 *    loyalty config, or rewards.
 * 2. **Referral reminder** — nudge merchants to share their referral code.
 *
 * Runs every 48 hours at 10:01 UTC (staggered from the smart-campaign weekly
 * performance push at 10:05 to avoid Monday-morning DB contention).
 *
 * Targets active merchants with a valid push token **and** `notifPush = true`.
 * Dedup keyed on the UTC day tag so a crash/restart cannot cause duplicates.
 * Messages are sent in the merchant's configured language (fr/en/ar).
 */
@Injectable()
export class MerchantReminderService {
  private readonly logger = new Logger(MerchantReminderService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(CAMPAIGN_SENT_TRACKER_REPOSITORY) private readonly campaignTrackerRepo: ICampaignSentTrackerRepository,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
  ) {}

  // Every 48 hours: send setup + referral push reminders.
  // Cron: at 10:01 UTC every 2nd day (offset from smart-campaign at 10:05).
  // 09:01 UTC = 10:01 Maroc (matinée calme, tous les 2 jours).
  @Cron('1 9 */2 * *')
  async sendMerchantReminders(): Promise<void> {
    if (!isCronEnabled(this.logger, 'MerchantReminder.sendMerchantReminders')) return;
    this.logger.log('Starting merchant push reminders (48h cycle)');

    try {
      const merchants = await this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          pushToken: { not: null },
          onboardingCompleted: true,
          notifPush: true,
        },
        select: {
          id: true,
          pushToken: true,
          language: true,
          logoUrl: true,
          loyaltyType: true,
          _count: { select: { rewards: true } },
        },
      });

      const today = dayTag();
      let setupCount = 0;
      let referralCount = 0;
      let skippedDup = 0;
      const staleTokenIds: string[] = [];

      for (const merchant of merchants) {
        if (!merchant.pushToken) continue;

        const l = lang(merchant.language);
        let result: { invalidToken: boolean } = { invalidToken: false };

        // ── Setup reminder ───────────────────────────────────
        const issueKeys: string[] = [];
        if (!merchant.logoUrl) issueKeys.push('logo');
        if (!merchant.loyaltyType) issueKeys.push('loyalty');
        if (merchant._count.rewards === 0) issueKeys.push('rewards');

        const campaignId = issueKeys.length > 0
          ? `merchant_setup_reminder_${today}`
          : `merchant_referral_reminder_${today}`;

        if (await merchantAlreadySent(this.campaignTrackerRepo, merchant.id, campaignId, 'PUSH')) {
          skippedDup++;
          continue;
        }

        if (issueKeys.length > 0) {
          const issueLabels = issueKeys.map((k) => ISSUE_LABELS[k][l]).join(', ');
          const msg = SETUP_MESSAGES[l];

          // Navigate to the page matching the first missing item
          const actionMap: Record<string, string> = {
            logo: 'open_logo',
            loyalty: 'open_settings',
            rewards: 'open_settings',
          };
          const action = actionMap[issueKeys[0]] || 'open_settings';

          result = await this.pushProvider.sendToMerchant(
            merchant.pushToken,
            msg.title,
            msg.body(issueLabels),
            { action },
          );
          if (!result.invalidToken) {
            setupCount++;
            await merchantMarkSent(this.campaignTrackerRepo, merchant.id, campaignId, 'PUSH');
          }
        } else {
          // Only send referral reminder if setup is complete
          // to avoid double notification spam.
          const msg = REFERRAL_MESSAGES[l];
          result = await this.pushProvider.sendToMerchant(
            merchant.pushToken,
            msg.title,
            msg.body,
            { action: 'open_referral' },
          );
          if (!result.invalidToken) {
            referralCount++;
            await merchantMarkSent(this.campaignTrackerRepo, merchant.id, campaignId, 'PUSH');
          }
        }

        if (result.invalidToken) staleTokenIds.push(merchant.id);
      }

      // Clean stale push tokens
      if (staleTokenIds.length > 0) {
        this.logger.log(`Cleaning ${staleTokenIds.length} stale merchant push token(s)`);
        await this.merchantRepo.updateMany({
          where: { id: { in: staleTokenIds } },
          data: { pushToken: null },
        }).catch((e: unknown) => this.logger.warn(`Failed to clean stale tokens: ${e}`));
      }

      this.logger.log(
        `Merchant reminders: ${setupCount} setup, ${referralCount} referral, ${skippedDup} dup-skipped (${merchants.length} eligible)`,
      );
    } catch (error) {
      this.logger.error('Failed to send merchant reminders', error);
    }
  }
}
