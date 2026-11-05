import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MERCHANT_REPOSITORY, type IMerchantRepository } from '../repositories';
import {
  MerchantNotifierService,
  NOTIFY_TARGET_SELECT,
  tally,
} from '../../merchant-inbox/merchant-notifier.service';
import { weekTag, weekIndexSinceReference, mapLimit, MERCHANT_PUSH_CONCURRENCY, cronEnabledOnce } from './cron-utils';
import { lang } from './merchant-notif-messages';

// ── Localized issue labels ──
const ISSUE_LABELS: Record<string, Record<string, string>> = {
  logo:        { fr: 'votre logo',      en: 'your logo',  ar: 'اللوغو ديالك' },
  rewards:     { fr: 'une récompense',  en: 'a reward',   ar: 'مكافأة' },
};
const LIST_JOINER: Record<string, string> = { fr: ' et ', en: ' and ', ar: ' و ' };

const SETUP_MESSAGES: Record<string, { title: string; body: (issues: string) => string }> = {
  fr: {
    title: 'Votre profil n\'est pas encore complet',
    body: (issues) => `Il manque encore ${issues}. Un profil complet inspire confiance à vos clients.`,
  },
  en: {
    title: 'Your profile is not complete yet',
    body: (issues) => `Still missing: ${issues}. A complete profile builds trust with your customers.`,
  },
  ar: {
    title: 'البروفيل ديالك مازال ما كملش',
    body: (issues) => `مازال خاصك ${issues}. البروفيل الكامل كيعطي الثقة للكليان ديالك.`,
  },
};

const REFERRAL_MESSAGES: Record<string, { title: string; body: string }> = {
  fr: {
    title: 'Gagnez 1 mois Premium offert',
    body: 'Invitez un commerçant avec votre code : dès qu\'il s\'abonne, vous recevez 1 mois Premium.',
  },
  en: {
    title: 'Earn a free month of Premium',
    body: 'Invite a business owner with your code: as soon as they subscribe, you get 1 month of Premium.',
  },
  ar: {
    title: 'ربح شهر Premium فابور',
    body: 'عرض على شي تاجر بالكود ديالك: ملي يشترك، كتربح شهر ديال Premium.',
  },
};

/** The referral nudge goes out at most once per block of this many weeks. */
const REFERRAL_EVERY_WEEKS = 4;

/**
 * Scheduled task (every 2 days, 09:01 UTC):
 * 1. **Setup reminder** (SETUP) — logo or reward missing; at most once a week.
 * 2. **Referral reminder** (OFFER) — setup complete; at most once every 4 weeks.
 *
 * Running every 2 days with a weekly dedup key means a reminder blocked by
 * the frequency cap or quiet hours is retried 2 days later.
 */
@Injectable()
export class MerchantReminderService {
  private readonly logger = new Logger(MerchantReminderService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    private readonly notifier: MerchantNotifierService,
  ) {}

  @Cron('1 9 */2 * *')
  async sendMerchantReminders(): Promise<void> {
    if (!(await cronEnabledOnce(this.logger, 'MerchantReminder.sendMerchantReminders'))) return;
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
          ...NOTIFY_TARGET_SELECT,
          language: true,
          logoUrl: true,
          _count: { select: { rewards: true } },
        },
      });

      const wtag = weekTag();
      const referralBlock = Math.floor(weekIndexSinceReference() / REFERRAL_EVERY_WEEKS);
      const results = await mapLimit(merchants, MERCHANT_PUSH_CONCURRENCY, (merchant) => {
        const l = lang(merchant.language);
        const issueKeys: string[] = [];
        if (!merchant.logoUrl) issueKeys.push('logo');
        if (merchant._count.rewards === 0) issueKeys.push('rewards');

        if (issueKeys.length > 0) {
          const issueLabels = issueKeys.map((k) => ISSUE_LABELS[k][l]).join(LIST_JOINER[l]);
          const msg = SETUP_MESSAGES[l];
          // Navigate to the page matching the first missing item
          const action = issueKeys[0] === 'logo' ? 'open_logo' : 'open_settings';
          return this.notifier.notify(merchant, {
            category: 'SETUP',
            title: msg.title,
            body: msg.body(issueLabels),
            action,
            event: 'merchant_setup_reminder',
            campaignId: `merchant_setup_reminder_${wtag}`,
          });
        }
        const msg = REFERRAL_MESSAGES[l];
        return this.notifier.notify(merchant, {
          category: 'OFFER',
          title: msg.title,
          body: msg.body,
          action: 'open_referral',
          event: 'merchant_referral_reminder',
          campaignId: `merchant_referral_reminder_b${referralBlock}`,
        });
      });

      this.logger.log(`Merchant reminders (${merchants.length} eligible): ${tally(results)}`);
    } catch (error) {
      this.logger.error('Failed to send merchant reminders', error);
    }
  }
}
