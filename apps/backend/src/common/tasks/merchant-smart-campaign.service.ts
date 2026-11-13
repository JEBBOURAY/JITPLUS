import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  NOTIFICATION_REPOSITORY, type INotificationRepository,
  CAMPAIGN_SENT_TRACKER_REPOSITORY, type ICampaignSentTrackerRepository,
} from '../repositories';
import {
  MerchantNotifierService,
  NOTIFY_TARGET_SELECT,
  tally,
} from '../../merchant-inbox/merchant-notifier.service';
import { isEvenWeek, weekTag, mapLimit, MERCHANT_PUSH_CONCURRENCY, cronEnabledOnce } from './cron-utils';
import { TIP_ACTIONS, TIP_MESSAGES, type TipKey } from './merchant-notif-messages';
import { pickAppLang } from '../utils/app-lang';
import { MS_PER_DAY } from '../constants';

// ── Merchant performance digest messages ────────────────────────────────
const MESSAGES = {
  // Weekly performance summary
  weeklyPerf: {
    fr: {
      title: 'Votre semaine en chiffres',
      body: (scans: number, newClients: number) => {
        if (scans === 0) return 'Aucun scan cette semaine. Scannez chaque passage pour faire revenir vos clients.';
        const s = `${scans} scan${scans > 1 ? 's' : ''}`;
        const c = newClients === 0
          ? 'aucun nouveau client'
          : `${newClients} nouveau${newClients > 1 ? 'x' : ''} client${newClients > 1 ? 's' : ''}`;
        return `Cette semaine : ${s} et ${c}. Continuez sur cette lancée.`;
      },
    },
    en: {
      title: 'Your week in numbers',
      body: (scans: number, newClients: number) => {
        if (scans === 0) return 'No scans this week. Scan every visit to bring your customers back.';
        const c = newClients === 0 ? 'no new customers' : `${newClients} new customer${newClients === 1 ? '' : 's'}`;
        return `This week: ${scans} scan${scans === 1 ? '' : 's'} and ${c}. Keep it up.`;
      },
    },
    ar: {
      title: 'الأسبوع ديالك بالأرقام',
      body: (scans: number, newClients: number) => {
        if (scans === 0) return 'حتى سكان هاد الأسبوع. سكاني كل زيارة باش يرجعو الكليان ديالك.';
        return `هاد الأسبوع: ${scans} سكان و ${newClients} كليان جديد. كمّل هكا.`;
      },
    },
  },
  // Client milestone (10, 25, 50… clients)
  clientMilestone: {
    fr: {
      title: (count: number) => `Nouveau palier : ${count} clients`,
      body: (count: number) =>
        `Vous avez maintenant ${count} clients dans votre programme de fidélité. Bravo !`,
    },
    en: {
      title: (count: number) => `New milestone: ${count} customers`,
      body: (count: number) =>
        `You now have ${count} customers in your loyalty program. Well done!`,
    },
    ar: {
      title: (count: number) => `مرحلة جديدة: ${count} كليان`,
      body: (count: number) =>
        `دابا عندك ${count} كليان فبرنامج الولاء ديالك. برافو!`,
    },
  },
  // Upgrade nudge (FREE plan)
  upgradePush: {
    fr: {
      title: 'Passez à Premium',
      body: 'Emails, WhatsApp, statistiques détaillées et équipe : tous les outils pour faire grandir votre commerce.',
    },
    en: {
      title: 'Upgrade to Premium',
      body: 'Emails, WhatsApp, detailed stats and team access: every tool to grow your business.',
    },
    ar: {
      title: 'دوز لـ Premium',
      body: 'إيميلات، واتساب، إحصائيات مفصّلة والفريق: كاع الأدوات باش يكبر الكومرس ديالك.',
    },
  },
} as const;

const lang = pickAppLang;

/** What a merchant already uses, for picking the tip of the week. */
export interface FeatureUsage {
  isPremium: boolean;
  accountAgeDays: number;
  clients: number;
  hasCardDesign: boolean;
  luckyWheels: number;
  scratchCampaigns: number;
  deals: number;
  stampCodes: number;
  teamMembers: number;
  stores: number;
  sentPush: boolean;
  sentEmail: boolean;
  sentWhatsapp: boolean;
}

