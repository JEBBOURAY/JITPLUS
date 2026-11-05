import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MERCHANT_REPOSITORY, type IMerchantRepository } from '../repositories';
import { IMailProvider, MAIL_PROVIDER } from '../interfaces';
import { pickEmailLang } from '../../mail/transactional-i18n';
import {
  MerchantNotifierService,
  NOTIFY_TARGET_SELECT,
  tally,
  type NotifyResult,
} from '../../merchant-inbox/merchant-notifier.service';
import { dayTag, mapLimit, MERCHANT_PUSH_CONCURRENCY, cronEnabledOnce } from './cron-utils';
import { NOTIF_MESSAGES } from './merchant-notif-messages';
import { type AppLang, pickAppLang } from '../utils/app-lang';
import { MS_PER_DAY } from '../constants';

/**
 * Merchant lifecycle pushes — premium-aware automated alerts that close
 * common SaaS feedback loops:
 *
 *  1. Trial / Premium ending in **3 days**
 *  2. Trial / Premium ending **tomorrow**
 *  3. Email quota at **80%+** of monthly cap
 *  4. WhatsApp quota at **80%+** of monthly cap
 *
 * One daily cron @ 09:30 UTC = 10:30 Maroc.
 * Each merchant receives at most one alert of each type per UTC day
 * (`CampaignSentTracker` dedup, channel = 'PUSH').
 */

type Lang = AppLang;
const lang = pickAppLang;

const MESSAGES = {
  trialEnding: {
    fr: {
      title: (days: number) =>
        days <= 1 ? 'Votre essai Premium se termine demain' : `Plus que ${days} jours d'essai Premium`,
      body: (days: number) =>
        days <= 1
          ? 'Abonnez-vous pour garder vos fonctionnalités Premium sans interruption.'
          : 'Abonnez-vous avant la fin pour garder vos fonctionnalités Premium.',
    },
    en: {
      title: (days: number) =>
        days <= 1 ? 'Your Premium trial ends tomorrow' : `${days} days left in your Premium trial`,
      body: (days: number) =>
        days <= 1
          ? 'Subscribe to keep your Premium features without interruption.'
          : 'Subscribe before it ends to keep your Premium features.',
    },
    ar: {
      title: (days: number) =>
        days <= 1 ? 'التجربة ديال Premium كتسالي غدا' : `بقاو ${days} أيام فالتجربة ديال Premium`,
      body: (days: number) =>
        days <= 1
          ? 'اشترك باش تبقى عندك الميزات ديال Premium بلا ما يتقطعو.'
          : 'اشترك قبل ما تسالي باش تحتافظ بالميزات ديال Premium.',
    },
  },
  premiumEnding: {
    fr: {
      title: (days: number) =>
        days <= 1 ? 'Votre Premium expire demain' : `Votre Premium expire dans ${days} jours`,
      body: (days: number) =>
        days <= 1
          ? 'Renouvelez votre abonnement pour continuer sans interruption.'
          : 'Renouvelez dès maintenant pour garder toutes vos fonctionnalités.',
    },
    en: {
      title: (days: number) =>
        days <= 1 ? 'Your Premium expires tomorrow' : `Your Premium expires in ${days} days`,
      body: (days: number) =>
        days <= 1
          ? 'Renew your subscription to continue without interruption.'
          : 'Renew now to keep all your features.',
    },
    ar: {
      title: (days: number) =>
        days <= 1 ? 'Premium ديالك كيسالي غدا' : `Premium ديالك كيسالي فـ ${days} أيام`,
      body: (days: number) =>
        days <= 1
          ? 'جدّد الاشتراك ديالك باش تكمّل بلا ما يتقطع.'
          : 'جدّد دابا باش تحتافظ بكاع الميزات ديالك.',
    },
  },
  emailQuotaLow: {
    fr: {
      title: 'Quota email presque atteint',
      body: (used: number, max: number) =>
        `${used} emails envoyés sur ${max} ce mois-ci. Il vous en reste ${max - used}.`,
    },
    en: {
      title: 'Email quota almost reached',
      body: (used: number, max: number) =>
        `${used} of ${max} emails sent this month. ${max - used} left.`,
    },
    ar: {
      title: 'الكوطا ديال الإيميل قربات تكمل',
      body: (used: number, max: number) =>
        `صيفطتي ${used} من ${max} إيميل هاد الشهر. بقاو ليك ${max - used}.`,
    },
  },
  whatsappQuotaLow: {
    fr: {
      title: 'Quota WhatsApp presque atteint',
      body: (used: number, max: number) =>
        `${used} messages WhatsApp envoyés sur ${max} ce mois-ci. Il vous en reste ${max - used}.`,
    },
    en: {
      title: 'WhatsApp quota almost reached',
      body: (used: number, max: number) =>
        `${used} of ${max} WhatsApp messages sent this month. ${max - used} left.`,
    },
    ar: {
      title: 'الكوطا ديال WhatsApp قربات تكمل',
      body: (used: number, max: number) =>
        `صيفطتي ${used} من ${max} ميساج WhatsApp هاد الشهر. بقاو ليك ${max - used}.`,
    },
  },
} as const;

