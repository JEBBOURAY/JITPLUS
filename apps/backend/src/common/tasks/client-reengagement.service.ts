import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  CAMPAIGN_SENT_TRACKER_REPOSITORY, type ICampaignSentTrackerRepository,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';
import { isCronAllowed, weekTag } from './cron-utils';

// ── Re-engagement messages ──────────────────────────────────────────────
const MESSAGES = {
  // 7 days inactive: soft nudge
  inactive7d: {
    fr: {
      title: '💫 Vos points vous attendent !',
      body: 'Ça fait un moment ! Passez chez vos commerces favoris et continuez à accumuler des points.',
    },
    en: {
      title: '💫 Your points are waiting!',
      body: 'It\'s been a while! Visit your favorite shops and keep earning points.',
    },
    ar: {
      title: '💫 النقاط ديالك كيتسناوك!',
      body: 'فات شي وقت! زور المحلات المفضلين ديالك وكمل تجمع النقاط.',
    },
  },
  // 14 days inactive: urgency
  inactive14d: {
    fr: {
      title: '🔥 Ne perdez pas vos avantages !',
      body: 'Vos points et récompenses sont toujours là. Revenez et profitez de vos avantages fidélité !',
    },
    en: {
      title: '🔥 Don\'t lose your perks!',
      body: 'Your points and rewards are still here. Come back and enjoy your loyalty benefits!',
    },
    ar: {
      title: '🔥 ما تخسرش المزايا ديالك!',
      body: 'النقط والمكافآت ديالك مازال تما. رجع تمتع بمزايا الولاء!',
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
      body: 'Vous n\'avez pas encore scanné votre premier commerce. Visitez un partenaire JIT+ et gagnez des points gratuitement !',
    },
    en: {
      title: '🚀 Start earning rewards!',
      body: 'You haven\'t scanned your first business yet. Visit a JIT+ partner and earn points for free!',
    },
    ar: {
      title: '🚀 بدا تربح المكافآت!',
      body: 'مازال ما سكانيتي حتى محل. زور شريك JIT+ واربح النقط بالمجان!',
    },
  },
} as const;

type MsgKey = keyof typeof MESSAGES;
type Lang = 'fr' | 'en' | 'ar';

function lang(v?: string | null): Lang {
  return v === 'en' || v === 'ar' ? v : 'fr';
}

