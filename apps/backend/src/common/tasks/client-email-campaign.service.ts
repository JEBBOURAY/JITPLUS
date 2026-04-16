import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  REWARD_REPOSITORY, type IRewardRepository,
} from '../repositories';
import { IMailProvider, MAIL_PROVIDER } from '../interfaces';
import {
  buildWelcomeDay1Email,
  buildWelcomeDay3Email,
  buildWelcomeDay7Email,
  buildReengagement7dEmail,
  buildReengagement14dEmail,
  buildReengagement30dEmail,
  buildRewardAvailableEmail,
  buildAlmostThereEmail,
  buildWeeklyDigestEmail,
  buildReferralCampaignEmail,
  buildFeatureStampsEmail,
  buildFeatureQREmail,
} from '../../mail/campaign-templates';

type Lang = 'fr' | 'en' | 'ar';

/**
 * Automated email campaigns for JIT+ clients.
 *
 * Mirrors the push notification campaigns but via email for clients
 * who have email notifications enabled (notifEmail = true).
 *
 * Schedule (all UTC):
 * - Daily 09:30  — Welcome series (Day 1, 3, 7)
 * - Daily 12:30  — Re-engagement (7d, 14d, 30d inactive)
 * - Every 2d 15:00 — Reward reminders (available / almost there)
 * - Sunday 10:30 — Weekly digest
 * - Wednesday 14:30 — Feature highlight (rotating)
 * - Friday 11:30 — Referral campaign
 *
 * Offset 30 minutes after push notification crons to spread server load.
 */