const QUOTA_THRESHOLD = 0.8;
const ENDING_SOON_DAYS = 3;
const ENDING_TOMORROW_DAYS = 1;

/** Days after the end of Premium at which the win-back offer goes out. */
const WINBACK_AFTER_DAYS = 7;

@Injectable()
export class MerchantLifecycleService {
  private readonly logger = new Logger(MerchantLifecycleService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: IMailProvider,
    private readonly notifier: MerchantNotifierService,
  ) {}

  /** 09:30 UTC daily = 10:30 Maroc (after the 09:00/09:01 reminder slots) */
  @Cron('30 9 * * *')
  async runDaily(): Promise<void> {
    if (!(await cronEnabledOnce(this.logger, 'MerchantLifecycle.runDaily'))) return;
    this.logger.log('Starting merchant lifecycle pushes');

    try {
      // No push-token filter: plan and quota alerts also land in the in-app inbox.
      const merchants = await this.merchantRepo.findMany({
        where: { isActive: true, deletedAt: null, onboardingCompleted: true },
        select: {
          ...NOTIFY_TARGET_SELECT,
          email: true,
          language: true,
          plan: true,
          planExpiresAt: true,
          trialStartedAt: true,
          emailQuotaUsed: true,
          emailQuotaMax: true,
          emailQuotaResetAt: true,
          whatsappQuotaUsed: true,
          whatsappQuotaMax: true,
          whatsappQuotaResetAt: true,
        },
      });

      const now = Date.now();
      // Merchants in parallel; the alerts of one merchant stay sequential (frequency cap).
      const perMerchant = await mapLimit(merchants, MERCHANT_PUSH_CONCURRENCY, async (m) => {
        const results: NotifyResult[] = [];
        const l = lang(m.language);

        // ── Plan / trial expiry ─────────────────────────────────────────
        if (m.planExpiresAt) {
          const expiresAt = m.planExpiresAt.getTime();
          const expiryTag = dayTag(m.planExpiresAt);
          const days = Math.ceil((expiresAt - now) / MS_PER_DAY);

          if (m.plan === 'PREMIUM' && (days === ENDING_SOON_DAYS || days === ENDING_TOMORROW_DAYS)) {
            // Only fire on exact 3-day or 1-day windows to keep cadence sane
            const isTrial = !!m.trialStartedAt;
            const msg = (isTrial ? MESSAGES.trialEnding : MESSAGES.premiumEnding)[l];
            const r = await this.notifier.notify(m, {
              category: 'PLAN',
              title: msg.title(days),
              body: msg.body(days),
              action: 'open_plan',
              event: 'plan_expiring',
              data: { daysLeft: String(days) },
              campaignId: `merchant_${isTrial ? 'trial' : 'premium'}_ending_${days}d_${expiryTag}`,
            });
            results.push(r);
            // Best-effort: also send an email reminder to the merchant
            if (r !== 'duplicate' && m.email) {
              this.mailProvider
                .sendPlanExpiring(m.email, days, isTrial ? 'trial' : 'premium', pickEmailLang(m.language))
                .catch((err) => this.logger.warn(`Plan-expiring email failed for ${m.id}: ${err?.message || err}`));
            }
          } else if (expiresAt <= now && expiresAt > now - MS_PER_DAY) {
            // Premium ended in the last 24 h (the plan itself is downgraded lazily).
            const msg = NOTIF_MESSAGES.planExpired[l];
            results.push(await this.notifier.notify(m, {
              category: 'PLAN',
              title: msg.title,
              body: msg.body,
              action: 'open_plan',
              event: 'plan_expired',
              campaignId: `merchant_plan_expired_${expiryTag}`,
            }));
          } else if (
            expiresAt <= now - WINBACK_AFTER_DAYS * MS_PER_DAY &&
            expiresAt > now - (WINBACK_AFTER_DAYS + 1) * MS_PER_DAY
          ) {
            const msg = NOTIF_MESSAGES.winback[l];
            results.push(await this.notifier.notify(m, {
              category: 'OFFER',
              title: msg.title,
              body: msg.body,
              action: 'open_plan',
              event: 'plan_winback',
              campaignId: `merchant_plan_winback_${expiryTag}`,
            }));
          }
        }

        // ── Quota alerts (Premium-only features), once per quota period ──
        if (m.plan === 'PREMIUM') {
          results.push(...await this.quotaAlerts(m, l, 'email'));
          results.push(...await this.quotaAlerts(m, l, 'whatsapp'));
        }
        return results;
      });

      this.logger.log(`Lifecycle pushes (${merchants.length} merchants): ${tally(perMerchant.flat())}`);
    } catch (error) {
      this.logger.error('Merchant lifecycle cron failed', error);
    }
  }

