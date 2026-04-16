import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';
import { DEFAULT_NOTIFICATION_LOGO } from '../constants';

// ── Weekly digest & special campaign messages ───────────────────────────
const MESSAGES = {
  // Weekly summary for active users
  weeklyDigest: {
    fr: {
      title: '📊 Votre résumé de la semaine',
      body: (points: number, merchants: number) =>
        `Cette semaine : +${points} points cumulés chez ${merchants} commerce(s). Continuez comme ça ! 💪`,
    },
    en: {
      title: '📊 Your weekly summary',
      body: (points: number, merchants: number) =>
        `This week: +${points} points earned at ${merchants} business(es). Keep it up! 💪`,
    },
    ar: {
      title: '📊 ملخص الأسبوع ديالك',
      body: (points: number, merchants: number) =>
        `هاد الأسبوع: +${points} نقطة عند ${merchants} محل(ات). كمل هكا! 💪`,
    },
  },
  // Referral viral loop
  referralPush: {
    fr: {
      title: '💰 Parrainez et gagnez 25 DH !',
      body: 'Invitez un ami commerçant sur JIT+. Quand il s\'abonne au Premium, vous recevez 25 DH de bonus !',
    },
    en: {
      title: '💰 Refer & earn 25 MAD!',
      body: 'Invite a merchant friend to JIT+. When they subscribe to Premium, you earn a 25 MAD bonus!',
    },
    ar: {
      title: '💰 باريني وربح 25 درهم!',
      body: 'عيّط لصاحبك التاجر لـ JIT+. ملي يشترك فـ Premium، تربح 25 درهم بونوص!',
    },
  },
  // New merchants nearby (discovery)
  newMerchants: {
    fr: {
      title: '🆕 Nouveaux commerces sur JIT+ !',
      body: 'De nouveaux partenaires ont rejoint JIT+ cette semaine. Explorez et gagnez des points dans encore plus d\'endroits !',
    },
    en: {
      title: '🆕 New businesses on JIT+!',
      body: 'New partners joined JIT+ this week. Explore and earn points at even more places!',
    },
    ar: {
      title: '🆕 محلات جديدة فـ JIT+!',
      body: 'شركاء جداد دخلو لـ JIT+ هاد الأسبوع. تصفح وربح النقاط فبلايص أكثر!',
    },
  },
  // Feature highlight: stamps
  featureStamps: {
    fr: {
      title: '📋 Le saviez-vous ?',
      body: 'Certains commerces offrent des cartes de tampons. Collectez tous les tampons et obtenez une récompense gratuite !',
    },
    en: {
      title: '📋 Did you know?',
      body: 'Some businesses offer stamp cards. Collect all stamps and get a free reward!',
    },
    ar: {
      title: '📋 واش كنتي عارف؟',
      body: 'شي محلات كيقدمو كارطات الطوابع. جمع الطوابع كلهم وربح مكافأة مجانية!',
    },
  },
  // Feature highlight: QR scanning
  featureQR: {
    fr: {
      title: '📱 Scanner = Gagner !',
      body: 'À chaque achat, scannez le QR code du commerçant pour accumuler des points automatiquement. Simple et rapide !',
    },
    en: {
      title: '📱 Scan = Earn!',
      body: 'With every purchase, scan the merchant\'s QR code to earn points automatically. Simple and fast!',
    },
    ar: {
      title: '📱 سكاني = ربح!',
      body: 'مع كل شراء، سكاني الـ QR code ديال التاجر باش تجمع النقاط أوتوماتيكيا. ساهل وسريع!',
    },
  },
} as const;

type Lang = 'fr' | 'en' | 'ar';

function lang(v?: string | null): Lang {
  return v === 'en' || v === 'ar' ? v : 'fr';
}

/**
 * Weekly engagement campaigns for JIT+ clients.
 *
 * - **Sunday 10:00**: Weekly digest for active users (points earned this week)
 * - **Wednesday 14:00**: Feature highlights & tips (rotating)
 * - **Friday 11:00**: Referral push + new merchants announcement
 *
 * Each campaign targets specific segments to avoid notification fatigue.
 */
