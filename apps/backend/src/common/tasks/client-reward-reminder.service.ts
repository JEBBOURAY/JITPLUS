import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  REWARD_REPOSITORY, type IRewardRepository,
  CAMPAIGN_SENT_TRACKER_REPOSITORY, type ICampaignSentTrackerRepository,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';
import { isCronAllowed } from './cron-utils';

// ── Reward reminder messages ────────────────────────────────────────────
const MESSAGES = {
  // Client has enough stamps to redeem a reward
  rewardAvailable: {
    fr: {
      title: '🎉 Vous avez une récompense disponible !',
      body: (merchant: string, reward: string) =>
        `Chez ${merchant}, vous avez assez de tampons pour "${reward}". Passez récupérer votre récompense !`,
    },
    en: {
      title: '🎉 You have a reward available!',
      body: (merchant: string, reward: string) =>
        `At ${merchant}, you have enough stamps for "${reward}". Go claim your reward!`,
    },
    ar: {
      title: '🎉 عندك مكافأة متوفرة!',
      body: (merchant: string, reward: string) =>
        `عند ${merchant}، عندك طوابع كافية لـ "${reward}". سير تاخد المكافأة ديالك!`,
    },
  },
  // Client is close to completing their stamp card (80%+ of the cheapest reward)
  stampsAlmost: {
    fr: {
      title: '📋 Votre carte est presque complète !',
      body: (merchant: string, remaining: number) =>
        `Plus que ${remaining} tampon(s) chez ${merchant} pour gagner votre récompense gratuite !`,
    },
    en: {
      title: '📋 Your card is almost full!',
      body: (merchant: string, remaining: number) =>
        `Just ${remaining} stamp(s) at ${merchant} to earn your free reward!`,
    },
    ar: {
      title: '📋 الكارطة ديالك تقريبا كملات!',
      body: (merchant: string, remaining: number) =>
        `غير ${remaining} طابع عند ${merchant} باش تربح المكافأة المجانية!`,
    },
  },
} as const;

type Lang = 'fr' | 'en' | 'ar';

function lang(v?: string | null): Lang {
  return v === 'en' || v === 'ar' ? v : 'fr';
}

/** Localized fallback when the merchant name is missing. */
const MERCHANT_FALLBACK: Record<Lang, string> = {
  fr: 'votre commerce',
  en: 'your merchant',
  ar: 'المحل ديالك',
};

/**
 * Reward reminders: nudge clients who are close to or already have
 * enough stamps to redeem a reward.
 *
 * Two segments:
 * 1. **Reward available** — client has >= stamps needed for cheapest reward
 * 2. **Almost there** — client has >= 80% of stamps needed for cheapest reward
 *
 * Runs every 2 days at 14:00 UTC (afternoon engagement).
 * Only notifies each client about their BEST opportunity (1 notification max).
 */