/**
 * Tips in priority order with the condition that makes them relevant: a tip
 * is only offered for a feature the merchant has not used yet, and
 * Premium-only features are never pitched to FREE merchants (the upgrade
 * nudge covers them).
 */
const TIP_RULES: ReadonlyArray<{ key: TipKey; applies: (u: FeatureUsage) => boolean }> = [
  { key: 'clientQr', applies: (u) => u.clients < 5 && u.accountAgeDays >= 7 },
  { key: 'clientPush', applies: (u) => !u.sentPush && u.clients > 0 },
  { key: 'cardDesign', applies: (u) => !u.hasCardDesign },
  { key: 'deals', applies: (u) => u.deals === 0 },
  { key: 'luckyWheel', applies: (u) => u.isPremium && u.luckyWheels === 0 },
  { key: 'scratch', applies: (u) => u.isPremium && u.scratchCampaigns === 0 },
  { key: 'team', applies: (u) => u.isPremium && u.teamMembers === 0 },
  { key: 'emailBlast', applies: (u) => u.isPremium && !u.sentEmail && u.clients > 0 },
  { key: 'whatsappBlast', applies: (u) => u.isPremium && !u.sentWhatsapp && u.clients > 0 },
  { key: 'stores', applies: (u) => u.isPremium && u.stores <= 1 },
  { key: 'stampCodes', applies: (u) => u.stampCodes === 0 },
];

const MILESTONES = [10, 25, 50, 100, 200, 500, 1000] as const;

/** Highest client milestone crossed this week, or null. */
export function crossedMilestone(previousTotal: number, total: number): number | null {
  const crossed = MILESTONES.filter((m) => previousTotal < m && total >= m);
  return crossed.length > 0 ? crossed[crossed.length - 1] : null;
}

export function candidateTips(u: FeatureUsage): TipKey[] {
  return TIP_RULES.filter((r) => r.applies(u)).map((r) => r.key);
}

/**
 * Merchant smart campaigns: automated push notifications to help merchants
 * grow their business on JIT+ Pro.
 *
 * Planning (UTC — Maroc = UTC+1, toute l'année) :
 * - **Lundi 09:00 UTC / 10:00 Maroc** : Bilan hebdomadaire (ACTIVITY, interrupteur « bilans »)
 * - **Jeudi 14:00 UTC / 15:00 Maroc** : Astuce ciblée sur une fonction pas encore utilisée (TIP)
 * - **Samedi 09:00 UTC / 10:00 Maroc, une semaine sur deux** : Relance Premium (plan FREE, OFFER)
 *
 * Les paliers clients sont vérifiés pendant le bilan hebdomadaire.
 * Vendredi volontairement exclu (prière du Jumu'ah ~12h-14h au Maroc).
 */
@Injectable()
export class MerchantSmartCampaignService {
  private readonly logger = new Logger(MerchantSmartCampaignService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private readonly loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(NOTIFICATION_REPOSITORY) private readonly notificationRepo: INotificationRepository,
    @Inject(CAMPAIGN_SENT_TRACKER_REPOSITORY) private readonly trackerRepo: ICampaignSentTrackerRepository,
    private readonly notifier: MerchantNotifierService,
  ) {}

  private activeMerchantsWhere() {
    return {
      isActive: true,
      deletedAt: null,
      pushToken: { not: null },
      onboardingCompleted: true,
      notifPush: true,
    };
  }

