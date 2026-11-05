import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';
import { weekIndexSinceReference, weekTag, cronAllowedOnce } from './cron-utils';
import { type ClientPush, CLIENT_CAMPAIGN_CHUNK, afterId, chunk, clearStaleClientTokens, deliverClientPushes } from './client-campaign';
import { type AppLang, pickAppLang } from '../utils/app-lang';
import { MS_PER_DAY } from '../constants';

// ── Weekly digest & special campaign messages ───────────────────────────
const MESSAGES = {
  // Weekly summary for active users
  weeklyDigest: {
    fr: {
      title: '📊 Votre résumé de la semaine',
      body: (stamps: number, merchants: number) =>
        `Cette semaine : +${stamps} tampon(s) cumulé(s) chez ${merchants} commerce(s). Continuez comme ça ! 💪`,
    },
    en: {
      title: '📊 Your weekly summary',
      body: (stamps: number, merchants: number) =>
        `This week: +${stamps} stamp(s) earned at ${merchants} business(es). Keep it up! 💪`,
    },
    ar: {
      title: '📊 ملخص الأسبوع ديالك',
      body: (stamps: number, merchants: number) =>
        `هاد الأسبوع: +${stamps} طابع عند ${merchants} محل(ات). كمل هكا! 💪`,
    },
  },
  // Referral viral loop
  referralPush: {
    fr: {
      title: '💰 Parrainez et gagnez 25 DH !',
      body: 'Invitez un ami commerçant sur JIT+. Quand il s\'abonne au Premium, vous recevez 25 DH de bonus !',
    },
    en: {
      title: '💰 Refer & earn 25 DH!',
      body: 'Invite a merchant friend to JIT+. When they subscribe to Premium, you earn a 25 DH bonus!',
    },
    ar: {
      title: '💰 باريني واربح 25 درهم!',
      body: 'عيّط لصاحبك التاجر لـ JIT+. ملي يشترك فـ Premium، تربح 25 درهم بونوص!',
    },
  },
  // New merchants nearby (discovery)
  newMerchants: {
    fr: {
      title: '🆕 Nouveaux commerces sur JIT+ !',
      body: 'De nouveaux partenaires ont rejoint JIT+ cette semaine. Explorez et gagnez des tampons dans encore plus d\'endroits !',
    },
    en: {
      title: '🆕 New businesses on JIT+!',
      body: 'New partners joined JIT+ this week. Explore and earn stamps at even more places!',
    },
    ar: {
      title: '🆕 محلات جديدة فـ JIT+!',
      body: 'شركاء جداد دخلو لـ JIT+ هاد الأسبوع. تصفح واربح الطوابع فبلايص أكثر!',
    },
  },
  // Feature highlight: stamps
  featureStamps: {
    fr: {
      title: '📋 Le saviez-vous ?',
      body: 'Chaque commerce partenaire a sa carte de tampons. Collectez tous les tampons et obtenez une récompense gratuite !',
    },
    en: {
      title: '📋 Did you know?',
      body: 'Every partner business has its own stamp card. Collect all stamps and get a free reward!',
    },
    ar: {
      title: '📋 واش كنتي عارف؟',
      body: 'كل محل شريك عندو كارطة الطوابع ديالو. جمع الطوابع كلهم واربح مكافأة مجانية!',
    },
  },
  // Feature highlight: QR scanning
  featureQR: {
    fr: {
      title: '📱 Scanner = Gagner !',
      body: 'À chaque achat, scannez le QR code du commerçant pour accumuler des tampons automatiquement. Simple et rapide !',
    },
    en: {
      title: '📱 Scan = Earn!',
      body: 'With every purchase, scan the merchant\'s QR code to earn stamps automatically. Simple and fast!',
    },
    ar: {
      title: '📱 سكاني = اربح!',
      body: 'مع كل شراء، سكاني الـ QR code ديال التاجر باش تجمع الطوابع أوتوماتيكيا. ساهل وسريع!',
    },
  },
} as const;

