import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY,
  CAMPAIGN_SENT_TRACKER_REPOSITORY,
  type IMerchantRepository,
  type ICampaignSentTrackerRepository,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER, IMailProvider, MAIL_PROVIDER } from '../interfaces';
import { pickEmailLang } from '../../mail/transactional-i18n';
import {
  isCronEnabled,
  dayTag,
  merchantAlreadySent,
  merchantMarkSent,
} from './cron-utils';

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

type Lang = 'fr' | 'en' | 'ar';

function lang(v?: string | null): Lang {
  return v === 'en' || v === 'ar' ? v : 'fr';
}

const MESSAGES = {
  trialEnding: {
    fr: {
      title: '⏳ Votre essai Premium se termine bientôt',
      body: (days: number) =>
        days <= 1
          ? `Votre essai Premium se termine demain. Souscrivez maintenant pour garder vos avantages !`
          : `Plus que ${days} jours d'essai Premium. Souscrivez avant la fin pour ne rien perdre.`,
    },
    en: {
      title: '⏳ Your Premium trial is ending',
      body: (days: number) =>
        days <= 1
          ? `Your Premium trial ends tomorrow. Subscribe now to keep your benefits!`
          : `Only ${days} days left in your Premium trial. Subscribe before it ends.`,
    },
    ar: {
      title: '⏳ التجربة Premium ديالك قاربت تسالي',
      body: (days: number) =>
        days <= 1
          ? `التجربة ديالك Premium كتسالي غدا. اشترك دابا باش متخسرش الميزات!`
          : `بقاو غير ${days} أيام فالتجربة Premium. اشترك قبل ما تسالي.`,
    },
  },
  premiumEnding: {
    fr: {
      title: '⚠️ Votre Premium expire bientôt',
      body: (days: number) =>
        days <= 1
          ? `Votre abonnement Premium expire demain. Renouvelez pour ne pas perdre l'accès Premium.`
          : `Votre Premium expire dans ${days} jours. Pensez à renouveler pour conserver vos avantages.`,
    },
    en: {
      title: '⚠️ Your Premium expires soon',
      body: (days: number) =>
        days <= 1
          ? `Your Premium subscription expires tomorrow. Renew to keep Premium access.`
          : `Your Premium expires in ${days} days. Renew now to keep your benefits.`,
    },
    ar: {
      title: '⚠️ Premium ديالك قاربت تسالي',
      body: (days: number) =>
        days <= 1
          ? `الاشتراك Premium ديالك كيسالي غدا. جدد باش متخسرش الميزات.`
          : `Premium ديالك كيسالي فـ${days} أيام. جدد دابا باش تحتفظ بالأفضليات.`,
    },
  },
  emailQuotaLow: {
    fr: {
      title: '📧 Quota email bientôt épuisé',
      body: (used: number, max: number) =>
        `Vous avez utilisé ${used}/${max} emails ce mois-ci. Il en reste peu — prévoyez vos prochaines campagnes.`,
    },
    en: {
      title: '📧 Email quota almost full',
      body: (used: number, max: number) =>
        `You've used ${used}/${max} emails this month. Few left — plan your next campaigns wisely.`,
    },
    ar: {
      title: '📧 الكوطا ديال الإيميل قاربت تسالي',
      body: (used: number, max: number) =>
        `استعملتي ${used}/${max} إيميلات هاد الشهر. بقا شوية — قيس الكامباني الجايين.`,
    },
  },
  whatsappQuotaLow: {
    fr: {
      title: '💬 Quota WhatsApp bientôt épuisé',
      body: (used: number, max: number) =>
        `Vous avez utilisé ${used}/${max} messages WhatsApp ce mois-ci. Plus que peu de messages disponibles.`,
    },
    en: {
      title: '💬 WhatsApp quota almost full',
      body: (used: number, max: number) =>
        `You've used ${used}/${max} WhatsApp messages this month. Few messages left.`,
    },
    ar: {
      title: '💬 الكوطا ديال WhatsApp قاربت تسالي',
      body: (used: number, max: number) =>
        `استعملتي ${used}/${max} ميساج WhatsApp هاد الشهر. بقاو شوية ديال الميساجات.`,
    },
  },
} as const;

const QUOTA_THRESHOLD = 0.8;
const ENDING_SOON_DAYS = 3;
const ENDING_TOMORROW_DAYS = 1;

@Injectable()
export class MerchantLifecycleService {
  private readonly logger = new Logger(MerchantLifecycleService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(CAMPAIGN_SENT_TRACKER_REPOSITORY) private readonly campaignTrackerRepo: ICampaignSentTrackerRepository,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: IMailProvider,
  ) {}

