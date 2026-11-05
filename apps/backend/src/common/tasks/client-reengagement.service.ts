import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';
import { weekTag, cronAllowedOnce } from './cron-utils';
import { type ClientPush, CLIENT_CAMPAIGN_CHUNK, afterId, clearStaleClientTokens, deliverClientPushes } from './client-campaign';
import { type AppLang, pickAppLang } from '../utils/app-lang';
import { MS_PER_DAY } from '../constants';

// ── Re-engagement messages ──────────────────────────────────────────────
const MESSAGES = {
  // 7 days inactive: soft nudge
  inactive7d: {
    fr: {
      title: '💫 Vos tampons vous attendent !',
      body: 'Ça fait un moment ! Passez chez vos commerces favoris et continuez à accumuler des tampons.',
    },
    en: {
      title: '💫 Your stamps are waiting!',
      body: 'It\'s been a while! Visit your favorite shops and keep earning stamps.',
    },
    ar: {
      title: '💫 الطوابع ديالك كيتسناوك!',
      body: 'فات شي وقت! زور المحلات المفضلين ديالك وكمل تجمع الطوابع.',
    },
  },
  // 14 days inactive: urgency
  inactive14d: {
    fr: {
      title: '🔥 Ne perdez pas vos avantages !',
      body: 'Vos tampons et récompenses sont toujours là. Revenez et profitez de vos avantages fidélité !',
    },
    en: {
      title: '🔥 Don\'t lose your perks!',
      body: 'Your stamps and rewards are still here. Come back and enjoy your loyalty benefits!',
    },
    ar: {
      title: '🔥 ما تخسرش المزايا ديالك!',
      body: 'الطوابع والمكافآت ديالك مازال تما. رجع تمتع بمزايا الولاء!',
    },
  },
  // 30 days inactive: win-back
  inactive30d: {
    fr: {
      title: '😢 Vous nous manquez !',
      body: 'Cela fait 30 jours que vous n\'avez pas visité vos commerces. Revenez découvrir les nouvelles offres qui vous attendent !',
    },
    en: {
      title: '😢 We miss you!',
      body: 'It\'s been 30 days since your last visit. Come back and discover new offers waiting for you!',
    },
    ar: {
      title: '😢 توحشناك!',
      body: 'فاتو 30 يوم من آخر زيارة. رجع واكتشف العروض الجديدة اللي كيتسناوك!',
    },
  },
  // Never opened: first-time activation
  neverUsed: {
    fr: {
      title: '🚀 Commencez à gagner des récompenses !',
      body: 'Vous n\'avez pas encore scanné votre premier commerce. Visitez un partenaire JIT+ et gagnez des tampons gratuitement !',
    },
    en: {
      title: '🚀 Start earning rewards!',
      body: 'You haven\'t scanned your first business yet. Visit a JIT+ partner and earn stamps for free!',
    },
    ar: {
      title: '🚀 بدا تربح المكافآت!',
      body: 'مازال ما سكانيتي حتى محل. زور شريك JIT+ واربح الطوابع بالمجان!',
    },
  },
} as const;

type MsgKey = keyof typeof MESSAGES;
type Lang = AppLang;
const lang = pickAppLang;

function getMsg(key: MsgKey, l: Lang): { title: string; body: string } {
  return MESSAGES[key][l];
}

type ClientRow = { id: string; pushToken: string | null; language: string | null };
type Results = { neverUsed: number; inactive7d: number; inactive14d: number; inactive30d: number };

/**
 * Client re-engagement: automated push notifications for inactive clients.
 *
 * Segments:
 * 1. Never used — signed up 3+ days ago, never got any loyalty card
 * 2. Inactive 7 days — last transaction > 7 days ago
 * 3. Inactive 14 days — last transaction > 14 days ago
 * 4. Inactive 30 days — last transaction > 30 days ago (win-back)
 *
 * Each client receives max 1 notification per run (highest priority segment).
 * Runs daily at 12:00 PM UTC (lunch peak engagement).
 */
