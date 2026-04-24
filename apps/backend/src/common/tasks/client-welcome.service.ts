import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,  CAMPAIGN_SENT_TRACKER_REPOSITORY, type ICampaignSentTrackerRepository,} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';
import { isCronAllowed } from './cron-utils';

// ── Welcome Series: 4-step onboarding over first 7 days ─────────────────────
// Day 0 (signup): handled by auth controller (immediate welcome push)
// Day 1: Discover nearby merchants
// Day 3: Earn your first points
// Day 7: Referral program

const MESSAGES = {
  day1: {
    fr: {
      title: '🏪 Découvrez les commerces autour de vous',
      body: 'Des dizaines de commerces vous attendent sur JIT+. Explorez et commencez à cumuler des points de fidélité !',
    },
    en: {
      title: '🏪 Discover nearby businesses',
      body: 'Dozens of businesses are waiting for you on JIT+. Explore and start earning loyalty points!',
    },
    ar: {
      title: '🏪 اكتشف المحلات اللي قريبين منك',
      body: 'عشرات المحلات كيتسناوك فـ JIT+. تصفح وبدا جمع نقاط الولاء!',
    },
  },
  day3: {
    fr: {
      title: '⭐ Gagnez vos premiers points !',
      body: 'Visitez un commerce partenaire et scannez votre QR code pour gagner vos premiers points. C\'est gratuit et rapide !',
    },
    en: {
      title: '⭐ Earn your first points!',
      body: 'Visit a partner business and scan your QR code to earn your first points. It\'s free and fast!',
    },
    ar: {
      title: '⭐ اربح أول النقط ديالك!',
      body: 'زور محل شريك وسكاني الـ QR code ديالك باش تربح النقاط الأولى. مجاني وسريع!',
    },
  },
  day7: {
    fr: {
      title: '🎁 Invitez vos amis, gagnez des récompenses',
      body: 'Partagez JIT+ avec vos amis et gagnez des bonus à chaque inscription. Plus on est de fous, plus on gagne !',
    },
    en: {
      title: '🎁 Invite friends, earn rewards',
      body: 'Share JIT+ with your friends and earn bonuses for every signup. The more the merrier!',
    },
    ar: {
      title: '🎁 عيّط لصحابك واربح المكافآت',
      body: 'بارطاجي JIT+ مع صحابك واربح بونوص على كل واحد يتسجل. كل ما كانوا كثر كل ما ربحتي!',
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
 * Welcome series: automated push notifications for new JIT+ clients.
 *
 * Targets clients who signed up 1, 3, or 7 days ago and have NOT
 * yet earned any loyalty points (haven't engaged yet).
 *
 * Runs daily at 09:00 AM UTC.
 */
@Injectable()
export class ClientWelcomeService {
  private readonly logger = new Logger(ClientWelcomeService.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private readonly loyaltyCardRepo: ILoyaltyCardRepository,
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

  @Cron('0 9 * * *') // Daily at 09:00 UTC = 10:00 Maroc
  async sendWelcomeSeries(): Promise<void> {
    if (!isCronAllowed(this.logger, 'ClientWelcome.sendWelcomeSeries')) return;
    this.logger.log('Starting client welcome series');

    try {
      const now = new Date();
      const results = { day1: 0, day3: 0, day7: 0 };
      const staleTokens: string[] = [];

      // Process each welcome step
      for (const [step, daysAgo] of [['day1', 1], ['day3', 3], ['day7', 7]] as const) {
        const dateStart = new Date(now);
        dateStart.setDate(dateStart.getDate() - daysAgo);
        dateStart.setHours(0, 0, 0, 0);

        const dateEnd = new Date(dateStart);
        dateEnd.setHours(23, 59, 59, 999);

        // Find clients who signed up on this exact day
        const clients = await this.clientRepo.findMany({
          where: {
            createdAt: { gte: dateStart, lte: dateEnd },
            deletedAt: null,
            notifPush: true,
            pushToken: { not: null },
          },
          select: { id: true, pushToken: true, language: true },
        });

        if (clients.length === 0) continue;

        // For day3 and day7, skip clients who already have loyalty cards (already engaged)
        let eligibleClients = clients;
        if (step === 'day3' || step === 'day7') {
          const clientIds = clients.map((c: any) => c.id);
          const clientsWithCards = await this.loyaltyCardRepo.findMany({
            where: { clientId: { in: clientIds }, deactivatedAt: null },
            select: { clientId: true },
            distinct: ['clientId'],
          });
          const engagedIds = new Set(clientsWithCards.map((c: { clientId: string }) => c.clientId));

          if (step === 'day3') {
            // Day 3: target clients who have NOT yet been scanned
            eligibleClients = clients.filter((c: any) => !engagedIds.has(c.id));
          } else {
            // Day 7: all clients get the referral message
            eligibleClients = clients;
          }
        }

        if (eligibleClients.length === 0) continue;

        // Dedup: filter out clients who already received this welcome step
        const campaignId = `welcome_push_${step}`;
        const freshClients: typeof eligibleClients = [];
        for (const c of eligibleClients) {
          if (await this.alreadySent(c.id, campaignId)) continue;
          freshClients.push(c);
        }
        if (freshClients.length === 0) continue;

        // Group by language for efficient sending
        const byLang = new Map<Lang, string[]>();
        for (const c of freshClients) {
          const l = lang(c.language);
          if (!byLang.has(l)) byLang.set(l, []);
          byLang.get(l)!.push(c.pushToken!);
        }

        const actionMap: Record<string, string> = {
          day1: 'open_explore',
          day3: 'open_scan',
          day7: 'open_referral',
        };

        for (const [l, tokens] of byLang) {
          const msg = getMsg(step, l);
          try {
            const result = await this.pushProvider.sendMulticast(
              tokens,
              msg.title,
              msg.body,
              undefined,
              { event: 'welcome_series', action: actionMap[step] },
            );
            if (result?.invalidTokens?.length) {
              staleTokens.push(...result.invalidTokens);
            }
          } catch (e) {
            this.logger.warn(`Welcome multicast failed (${step}, ${l}): ${e}`);
          }
        }

        for (const c of freshClients) {
          await this.markSent(c.id, campaignId);
        }
        results[step] = freshClients.length;
      }

      // Clean stale tokens captured during multicast sends.
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

      this.logger.log(
        `Welcome series sent: day1=${results.day1}, day3=${results.day3}, day7=${results.day7}`,
      );
    } catch (error) {
      this.logger.error('Failed to send welcome series', error);
    }
  }
}