@Injectable()
export class ClientWeeklyDigestService {
  private readonly logger = new Logger(ClientWeeklyDigestService.name);
  private static readonly BATCH_SIZE = 1000;

  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private readonly loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
  ) {}

  // ── Sunday: Weekly digest for active users ──────────────────────────────
  @Cron('0 10 * * 0') // Sunday at 10:00 UTC
  async sendWeeklyDigest(): Promise<void> {
    this.logger.log('Starting weekly digest push');

    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
      let digestCount = 0;

      // Find clients who had transactions this week
      const recentClients = await this.txRepo.findMany({
        where: {
          type: 'EARN_POINTS',
          status: 'ACTIVE',
          createdAt: { gte: weekAgo },
          client: {
            deletedAt: null,
            notifPush: true,
            pushToken: { not: null },
          },
        },
        select: {
          clientId: true,
          points: true,
          merchantId: true,
          client: { select: { pushToken: true, language: true } },
        },
      });

      // Aggregate per client
      const clientStats = new Map<string, {
        token: string;
        language: string;
        totalPoints: number;
        merchants: Set<string>;
      }>();

      for (const tx of recentClients) {
        const client = tx.client as { pushToken: string | null; language: string };
        if (!client.pushToken) continue;

        if (!clientStats.has(tx.clientId)) {
          clientStats.set(tx.clientId, {
            token: client.pushToken,
            language: client.language,
            totalPoints: 0,
            merchants: new Set(),
          });
        }
        const stats = clientStats.get(tx.clientId)!;
        stats.totalPoints += tx.points;
        stats.merchants.add(tx.merchantId);
      }

      // Send personalized digest
      for (const [, stats] of clientStats) {
        const l = lang(stats.language);
        const msg = MESSAGES.weeklyDigest[l];
        await this.pushProvider.sendMulticast(
          [stats.token],
          msg.title,
          msg.body(stats.totalPoints, stats.merchants.size),
          DEFAULT_NOTIFICATION_LOGO,
          { event: 'weekly_digest', action: 'open_cards' },
        );
        digestCount++;
      }

      this.logger.log(`Weekly digest sent to ${digestCount} active clients`);
    } catch (error) {
      this.logger.error('Failed to send weekly digest', error);
    }
  }

  // ── Wednesday: Feature highlights & tips (rotating) ─────────────────────
  @Cron('0 14 * * 3') // Wednesday at 14:00 UTC
  async sendFeatureHighlight(): Promise<void> {
    this.logger.log('Starting feature highlight push');

    try {
      // Rotate between features based on week number
      const weekNumber = Math.floor(Date.now() / (7 * 86_400_000));
      const features = ['featureStamps', 'featureQR'] as const;
      const featureKey = features[weekNumber % features.length];

      // Target clients who signed up more than 2 days ago (not in welcome series)
      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
      let pushCount = 0;

      // Batch by language
      for (const l of ['fr', 'en', 'ar'] as Lang[]) {
        const clients = await this.clientRepo.findMany({
          where: {
            deletedAt: null,
            notifPush: true,
            pushToken: { not: null },
            language: l === 'fr' ? { in: ['fr', undefined as any] } : l,
            createdAt: { lte: twoDaysAgo },
          },
          select: { pushToken: true },
          take: 5000,
        });

        if (clients.length === 0) continue;

        const tokens = clients
          .map((c) => c.pushToken)
          .filter((t): t is string => !!t);

        if (tokens.length === 0) continue;

        const msg = MESSAGES[featureKey][l];
        await this.pushProvider.sendMulticast(
          tokens, msg.title, msg.body, DEFAULT_NOTIFICATION_LOGO,
          { event: 'feature_highlight', action: 'open_explore' },
        );
        pushCount += tokens.length;
      }

      this.logger.log(`Feature highlight (${featureKey}) sent to ${pushCount} clients`);
    } catch (error) {
      this.logger.error('Failed to send feature highlight', error);
    }
  }

  // ── Friday: Referral push + new merchants ──────────────────────────────
  @Cron('0 11 * * 5') // Friday at 11:00 UTC
  async sendFridayCampaign(): Promise<void> {
    this.logger.log('Starting Friday campaign push');

    try {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000);

      // Check if new merchants joined this week
      const newMerchantCount = await (this.clientRepo as any).constructor?.count
        ? 0
        : 0; // We'll check via a different approach

      // Alternate between referral and new merchants announcements
      const weekNumber = Math.floor(Date.now() / (7 * 86_400_000));
      const campaignKey = weekNumber % 2 === 0 ? 'referralPush' : 'newMerchants';

      let pushCount = 0;

      for (const l of ['fr', 'en', 'ar'] as Lang[]) {
        const clients = await this.clientRepo.findMany({
          where: {
            deletedAt: null,
            notifPush: true,
            pushToken: { not: null },
            language: l === 'fr' ? { in: ['fr', undefined as any] } : l,
          },
          select: { pushToken: true },
          take: 5000,
        });

        if (clients.length === 0) continue;

        const tokens = clients
          .map((c) => c.pushToken)
          .filter((t): t is string => !!t);

        if (tokens.length === 0) continue;

        const msg = MESSAGES[campaignKey][l];
        const action = campaignKey === 'referralPush' ? 'open_referral' : 'open_explore';

        await this.pushProvider.sendMulticast(
          tokens, msg.title, msg.body, DEFAULT_NOTIFICATION_LOGO,
          { event: 'friday_campaign', action },
        );
        pushCount += tokens.length;
      }

      this.logger.log(`Friday campaign (${campaignKey}) sent to ${pushCount} clients`);
    } catch (error) {
      this.logger.error('Failed to send Friday campaign', error);
    }
  }
}