  private async quotaAlerts(
    m: {
      id: string; pushToken: string | null; notifPush: boolean; notifPrefs: unknown;
      emailQuotaUsed: number; emailQuotaMax: number; emailQuotaResetAt: Date;
      whatsappQuotaUsed: number; whatsappQuotaMax: number; whatsappQuotaResetAt: Date;
    },
    l: Lang,
    channel: 'email' | 'whatsapp',
  ): Promise<NotifyResult[]> {
    const used = channel === 'email' ? m.emailQuotaUsed : m.whatsappQuotaUsed;
    const max = channel === 'email' ? m.emailQuotaMax : m.whatsappQuotaMax;
    const period = dayTag(channel === 'email' ? m.emailQuotaResetAt : m.whatsappQuotaResetAt);
    const prefix = channel === 'email' ? 'merchant_email_quota' : 'merchant_wa_quota';
    if (max <= 0 || used / max < QUOTA_THRESHOLD) return [];

    if (used >= max) {
      const msg = NOTIF_MESSAGES[channel === 'email' ? 'emailQuotaFull' : 'whatsappQuotaFull'][l];
      return [await this.notifier.notify(m, {
        category: 'QUOTA',
        title: msg.title,
        body: msg.body,
        action: 'open_plan',
        event: 'quota_full',
        data: { channel },
        campaignId: `${prefix}_full_${period}`,
      })];
    }
    const msg = MESSAGES[channel === 'email' ? 'emailQuotaLow' : 'whatsappQuotaLow'][l];
    return [await this.notifier.notify(m, {
      category: 'QUOTA',
      title: msg.title,
      body: msg.body(used, max),
      action: 'open_plan',
      event: 'quota_low',
      data: { channel },
      campaignId: `${prefix}_low_${period}`,
    })];
  }
}
