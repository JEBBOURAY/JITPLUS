import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  REWARD_REPOSITORY, type IRewardRepository,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';
import { cronAllowedOnce } from './cron-utils';
import { type ClientPush, afterId, clearStaleClientTokens, deliverClientPushes } from './client-campaign';
import { type AppLang, pickAppLang } from '../utils/app-lang';

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

type Lang = AppLang;
const lang = pickAppLang;

/** Localized fallback when the merchant name is missing. */
const MERCHANT_FALLBACK: Record<Lang, string> = {
  fr: 'votre commerce',
  en: 'your merchant',
  ar: 'المحل ديالك',
};

interface ReminderCard {
  id: string;
  stamps: number;
  clientId: string;
  merchantId: string;
  merchant: { nom: string | null } | null;
  client: { pushToken: string | null; language: string | null } | null;
}

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
    @Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
  ) {}

  @Cron('0 14 */2 * *') // Every 2 days at 14:00 UTC = 15:00 Maroc
  async sendRewardReminders(): Promise<void> {
    if (!(await cronAllowedOnce(this.logger, 'ClientRewardReminder.sendRewardReminders'))) return;
    this.logger.log('Starting client reward reminders');

    const staleTokens: string[] = [];
    const deps = { raw: this.rawQuery, push: this.pushProvider, logger: this.logger };

    try {
      let rewardAvailableCount = 0;
      let almostCount = 0;
      let last: string | undefined;
      // Clients already handled this run (1 notification max per client per run).
      const notifiedClients = new Set<string>();
      const dayKey = new Date().toISOString().slice(0, 10);

      while (true) {
        // Active loyalty cards with stamps (a fresh card is not a reason to
        // ping) of push-enabled clients, with the client's token + language.
        const cards: ReminderCard[] = await this.loyaltyCardRepo.findMany({
          where: {
            deactivatedAt: null,
            stamps: { gt: 0 },
            client: {
              deletedAt: null,
              notifPush: true,
              pushToken: { not: null },
            },
            merchant: {
              isActive: true,
              deletedAt: null,
            },
            ...afterId(last),
          },
          select: {
            id: true,
            stamps: true,
            clientId: true,
            merchantId: true,
            merchant: { select: { nom: true } },
            client: { select: { pushToken: true, language: true } },
          },
          take: ClientRewardReminderService.BATCH_SIZE,
          orderBy: { id: 'asc' },
        });

        if (cards.length === 0) break;
        last = cards[cards.length - 1].id;

        // Collect unique merchant IDs for batch reward lookup
        const merchantIds = [...new Set(cards.map((c) => c.merchantId))];

        // Batch load rewards
        const rewards: Array<{ merchantId: string; titre: string; cout: number }> = await this.rewardRepo.findMany({
          where: { merchantId: { in: merchantIds } },
          select: { id: true, merchantId: true, titre: true, cout: true },
          orderBy: { cout: 'asc' },
        });

        // Group rewards by merchant, keep cheapest first
        const cheapestByMerchant = new Map<string, { titre: string; cout: number }>();
        for (const r of rewards) {
          if (!cheapestByMerchant.has(r.merchantId)) cheapestByMerchant.set(r.merchantId, { titre: r.titre, cout: r.cout });
        }

        // First qualifying card per client (id order), then one bulk claim.
        const items: ClientPush[] = [];
        const kindOf = new Map<string, 'available' | 'almost'>();
        for (const card of cards) {
          if (notifiedClients.has(card.clientId)) continue;

          const token = card.client?.pushToken;
          if (!token) continue;

          const cheapest = cheapestByMerchant.get(card.merchantId);
          if (!cheapest) continue;

          const l = lang(card.client?.language);
          const merchantName = card.merchant?.nom || MERCHANT_FALLBACK[l];
          const stamps = card.stamps || 0;
          const data = { event: 'reward_reminder', action: 'open_card', merchantId: card.merchantId };

          if (stamps >= cheapest.cout) {
            const msg = MESSAGES.rewardAvailable[l];
            items.push({
              clientId: card.clientId,
              token,
              campaignId: `reward_stamps_available_${card.merchantId}_${dayKey}`,
              title: msg.title,
              body: msg.body(merchantName, cheapest.titre),
              data,
            });
            kindOf.set(card.clientId, 'available');
          } else if (stamps >= cheapest.cout * 0.8) {
            const remaining = cheapest.cout - stamps;
            if (remaining <= 0) continue;
            const msg = MESSAGES.stampsAlmost[l];
            items.push({
              clientId: card.clientId,
              token,
              campaignId: `reward_stamps_almost_${card.merchantId}_${dayKey}`,
              title: msg.title,
              body: msg.body(merchantName, remaining),
              data,
            });
            kindOf.set(card.clientId, 'almost');
          } else {
            continue;
          }
          // Claimed or already sent by another run: either way this client is done.
          notifiedClients.add(card.clientId);
        }

        const res = await deliverClientPushes(deps, items);
        staleTokens.push(...res.staleTokens);
        for (const p of res.claimed) {
          if (kindOf.get(p.clientId) === 'available') rewardAvailableCount++;
          else almostCount++;
        }

        if (cards.length < ClientRewardReminderService.BATCH_SIZE) break;
      }

      this.logger.log(
        `Reward reminders sent: ${rewardAvailableCount} available, ${almostCount} almost-there`,
      );

      await clearStaleClientTokens(this.clientRepo, staleTokens, this.logger);
    } catch (error) {
      this.logger.error('Failed to send reward reminders', error);
    }
  }
}
