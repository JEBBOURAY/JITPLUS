import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';

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
 * - **Monday 10:00**: Weekly performance digest
 * - **Thursday 15:00**: Feature tips & tricks (rotating)
 * - **Saturday 10:00**: Upgrade nudge for free plan merchants
 *
 * Client milestones are checked during the weekly digest.
 */
@Injectable()
export class MerchantSmartCampaignService {
  private readonly logger = new Logger(MerchantSmartCampaignService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private readonly loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
  ) {}

  // ── Monday: Weekly performance summary ──────────────────────────────────
  @Cron('0 10 * * 1') // Monday at 10:00 UTC
  async sendWeeklyPerformance(): Promise<void> {
    this.logger.log('Starting merchant weekly performance digest');

    try {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000);
      let digestCount = 0;
      let milestoneCount = 0;
      const staleTokenIds: string[] = [];

      const merchants = await this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          pushToken: { not: null },
          onboardingCompleted: true,
        },
        select: { id: true, pushToken: true, language: true },
      });

      for (const merchant of merchants) {
        if (!merchant.pushToken) continue;
        const l = lang(merchant.language);

        // Count scans this week
        const weekScans = await this.txRepo.count({
          where: {
            merchantId: merchant.id,
            type: 'EARN_POINTS',
            status: 'ACTIVE',
            createdAt: { gte: weekAgo },
          },
        });

        // Count new loyalty cards this week (new clients)
        const newClients = await this.loyaltyCardRepo.count({
          where: {
            merchantId: merchant.id,
            deactivatedAt: null,
            createdAt: { gte: weekAgo },
          },
        });

        // Send weekly performance digest
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

        // Check for client milestones (every 10, 25, 50, 100...)
        const totalClients = await this.loyaltyCardRepo.count({
          where: { merchantId: merchant.id, deactivatedAt: null },
        });

        const milestones = [10, 25, 50, 100, 200, 500, 1000];
        for (const milestone of milestones) {
          // Check if they just crossed this milestone this week
          if (totalClients >= milestone && totalClients - newClients < milestone) {
            const milestoneMsg = MESSAGES.clientMilestone[l];
            await this.pushProvider.sendToMerchant(
              merchant.pushToken,
              milestoneMsg.title,
              milestoneMsg.body(milestone),
              { action: 'open_clients' },
            );
            milestoneCount++;
            break; // Only one milestone per week
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
        `Weekly perf digest: ${digestCount} merchants, ${milestoneCount} milestones`,
      );
    } catch (error) {
      this.logger.error('Failed to send weekly performance', error);
    }
  }

  // ── Thursday: Feature tips & tricks (rotating) ──────────────────────────
  @Cron('0 15 * * 4') // Thursday at 15:00 UTC
  async sendFeatureTips(): Promise<void> {
    this.logger.log('Starting merchant feature tips push');

    try {
      // Rotate tips based on week number
      const weekNumber = Math.floor(Date.now() / (7 * 86_400_000));
      const tips = ['tipNotifications', 'tipRewards', 'tipEmailBlast'] as const;
      const tipKey = tips[weekNumber % tips.length];

      let pushCount = 0;
      const staleTokenIds: string[] = [];

      const merchants = await this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          pushToken: { not: null },
          onboardingCompleted: true,
        },
        select: { id: true, pushToken: true, language: true, plan: true },
      });

      for (const merchant of merchants) {
        if (!merchant.pushToken) continue;

        // Skip Premium-only tips for free merchants
        if (tipKey === 'tipEmailBlast' && merchant.plan === 'FREE') continue;

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
        }
      }

      if (staleTokenIds.length > 0) {
        await this.merchantRepo.updateMany({
          where: { id: { in: staleTokenIds } },
          data: { pushToken: null },
        }).catch((e: unknown) => this.logger.warn(`Failed to clean stale tokens: ${e}`));
      }

      this.logger.log(`Feature tip (${tipKey}) sent to ${pushCount} merchants`);
    } catch (error) {
      this.logger.error('Failed to send feature tips', error);
    }
  }

  // ── Saturday: Upgrade nudge for free plan merchants ─────────────────────
  @Cron('0 10 * * 6') // Saturday at 10:00 UTC
  async sendUpgradeNudge(): Promise<void> {
    this.logger.log('Starting merchant upgrade nudge');

    try {
      let pushCount = 0;
      const staleTokenIds: string[] = [];

      // Only target FREE plan merchants who have been active for at least 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

      const merchants = await this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          pushToken: { not: null },
          onboardingCompleted: true,
          plan: 'FREE',
          createdAt: { lte: sevenDaysAgo },
        },
        select: { id: true, pushToken: true, language: true },
      });

      for (const merchant of merchants) {
        if (!merchant.pushToken) continue;

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
        }
      }

      if (staleTokenIds.length > 0) {
        await this.merchantRepo.updateMany({
          where: { id: { in: staleTokenIds } },
          data: { pushToken: null },
        }).catch((e: unknown) => this.logger.warn(`Failed to clean stale tokens: ${e}`));
      }

      this.logger.log(`Upgrade nudge sent to ${pushCount} free merchants`);
    } catch (error) {
      this.logger.error('Failed to send upgrade nudge', error);
    }
  }
}