  /** 09:30 UTC daily = 10:30 Maroc (after the 09:00/09:01 reminder slots) */
  @Cron('30 9 * * *')
  async runDaily(): Promise<void> {
    if (!isCronEnabled(this.logger, 'MerchantLifecycle.runDaily')) return;
    this.logger.log('Starting merchant lifecycle pushes');

    try {
      const merchants = await this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          pushToken: { not: null },
          notifPush: true,
          onboardingCompleted: true,
        },
        select: {
          id: true,
          email: true,
          pushToken: true,
          language: true,
          plan: true,
          planExpiresAt: true,
          trialStartedAt: true,
          emailQuotaUsed: true,
          emailQuotaMax: true,
          whatsappQuotaUsed: true,
          whatsappQuotaMax: true,
        },
      });

      const now = Date.now();
      const tag = dayTag();
      const staleTokenIds: string[] = [];
      let trialAlerts = 0;
      let premiumAlerts = 0;
      let emailAlerts = 0;
      let waAlerts = 0;

      for (const m of merchants) {
        if (!m.pushToken) continue;
        const l = lang(m.language);

        // ── Plan / trial expiry ─────────────────────────────────────────
        if (m.plan === 'PREMIUM' && m.planExpiresAt) {
          const ms = m.planExpiresAt.getTime() - now;
          const days = Math.ceil(ms / 86_400_000);

          // Only fire on exact 3-day or 1-day windows to keep cadence sane
          if (days === ENDING_SOON_DAYS || days === ENDING_TOMORROW_DAYS) {
            const isTrial = !!m.trialStartedAt;
            const msgGroup = isTrial ? MESSAGES.trialEnding : MESSAGES.premiumEnding;
            const msg = msgGroup[l];
            const campaignId = `merchant_${isTrial ? 'trial' : 'premium'}_ending_${days}d_${tag}`;

            if (!(await merchantAlreadySent(this.campaignTrackerRepo, m.id, campaignId, 'PUSH'))) {
              const result = await this.pushProvider.sendToMerchant(
                m.pushToken,
                msg.title,
                msg.body(days),
                { event: 'plan_expiring', action: 'open_plan', daysLeft: String(days) },
              );
              if (result.invalidToken) {
                staleTokenIds.push(m.id);
                continue;
              }
              if (isTrial) trialAlerts++;
              else premiumAlerts++;
              await merchantMarkSent(this.campaignTrackerRepo, m.id, campaignId, 'PUSH');
              // Best-effort: also send an email reminder to the merchant
              if (m.email) {
                this.mailProvider
                  .sendPlanExpiring(m.email, days, isTrial ? 'trial' : 'premium', pickEmailLang(m.language))
                  .catch((err) => this.logger.warn(`Plan-expiring email failed for ${m.id}: ${err?.message || err}`));
              }
            }
          }
        }

        // ── Quota alerts (Premium-only features) ────────────────────────
        if (m.plan === 'PREMIUM') {
          // Email quota
          if (
            m.emailQuotaMax > 0 &&
            m.emailQuotaUsed / m.emailQuotaMax >= QUOTA_THRESHOLD &&
            m.emailQuotaUsed < m.emailQuotaMax
          ) {
            const campaignId = `merchant_email_quota_low_${tag}`;
            if (!(await merchantAlreadySent(this.campaignTrackerRepo, m.id, campaignId, 'PUSH'))) {
              const msg = MESSAGES.emailQuotaLow[l];
              const result = await this.pushProvider.sendToMerchant(
                m.pushToken,
                msg.title,
                msg.body(m.emailQuotaUsed, m.emailQuotaMax),
                { event: 'quota_low', action: 'open_plan', channel: 'email' },
              );
              if (result.invalidToken) {
                staleTokenIds.push(m.id);
                continue;
              }
              emailAlerts++;
              await merchantMarkSent(this.campaignTrackerRepo, m.id, campaignId, 'PUSH');
            }
          }

          // WhatsApp quota
          if (
            m.whatsappQuotaMax > 0 &&
            m.whatsappQuotaUsed / m.whatsappQuotaMax >= QUOTA_THRESHOLD &&
            m.whatsappQuotaUsed < m.whatsappQuotaMax
          ) {
            const campaignId = `merchant_wa_quota_low_${tag}`;
            if (!(await merchantAlreadySent(this.campaignTrackerRepo, m.id, campaignId, 'PUSH'))) {
              const msg = MESSAGES.whatsappQuotaLow[l];
              const result = await this.pushProvider.sendToMerchant(
                m.pushToken,
                msg.title,
                msg.body(m.whatsappQuotaUsed, m.whatsappQuotaMax),
                { event: 'quota_low', action: 'open_plan', channel: 'whatsapp' },
              );
              if (result.invalidToken) {
                staleTokenIds.push(m.id);
                continue;
              }
              waAlerts++;
              await merchantMarkSent(this.campaignTrackerRepo, m.id, campaignId, 'PUSH');
            }
          }
        }
      }

      if (staleTokenIds.length > 0) {
        await this.merchantRepo
          .updateMany({ where: { id: { in: staleTokenIds } }, data: { pushToken: null } })
          .catch((e: unknown) => this.logger.warn(`Failed to clean stale tokens: ${e}`));
      }

      this.logger.log(
        `Lifecycle pushes — trial:${trialAlerts}, premium:${premiumAlerts}, email:${emailAlerts}, wa:${waAlerts}`,
      );
    } catch (error) {
      this.logger.error('Merchant lifecycle cron failed', error);
    }
  }
}
