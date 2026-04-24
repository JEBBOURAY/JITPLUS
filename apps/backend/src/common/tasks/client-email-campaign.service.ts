import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  REWARD_REPOSITORY, type IRewardRepository,
  CAMPAIGN_SENT_TRACKER_REPOSITORY, type ICampaignSentTrackerRepository,
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
  pickLang,
  type Lang,
} from '../../mail/campaign-templates';
import { isCronAllowed, weekIndexSinceReference, weekTag } from './cron-utils';

// ─── Subject localization ────────────────────────────────────────────────────
// Keep the subjects table here so `campaign-templates.ts` stays focused on HTML.

const SUBJECTS = {
  welcome_day1: {
    fr: '🏪 Découvrez les commerces autour de vous !',
    en: '🏪 Discover shops around you!',
    ar: '🏪 اكتشف المحلات اللي قريبين منك!',
  },
  welcome_day3: {
    fr: '⭐ Gagnez vos premiers points de fidélité !',
    en: '⭐ Earn your first loyalty points!',
    ar: '⭐ اربح أول النقط ديال الوفاء ديالك!',
  },
  welcome_day7: {
    fr: '🎁 Invitez vos amis, gagnez des récompenses !',
    en: '🎁 Invite your friends, earn rewards!',
    ar: '🎁 عيّط لصحابك واربح كادوات!',
  },
  reengage_7d: {
    fr: '💫 Vos points vous attendent !',
    en: '💫 Your points are waiting!',
    ar: '💫 النقط ديالك كتسناك!',
  },
  reengage_14d: {
    fr: '🔥 Ne perdez pas vos avantages !',
    en: '🔥 Don\'t lose your perks!',
    ar: '🔥 ما تضيعش المزايا ديالك!',
  },
  reengage_30d: {
    fr: '😢 Vous nous manquez !',
    en: '😢 We miss you!',
    ar: '😢 كتخصرنا!',
  },
  reward_available: {
    fr: (m: string) => `🎉 Récompense disponible chez ${m} !`,
    en: (m: string) => `🎉 Reward available at ${m}!`,
    ar: (m: string) => `🎉 كادو متاح عند ${m}!`,
  },
  reward_almost: {
    fr: (n: number) => `🔥 Plus que ${n} points pour votre récompense !`,
    en: (n: number) => `🔥 Only ${n} more points for your reward!`,
    ar: (n: number) => `🔥 بقا ${n} نقط للكادو ديالك!`,
  },
  weekly_digest: {
    fr: (p: number, n: number) => `📊 Votre semaine : +${p} points chez ${n} commerce(s)`,
    en: (p: number, n: number) => `📊 Your week: +${p} points at ${n} shop(s)`,
    ar: (p: number, n: number) => `📊 السيمانة ديالك: +${p} نقطة عند ${n} محل`,
  },
  feature_stamps: {
    fr: '📋 Le saviez-vous ? Les cartes de tampons JitPlus !',
    en: '📋 Did you know? JitPlus stamp cards!',
    ar: '📋 واش كنتي تعرف؟ كارطات الطوابع ديال جيت بلوس!',
  },
  feature_qr: {
    fr: '📱 Scanner = Gagner ! Découvrez comment ça marche',
    en: '📱 Scan = Earn! See how it works',
    ar: '📱 سكاني = اربح! شوف كيفاش كتخدم',
  },
  referral: {
    fr: '💰 Parrainez et gagnez 25 DH !',
    en: '💰 Refer a friend and earn 25 DH!',
    ar: '💰 بارطاجي واربح 25 درهم!',
  },
} as const;

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
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(REWARD_REPOSITORY) private readonly rewardRepo: IRewardRepository,
    @Inject(CAMPAIGN_SENT_TRACKER_REPOSITORY) private readonly campaignTrackerRepo: ICampaignSentTrackerRepository,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: IMailProvider,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /** Build RFC 8058 one-click unsubscribe URL signed with JWT (365d TTL). */
  private buildUnsubscribeUrl(clientId: string): string | undefined {
    try {
      const base = this.configService.get<string>('PUBLIC_API_URL')?.trim();
      if (!base) return undefined;
      const token = this.jwtService.sign(
        { clientId, purpose: 'unsubscribe_email' },
        { expiresIn: '365d' },
      );
      return `${base.replace(/\/$/, '')}/public/unsubscribe/email?t=${encodeURIComponent(token)}`;
    } catch {
      return undefined;
    }
  }

  /**
   * Check if a client was already sent a given campaign.
   * Returns true if already sent (skip), false if not.
   */
  private async alreadySent(clientId: string, campaignId: string, channel = 'EMAIL'): Promise<boolean> {
    const existing = await this.campaignTrackerRepo.findUnique({
      where: { clientId_campaignId_channel: { clientId, campaignId, channel } },
      select: { id: true },
    });
    return existing !== null;
  }

  /**
   * Mark a campaign as sent for a client (idempotent via skipDuplicates pattern).
   */
  private async markSent(clientId: string, campaignId: string, channel = 'EMAIL'): Promise<void> {
    try {
      await this.campaignTrackerRepo.create({
        data: { clientId, campaignId, channel },
      });
    } catch {
      // Unique constraint — already marked, safe to ignore
    }
  }

  // ── Welcome Series Email ────────────────────────────────────────────────
  @Cron('30 9 * * *') // Daily at 09:30 UTC = 10:30 Maroc
  async sendWelcomeSeriesEmail(): Promise<void> {
    if (!isCronAllowed(this.logger, 'ClientEmailCampaign.sendWelcomeSeriesEmail')) return;
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
          select: { id: true, email: true, prenom: true, language: true },
        });

        if (clients.length === 0) continue;

        // For day3, skip clients who already have loyalty cards
        let eligibleClients = clients;
        if (step === 'day3') {
          const clientIds = clients.map((c: any) => c.id);
          const clientsWithCards = await this.loyaltyCardRepo.findMany({
            where: { clientId: { in: clientIds }, deactivatedAt: null },
            select: { clientId: true },
            distinct: ['clientId'],
          });
          const engagedIds = new Set(clientsWithCards.map((c: { clientId: string }) => c.clientId));
          eligibleClients = clients.filter((c: any) => !engagedIds.has(c.id));
        }

        const buildEmail = {
          day1: buildWelcomeDay1Email,
          day3: buildWelcomeDay3Email,
          day7: buildWelcomeDay7Email,
        }[step];

        const subjectKey = ({ day1: 'welcome_day1', day3: 'welcome_day3', day7: 'welcome_day7' } as const)[step];

        for (const client of eligibleClients) {
          if (!client.email) continue;
          const campaignId = `welcome_${step}`;
          if (await this.alreadySent(client.id, campaignId)) continue;
          try {
            const lang: Lang = pickLang(client.language);
            const html = buildEmail(client.prenom ?? undefined, lang);
            await this.mailProvider.sendRaw(client.email, SUBJECTS[subjectKey][lang], html, this.buildUnsubscribeUrl(client.id));
            await this.markSent(client.id, campaignId);
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
  @Cron('30 14 * * *') // Daily at 14:30 UTC = 15:30 Maroc (après Dohr)
  async sendReengagementEmail(): Promise<void> {
    if (!isCronAllowed(this.logger, 'ClientEmailCampaign.sendReengagementEmail')) return;
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
          select: { id: true, email: true, prenom: true, language: true },
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

          // Pick the right window: 30d, 14d, 7d (only one email per client).
          // Tiers are checked from highest to lowest with `>=` so a client who
          // is inactive 40 days still receives the 30d win-back email (the
          // cron can miss a run, a user can be skipped by dedup, etc).
          // Dedup by `lastTx.createdAt` date prevents sending the same tier
          // twice for the same inactivity window.
          const daysSinceLastTx = Math.floor((now.getTime() - lastTx.createdAt.getTime()) / 86_400_000);
          const lang: Lang = pickLang(client.language);

          if (daysSinceLastTx >= 30) {
            html = buildReengagement30dEmail(client.prenom ?? undefined, lang);
            subject = SUBJECTS.reengage_30d[lang];
            resultKey = 'd30';
          } else if (daysSinceLastTx >= 14) {
            html = buildReengagement14dEmail(client.prenom ?? undefined, lang);
            subject = SUBJECTS.reengage_14d[lang];
            resultKey = 'd14';
          } else if (daysSinceLastTx >= 7) {
            html = buildReengagement7dEmail(client.prenom ?? undefined, lang);
            subject = SUBJECTS.reengage_7d[lang];
            resultKey = 'd7';
          }

          if (html && subject && resultKey) {
            const campaignId = `reengagement_${resultKey}_${lastTx.createdAt.toISOString().slice(0, 10)}`;
            if (await this.alreadySent(client.id, campaignId)) continue;
            try {
              await this.mailProvider.sendRaw(client.email, subject, html, this.buildUnsubscribeUrl(client.id));
              await this.markSent(client.id, campaignId);
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
  @Cron('0 15 */2 * *') // Every 2 days at 15:00 UTC = 16:00 Maroc
  async sendRewardReminderEmail(): Promise<void> {
    if (!isCronAllowed(this.logger, 'ClientEmailCampaign.sendRewardReminderEmail')) return;
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
        const merchantIds = [...new Set(cards.map((c: any) => c.merchantId))];
        const clientIds = [...new Set(cards.map((c: any) => c.clientId))];

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

        // Batch load merchant names
        const merchants = await this.merchantRepo.findMany({
          where: { id: { in: merchantIds } },
          select: { id: true, nom: true, loyaltyType: true },
        });
        const merchantMap = new Map<string, any>(merchants.map((m: any) => [m.id, m]));

        const clients = await this.clientRepo.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, email: true, prenom: true, language: true },
        });
        const clientMap = new Map<string, any>(clients.map((c: any) => [c.id, c]));

        for (const card of cards) {
          if (notifiedClients.has(card.clientId)) continue;
          const client = clientMap.get(card.clientId);
          if (!client?.email) continue;

          const cheapest = rewardsByMerchant.get(card.merchantId);
          if (!cheapest) continue;

          const merchant = merchantMap.get(card.merchantId);
          const merchantName = merchant?.nom || 'votre commerce';
          const isStamps = merchant?.loyaltyType === 'STAMPS';
          const points = card.points || 0;
          const lang: Lang = pickLang(client.language);

          try {
            if (points >= cheapest.cout) {
              const campaignId = `reward_available_${card.merchantId}_${new Date().toISOString().slice(0, 10)}`;
              if (await this.alreadySent(card.clientId, campaignId)) {
                notifiedClients.add(card.clientId);
                continue;
              }
              const html = buildRewardAvailableEmail(
                client.prenom ?? undefined,
                merchantName,
                cheapest.titre,
                points,
                card.merchantId,
                lang,
              );
              await this.mailProvider.sendRaw(client.email, SUBJECTS.reward_available[lang](merchantName), html, this.buildUnsubscribeUrl(card.clientId));
              await this.markSent(card.clientId, campaignId);
              availableCount++;
              notifiedClients.add(card.clientId);
            } else if (points >= cheapest.cout * 0.8) {
              const remaining = cheapest.cout - points;
              const campaignId = `reward_almost_${card.merchantId}_${new Date().toISOString().slice(0, 10)}`;
              if (await this.alreadySent(card.clientId, campaignId)) {
                notifiedClients.add(card.clientId);
                continue;
              }
              const html = buildAlmostThereEmail(
                client.prenom ?? undefined,
                merchantName,
                remaining,
                isStamps,
                card.merchantId,
                lang,
              );
              await this.mailProvider.sendRaw(client.email, SUBJECTS.reward_almost[lang](remaining), html, this.buildUnsubscribeUrl(card.clientId));
              await this.markSent(card.clientId, campaignId);
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
  @Cron('30 10 * * 0') // Sunday at 10:30 UTC = 11:30 Maroc
  async sendWeeklyDigestEmail(): Promise<void> {
    if (!isCronAllowed(this.logger, 'ClientEmailCampaign.sendWeeklyDigestEmail')) return;
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
        select: { id: true, email: true, prenom: true, language: true },
      });

      for (const client of clients) {
        if (!client.email) continue;
        const stats = clientStats.get(client.id);
        if (!stats) continue;
        // One digest per ISO-week
        const isoWeek = new Date().toISOString().slice(0, 10);
        const campaignId = `weekly_digest_${isoWeek}`;
        if (await this.alreadySent(client.id, campaignId)) continue;

        try {
          const lang: Lang = pickLang(client.language);
          const html = buildWeeklyDigestEmail(
            client.prenom ?? undefined,
            stats.totalPoints,
            stats.merchants.size,
            lang,
          );
          await this.mailProvider.sendRaw(
            client.email,
            SUBJECTS.weekly_digest[lang](stats.totalPoints, stats.merchants.size),
            html,
            this.buildUnsubscribeUrl(client.id),
          );
          await this.markSent(client.id, campaignId);
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
  @Cron('30 14 * * 3') // Wednesday at 14:30 UTC = 15:30 Maroc
  async sendFeatureHighlightEmail(): Promise<void> {
    if (!isCronAllowed(this.logger, 'ClientEmailCampaign.sendFeatureHighlightEmail')) return;
    this.logger.log('Starting feature highlight emails');

    try {
      const weekNumber = weekIndexSinceReference();
      const features = [buildFeatureStampsEmail, buildFeatureQREmail] as const;
      const buildEmail = features[weekNumber % features.length];
      const subjectKey: 'feature_stamps' | 'feature_qr' = weekNumber % 2 === 0 ? 'feature_stamps' : 'feature_qr';

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
          select: { id: true, email: true, prenom: true, language: true },
          take: ClientEmailCampaignService.BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        if (clients.length === 0) break;

        for (const client of clients) {
          if (!client.email) continue;
          const campaignId = `feature_highlight_w${weekNumber}`;
          if (await this.alreadySent(client.id, campaignId)) continue;
          try {
            const lang: Lang = pickLang(client.language);
            const html = buildEmail(client.prenom ?? undefined, lang);
            await this.mailProvider.sendRaw(client.email, SUBJECTS[subjectKey][lang], html, this.buildUnsubscribeUrl(client.id));
            await this.markSent(client.id, campaignId);
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
  // ⚠️ Vendredi 9:30 UTC = 10:30 Maroc — AVANT le Jumu'ah (11h30-14h)
  @Cron('30 9 * * 5')
  async sendReferralCampaignEmail(): Promise<void> {
    if (!isCronAllowed(this.logger, 'ClientEmailCampaign.sendReferralCampaignEmail')) return;
    this.logger.log('Starting referral campaign emails');

    try {
      // Only send every other week to avoid spam
      const weekNumber = weekIndexSinceReference();
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
          select: { id: true, email: true, prenom: true, language: true },
          take: ClientEmailCampaignService.BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        if (clients.length === 0) break;

        for (const client of clients) {
          if (!client.email) continue;
          const campaignId = `referral_w${weekNumber}`;
          if (await this.alreadySent(client.id, campaignId)) continue;
          try {
            const lang: Lang = pickLang(client.language);
            const html = buildReferralCampaignEmail(client.prenom ?? undefined, lang);
            await this.mailProvider.sendRaw(client.email, SUBJECTS.referral[lang], html, this.buildUnsubscribeUrl(client.id));
            await this.markSent(client.id, campaignId);
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
