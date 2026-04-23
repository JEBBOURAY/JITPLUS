import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  CAMPAIGN_SENT_TRACKER_REPOSITORY, type ICampaignSentTrackerRepository,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';

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
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(CAMPAIGN_SENT_TRACKER_REPOSITORY) private readonly campaignTrackerRepo: ICampaignSentTrackerRepository,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
  ) {}

  private async alreadySent(clientId: string, campaignId: string): Promise<boolean> {
    try {
      const row = await this.campaignTrackerRepo.findUnique({
        where: { clientId_campaignId_channel: { clientId, campaignId, channel: 'PUSH' } },
        select: { id: true },
      });
      return !!row;
    } catch {
      return false;
    }
  }

  private async markSent(clientId: string, campaignId: string): Promise<void> {
    try {
      await this.campaignTrackerRepo.create({
        data: { clientId, campaignId, channel: 'PUSH' },
      });
    } catch {
      // race / unique violation — safe to ignore
    }
  }

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
      const weekKey = `w${Math.floor(Date.now() / (7 * 86_400_000))}`;
      const campaignId = `weekly_digest_push_${weekKey}`;
      for (const [clientId, stats] of clientStats) {
        // Skip clients whose weekly score is zero (e.g. only pending / refunded tx)
        if (stats.totalPoints <= 0) continue;
        if (await this.alreadySent(clientId, campaignId)) continue;

        const l = lang(stats.language);
        const msg = MESSAGES.weeklyDigest[l];
        await this.pushProvider.sendMulticast(
          [stats.token],
          msg.title,
          msg.body(stats.totalPoints, stats.merchants.size),
          undefined,
          { event: 'weekly_digest', action: 'open_cards' },
        );
        await this.markSent(clientId, campaignId);
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
      const campaignId = `feature_highlight_push_w${weekNumber}`;
      let pushCount = 0;

      // Batch by language
      for (const l of ['fr', 'en', 'ar'] as Lang[]) {
        const clients = await this.clientRepo.findMany({
          where: {
            deletedAt: null,
            notifPush: true,
            pushToken: { not: null },
            language: l,
            createdAt: { lte: twoDaysAgo },
          },
          select: { id: true, pushToken: true },
          take: 5000,
        });

        if (clients.length === 0) continue;

        // Dedup: drop clients already pinged this week
        const fresh: typeof clients = [];
        for (const c of clients) {
          if (!c.pushToken) continue;
          if (await this.alreadySent(c.id, campaignId)) continue;
          fresh.push(c);
        }
        if (fresh.length === 0) continue;

        const tokens = fresh.map((c: any) => c.pushToken).filter((t: any): t is string => !!t);
        const msg = MESSAGES[featureKey][l];
        await this.pushProvider.sendMulticast(
          tokens, msg.title, msg.body, undefined,
          { event: 'feature_highlight', action: 'open_explore' },
        );
        for (const c of fresh) {
          await this.markSent(c.id, campaignId);
        }
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

      // Check if new merchants actually joined this week
      const newMerchantCount = await this.merchantRepo.count({
        where: {
          isActive: true,
          deletedAt: null,
          createdAt: { gte: weekAgo },
        },
      });

      // Alternate between referral and new merchants announcements.
      // If we intended to show "new merchants" but none joined, fall back
      // to the referral message so we don't send a misleading notification.
      const weekNumber = Math.floor(Date.now() / (7 * 86_400_000));
      const wantNewMerchants = weekNumber % 2 === 1 && newMerchantCount > 0;
      const campaignKey = wantNewMerchants ? 'newMerchants' : 'referralPush';
      const campaignId = `friday_${campaignKey}_w${weekNumber}`;

      let pushCount = 0;

      for (const l of ['fr', 'en', 'ar'] as Lang[]) {
        const clients = await this.clientRepo.findMany({
          where: {
            deletedAt: null,
            notifPush: true,
            pushToken: { not: null },
            language: l,
          },
          select: { id: true, pushToken: true },
          take: 5000,
        });

        if (clients.length === 0) continue;

        const fresh: typeof clients = [];
        for (const c of clients) {
          if (!c.pushToken) continue;
          if (await this.alreadySent(c.id, campaignId)) continue;
          fresh.push(c);
        }
        if (fresh.length === 0) continue;

        const tokens = fresh.map((c: any) => c.pushToken).filter((t: any): t is string => !!t);
        const msg = MESSAGES[campaignKey][l];
        const action = campaignKey === 'referralPush' ? 'open_referral' : 'open_explore';

        await this.pushProvider.sendMulticast(
          tokens, msg.title, msg.body, undefined,
          { event: 'friday_campaign', action },
        );
        for (const c of fresh) {
          await this.markSent(c.id, campaignId);
        }
        pushCount += tokens.length;
      }

      this.logger.log(`Friday campaign (${campaignKey}) sent to ${pushCount} clients`);
    } catch (error) {
      this.logger.error('Failed to send Friday campaign', error);
    }
  }
}
