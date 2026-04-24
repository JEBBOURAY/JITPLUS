import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  CAMPAIGN_SENT_TRACKER_REPOSITORY, type ICampaignSentTrackerRepository,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';
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
      title: '📈 Votre semaine en chiffres',
      body: (scans: number, newClients: number) =>
        `Cette semaine : ${scans} scan(s), ${newClients} nouveau(x) client(s). ${scans > 0 ? 'Bravo, continuez !' : 'Scannez vos clients pour les fidéliser !'}`,
    },
    en: {
      title: '📈 Your week in numbers',
      body: (scans: number, newClients: number) =>
        `This week: ${scans} scan(s), ${newClients} new client(s). ${scans > 0 ? 'Great job, keep going!' : 'Scan your clients to build loyalty!'}`,
    },
    ar: {
      title: '📈 الأسبوع ديالك بالأرقام',
      body: (scans: number, newClients: number) =>
        `هاد الأسبوع: ${scans} سكان، ${newClients} كليان جديد. ${scans > 0 ? 'برافو، كمل هكا!' : 'سكاني الكليان ديالك باش تفيداليزيهم!'}`,
    },
  },
  // Client milestone (every 10 clients)
  clientMilestone: {
    fr: {
      title: '🎯 Nouveau cap atteint !',
      body: (count: number) =>
        `Félicitations ! Vous avez atteint ${count} clients fidèles. Votre programme de fidélité fait effet ! 🚀`,
    },
    en: {
      title: '🎯 New milestone reached!',
      body: (count: number) =>
        `Congratulations! You've reached ${count} loyal clients. Your loyalty program is working! 🚀`,
    },
    ar: {
      title: '🎯 هدف جديد تحقق!',
      body: (count: number) =>
        `مبروك! وصلتي لـ ${count} كليان وفي. برنامج الولاء ديالك كيخدم! 🚀`,
    },
  },
  // Feature tips: send notifications to clients
  tipNotifications: {
    fr: {
      title: '💡 Astuce : Envoyez des notifications push',
      body: 'Saviez-vous que vous pouvez envoyer des notifications push à tous vos clients ? Promo, nouveauté, événement... Gardez le contact !',
    },
    en: {
      title: '💡 Tip: Send push notifications',
      body: 'Did you know you can send push notifications to all your clients? Promos, news, events... Stay connected!',
    },
    ar: {
      title: '💡 نصيحة: صيفط نوتيفيكاسيون',
      body: 'واش كنتي عارف أنك تقدر تصيفط نوتيفيكاسيون لكاع الكليان ديالك؟ بروموسيون، جديد، إيفينمون... خلي الكونطاكت!',
    },
  },
  // Feature tips: customize rewards
  tipRewards: {
    fr: {
      title: '💡 Astuce : Personnalisez vos récompenses',
      body: 'Ajoutez des récompenses attractives pour motiver vos clients. Café gratuit, remise 10%, cadeau surprise... À vous de jouer !',
    },
    en: {
      title: '💡 Tip: Customize your rewards',
      body: 'Add attractive rewards to motivate your clients. Free coffee, 10% off, surprise gift... It\'s up to you!',
    },
    ar: {
      title: '💡 نصيحة: خصص المكافآت ديالك',
      body: 'زيد مكافآت مغرية باش تحفز الكليان. قهوة مجانية، تخفيض 10%، كادو مفاجأة... أنت اللي تختار!',
    },
  },
  // Feature tips: email blasts (Premium)
  tipEmailBlast: {
    fr: {
      title: '💡 Premium : Campagnes email illimitées',
      body: 'Avec le plan Premium, envoyez des emails marketing à tous vos clients. Boostez vos ventes avec des campagnes personnalisées !',
    },
    en: {
      title: '💡 Premium: Unlimited email campaigns',
      body: 'With the Premium plan, send marketing emails to all your clients. Boost sales with personalized campaigns!',
    },
    ar: {
      title: '💡 بريميوم: حملات إيميل بلا ليميت',
      body: 'مع بلان بريميوم، صيفط إيميلات ماركتينغ لكاع الكليان. زيد المبيعات بحملات مخصصة!',
    },
  },
  // Upgrade nudge for FREE plan merchants
  upgradePush: {
    fr: {
      title: '⚡ Passez au Premium et débloquez tout !',
      body: 'Emails, WhatsApp, analyses détaillées, équipe multi-employés... Le Premium vous donne les outils pour grandir. Essayez 30 jours gratuits !',
    },
    en: {
      title: '⚡ Upgrade to Premium and unlock everything!',
      body: 'Emails, WhatsApp, detailed analytics, multi-staff team... Premium gives you the tools to grow. Try 30 days free!',
    },
    ar: {
      title: '⚡ ترقّى لـ Premium وحل كلشي!',
      body: 'إيميلات، واتساب، تحاليل مفصلة، فريق متعدد... بريميوم كيعطيك الأدوات باش تكبر. جرب 30 يوم مجانا!',
    },
  },
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
          type: 'EARN_POINTS',
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
          const result = await this.pushProvider.sendToMerchant(
            merchant.pushToken,
            msg.title,
            msg.body(weekScans, newClients),
            { action: 'open_dashboard' },
          );
          if (result.invalidToken) {
            staleTokenIds.push(merchant.id);
            continue;
          }
          digestCount++;
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
            await this.pushProvider.sendToMerchant(
              merchant.pushToken,
              milestoneMsg.title,
              milestoneMsg.body(milestone),
              { action: 'open_clients' },
            );
            milestoneCount++;
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

        const result = await this.pushProvider.sendToMerchant(
          merchant.pushToken,
          msg.title,
          msg.body,
          { action: 'open_settings' },
        );

        if (result.invalidToken) {
          staleTokenIds.push(merchant.id);
        } else {
          pushCount++;
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