@Injectable()
export class ClientRewardReminderService {
  private readonly logger = new Logger(ClientRewardReminderService.name);
  private static readonly BATCH_SIZE = 500;

  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private readonly loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(REWARD_REPOSITORY) private readonly rewardRepo: IRewardRepository,
    @Inject(CAMPAIGN_SENT_TRACKER_REPOSITORY) private readonly campaignTrackerRepo: ICampaignSentTrackerRepository,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
  ) {}

  /** Check if this (client, campaign, PUSH) was already sent — used to dedup cron reruns. */
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
      // race condition — safe to ignore (unique constraint)
    }
  }

  @Cron('0 14 */2 * *') // Every 2 days at 14:00 UTC = 15:00 Maroc
  async sendRewardReminders(): Promise<void> {
    if (!isCronAllowed(this.logger, 'ClientRewardReminder.sendRewardReminders')) return;
    this.logger.log('Starting client reward reminders');

    const staleTokens: string[] = [];
    const safeSend = async (
      token: string,
      title: string,
      body: string,
      data: Record<string, string>,
    ): Promise<boolean> => {
      try {
        const result = await this.pushProvider.sendMulticast([token], title, body, undefined, data);
        if (result?.invalidTokens?.length) staleTokens.push(...result.invalidTokens);
        return (result?.successCount ?? 0) > 0;
      } catch (e) {
        this.logger.warn(`Push failed: ${e}`);
        return false;
      }
    };

    try {
      let rewardAvailableCount = 0;
      let almostCount = 0;
      let cursor: string | undefined;

      while (true) {
        // Fetch active loyalty cards with push-enabled clients
        const cards = await this.loyaltyCardRepo.findMany({
          where: {
            deactivatedAt: null,
            client: {
              deletedAt: null,
              notifPush: true,
              pushToken: { not: null },
            },
            merchant: {
              isActive: true,
              deletedAt: null,
            },
          },
          select: {
            id: true,
            stamps: true,
            clientId: true,
            merchantId: true,
            merchant: { select: { nom: true } },
          },
          take: ClientRewardReminderService.BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });

        if (cards.length === 0) break;

        // Track which clients we've already notified this run
        const notifiedClients = new Set<string>();

        // Collect unique merchant IDs for batch reward lookup
        const merchantIds = [...new Set(cards.map((c: any) => c.merchantId))];

        // Batch load rewards
        const rewards = await this.rewardRepo.findMany({
          where: { merchantId: { in: merchantIds } },
          select: { id: true, merchantId: true, titre: true, cout: true },
          orderBy: { cout: 'asc' },
        });

        // Group rewards by merchant, keep cheapest first
        const rewardsByMerchant = new Map<string, { titre: string; cout: number }[]>();
        for (const r of rewards) {
          if (!rewardsByMerchant.has(r.merchantId)) rewardsByMerchant.set(r.merchantId, []);
          rewardsByMerchant.get(r.merchantId)!.push({ titre: r.titre, cout: r.cout });
        }

        // Batch load client info (push tokens + language)
        const clientIds = [...new Set(cards.map((c: any) => c.clientId))];
        const clients = await this.clientRepo.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, pushToken: true, language: true },
        });
        const clientMap = new Map<string, any>(clients.map((c: any) => [c.id, c]));

        for (const card of cards) {
          if (notifiedClients.has(card.clientId)) continue;

          const client = clientMap.get(card.clientId);
          if (!client?.pushToken) continue;

          const merchantRewards = rewardsByMerchant.get(card.merchantId);
          if (!merchantRewards || merchantRewards.length === 0) continue;

          const cheapest = merchantRewards[0];
          const l = lang(client.language);
          const merchantName = card.merchant?.nom || MERCHANT_FALLBACK[l];
          const dayKey = new Date().toISOString().slice(0, 10);

          // Skip clients with zero stamps — a fresh card is not a reason to ping.
          const stamps = card.stamps || 0;
          if (stamps <= 0) continue;

          if (stamps >= cheapest.cout) {
            const campaignId = `reward_stamps_available_${card.merchantId}_${dayKey}`;
            if (await this.alreadySent(card.clientId, campaignId)) {
              notifiedClients.add(card.clientId);
              continue;
            }
            const msg = MESSAGES.rewardAvailable[l];
            await safeSend(
              client.pushToken,
              msg.title,
              msg.body(merchantName, cheapest.titre),
              { event: 'reward_reminder', action: 'open_card', merchantId: card.merchantId },
            );
            await this.markSent(card.clientId, campaignId);
            rewardAvailableCount++;
            notifiedClients.add(card.clientId);
          } else if (stamps >= cheapest.cout * 0.8) {
            const remaining = cheapest.cout - stamps;
            if (remaining <= 0) continue;
            const campaignId = `reward_stamps_almost_${card.merchantId}_${dayKey}`;
            if (await this.alreadySent(card.clientId, campaignId)) {
              notifiedClients.add(card.clientId);
              continue;
            }
            const msg = MESSAGES.stampsAlmost[l];
            await safeSend(
              client.pushToken,
              msg.title,
              msg.body(merchantName, remaining),
              { event: 'reward_reminder', action: 'open_card', merchantId: card.merchantId },
            );
            await this.markSent(card.clientId, campaignId);
            almostCount++;
            notifiedClients.add(card.clientId);
          }
        }

        cursor = cards[cards.length - 1].id;
        if (cards.length < ClientRewardReminderService.BATCH_SIZE) break;
      }

      this.logger.log(
        `Reward reminders sent: ${rewardAvailableCount} available, ${almostCount} almost-there`,
      );

      if (staleTokens.length > 0) {
        try {
          await this.clientRepo.updateMany({
            where: { pushToken: { in: staleTokens } },
            data: { pushToken: null },
          });
          this.logger.log(`Cleaned ${staleTokens.length} stale push token(s)`);
        } catch (e) {
          this.logger.warn(`Failed to clean stale tokens: ${e}`);
        }
      }
    } catch (error) {
      this.logger.error('Failed to send reward reminders', error);
    }
  }
}