  // ── Monday: Weekly performance summary ──────────────────────────────────
  @Cron('0 9 * * 1')
  async sendWeeklyPerformance(): Promise<void> {
    if (!(await cronEnabledOnce(this.logger, 'MerchantSmartCampaign.sendWeeklyPerformance'))) return;
    this.logger.log('Starting merchant weekly performance digest');

    try {
      const weekAgo = new Date(Date.now() - 7 * MS_PER_DAY);
      const wtag = weekTag();

      const merchants = await this.merchantRepo.findMany({
        where: this.activeMerchantsWhere(),
        select: { ...NOTIFY_TARGET_SELECT, language: true },
      });
      if (merchants.length === 0) return;

      const merchantIds = merchants.map((m) => m.id);

      // N+1 killers: 3 aggregated queries instead of N*3 per-merchant counts.
      const scansAgg = await this.txRepo.groupBy({
        by: ['merchantId'],
        where: {
          merchantId: { in: merchantIds },
          type: 'EARN_STAMPS',
          status: 'ACTIVE',
          createdAt: { gte: weekAgo },
        },
        _count: { _all: true },
      });
      const scansMap = new Map<string, number>(
        scansAgg.map((r: { merchantId: string; _count: { _all: number } }) => [r.merchantId, r._count._all]),
      );

      const newCardsAgg = await this.loyaltyCardRepo.groupBy({
        by: ['merchantId'],
        where: {
          merchantId: { in: merchantIds },
          deactivatedAt: null,
          createdAt: { gte: weekAgo },
        },
        _count: { _all: true },
      });
      const newClientsMap = new Map<string, number>(
        newCardsAgg.map((r: { merchantId: string; _count: { _all: number } }) => [r.merchantId, r._count._all]),
      );

      const totalCardsAgg = await this.loyaltyCardRepo.groupBy({
        by: ['merchantId'],
        where: { merchantId: { in: merchantIds }, deactivatedAt: null },
        _count: { _all: true },
      });
      const totalsMap = new Map<string, number>(
        totalCardsAgg.map((r: { merchantId: string; _count: { _all: number } }) => [r.merchantId, r._count._all]),
      );

      // Merchants in parallel; the digest and the milestone of one merchant stay sequential.
      const perMerchant = await mapLimit(merchants, MERCHANT_PUSH_CONCURRENCY, async (merchant) => {
        const l = lang(merchant.language);
        const weekScans = scansMap.get(merchant.id) ?? 0;
        const newClients = newClientsMap.get(merchant.id) ?? 0;
        const totalClients = totalsMap.get(merchant.id) ?? 0;

        const msg = MESSAGES.weeklyPerf[l];
        const digest = await this.notifier.notify(merchant, {
          category: 'ACTIVITY',
          title: msg.title,
          body: msg.body(weekScans, newClients),
          action: 'open_dashboard',
          event: 'merchant_weekly_perf',
          campaignId: `merchant_weekly_perf_${wtag}`,
        });
        const milestone = crossedMilestone(totalClients - newClients, totalClients);
        if (!milestone || digest === 'stale_token') return [digest];

        const milestoneMsg = MESSAGES.clientMilestone[l];
        return [digest, await this.notifier.notify(merchant, {
          category: 'ACTIVITY',
          title: milestoneMsg.title(milestone),
          body: milestoneMsg.body(milestone),
          action: 'open_clients',
          event: 'merchant_milestone',
          campaignId: `merchant_milestone_${milestone}_${wtag}`,
        })];
      });
      const results = perMerchant.flat();

      this.logger.log(`Weekly perf (${merchants.length} eligible): ${tally(results)}`);
    } catch (error) {
      this.logger.error('Failed to send weekly performance', error);
    }
  }

