import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  CAMPAIGN_SENT_TRACKER_REPOSITORY, type ICampaignSentTrackerRepository,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';
import { MerchantInboxService } from '../../merchant-inbox/merchant-inbox.service';
import {
  isCronEnabled,
  weekTag,
  weekIndexSinceReference,
  merchantAlreadySent,
  merchantMarkSent,
} from './cron-utils';

// ── Merchant performance digest messages ────────────────────────────────
const MESSAGES = {
  // Weekly performance summary
  weeklyPerf: {
    fr: {
      title: 'Votre semaine en chiffres',
      body: (scans: number, newClients: number) => {
        if (scans === 0) return 'Aucun scan cette semaine. Scannez chaque passage pour faire revenir vos clients.';
        const s = `${scans} scan${scans > 1 ? 's' : ''}`;
        const c = newClients === 0
          ? 'aucun nouveau client'
          : `${newClients} nouveau${newClients > 1 ? 'x' : ''} client${newClients > 1 ? 's' : ''}`;
        return `Cette semaine : ${s} et ${c}. Continuez sur cette lancée.`;
      },
    },
    en: {
      title: 'Your week in numbers',
      body: (scans: number, newClients: number) => {
        if (scans === 0) return 'No scans this week. Scan every visit to bring your customers back.';
        const c = newClients === 0 ? 'no new customers' : `${newClients} new customer${newClients === 1 ? '' : 's'}`;
        return `This week: ${scans} scan${scans === 1 ? '' : 's'} and ${c}. Keep it up.`;
      },
    },
    ar: {
      title: 'الأسبوع ديالك بالأرقام',
      body: (scans: number, newClients: number) => {
        if (scans === 0) return 'حتى سكان هاد الأسبوع. سكاني كل زيارة باش يرجعو الكليان ديالك.';
        return `هاد الأسبوع: ${scans} سكان و ${newClients} كليان جديد. كمّل هكا.`;
      },
    },
  },
  // Client milestone (10, 25, 50… clients)
  clientMilestone: {
    fr: {
      title: (count: number) => `Nouveau palier : ${count} clients`,
      body: (count: number) =>
        `Vous avez maintenant ${count} clients dans votre programme de fidélité. Bravo !`,
    },
    en: {
      title: (count: number) => `New milestone: ${count} customers`,
      body: (count: number) =>
        `You now have ${count} customers in your loyalty program. Well done!`,
    },
    ar: {
      title: (count: number) => `مرحلة جديدة: ${count} كليان`,
      body: (count: number) =>
        `دابا عندك ${count} كليان فبرنامج الولاء ديالك. برافو!`,
    },
  },
  // Feature tips: send notifications to clients
  tipNotifications: {
    fr: {
      title: 'Conseil : restez en contact avec vos clients',
      body: 'Envoyez une notification à tous vos clients en un geste : promo, nouveauté ou événement.',
    },
    en: {
      title: 'Tip: stay in touch with your customers',
      body: 'Send a notification to all your customers in one tap: a promo, something new or an event.',
    },
    ar: {
      title: 'نصيحة: بقى على تواصل مع الكليان ديالك',
      body: 'صيفط نوتيفيكاسيون لكاع الكليان ديالك بضغطة وحدة: بروموسيون، جديد ولا مناسبة.',
    },
  },
  // Feature tips: customize rewards
  tipRewards: {
    fr: {
      title: 'Conseil : une récompense qui donne envie',
      body: 'Un café offert ou -10 % : une récompense simple et concrète motive vos clients à revenir.',
    },
    en: {
      title: 'Tip: a reward worth coming back for',
      body: 'A free coffee or 10% off: a simple, concrete reward motivates customers to return.',
    },
    ar: {
      title: 'نصيحة: مكافأة كتشوّق',
      body: 'قهوة فابور ولا -10%: مكافأة بسيطة وواضحة كتحفّز الكليان يرجعو.',
    },
  },
  // Feature tips: email blasts (Premium)
  tipEmailBlast: {
    fr: {
      title: 'Conseil : lancez une campagne email',
      body: 'Avec Premium, envoyez un email à tous vos clients pour annoncer une offre ou une nouveauté.',
    },
    en: {
      title: 'Tip: launch an email campaign',
      body: 'With Premium, email all your customers to announce an offer or something new.',
    },
    ar: {
      title: 'نصيحة: طلق حملة إيميل',
      body: 'مع Premium، صيفط إيميل لكاع الكليان ديالك باش تعلن على عرض ولا جديد.',
    },
  },
  // Upgrade nudge for FREE plan merchants
  upgradePush: {
    fr: {
      title: 'Passez à Premium',
      body: 'Emails, WhatsApp, statistiques détaillées et équipe : tous les outils pour faire grandir votre commerce.',
    },
    en: {
      title: 'Upgrade to Premium',
      body: 'Emails, WhatsApp, detailed stats and team access: every tool to grow your business.',
    },
    ar: {
      title: 'دوز لـ Premium',
      body: 'إيميلات، واتساب، إحصائيات مفصّلة والفريق: كاع الأدوات باش يكبر الكومرس ديالك.',
    },
  },
} as const;