@Injectable()
export class ClientReengagementService {
  private readonly logger = new Logger(ClientReengagementService.name);
  private static readonly BATCH_SIZE = CLIENT_CAMPAIGN_CHUNK;

  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
  ) {}

  private get deps() {
    return { raw: this.rawQuery, push: this.pushProvider, logger: this.logger };
  }

  @Cron('0 14 * * *') // Daily at 14:00 UTC = 15:00 Maroc (après Dohr)
  async sendReengagementPush(): Promise<void> {
    if (!(await cronAllowedOnce(this.logger, 'ClientReengagement.sendReengagementPush'))) return;
    this.logger.log('Starting client re-engagement push');

    try {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * MS_PER_DAY);
      const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * MS_PER_DAY);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);

      const results: Results = { neverUsed: 0, inactive7d: 0, inactive14d: 0, inactive30d: 0 };
      const staleTokens: string[] = [];

      // ── Segment 1: Never used (no loyalty cards, signed up 3+ days ago) ──
      await this.processNeverUsed(threeDaysAgo, results, staleTokens);

      // ── Segments 2-4: Inactive based on last transaction ──
      await this.processInactive(sevenDaysAgo, fourteenDaysAgo, thirtyDaysAgo, results, staleTokens);

      // Clean stale tokens
      await clearStaleClientTokens(this.clientRepo, staleTokens, this.logger);

      this.logger.log(
        `Re-engagement sent: neverUsed=${results.neverUsed}, 7d=${results.inactive7d}, 14d=${results.inactive14d}, 30d=${results.inactive30d}`,
      );
    } catch (error) {
      this.logger.error('Failed to send re-engagement push', error);
    }
  }

  private async processNeverUsed(threeDaysAgo: Date, results: Results, staleTokens: string[]): Promise<void> {
    // Clients signed up 3-30 days ago with push enabled and no active loyalty card.
    const thirtyDaysAgo = new Date(threeDaysAgo.getTime() - 27 * MS_PER_DAY);
    // Dedup: only ping each "never used" client once per week.
    const campaignId = `reengagement_never_used_${weekTag()}`;
    const data = { event: 'reengagement', action: 'open_scan' };

    let last: string | undefined;
    for (;;) {
      const clients: ClientRow[] = await this.clientRepo.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo, lte: threeDaysAgo },
          deletedAt: null,
          notifPush: true,
          pushToken: { not: null },
          loyaltyCards: { none: { deactivatedAt: null } },
          ...afterId(last),
        },
        select: { id: true, pushToken: true, language: true },
        orderBy: { id: 'asc' },
        take: ClientReengagementService.BATCH_SIZE,
      });
      if (clients.length === 0) break;
      last = clients[clients.length - 1].id;

      const items: ClientPush[] = clients
        .filter((c) => c.pushToken)
        .map((c) => {
          const msg = getMsg('neverUsed', lang(c.language));
          return { clientId: c.id, token: c.pushToken!, campaignId, title: msg.title, body: msg.body, data };
        });
      const r = await deliverClientPushes(this.deps, items);
      staleTokens.push(...r.staleTokens);
      results.neverUsed += r.claimed.length;

      if (clients.length < ClientReengagementService.BATCH_SIZE) break;
    }
  }

  private async processInactive(
    sevenDaysAgo: Date,
    fourteenDaysAgo: Date,
    thirtyDaysAgo: Date,
    results: Results,
    staleTokens: string[],
  ): Promise<void> {
    // Clients with push enabled who have at least one loyalty card (have used the app)
    let last: string | undefined;

    for (;;) {
      const batch: ClientRow[] = await this.clientRepo.findMany({
        where: {
          deletedAt: null,
          notifPush: true,
          pushToken: { not: null },
          loyaltyCards: { some: { deactivatedAt: null } },
          ...afterId(last),
        },
        select: { id: true, pushToken: true, language: true },
        take: ClientReengagementService.BATCH_SIZE,
        orderBy: { id: 'asc' },
      });
      if (batch.length === 0) break;
      last = batch[batch.length - 1].id;

      // Most recent qualifying transaction per client of the batch, in one
      // query: a LATERAL LIMIT 1 walks transactions(client_id, status,
      // created_at) backwards from the newest row, instead of aggregating every
      // active transaction of the 1000 clients.
      const lastTxs = await this.rawQuery.queryRaw<{ client_id: string; last_at: Date }>`
        SELECT c.id AS client_id, lt.created_at AS last_at
        FROM unnest(${batch.map((c) => c.id)}::text[]) AS c(id)
        CROSS JOIN LATERAL (
          SELECT t.created_at FROM transactions t
          WHERE t.client_id = c.id AND t.status = 'ACTIVE'
            AND t.type IN ('EARN_STAMPS', 'REDEEM_REWARD', 'PURCHASE')
          ORDER BY t.created_at DESC
          LIMIT 1
        ) lt`;
      const lastTxAt = new Map(lastTxs.map((r) => [r.client_id, r.last_at]));

      const items: ClientPush[] = [];
      const segmentOf = new Map<string, keyof Results>();
      for (const client of batch) {
        const lastAt = lastTxAt.get(client.id);
        if (!client.pushToken || !lastAt) continue;

        let msgKey: 'inactive7d' | 'inactive14d' | 'inactive30d';
        if (lastAt < thirtyDaysAgo) msgKey = 'inactive30d';
        else if (lastAt < fourteenDaysAgo) msgKey = 'inactive14d';
        else if (lastAt < sevenDaysAgo) msgKey = 'inactive7d';
        else continue;

        // Dedup: dedup key derived from the tier + lastTx date, so a client
        // who resumes activity and goes inactive again will receive a new cycle.
        const txKey = lastAt.toISOString().slice(0, 10);
        const msg = getMsg(msgKey, lang(client.language));
        // Different actions per tier: 7d/14d push them back to their cards,
        // 30d push them to the explorer so they can discover fresh merchants.
        const action = msgKey === 'inactive30d' ? 'open_explore' : 'open_cards';
        items.push({
          clientId: client.id,
          token: client.pushToken,
          campaignId: `reengagement_${msgKey}_${txKey}`,
          title: msg.title,
          body: msg.body,
          data: { event: 'reengagement', action },
        });
        segmentOf.set(client.id, msgKey);
      }

      const r = await deliverClientPushes(this.deps, items);
      staleTokens.push(...r.staleTokens);
      for (const p of r.claimed) results[segmentOf.get(p.clientId)!]++;

      if (batch.length < ClientReengagementService.BATCH_SIZE) break;
    }
  }
}
