import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';
import { cronAllowedOnce } from './cron-utils';
import { type ClientPush, CLIENT_CAMPAIGN_CHUNK, afterId, clearStaleClientTokens, deliverClientPushes } from './client-campaign';
import { type AppLang, pickAppLang } from '../utils/app-lang';

// ── Welcome Series: 4-step onboarding over first 7 days ─────────────────────
// Day 0 (signup): handled by auth controller (immediate welcome push)
// Day 1: Discover nearby merchants
// Day 3: Earn your first stamps
// Day 7: Referral program

const MESSAGES = {
  day1: {
    fr: {
      title: '🏪 Découvrez les commerces autour de vous',
      body: 'Des dizaines de commerces vous attendent sur JIT+. Explorez et commencez à cumuler des tampons de fidélité !',
    },
    en: {
      title: '🏪 Discover nearby businesses',
      body: 'Dozens of businesses are waiting for you on JIT+. Explore and start earning loyalty stamps!',
    },
    ar: {
      title: '🏪 اكتشف المحلات اللي قريبين منك',
      body: 'عشرات المحلات كيتسناوك فـ JIT+. تصفح وبدا جمع طوابع الولاء!',
    },
  },
  day3: {
    fr: {
      title: '⭐ Gagnez vos premiers tampons !',
      body: 'Visitez un commerce partenaire et scannez votre QR code pour gagner vos premiers tampons. C\'est gratuit et rapide !',
    },
    en: {
      title: '⭐ Earn your first stamps!',
      body: 'Visit a partner business and scan your QR code to earn your first stamps. It\'s free and fast!',
    },
    ar: {
      title: '⭐ اربح أول الطوابع ديالك!',
      body: 'زور محل شريك وسكاني الـ QR code ديالك باش تربح الطوابع الأولى. مجاني وسريع!',
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
type Lang = AppLang;
const lang = pickAppLang;

function getMsg(key: MsgKey, l: Lang): { title: string; body: string } {
  return MESSAGES[key][l];
}

const ACTIONS: Record<MsgKey, string> = {
  day1: 'open_explore',
  day3: 'open_scan',
  day7: 'open_referral',
};

/**
 * Welcome series: automated push notifications for new JIT+ clients.
 *
 * Targets clients who signed up 1, 3, or 7 days ago and have NOT
 * yet earned any loyalty stamps (haven't engaged yet).
 *
 * Runs daily at 09:00 AM UTC.
 */
@Injectable()
export class ClientWelcomeService {
  private readonly logger = new Logger(ClientWelcomeService.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
  ) {}

  @Cron('0 9 * * *') // Daily at 09:00 UTC = 10:00 Maroc
  async sendWelcomeSeries(): Promise<void> {
    if (!(await cronAllowedOnce(this.logger, 'ClientWelcome.sendWelcomeSeries'))) return;
    this.logger.log('Starting client welcome series');

    try {
      const now = new Date();
      const results = { day1: 0, day3: 0, day7: 0 };
      const staleTokens: string[] = [];
      const deps = { raw: this.rawQuery, push: this.pushProvider, logger: this.logger };

      // Process each welcome step
      for (const [step, daysAgo] of [['day1', 1], ['day3', 3], ['day7', 7]] as const) {
        const dateStart = new Date(now);
        dateStart.setDate(dateStart.getDate() - daysAgo);
        dateStart.setHours(0, 0, 0, 0);

        const dateEnd = new Date(dateStart);
        dateEnd.setHours(23, 59, 59, 999);

        const campaignId = `welcome_push_${step}`;
        const data = { event: 'welcome_series', action: ACTIONS[step] };

        // Clients who signed up on this exact day, read in id order page by page.
        let last: string | undefined;
        for (;;) {
          const clients: Array<{ id: string; pushToken: string | null; language: string | null }> = await this.clientRepo.findMany({
            where: {
              createdAt: { gte: dateStart, lte: dateEnd },
              deletedAt: null,
              notifPush: true,
              pushToken: { not: null },
              // Day 3: only clients who have NOT been scanned yet (no active card).
              ...(step === 'day3' ? { loyaltyCards: { none: { deactivatedAt: null } } } : {}),
              ...afterId(last),
            },
            select: { id: true, pushToken: true, language: true },
            orderBy: { id: 'asc' },
            take: CLIENT_CAMPAIGN_CHUNK,
          });
          if (clients.length === 0) break;
          last = clients[clients.length - 1].id;

          const items: ClientPush[] = clients
            .filter((c) => c.pushToken)
            .map((c) => {
              const msg = getMsg(step, lang(c.language));
              return { clientId: c.id, token: c.pushToken!, campaignId, title: msg.title, body: msg.body, data };
            });
          const r = await deliverClientPushes(deps, items);
          staleTokens.push(...r.staleTokens);
          results[step] += r.claimed.length;

          if (clients.length < CLIENT_CAMPAIGN_CHUNK) break;
        }
      }

      // Clean stale tokens captured during multicast sends.
      await clearStaleClientTokens(this.clientRepo, staleTokens, this.logger);

      this.logger.log(
        `Welcome series sent: day1=${results.day1}, day3=${results.day3}, day7=${results.day7}`,
      );
    } catch (error) {
      this.logger.error('Failed to send welcome series', error);
    }
  }
}