// Each tip opens the screen where the merchant can act on it.
const TIP_ACTIONS = {
  tipNotifications: 'open_messages',
  tipRewards: 'open_settings',
  tipEmailBlast: 'open_messages',
} as const;

type Lang = 'fr' | 'en' | 'ar';

function lang(v?: string | null): Lang {
  return v === 'en' || v === 'ar' ? v : 'fr';
}

/**
 * Merchant smart campaigns: automated push notifications to help merchants
 * grow their business on JIT+ Pro.
 *
 * Planning (UTC — Maroc = UTC+1, toute l'année) :
 * - **Lundi 09:00 UTC / 10:00 Maroc** : Digest hebdomadaire de performance
 * - **Jeudi 14:00 UTC / 15:00 Maroc** : Astuces fonctionnalités (tournantes)
 * - **Samedi 09:00 UTC / 10:00 Maroc** : Relance upgrade (plan FREE uniquement)
 *
 * Les paliers clients sont vérifiés pendant le digest hebdomadaire.
 * Vendredi volontairement exclu (prière du Jumu'ah ~12h-14h au Maroc).
 */
@Injectable()
export class MerchantSmartCampaignService {
  private readonly logger = new Logger(MerchantSmartCampaignService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private readonly loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(CAMPAIGN_SENT_TRACKER_REPOSITORY) private readonly campaignTrackerRepo: ICampaignSentTrackerRepository,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
    private readonly inbox: MerchantInboxService,
  ) {}