type Lang = AppLang;
const lang = pickAppLang;
const LANGS: readonly Lang[] = ['fr', 'en', 'ar'];

/**
 * Weekly engagement campaigns for JIT+ clients.
 *
 * - **Sunday 10:00**: Weekly digest for active users (stamps earned this week)
 * - **Wednesday 14:00**: Feature highlights & tips (rotating)
 * - **Friday 11:00**: Referral push + new merchants announcement
 *
 * Each campaign targets specific segments to avoid notification fatigue.
 */
@Injectable()
export class ClientWeeklyDigestService {
  private readonly logger = new Logger(ClientWeeklyDigestService.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
  ) {}

  private get deps() {
    return { raw: this.rawQuery, push: this.pushProvider, logger: this.logger };
  }

  // ── Sunday: Weekly digest for active users ──────────────────────────────
  @Cron('0 10 * * 0') // Sunday at 10:00 UTC = 11:00 Maroc
  async sendWeeklyDigest(): Promise<void> {
    if (!(await cronAllowedOnce(this.logger, 'ClientWeeklyDigest.sendWeeklyDigest'))) return;
    this.logger.log('Starting weekly digest push');

    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * MS_PER_DAY);
      let digestCount = 0;
      const staleTokens: string[] = [];

      // Per-client totals of the week, aggregated in SQL: one row per active
      // client instead of every EARN_STAMPS transaction of the week. Clients
      // whose weekly score is zero (e.g. only pending / refunded tx) are dropped.
      const stats = await this.rawQuery.queryRaw<{
        client_id: string;
        push_token: string;
        language: string | null;
        stamps: number;
        merchants: number;
      }>`
        SELECT t.client_id, c.push_token, c.language,
               SUM(t.stamps)::int AS stamps,
               COUNT(DISTINCT t.merchant_id)::int AS merchants
        FROM transactions t
        JOIN clients c ON c.id = t.client_id
        WHERE t.type = 'EARN_STAMPS'
          AND t.status = 'ACTIVE'
          AND t.created_at >= ${weekAgo}
          AND c.deleted_at IS NULL
          AND c.notif_push = true
          AND c.push_token IS NOT NULL
        GROUP BY t.client_id, c.push_token, c.language
        HAVING SUM(t.stamps) > 0`;

      // Send personalized digest
      const weekKey = `w${Math.floor(Date.now() / (7 * MS_PER_DAY))}`;
      const campaignId = `weekly_digest_push_${weekKey}`;
      const data = { event: 'weekly_digest', action: 'open_cards' };
      for (const rows of chunk(stats, CLIENT_CAMPAIGN_CHUNK)) {
        const items: ClientPush[] = rows.map((r) => {
          const msg = MESSAGES.weeklyDigest[lang(r.language)];
          return {
            clientId: r.client_id,
            token: r.push_token,
            campaignId,
            title: msg.title,
            body: msg.body(Number(r.stamps), Number(r.merchants)),
            data,
          };
        });
        const res = await deliverClientPushes(this.deps, items);
        staleTokens.push(...res.staleTokens);
        digestCount += res.claimed.length;
      }