function getMsg(key: MsgKey, l: Lang): { title: string; body: string } {
  return MESSAGES[key][l];
}

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
  private static readonly BATCH_SIZE = 1000;

  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private readonly loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
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

  @Cron('0 14 * * *') // Daily at 14:00 UTC = 15:00 Maroc (après Dohr)
  async sendReengagementPush(): Promise<void> {
    if (!isCronAllowed(this.logger, 'ClientReengagement.sendReengagementPush')) return;
    this.logger.log('Starting client re-engagement push');

    try {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
      // Don't notify clients who signed up in the last day (welcome series handles them)
      const oneDayAgo = new Date(now.getTime() - 86_400_000);

      const results = { neverUsed: 0, inactive7d: 0, inactive14d: 0, inactive30d: 0 };
      const staleTokenIds: string[] = [];

      // ── Segment 1: Never used (no loyalty cards, signed up 3+ days ago) ──
      await this.processNeverUsed(threeDaysAgo, oneDayAgo, results, staleTokenIds);

      // ── Segments 2-4: Inactive based on last transaction ──
      await this.processInactive(sevenDaysAgo, fourteenDaysAgo, thirtyDaysAgo, results, staleTokenIds);

      // Clean stale tokens
      if (staleTokenIds.length > 0) {
        this.logger.log(`Cleaning ${staleTokenIds.length} stale client push token(s)`);
        await this.clientRepo.updateMany({
          where: { id: { in: staleTokenIds } },
          data: { pushToken: null },
        }).catch((e: unknown) => this.logger.warn(`Failed to clean stale tokens: ${e}`));
      }

      this.logger.log(
        `Re-engagement sent: neverUsed=${results.neverUsed}, 7d=${results.inactive7d}, 14d=${results.inactive14d}, 30d=${results.inactive30d}`,
      );
    } catch (error) {
      this.logger.error('Failed to send re-engagement push', error);
    }
  }

  private async processNeverUsed(
    threeDaysAgo: Date,
    oneDayAgo: Date,
    results: Record<string, number>,
    staleTokenIds: string[],
  ): Promise<void> {
    // Clients signed up 3-30 days ago with push enabled
    const thirtyDaysAgo = new Date(threeDaysAgo.getTime() - 27 * 86_400_000);
    const clients = await this.clientRepo.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo, lte: threeDaysAgo },
        deletedAt: null,
        notifPush: true,
        pushToken: { not: null },
      },
      select: { id: true, pushToken: true, language: true },
      take: ClientReengagementService.BATCH_SIZE,
    });

    if (clients.length === 0) return;

    // Filter out clients who already have loyalty cards
    const clientIds = clients.map((c: any) => c.id);
    const clientsWithCards = await this.loyaltyCardRepo.findMany({
      where: { clientId: { in: clientIds }, deactivatedAt: null },
      select: { clientId: true },
      distinct: ['clientId'],
    });
    const engagedIds = new Set(clientsWithCards.map((c: { clientId: string }) => c.clientId));
    const neverUsedClients = clients.filter((c: any) => !engagedIds.has(c.id));

    if (neverUsedClients.length === 0) return;

    // Dedup: only ping each "never used" client once per week.
    const weekKey = weekTag();
    const campaignId = `reengagement_never_used_${weekKey}`;
    const freshClients: typeof neverUsedClients = [];
    for (const c of neverUsedClients) {
      if (await this.alreadySent(c.id, campaignId)) continue;
      freshClients.push(c);
    }
    if (freshClients.length === 0) return;

    // Group by language
    const byLang = new Map<Lang, string[]>();
    for (const c of freshClients) {
      const l = lang(c.language);
      if (!byLang.has(l)) byLang.set(l, []);
      byLang.get(l)!.push(c.pushToken!);
    }

    for (const [l, tokens] of byLang) {
      const msg = getMsg('neverUsed', l);
      try {
        const result = await this.pushProvider.sendMulticast(
          tokens, msg.title, msg.body, undefined,
          { event: 'reengagement', action: 'open_scan' },
        );
        if (result.invalidTokens.length > 0) {
          // Map invalid tokens back to client IDs
          const tokenToId = new Map<string, string>(freshClients.map((c: any) => [c.pushToken!, c.id]));
          for (const t of result.invalidTokens) {
            const id = tokenToId.get(t);
            if (id) staleTokenIds.push(id);
          }
        }
      } catch (e) {
        this.logger.warn(`neverUsed push failed (${l}): ${e}`);
      }
    }

    // Mark all successfully-queued clients as sent (idempotent)
    for (const c of freshClients) {
      await this.markSent(c.id, campaignId);
    }

    results.neverUsed = freshClients.length;
  }

  private async processInactive(
    sevenDaysAgo: Date,
    fourteenDaysAgo: Date,
    thirtyDaysAgo: Date,
    results: Record<string, number>,
    staleTokenIds: string[],
  ): Promise<void> {
    // Find clients with push enabled who have at least one loyalty card (have used the app)
    let cursor: string | undefined;

    while (true) {
      const batch = await this.clientRepo.findMany({
        where: {
          deletedAt: null,
          notifPush: true,
          pushToken: { not: null },
          loyaltyCards: { some: { deactivatedAt: null } },
        },
        select: { id: true, pushToken: true, language: true },
        take: ClientReengagementService.BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });
      if (batch.length === 0) break;

      for (const client of batch) {
        if (!client.pushToken) continue;

        // Find most recent transaction for this client
        const lastTx = await this.txRepo.findFirst({
          where: {
            clientId: client.id,
            type: { in: ['EARN_POINTS', 'REDEEM_REWARD'] },
            status: 'ACTIVE',
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });

        if (!lastTx) continue;

        const l = lang(client.language);
        let msgKey: MsgKey | null = null;
        let resultKey: string | null = null;

        if (lastTx.createdAt < thirtyDaysAgo) {
          msgKey = 'inactive30d';
          resultKey = 'inactive30d';
        } else if (lastTx.createdAt < fourteenDaysAgo) {
          msgKey = 'inactive14d';
          resultKey = 'inactive14d';
        } else if (lastTx.createdAt < sevenDaysAgo) {
          msgKey = 'inactive7d';
          resultKey = 'inactive7d';
        }

        if (!msgKey || !resultKey) continue;

        // Dedup: dedup key derived from the tier + lastTx date, so a client
        // who resumes activity and goes inactive again will receive a new cycle.
        const txKey = lastTx.createdAt.toISOString().slice(0, 10);
        const campaignId = `reengagement_${resultKey}_${txKey}`;
        if (await this.alreadySent(client.id, campaignId)) continue;

        const msg = getMsg(msgKey, l);
        // Different actions per tier: 7d/14d push them back to their cards,
        // 30d push them to the explorer so they can discover fresh merchants.
        const action = resultKey === 'inactive30d' ? 'open_explore' : 'open_cards';
        try {
          const pushResult = await this.pushProvider.sendMulticast(
            [client.pushToken], msg.title, msg.body, undefined,
            { event: 'reengagement', action },
          );

          await this.markSent(client.id, campaignId);
          results[resultKey]++;

          if (pushResult.invalidTokens.length > 0) {
            staleTokenIds.push(client.id);
          }
        } catch (e) {
          this.logger.warn(`reengagement push failed for ${client.id}: ${e}`);
        }
      }

      cursor = batch[batch.length - 1].id;
      if (batch.length < ClientReengagementService.BATCH_SIZE) break;
    }
  }
}
