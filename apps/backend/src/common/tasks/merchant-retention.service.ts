import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  DEVICE_SESSION_REPOSITORY, type IDeviceSessionRepository,
  LUCKY_WHEEL_CAMPAIGN_REPOSITORY, type ILuckyWheelCampaignRepository,
  DEAL_REPOSITORY, type IDealRepository,
} from '../repositories';
import {
  MerchantNotifierService,
  NOTIFY_TARGET_SELECT,
  tally,
  type MerchantNotification,
  type NotifyTarget,
} from '../../merchant-inbox/merchant-notifier.service';
import { reachedStage, mapLimit, MERCHANT_PUSH_CONCURRENCY, cronEnabledOnce } from './cron-utils';
import { NOTIF_MESSAGES, NOTIF_TEMPLATES, lang } from './merchant-notif-messages';
import { MS_PER_DAY } from '../constants';

const HOUR_MS = 3_600_000;

/** Hours after sign-up at which an unfinished onboarding is reminded. */
export const ONBOARDING_STAGES_H = [2, 24, 72] as const;
/** Days without opening the app at which the merchant is reminded. */
export const APP_IDLE_STAGES_D = [3, 7, 14, 30] as const;
/** Days after sign-up at which an unverified email is reminded. */
const EMAIL_UNVERIFIED_STAGES_D = [1, 7] as const;

type Plan = { target: NotifyTarget; n: MerchantNotification };

const ONBOARDING_KEY = { 2: 'onboarding2h', 24: 'onboarding1d', 72: 'onboarding3d' } as const;
const APP_IDLE_KEY = { 3: 'appIdle3', 7: 'appIdle7', 14: 'appIdle14', 30: 'appIdle30' } as const;

/**
 * Retention and status pushes of JitPlus Pro:
 * - hourly: unfinished onboarding (2 h, 1 day, 3 days after sign-up)
 * - daily: app not opened (3, 7, 14, 30 days), unverified email (1 and 7 days),
 *   lucky wheel campaign ended, deal ending tomorrow.
 *
 * Every send goes through MerchantNotifierService (preferences, quiet hours,
 * frequency cap, dedup). Reminder series stop by themselves: the condition
 * (onboarding not done, app not opened…) is re-evaluated on every run.
 */
@Injectable()
export class MerchantRetentionService {
  private readonly logger = new Logger(MerchantRetentionService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(DEVICE_SESSION_REPOSITORY) private readonly sessionRepo: IDeviceSessionRepository,
    @Inject(LUCKY_WHEEL_CAMPAIGN_REPOSITORY) private readonly wheelCampaignRepo: ILuckyWheelCampaignRepository,
    @Inject(DEAL_REPOSITORY) private readonly dealRepo: IDealRepository,
    private readonly notifier: MerchantNotifierService,
  ) {}

  /** Sends the planned notifications, merchants in parallel. */
  private send(plans: Plan[], now: Date) {
    return mapLimit(plans, MERCHANT_PUSH_CONCURRENCY, ({ target, n }) => this.notifier.notify(target, n, now));
  }