  // ── Monday: Weekly performance summary ──────────────────────────────────
  // 09:00 UTC = 10:00 Maroc (heure ouvrable, après ouverture des commerces).
  @Cron('0 9 * * 1')
  async sendWeeklyPerformance(): Promise<void> {
    if (!isCronEnabled(this.logger, 'MerchantSmartCampaign.sendWeeklyPerformance')) return;
    this.logger.log('Starting merchant weekly performance digest');

    try {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000);
      const wtag = weekTag();
      let digestCount = 0;
      let milestoneCount = 0;
      let skippedDup = 0;
      const staleTokenIds: string[] = [];

      const merchants = await this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          pushToken: { not: null },
          onboardingCompleted: true,
          notifPush: true,
        },
        select: { id: true, pushToken: true, language: true },
      });

      if (merchants.length === 0) {
        this.logger.log('No eligible merchants for weekly perf digest');
        return;
      }

      const merchantIds = merchants.map((m) => m.id);

      // N+1 killers: 3 aggregated queries instead of N*3 per-merchant counts.
      const scansAgg = await this.txRepo.groupBy({
        by: ['merchantId'],
        where: {
          merchantId: { in: merchantIds },
          type: 'EARN_STAMPS',
          status: 'ACTIVE',
          createdAt: { gte: weekAgo },
        },
        _count: { _all: true },
      });
      const scansMap = new Map<string, number>(
        scansAgg.map((r: { merchantId: string; _count: { _all: number } }) => [r.merchantId, r._count._all]),
      );

      const newCardsAgg = await this.loyaltyCardRepo.groupBy({
        by: ['merchantId'],
        where: {
          merchantId: { in: merchantIds },
          deactivatedAt: null,
          createdAt: { gte: weekAgo },
        },
        _count: { _all: true },
      });
      const newClientsMap = new Map<string, number>(
        newCardsAgg.map((r: { merchantId: string; _count: { _all: number } }) => [r.merchantId, r._count._all]),
      );

      const totalCardsAgg = await this.loyaltyCardRepo.groupBy({
        by: ['merchantId'],
        where: { merchantId: { in: merchantIds }, deactivatedAt: null },
        _count: { _all: true },
      });
      const totalsMap = new Map<string, number>(
        totalCardsAgg.map((r: { merchantId: string; _count: { _all: number } }) => [r.merchantId, r._count._all]),
      );

      const MILESTONES = [10, 25, 50, 100, 200, 500, 1000];

      for (const merchant of merchants) {
        if (!merchant.pushToken) continue;
        const l = lang(merchant.language);

        const weekScans = scansMap.get(merchant.id) ?? 0;
        const newClients = newClientsMap.get(merchant.id) ?? 0;
        const totalClients = totalsMap.get(merchant.id) ?? 0;

        // Weekly digest (dédup par semaine ISO)
        const digestCampaignId = `merchant_weekly_perf_${wtag}`;
        if (await merchantAlreadySent(this.campaignTrackerRepo, merchant.id, digestCampaignId, 'PUSH')) {
          skippedDup++;
        } else {
          const msg = MESSAGES.weeklyPerf[l];
          const body = msg.body(weekScans, newClients);
          const result = await this.pushProvider.sendToMerchant(
            merchant.pushToken,
            msg.title,
            body,
            { action: 'open_dashboard' },
          );
          if (result.invalidToken) {
            staleTokenIds.push(merchant.id);
            continue;
          }
          digestCount++;
          await this.inbox.record(merchant.id, { category: 'ACTIVITY', title: msg.title, body, action: 'open_dashboard' });
          await merchantMarkSent(this.campaignTrackerRepo, merchant.id, digestCampaignId, 'PUSH');
        }

        // Détection de franchissement de palier (cette semaine uniquement).
        const previousTotal = totalClients - newClients;
        const crossed = MILESTONES.filter((m) => previousTotal < m && totalClients >= m);
        const milestone = crossed.length > 0 ? crossed[crossed.length - 1] : null;
        if (milestone) {
          const mCampaignId = `merchant_milestone_${milestone}_${wtag}`;
          if (!(await merchantAlreadySent(this.campaignTrackerRepo, merchant.id, mCampaignId, 'PUSH'))) {
            const milestoneMsg = MESSAGES.clientMilestone[l];
            const mTitle = milestoneMsg.title(milestone);
            const mBody = milestoneMsg.body(milestone);
            await this.pushProvider.sendToMerchant(
              merchant.pushToken,
              mTitle,
              mBody,
              { action: 'open_clients' },
            );
            milestoneCount++;
            await this.inbox.record(merchant.id, { category: 'ACTIVITY', title: mTitle, body: mBody, action: 'open_clients' });
            await merchantMarkSent(this.campaignTrackerRepo, merchant.id, mCampaignId, 'PUSH');
          }
        }
      }

      // Clean stale tokens
      if (staleTokenIds.length > 0) {
        await this.merchantRepo.updateMany({
          where: { id: { in: staleTokenIds } },
          data: { pushToken: null },
        }).catch((e: unknown) => this.logger.warn(`Failed to clean stale tokens: ${e}`));
      }

      this.logger.log(
        `Weekly perf: ${digestCount} digests, ${milestoneCount} milestones, ${skippedDup} dup-skipped`,
      );
    } catch (error) {
      this.logger.error('Failed to send weekly performance', error);
    }
  }

  // ── Thursday: Feature tips & tricks (rotating) ──────────────────────────
  // 14:00 UTC = 15:00 Maroc (début d'après-midi, avant rush de fin de journée).
  @Cron('0 14 * * 4')
  async sendFeatureTips(): Promise<void> {
    if (!isCronEnabled(this.logger, 'MerchantSmartCampaign.sendFeatureTips')) return;
    this.logger.log('Starting merchant feature tips push');

    try {
      // Rotate tips on a deterministic reference-anchored week index.
      const wIdx = weekIndexSinceReference();
      const wtag = weekTag();
      const tips = ['tipNotifications', 'tipRewards', 'tipEmailBlast'] as const;
      const tipKey = tips[wIdx % tips.length];

      let pushCount = 0;
      let skippedDup = 0;
      const staleTokenIds: string[] = [];

      const merchants = await this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          pushToken: { not: null },
          onboardingCompleted: true,
          notifPush: true,
        },
        select: { id: true, pushToken: true, language: true, plan: true },
      });

      for (const merchant of merchants) {
        if (!merchant.pushToken) continue;

        // Skip Premium-only tips for free merchants
        if (tipKey === 'tipEmailBlast' && merchant.plan === 'FREE') continue;

        const campaignId = `merchant_tip_${tipKey}_${wtag}`;
        if (await merchantAlreadySent(this.campaignTrackerRepo, merchant.id, campaignId, 'PUSH')) {
          skippedDup++;
          continue;
        }

        const l = lang(merchant.language);
        const msg = MESSAGES[tipKey][l];

        const action = TIP_ACTIONS[tipKey];
        const result = await this.pushProvider.sendToMerchant(
          merchant.pushToken,
          msg.title,
          msg.body,
          { action },
        );

        if (result.invalidToken) {
          staleTokenIds.push(merchant.id);
        } else {
          pushCount++;
          await this.inbox.record(merchant.id, { category: 'TIP', title: msg.title, body: msg.body, action });
          await merchantMarkSent(this.campaignTrackerRepo, merchant.id, campaignId, 'PUSH');
        }
      }

      if (staleTokenIds.length > 0) {
        await this.merchantRepo.updateMany({
          where: { id: { in: staleTokenIds } },
          data: { pushToken: null },
        }).catch((e: unknown) => this.logger.warn(`Failed to clean stale tokens: ${e}`));
      }

      this.logger.log(`Feature tip (${tipKey}) sent to ${pushCount} merchants, ${skippedDup} dup-skipped`);
    } catch (error) {
      this.logger.error('Failed to send feature tips', error);
    }
  }

  // ── Saturday: Upgrade nudge for free plan merchants ─────────────────────
  // 09:00 UTC = 10:00 Maroc (samedi est un jour ouvrable pour la plupart des commerçants).
  @Cron('0 9 * * 6')
  async sendUpgradeNudge(): Promise<void> {
    if (!isCronEnabled(this.logger, 'MerchantSmartCampaign.sendUpgradeNudge')) return;
    this.logger.log('Starting merchant upgrade nudge');

    try {
      let pushCount = 0;
      let skippedDup = 0;
      const staleTokenIds: string[] = [];
      const wtag = weekTag();

      // Only target FREE plan merchants who have been active for at least 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

      const merchants = await this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          pushToken: { not: null },
          onboardingCompleted: true,
          notifPush: true,
          plan: 'FREE',
          createdAt: { lte: sevenDaysAgo },
        },
        select: { id: true, pushToken: true, language: true },
      });

      for (const merchant of merchants) {
        if (!merchant.pushToken) continue;

        const campaignId = `merchant_upgrade_nudge_${wtag}`;
        if (await merchantAlreadySent(this.campaignTrackerRepo, merchant.id, campaignId, 'PUSH')) {
          skippedDup++;
          continue;
        }

        const l = lang(merchant.language);
        const msg = MESSAGES.upgradePush[l];

        const result = await this.pushProvider.sendToMerchant(
          merchant.pushToken,
          msg.title,
          msg.body,
          { action: 'open_plan' },
        );

        if (result.invalidToken) {
          staleTokenIds.push(merchant.id);
        } else {
          pushCount++;
          await this.inbox.record(merchant.id, { category: 'OFFER', title: msg.title, body: msg.body, action: 'open_plan' });
          await merchantMarkSent(this.campaignTrackerRepo, merchant.id, campaignId, 'PUSH');
        }
      }

      if (staleTokenIds.length > 0) {
        await this.merchantRepo.updateMany({
          where: { id: { in: staleTokenIds } },
          data: { pushToken: null },
        }).catch((e: unknown) => this.logger.warn(`Failed to clean stale tokens: ${e}`));
      }

      this.logger.log(`Upgrade nudge sent to ${pushCount} free merchants, ${skippedDup} dup-skipped`);
    } catch (error) {
      this.logger.error('Failed to send upgrade nudge', error);
    }
  }
}