@Injectable()
export class ClientEmailCampaignService {
  private readonly logger = new Logger(ClientEmailCampaignService.name);
  private static readonly BATCH_SIZE = 100;

  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private readonly loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(REWARD_REPOSITORY) private readonly rewardRepo: IRewardRepository,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: IMailProvider,
  ) {}

  // ── Welcome Series Email ────────────────────────────────────────────────
  @Cron('30 9 * * *') // Daily at 09:30 UTC
  async sendWelcomeSeriesEmail(): Promise<void> {
    this.logger.log('Starting client welcome series emails');

    try {
      const now = new Date();
      const results = { day1: 0, day3: 0, day7: 0 };

      for (const [step, daysAgo] of [['day1', 1], ['day3', 3], ['day7', 7]] as const) {
        const dateStart = new Date(now);
        dateStart.setDate(dateStart.getDate() - daysAgo);
        dateStart.setHours(0, 0, 0, 0);

        const dateEnd = new Date(dateStart);
        dateEnd.setHours(23, 59, 59, 999);

        const clients = await this.clientRepo.findMany({
          where: {
            createdAt: { gte: dateStart, lte: dateEnd },
            deletedAt: null,
            notifEmail: true,
            email: { not: null },
          },
          select: { id: true, email: true, prenom: true },
        });

        if (clients.length === 0) continue;

        // For day3, skip clients who already have loyalty cards
        let eligibleClients = clients;
        if (step === 'day3') {
          const clientIds = clients.map((c) => c.id);
          const clientsWithCards = await this.loyaltyCardRepo.findMany({
            where: { clientId: { in: clientIds }, deactivatedAt: null },
            select: { clientId: true },
            distinct: ['clientId'],
          });
          const engagedIds = new Set(clientsWithCards.map((c: { clientId: string }) => c.clientId));
          eligibleClients = clients.filter((c) => !engagedIds.has(c.id));
        }

        const buildEmail = {
          day1: buildWelcomeDay1Email,
          day3: buildWelcomeDay3Email,
          day7: buildWelcomeDay7Email,
        }[step];

        const subjects = {
          day1: '🏪 Découvrez les commerces autour de vous !',
          day3: '⭐ Gagnez vos premiers points de fidélité !',
          day7: '🎁 Invitez vos amis, gagnez des récompenses !',
        };

        for (const client of eligibleClients) {
          if (!client.email) continue;
          try {
            const html = buildEmail(client.prenom ?? undefined);
            await this.mailProvider.sendRaw(client.email, subjects[step], html);
            results[step]++;
          } catch (e) {
            this.logger.warn(`Welcome ${step} email failed for ${client.email}: ${e}`);
          }
        }
      }

      this.logger.log(
        `Welcome emails sent: day1=${results.day1}, day3=${results.day3}, day7=${results.day7}`,
      );
    } catch (error) {
      this.logger.error('Failed to send welcome series emails', error);
    }
  }

  // ── Re-engagement Emails ────────────────────────────────────────────────
  @Cron('30 12 * * *') // Daily at 12:30 UTC
  async sendReengagementEmail(): Promise<void> {
    this.logger.log('Starting client re-engagement emails');

    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

      const results = { d7: 0, d14: 0, d30: 0 };
      let cursor: string | undefined;

      while (true) {
        const clients = await this.clientRepo.findMany({
          where: {
            deletedAt: null,
            notifEmail: true,
            email: { not: null },
            loyaltyCards: { some: { deactivatedAt: null } },
          },
          select: { id: true, email: true, prenom: true },
          take: ClientEmailCampaignService.BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        if (clients.length === 0) break;

        for (const client of clients) {
          if (!client.email) continue;

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

          let html: string | null = null;
          let subject: string | null = null;
          let resultKey: keyof typeof results | null = null;

          // Pick the right window: 30d, 14d, 7d (only one email per client)
          // Target clients who are EXACTLY in the day range (±1 day) to avoid re-sending
          const daysSinceLastTx = Math.floor((now.getTime() - lastTx.createdAt.getTime()) / 86_400_000);

          if (daysSinceLastTx >= 29 && daysSinceLastTx <= 31) {
            html = buildReengagement30dEmail(client.prenom ?? undefined);
            subject = '😢 Vous nous manquez !';
            resultKey = 'd30';
          } else if (daysSinceLastTx >= 13 && daysSinceLastTx <= 15) {
            html = buildReengagement14dEmail(client.prenom ?? undefined);
            subject = '🔥 Ne perdez pas vos avantages !';
            resultKey = 'd14';
          } else if (daysSinceLastTx >= 6 && daysSinceLastTx <= 8) {
            html = buildReengagement7dEmail(client.prenom ?? undefined);
            subject = '💫 Vos points vous attendent !';
            resultKey = 'd7';
          }

          if (html && subject && resultKey) {
            try {
              await this.mailProvider.sendRaw(client.email, subject, html);
              results[resultKey]++;
            } catch (e) {
              this.logger.warn(`Re-engagement email failed for ${client.email}: ${e}`);
            }
          }
        }

        cursor = clients[clients.length - 1].id;
        if (clients.length < ClientEmailCampaignService.BATCH_SIZE) break;
      }

      this.logger.log(
        `Re-engagement emails sent: 7d=${results.d7}, 14d=${results.d14}, 30d=${results.d30}`,
      );
    } catch (error) {
      this.logger.error('Failed to send re-engagement emails', error);
    }
  }

  // ── Reward Reminder Emails ──────────────────────────────────────────────
  @Cron('0 15 */2 * *') // Every 2 days at 15:00 UTC
  async sendRewardReminderEmail(): Promise<void> {
    this.logger.log('Starting client reward reminder emails');

    try {
      let availableCount = 0;
      let almostCount = 0;
      let cursor: string | undefined;

      while (true) {
        const cards = await this.loyaltyCardRepo.findMany({
          where: {
            deactivatedAt: null,
            client: {
              deletedAt: null,
              notifEmail: true,
              email: { not: null },
            },
            merchant: { isActive: true, deletedAt: null },
          },
          select: {
            id: true,
            points: true,
            clientId: true,
            merchantId: true,
          },
          take: ClientEmailCampaignService.BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        if (cards.length === 0) break;

        const notifiedClients = new Set<string>();

        // Batch load related data
        const merchantIds = [...new Set(cards.map((c) => c.merchantId))];
        const clientIds = [...new Set(cards.map((c) => c.clientId))];

        const rewards = await this.rewardRepo.findMany({
          where: { merchantId: { in: merchantIds } },
          select: { merchantId: true, titre: true, cout: true },
          orderBy: { cout: 'asc' },
        });
        const rewardsByMerchant = new Map<string, { titre: string; cout: number }>();
        for (const r of rewards) {
          if (!rewardsByMerchant.has(r.merchantId)) {
            rewardsByMerchant.set(r.merchantId, { titre: r.titre, cout: r.cout });
          }
        }

        const clients = await this.clientRepo.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, email: true, prenom: true },
        });
        const clientMap = new Map(clients.map((c) => [c.id, c]));

        for (const card of cards) {
          if (notifiedClients.has(card.clientId)) continue;
          const client = clientMap.get(card.clientId);
          if (!client?.email) continue;

          const cheapest = rewardsByMerchant.get(card.merchantId);
          if (!cheapest) continue;

          const points = card.points || 0;

          try {
            if (points >= cheapest.cout) {
              const html = buildRewardAvailableEmail(
                client.prenom ?? undefined,
                'votre commerce', // We'd need merchant name here
                cheapest.titre,
                points,
              );
              await this.mailProvider.sendRaw(client.email, '🎉 Vous avez une récompense disponible !', html);
              availableCount++;
              notifiedClients.add(card.clientId);
            } else if (points >= cheapest.cout * 0.8) {
              const remaining = cheapest.cout - points;
              const html = buildAlmostThereEmail(
                client.prenom ?? undefined,
                'votre commerce',
                remaining,
                false,
              );
              await this.mailProvider.sendRaw(client.email, `🔥 Plus que ${remaining} points pour votre récompense !`, html);
              almostCount++;
              notifiedClients.add(card.clientId);
            }
          } catch (e) {
            this.logger.warn(`Reward reminder email failed for ${client.email}: ${e}`);
          }
        }

        cursor = cards[cards.length - 1].id;
        if (cards.length < ClientEmailCampaignService.BATCH_SIZE) break;
      }

      this.logger.log(`Reward reminder emails: ${availableCount} available, ${almostCount} almost`);
    } catch (error) {
      this.logger.error('Failed to send reward reminder emails', error);
    }
  }

  // ── Weekly Digest Email ─────────────────────────────────────────────────
  @Cron('30 10 * * 0') // Sunday at 10:30 UTC
  async sendWeeklyDigestEmail(): Promise<void> {
    this.logger.log('Starting client weekly digest emails');

    try {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000);
      let digestCount = 0;

      const recentTx = await this.txRepo.findMany({
        where: {
          type: 'EARN_POINTS',
          status: 'ACTIVE',
          createdAt: { gte: weekAgo },
          client: {
            deletedAt: null,
            notifEmail: true,
            email: { not: null },
          },
        },
        select: {
          clientId: true,
          points: true,
          merchantId: true,
        },
      });

      // Aggregate per client
      const clientStats = new Map<string, { totalPoints: number; merchants: Set<string> }>();
      for (const tx of recentTx) {
        if (!clientStats.has(tx.clientId)) {
          clientStats.set(tx.clientId, { totalPoints: 0, merchants: new Set() });
        }
        const stats = clientStats.get(tx.clientId)!;
        stats.totalPoints += tx.points;
        stats.merchants.add(tx.merchantId);
      }

      if (clientStats.size === 0) {
        this.logger.log('No active clients for weekly digest email');
        return;
      }

      // Fetch client info
      const clientIds = [...clientStats.keys()];
      const clients = await this.clientRepo.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, email: true, prenom: true },
      });

      for (const client of clients) {
        if (!client.email) continue;
        const stats = clientStats.get(client.id);
        if (!stats) continue;

        try {
          const html = buildWeeklyDigestEmail(
            client.prenom ?? undefined,
            stats.totalPoints,
            stats.merchants.size,
          );
          await this.mailProvider.sendRaw(
            client.email,
            `📊 Votre semaine : +${stats.totalPoints} points chez ${stats.merchants.size} commerce(s)`,
            html,
          );
          digestCount++;
        } catch (e) {
          this.logger.warn(`Weekly digest email failed for ${client.email}: ${e}`);
        }
      }

      this.logger.log(`Weekly digest emails sent to ${digestCount} clients`);
    } catch (error) {
      this.logger.error('Failed to send weekly digest emails', error);
    }
  }

  // ── Feature Highlight Email (Wednesday) ─────────────────────────────────
  @Cron('30 14 * * 3') // Wednesday at 14:30 UTC
  async sendFeatureHighlightEmail(): Promise<void> {
    this.logger.log('Starting feature highlight emails');

    try {
      const weekNumber = Math.floor(Date.now() / (7 * 86_400_000));
      const features = [buildFeatureStampsEmail, buildFeatureQREmail] as const;
      const buildEmail = features[weekNumber % features.length];
      const subjects = [
        '📋 Le saviez-vous ? Les cartes de tampons JitPlus !',
        '📱 Scanner = Gagner ! Découvrez comment ça marche',
      ];
      const subject = subjects[weekNumber % subjects.length];

      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
      let emailCount = 0;
      let cursor: string | undefined;

      while (true) {
        const clients = await this.clientRepo.findMany({
          where: {
            deletedAt: null,
            notifEmail: true,
            email: { not: null },
            createdAt: { lte: twoDaysAgo },
          },
          select: { id: true, email: true, prenom: true },
          take: ClientEmailCampaignService.BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        if (clients.length === 0) break;

        for (const client of clients) {
          if (!client.email) continue;
          try {
            const html = buildEmail(client.prenom ?? undefined);
            await this.mailProvider.sendRaw(client.email, subject, html);
            emailCount++;
          } catch (e) {
            this.logger.warn(`Feature highlight email failed for ${client.email}: ${e}`);
          }
        }

        cursor = clients[clients.length - 1].id;
        if (clients.length < ClientEmailCampaignService.BATCH_SIZE) break;
      }

      this.logger.log(`Feature highlight emails sent to ${emailCount} clients`);
    } catch (error) {
      this.logger.error('Failed to send feature highlight emails', error);
    }
  }

  // ── Referral Campaign Email (Friday) ────────────────────────────────────
  @Cron('30 11 * * 5') // Friday at 11:30 UTC
  async sendReferralCampaignEmail(): Promise<void> {
    this.logger.log('Starting referral campaign emails');

    try {
      // Only send every other week to avoid spam
      const weekNumber = Math.floor(Date.now() / (7 * 86_400_000));
      if (weekNumber % 2 !== 0) {
        this.logger.log('Skipping referral email this week (bi-weekly cadence)');
        return;
      }

      let emailCount = 0;
      let cursor: string | undefined;

      while (true) {
        const clients = await this.clientRepo.findMany({
          where: {
            deletedAt: null,
            notifEmail: true,
            email: { not: null },
          },
          select: { id: true, email: true, prenom: true },
          take: ClientEmailCampaignService.BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        if (clients.length === 0) break;

        for (const client of clients) {
          if (!client.email) continue;
          try {
            const html = buildReferralCampaignEmail(client.prenom ?? undefined);
            await this.mailProvider.sendRaw(client.email, '💰 Parrainez et gagnez 25 DH !', html);
            emailCount++;
          } catch (e) {
            this.logger.warn(`Referral email failed for ${client.email}: ${e}`);
          }
        }

        cursor = clients[clients.length - 1].id;
        if (clients.length < ClientEmailCampaignService.BATCH_SIZE) break;
      }

      this.logger.log(`Referral campaign emails sent to ${emailCount} clients`);
    } catch (error) {
      this.logger.error('Failed to send referral campaign emails', error);
    }
  }
}