  // ── Thursday: one targeted tip about a feature not used yet ─────────────
  // 14:00 UTC = 15:00 Maroc (début d'après-midi, avant rush de fin de journée).
  @Cron('0 14 * * 4')
  async sendFeatureTips(): Promise<void> {
    if (!(await cronEnabledOnce(this.logger, 'MerchantSmartCampaign.sendFeatureTips'))) return;
    this.logger.log('Starting merchant targeted feature tips');

    try {
      const merchants = await this.merchantRepo.findMany({
        where: this.activeMerchantsWhere(),
        select: {
          ...NOTIFY_TARGET_SELECT,
          language: true,
          plan: true,
          createdAt: true,
          themeColor: true,
          cardBackgroundColor: true,
          cardBackgroundUrl: true,
          _count: {
            select: {
              loyaltyCards: true,
              luckyWheelCampaigns: true,
              scratchCampaigns: true,
              deals: true,
              stampCodes: true,
              teamMembers: true,
              stores: true,
            },
          },
        },
      });
      if (merchants.length === 0) return;

      // Channels each merchant already used to message their customers.
      const sentAgg = await this.notificationRepo.groupBy({
        by: ['merchantId', 'channel'],
        where: { merchantId: { in: merchants.map((m) => m.id) } },
        _count: { _all: true },
      });
      const sentChannels = new Map<string, Set<string>>();
      for (const r of sentAgg as Array<{ merchantId: string | null; channel: string | null }>) {
        if (!r.merchantId || !r.channel) continue;
        if (!sentChannels.has(r.merchantId)) sentChannels.set(r.merchantId, new Set());
        sentChannels.get(r.merchantId)!.add(r.channel);
      }

      // Tips already delivered, in one query (each tip is offered once).
      const sentTips = await this.trackerRepo.findMany({
        where: { merchantId: { in: merchants.map((m) => m.id) }, campaignId: { startsWith: 'merchant_tip_' }, channel: 'PUSH' },
        select: { merchantId: true, campaignId: true },
      });
      const sentByMerchant = new Map<string, Set<string>>();
      for (const t of sentTips as Array<{ merchantId: string | null; campaignId: string }>) {
        if (!t.merchantId) continue;
        if (!sentByMerchant.has(t.merchantId)) sentByMerchant.set(t.merchantId, new Set());
        sentByMerchant.get(t.merchantId)!.add(t.campaignId);
      }

      const now = Date.now();
      const plans = merchants.flatMap((m) => {
        const channels = sentChannels.get(m.id) ?? new Set<string>();
        const usage: FeatureUsage = {
          isPremium: m.plan === 'PREMIUM',
          accountAgeDays: Math.floor((now - m.createdAt.getTime()) / MS_PER_DAY),
          clients: m._count.loyaltyCards,
          hasCardDesign: !!(m.themeColor || m.cardBackgroundColor || m.cardBackgroundUrl),
          luckyWheels: m._count.luckyWheelCampaigns,
          scratchCampaigns: m._count.scratchCampaigns,
          deals: m._count.deals,
          stampCodes: m._count.stampCodes,
          teamMembers: m._count.teamMembers,
          stores: m._count.stores,
          sentPush: channels.has('PUSH'),
          sentEmail: channels.has('EMAIL'),
          sentWhatsapp: channels.has('WHATSAPP'),
        };
        const sent = sentByMerchant.get(m.id);
        const key = candidateTips(usage).find((k) => !sent?.has(`merchant_tip_${k}`));
        return key ? [{ m, key }] : [];
      });

      const results = await mapLimit(plans, MERCHANT_PUSH_CONCURRENCY, ({ m, key }) => {
        const msg = TIP_MESSAGES[key][lang(m.language)];
        return this.notifier.notify(m, {
          category: 'TIP',
          title: msg.title,
          body: msg.body,
          action: TIP_ACTIONS[key],
          event: 'merchant_tip',
          data: { tip: key },
          campaignId: `merchant_tip_${key}`,
        });
      });

      this.logger.log(`Feature tips (${merchants.length} eligible): ${tally(results)}`);
    } catch (error) {
      this.logger.error('Failed to send feature tips', error);
    }
  }

  // ── Saturday, every other week: Upgrade nudge for free plan merchants ───
  // 09:00 UTC = 10:00 Maroc (samedi est un jour ouvrable pour la plupart des commerçants).
  @Cron('0 9 * * 6')
  async sendUpgradeNudge(): Promise<void> {
    if (!(await cronEnabledOnce(this.logger, 'MerchantSmartCampaign.sendUpgradeNudge'))) return;
    if (!isEvenWeek()) return;
    this.logger.log('Starting merchant upgrade nudge');

    try {
      const wtag = weekTag();
      // Only target FREE plan merchants who have been active for at least 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * MS_PER_DAY);

      const merchants = await this.merchantRepo.findMany({
        where: { ...this.activeMerchantsWhere(), plan: 'FREE', createdAt: { lte: sevenDaysAgo } },
        select: { ...NOTIFY_TARGET_SELECT, language: true },
      });

      const results = await mapLimit(merchants, MERCHANT_PUSH_CONCURRENCY, (merchant) => {
        const msg = MESSAGES.upgradePush[lang(merchant.language)];
        return this.notifier.notify(merchant, {
          category: 'OFFER',
          title: msg.title,
          body: msg.body,
          action: 'open_plan',
          event: 'merchant_upgrade_nudge',
          campaignId: `merchant_upgrade_nudge_${wtag}`,
        });
      });

      this.logger.log(`Upgrade nudge (${merchants.length} eligible): ${tally(results)}`);
    } catch (error) {
      this.logger.error('Failed to send upgrade nudge', error);
    }
  }
}