      this.logger.log(`Weekly digest sent to ${digestCount} active clients`);
      await clearStaleClientTokens(this.clientRepo, staleTokens, this.logger);
    } catch (error) {
      this.logger.error('Failed to send weekly digest', error);
    }
  }

  // ── Wednesday: Feature highlights & tips (rotating) ─────────────────────
  @Cron('0 14 * * 3') // Wednesday at 14:00 UTC = 15:00 Maroc
  async sendFeatureHighlight(): Promise<void> {
    if (!(await cronAllowedOnce(this.logger, 'ClientWeeklyDigest.sendFeatureHighlight'))) return;
    this.logger.log('Starting feature highlight push');

    try {
      // Rotate between features based on deterministic reference-anchored index.
      const weekNumber = weekIndexSinceReference();
      const wtag = weekTag();
      const features = ['featureStamps', 'featureQR'] as const;
      const featureKey = features[weekNumber % features.length];

      // Target clients who signed up more than 2 days ago (not in welcome series)
      const twoDaysAgo = new Date(Date.now() - 2 * MS_PER_DAY);
      const campaignId = `feature_highlight_push_${wtag}`;

      const { sent, staleTokens } = await this.broadcast(
        { createdAt: { lte: twoDaysAgo } },
        (l) => ({ campaignId, ...MESSAGES[featureKey][l], data: { event: 'feature_highlight', action: 'open_explore' } }),
      );

      this.logger.log(`Feature highlight (${featureKey}) sent to ${sent} clients`);
      await clearStaleClientTokens(this.clientRepo, staleTokens, this.logger);
    } catch (error) {
      this.logger.error('Failed to send feature highlight', error);
    }
  }

  // ── Friday: Referral push + new merchants ──────────────────────────────
  // ⚠️ Vendredi 9 UTC = 10 Maroc — AVANT le Jumu'ah (11h30-14h). L'ancien 11 UTC
  // tombait au début de la prière, ce qui était inapproprié pour le marché marocain.
  @Cron('0 9 * * 5')
  async sendFridayCampaign(): Promise<void> {
    if (!(await cronAllowedOnce(this.logger, 'ClientWeeklyDigest.sendFridayCampaign'))) return;
    this.logger.log('Starting Friday campaign push');

    try {
      const weekAgo = new Date(Date.now() - 7 * MS_PER_DAY);

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
      const weekNumber = weekIndexSinceReference();
      const wtag = weekTag();
      const wantNewMerchants = weekNumber % 2 === 1 && newMerchantCount > 0;
      const campaignKey = wantNewMerchants ? 'newMerchants' : 'referralPush';
      const campaignId = `friday_${campaignKey}_${wtag}`;
      const action = campaignKey === 'referralPush' ? 'open_referral' : 'open_explore';

      const { sent, staleTokens } = await this.broadcast(
        {},
        (l) => ({ campaignId, ...MESSAGES[campaignKey][l], data: { event: 'friday_campaign', action } }),
      );

      this.logger.log(`Friday campaign (${campaignKey}) sent to ${sent} clients`);
      await clearStaleClientTokens(this.clientRepo, staleTokens, this.logger);
    } catch (error) {
      this.logger.error('Failed to send Friday campaign', error);
    }
  }

  /**
   * Same message (per language) to every push-enabled client whose language
   * is fr / en / ar, read in id order page by page so every client is reached
   * (the old `take: 5000` per language kept re-picking the same 5000).
   */
  private async broadcast(
    extraWhere: Record<string, unknown>,
    message: (l: Lang) => Pick<ClientPush, 'campaignId' | 'title' | 'body' | 'data'>,
  ): Promise<{ sent: number; staleTokens: string[] }> {
    const messages = new Map<Lang, Pick<ClientPush, 'campaignId' | 'title' | 'body' | 'data'>>();
    for (const l of LANGS) messages.set(l, message(l));
    let sent = 0;
    const staleTokens: string[] = [];
    let last: string | undefined;
    for (;;) {
      const clients: Array<{ id: string; pushToken: string | null; language: string }> = await this.clientRepo.findMany({
        where: {
          deletedAt: null,
          notifPush: true,
          pushToken: { not: null },
          language: { in: [...LANGS] },
          ...extraWhere,
          ...afterId(last),
        },
        select: { id: true, pushToken: true, language: true },
        orderBy: { id: 'asc' },
        take: CLIENT_CAMPAIGN_CHUNK,
      });
      if (clients.length === 0) break;
      last = clients[clients.length - 1].id;

      const items: ClientPush[] = [];
      for (const c of clients) {
        const msg = messages.get(c.language as Lang);
        if (c.pushToken && msg) items.push({ clientId: c.id, token: c.pushToken, ...msg });
      }
      const res = await deliverClientPushes(this.deps, items);
      staleTokens.push(...res.staleTokens);
      sent += res.claimed.length;

      if (clients.length < CLIENT_CAMPAIGN_CHUNK) break;
    }
    return { sent, staleTokens };
  }
}