  // Every hour at :20 — quiet hours are enforced by the notifier, a blocked
  // reminder is retried on the next run.
  @Cron('20 * * * *')
  async sendOnboardingReminders(now: Date = new Date()): Promise<void> {
    if (!(await cronEnabledOnce(this.logger, 'MerchantRetention.sendOnboardingReminders'))) return;
    try {
      const merchants = await this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          onboardingCompleted: false,
          pushToken: { not: null },
          createdAt: { lte: new Date(now.getTime() - ONBOARDING_STAGES_H[0] * HOUR_MS), gte: new Date(now.getTime() - 7 * MS_PER_DAY) },
        },
        select: { ...NOTIFY_TARGET_SELECT, language: true, createdAt: true },
      });
      const plans: Plan[] = [];
      for (const m of merchants) {
        const stage = reachedStage(ONBOARDING_STAGES_H, Math.floor((now.getTime() - m.createdAt.getTime()) / HOUR_MS));
        if (!stage) continue;
        const msg = NOTIF_MESSAGES[ONBOARDING_KEY[stage]][lang(m.language)];
        plans.push({ target: m, n: {
          category: 'REMINDER',
          title: msg.title,
          body: msg.body,
          action: stage === 72 ? 'open_support' : 'open_dashboard',
          event: 'merchant_onboarding',
          campaignId: `merchant_onboarding_${stage}h`,
        } });
      }
      const results = await this.send(plans, now);
      if (results.length) this.logger.log(`Onboarding reminders: ${tally(results)}`);
    } catch (err) {
      this.logger.error('Onboarding reminders failed', err);
    }
  }

  // 10:00 UTC = 11:00 Maroc, after the 08:00 scan reminders and 09:00 slots.
  @Cron('0 10 * * *')
  async runDaily(now: Date = new Date()): Promise<void> {
    if (!(await cronEnabledOnce(this.logger, 'MerchantRetention.runDaily'))) return;
    await this.sendAppIdleReminders(now);
    await this.sendEmailUnverifiedReminders(now);
    await this.sendLuckyWheelEnded(now);
    await this.sendDealsEndingTomorrow(now);
  }

  async sendAppIdleReminders(now: Date = new Date()): Promise<void> {
    try {
      const merchants = await this.merchantRepo.findMany({
        where: { isActive: true, deletedAt: null, onboardingCompleted: true, pushToken: { not: null }, notifPush: true },
        select: { ...NOTIFY_TARGET_SELECT, language: true },
      });
      if (merchants.length === 0) return;

      // Last API activity of any device of the merchant (owner and team).
      const lastActive = await this.sessionRepo.groupBy({
        by: ['merchantId'],
        where: { merchantId: { in: merchants.map((m) => m.id) } },
        _max: { lastActiveAt: true },
      });
      const lastMap = new Map<string, Date | null>(
        lastActive.map((r: { merchantId: string; _max: { lastActiveAt: Date | null } }) => [r.merchantId, r._max.lastActiveAt]),
      );

      const plans: Plan[] = [];
      for (const m of merchants) {
        const last = lastMap.get(m.id);
        if (!last) continue; // logged out everywhere: nothing to bring back to
        const stage = reachedStage(APP_IDLE_STAGES_D, Math.floor((now.getTime() - last.getTime()) / MS_PER_DAY));
        if (!stage) continue;
        const msg = NOTIF_MESSAGES[APP_IDLE_KEY[stage]][lang(m.language)];
        plans.push({ target: m, n: {
          category: 'REMINDER',
          title: msg.title,
          body: msg.body,
          action: stage === 14 ? 'open_support' : stage === 7 ? 'open_messages' : 'open_dashboard',
          event: 'merchant_app_idle',
          // The idle period start is part of the key: opening the app resets the series.
          campaignId: `merchant_app_idle_${stage}d_${last.toISOString().slice(0, 10)}`,
        } });
      }
      const results = await this.send(plans, now);
      if (results.length) this.logger.log(`App idle reminders: ${tally(results)}`);
    } catch (err) {
      this.logger.error('App idle reminders failed', err);
    }
  }

  async sendEmailUnverifiedReminders(now: Date = new Date()): Promise<void> {
    try {
      const merchants = await this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          emailVerified: false,
          createdAt: { lte: new Date(now.getTime() - MS_PER_DAY), gte: new Date(now.getTime() - 30 * MS_PER_DAY) },
        },
        select: { ...NOTIFY_TARGET_SELECT, language: true, createdAt: true },
      });
      const plans: Plan[] = [];
      for (const m of merchants) {
        const stage = reachedStage(EMAIL_UNVERIFIED_STAGES_D, Math.floor((now.getTime() - m.createdAt.getTime()) / MS_PER_DAY));
        if (!stage) continue;
        const msg = NOTIF_MESSAGES.emailUnverified[lang(m.language)];
        plans.push({ target: m, n: {
          category: 'STATUS',
          title: msg.title,
          body: msg.body,
          action: 'open_verify_email',
          event: 'email_unverified',
          campaignId: `merchant_email_unverified_${stage}d`,
        } });
      }
      const results = await this.send(plans, now);
      if (results.length) this.logger.log(`Email verification reminders: ${tally(results)}`);
    } catch (err) {
      this.logger.error('Email verification reminders failed', err);
    }
  }

  async sendLuckyWheelEnded(now: Date = new Date()): Promise<void> {
    try {
      const campaigns = await this.wheelCampaignRepo.findMany({
        where: {
          status: { in: ['ACTIVE', 'PAUSED', 'ENDED'] },
          endsAt: { lte: now, gt: new Date(now.getTime() - MS_PER_DAY) },
          merchant: { isActive: true, deletedAt: null },
        },
        select: {
          id: true,
          name: true,
          merchant: { select: { ...NOTIFY_TARGET_SELECT, language: true } },
        },
      });
      const plans: Plan[] = [];
      for (const c of campaigns) {
        const msg = NOTIF_TEMPLATES.luckyWheelEnded[lang(c.merchant.language)](c.name);
        plans.push({ target: c.merchant, n: {
          category: 'STATUS',
          title: msg.title,
          body: msg.body,
          action: 'open_lucky_wheel',
          event: 'lucky_wheel_ended',
          data: { campaignId: c.id },
          campaignId: `merchant_wheel_ended_${c.id}`,
        } });
      }
      const results = await this.send(plans, now);
      if (results.length) this.logger.log(`Lucky wheel ended: ${tally(results)}`);
    } catch (err) {
      this.logger.error('Lucky wheel ended notifications failed', err);
    }
  }

  async sendDealsEndingTomorrow(now: Date = new Date()): Promise<void> {
    try {
      const deals = await this.dealRepo.findMany({
        where: {
          status: 'ACTIVE',
          endsAt: { gt: new Date(now.getTime() + 12 * HOUR_MS), lte: new Date(now.getTime() + 36 * HOUR_MS) },
          // A deal published for a day or two does not need a warning.
          startsAt: { lte: new Date(now.getTime() - 2 * MS_PER_DAY) },
          merchant: { isActive: true, deletedAt: null },
        },
        select: {
          id: true,
          title: true,
          merchant: { select: { ...NOTIFY_TARGET_SELECT, language: true } },
        },
      });
      const plans: Plan[] = [];
      for (const d of deals) {
        const msg = NOTIF_TEMPLATES.dealEndsTomorrow[lang(d.merchant.language)](d.title);
        plans.push({ target: d.merchant, n: {
          category: 'STATUS',
          title: msg.title,
          body: msg.body,
          action: 'open_deals',
          event: 'deal_ending',
          data: { dealId: d.id },
          campaignId: `merchant_deal_ending_${d.id}`,
        } });
      }
      const results = await this.send(plans, now);
      if (results.length) this.logger.log(`Deals ending tomorrow: ${tally(results)}`);
    } catch (err) {
      this.logger.error('Deal ending notifications failed', err);
    }
  }
}
