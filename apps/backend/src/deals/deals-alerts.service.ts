import { randomUUID } from 'crypto';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { MerchantCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IPushProvider, PUSH_PROVIDER } from '../common/interfaces';
import { dayTag, isCronAllowed, weekTag } from '../common/tasks/cron-utils';
import { MOROCCO_TZ } from '../common/utils/morocco-time';
import { errMsg } from '../common/utils';
import {
  DEAL_ALERT_FRESH_DAYS,
  DEAL_DIGEST_AUDIENCE,
  DEAL_DIGEST_BATCH,
  DEAL_DIGEST_MAX_DEALS,
  DEAL_ONLINE_ALERTS_PER_WEEK,
} from './deal-limits';
import { liveDealWhere } from './deal-rules';
import { MOROCCO_CITY_KEYS } from './morocco-cities';
import {
  dealsForClient,
  digestGroupKey,
  digestMessage,
  groupByCity,
  pickFeaturedOnline,
  type DigestDeal,
} from './deal-digest';
import type { DealAlertsDto } from './dto';

export interface DealAlertPreferences {
  enabled: boolean;
  cityKey: string | null;
  categories: string[];
  online: boolean;
}

interface Recipient {
  id: string;
  token: string;
  lang: string;
  deals: DigestDeal[];
}

/** One in-app entry per distinct message, shared by its recipients across batches. */
type DigestNotifications = Map<string, string>;

const PREFS_SELECT = {
  dealAlertsEnabled: true,
  dealAlertCityKey: true,
  dealAlertCategories: true,
  dealOnlineAlerts: true,
} as const;

const pushable = { deletedAt: null, notifPush: true, pushToken: { not: null } } as const;

/**
 * Deal alerts: client preferences and the daily digest (one push a day at most).
 * Clients are claimed through CampaignSentTracker rows inserted with
 * ON CONFLICT DO NOTHING, so concurrent instances never push the same client twice.
 */
@Injectable()
export class DealsAlertsService {
  private readonly logger = new Logger(DealsAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly push: IPushProvider,
  ) {}

  // ── Preferences ────────────────────────────────────────────

  async getPreferences(clientId: string): Promise<DealAlertPreferences> {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, deletedAt: null }, select: PREFS_SELECT });
    if (!client) throw new NotFoundException('Client non trouvé');
    return toPreferences(client);
  }

  async updatePreferences(clientId: string, dto: DealAlertsDto): Promise<DealAlertPreferences> {
    const current = await this.prisma.client.findFirst({ where: { id: clientId, deletedAt: null }, select: PREFS_SELECT });
    if (!current) throw new NotFoundException('Client non trouvé');

    if (dto.cityKey != null && !MOROCCO_CITY_KEYS.has(dto.cityKey)) {
      throw new BadRequestException('Ville inconnue');
    }
    const cityKey = dto.cityKey !== undefined ? dto.cityKey : current.dealAlertCityKey;
    const enabled = dto.enabled ?? current.dealAlertsEnabled;
    if (enabled && !cityKey) {
      throw new BadRequestException({ message: 'Choisissez une ville pour activer les alertes', code: 'DEAL_ALERT_NEEDS_CITY' });
    }
    const updated = await this.prisma.client.update({
      where: { id: clientId },
      data: {
        dealAlertsEnabled: enabled,
        dealAlertCityKey: cityKey,
        ...(dto.categories ? { dealAlertCategories: [...new Set(dto.categories)] as MerchantCategory[] } : {}),
        ...(dto.online !== undefined ? { dealOnlineAlerts: dto.online } : {}),
      },
      select: PREFS_SELECT,
    });
    return toPreferences(updated);
  }

  // ── Daily digest ───────────────────────────────────────────

  @Cron('0 12 * * 0-4,6', { name: 'deals-digest', timeZone: MOROCCO_TZ })
  async dailyDigest() {
    if (!isCronAllowed(this.logger, 'DealsAlerts.dailyDigest')) return;
    await this.safeRun();
  }

  /** On Fridays 12:00 falls in the Jumu'ah quiet hours (11:30-14:00). */
  @Cron('0 14 * * 5', { name: 'deals-digest-friday', timeZone: MOROCCO_TZ })
  async fridayDigest() {
    if (!isCronAllowed(this.logger, 'DealsAlerts.fridayDigest')) return;
    await this.safeRun();
  }

  private async safeRun() {
    try {
      const { city, online } = await this.runDigest();
      if (city + online > 0) this.logger.log(`[deals:digest] ${city} city push(es), ${online} online push(es)`);
    } catch (err) {
      this.logger.error(`[deals:digest] failed: ${errMsg(err)}`);
    }
  }

  async runDigest(now: Date = new Date()): Promise<{ city: number; online: number }> {
    const day = dayTag(now);
    const week = weekTag(now);
    const daily = `deals_digest_${day}`;

    const rows = await this.prisma.deal.findMany({
      where: {
        ...liveDealWhere(now),
        alertSentAt: null,
        reportCount: 0,
        startsAt: { lte: now, gte: new Date(now.getTime() - DEAL_ALERT_FRESH_DAYS * 86_400_000) },
      },
      select: {
        id: true,
        merchantId: true,
        scope: true,
        title: true,
        cityKeys: true,
        percentOff: true,
        startsAt: true,
        merchant: { select: { nom: true, categorie: true } },
      },
      orderBy: { startsAt: 'desc' },
      take: DEAL_DIGEST_MAX_DEALS,
    });
    if (rows.length === 0) return { city: 0, online: 0 };

    const deals: DigestDeal[] = rows.map((r) => ({
      id: r.id,
      merchantId: r.merchantId,
      merchantName: r.merchant.nom,
      category: r.merchant.categorie,
      scope: r.scope,
      title: r.title,
      cityKeys: r.cityKeys,
      percentOff: r.percentOff,
      startsAt: r.startsAt,
    }));
    const local = deals.filter((d) => d.scope === 'LOCAL');
    const online = await this.featuredOnline(deals, week, now);
    const notifications: DigestNotifications = new Map();

    let city = 0;
    for (const [cityKey, cityDeals] of groupByCity(local)) {
      city += await this.sendCity(cityKey, cityDeals, online, daily, notifications);
    }
    const onlineSent = online ? await this.sendOnline(online, daily, week, day, notifications) : 0;

    // Local deals are announced once, even where nobody subscribed, so they never come back as "new".
    if (local.length > 0) {
      await this.prisma.deal.updateMany({ where: { id: { in: local.map((d) => d.id) }, alertSentAt: null }, data: { alertSentAt: now } });
    }
    if (online && city + onlineSent > 0) {
      await this.prisma.deal.updateMany({ where: { id: online.id, alertSentAt: null }, data: { alertSentAt: now } });
      await this.prisma.$executeRaw`
        INSERT INTO campaign_sent_trackers (id, merchant_id, campaign_id, channel, sent_at)
        VALUES (${randomUUID()}, ${online.merchantId}, ${onlineMerchantCampaign(week)}, 'PUSH', NOW())
        ON CONFLICT DO NOTHING`;
    }
    return { city, online: onlineSent };
  }

  /** A merchant gets at most one ONLINE deal in the alerts per week. */
  private async featuredOnline(deals: DigestDeal[], week: string, now: Date): Promise<DigestDeal | null> {
    const merchantIds = [...new Set(deals.filter((d) => d.scope === 'ONLINE').map((d) => d.merchantId))];
    if (merchantIds.length === 0) return null;
    const featured = await this.prisma.campaignSentTracker.findMany({
      where: {
        merchantId: { in: merchantIds },
        campaignId: onlineMerchantCampaign(week),
        channel: 'PUSH',
        // A row written by a concurrent run of today must not change the pick.
        sentAt: { lt: new Date(now.getTime() - 3_600_000) },
      },
      select: { merchantId: true },
    });
    return pickFeaturedOnline(deals, new Set(featured.map((f) => f.merchantId!)));
  }

  private async sendCity(
    cityKey: string,
    cityDeals: DigestDeal[],
    online: DigestDeal | null,
    daily: string,
    notifications: DigestNotifications,
  ): Promise<number> {
    const merchantIds = [...new Set([...cityDeals.map((d) => d.merchantId), ...(online ? [online.merchantId] : [])])];
    let sent = 0;
    let cursor: string | undefined;
    for (;;) {
      const clients = await this.prisma.client.findMany({
        where: { ...pushable, dealAlertsEnabled: true, dealAlertCityKey: cityKey },
        select: {
          id: true,
          pushToken: true,
          language: true,
          dealAlertCategories: true,
          dealOnlineAlerts: true,
          merchantBlocks: { where: { merchantId: { in: merchantIds } }, select: { merchantId: true } },
        },
        orderBy: { id: 'asc' },
        take: DEAL_DIGEST_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (clients.length === 0) break;
      cursor = clients[clients.length - 1].id;

      const recipients: Recipient[] = [];
      for (const c of clients) {
        if (!c.pushToken) continue;
        const blocked = new Set(c.merchantBlocks.map((b) => b.merchantId));
        const mine = dealsForClient(cityDeals, c.dealAlertCategories, blocked);
        if (mine.length === 0) continue;
        const withOnline = online && c.dealOnlineAlerts && !blocked.has(online.merchantId) ? [...mine, online] : mine;
        recipients.push({ id: c.id, token: c.pushToken, lang: c.language, deals: withOnline });
      }
      const claimed = await this.claim(recipients.map((r) => r.id), daily);
      sent += await this.deliver(recipients.filter((r) => claimed.has(r.id)), cityKey, notifications);
      if (clients.length < DEAL_DIGEST_BATCH) break;
    }
    return sent;
  }

  /** ONLINE-only digest for everyone else, at most DEAL_ONLINE_ALERTS_PER_WEEK times a week. */
  private async sendOnline(
    online: DigestDeal,
    daily: string,
    week: string,
    day: string,
    notifications: DigestNotifications,
  ): Promise<number> {
    const weeklyPrefix = `deals_online_${week}_`;
    let sent = 0;
    let cursor: string | undefined;
    for (;;) {
      const clients = await this.prisma.client.findMany({
        where: { ...pushable, dealOnlineAlerts: true, merchantBlocks: { none: { merchantId: online.merchantId } } },
        select: { id: true, pushToken: true, language: true },
        orderBy: { id: 'asc' },
        take: DEAL_DIGEST_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (clients.length === 0) break;
      cursor = clients[clients.length - 1].id;

      const counts = await this.prisma.campaignSentTracker.groupBy({
        by: ['clientId'],
        where: { clientId: { in: clients.map((c) => c.id) }, campaignId: { startsWith: weeklyPrefix }, channel: 'PUSH' },
        _count: { _all: true },
      });
      const capped = new Set(counts.filter((c) => c._count._all >= DEAL_ONLINE_ALERTS_PER_WEEK).map((c) => c.clientId));
      const eligible = clients.filter((c) => c.pushToken && !capped.has(c.id));
      const claimed = await this.claim(eligible.map((c) => c.id), daily);
      const winners = eligible.filter((c) => claimed.has(c.id));
      await this.claim(winners.map((c) => c.id), `${weeklyPrefix}${day}`);
      sent += await this.deliver(
        winners.map((c) => ({ id: c.id, token: c.pushToken!, lang: c.language, deals: [online] })),
        null,
        notifications,
      );
      if (clients.length < DEAL_DIGEST_BATCH) break;
    }
    return sent;
  }

  /** Inserts the tracker rows and returns the clients this run owns (rows it actually inserted). */
  private async claim(clientIds: string[], campaignId: string): Promise<Set<string>> {
    if (clientIds.length === 0) return new Set();
    const ids = clientIds.map(() => randomUUID());
    const rows = await this.prisma.$queryRaw<{ client_id: string }[]>`
      INSERT INTO campaign_sent_trackers (id, client_id, campaign_id, channel, sent_at)
      SELECT t.id, t.client_id, ${campaignId}, 'PUSH', NOW()
      FROM unnest(${ids}::text[], ${clientIds}::text[]) AS t(id, client_id)
      ON CONFLICT DO NOTHING
      RETURNING client_id`;
    return new Set(rows.map((r) => r.client_id));
  }

  private async deliver(recipients: Recipient[], cityKey: string | null, notifications: DigestNotifications): Promise<number> {
    const groups = new Map<string, Recipient[]>();
    for (const r of recipients) {
      const key = digestGroupKey(r.lang, r.deals, cityKey);
      const members = groups.get(key);
      if (members) members.push(r);
      else groups.set(key, [r]);
    }

    const staleTokens: string[] = [];
    for (const [key, members] of groups) {
      const msg = digestMessage(members[0].lang, members[0].deals, cityKey);
      let notificationId = notifications.get(key);
      if (!notificationId) {
        const created = await this.prisma.notification.create({
          data: { title: msg.title, body: msg.body, channel: 'PUSH', audience: DEAL_DIGEST_AUDIENCE, isBroadcast: false },
          select: { id: true },
        });
        notificationId = created.id;
        notifications.set(key, notificationId);
      }
      await this.prisma.clientNotificationStatus.createMany({
        data: members.map((m) => ({ clientId: m.id, notificationId: notificationId! })),
        skipDuplicates: true,
      });

      let successCount = 0;
      let failureCount = 0;
      try {
        const result = await this.push.sendMulticast(members.map((m) => m.token), msg.title, msg.body, undefined, msg.data);
        successCount = result.successCount;
        failureCount = result.failureCount;
        staleTokens.push(...result.invalidTokens);
      } catch (err) {
        failureCount = members.length;
        this.logger.warn(`[deals:digest] push failed: ${errMsg(err)}`);
      }
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          recipientCount: { increment: members.length },
          successCount: { increment: successCount },
          failureCount: { increment: failureCount },
        },
      });
    }
    if (staleTokens.length > 0) {
      await this.prisma.client.updateMany({ where: { pushToken: { in: staleTokens } }, data: { pushToken: null } });
    }
    return recipients.length;
  }
}

function onlineMerchantCampaign(week: string): string {
  return `deals_online_merchant_${week}`;
}

function toPreferences(c: {
  dealAlertsEnabled: boolean;
  dealAlertCityKey: string | null;
  dealAlertCategories: string[];
  dealOnlineAlerts: boolean;
}): DealAlertPreferences {
  return {
    enabled: c.dealAlertsEnabled,
    cityKey: c.dealAlertCityKey,
    categories: c.dealAlertCategories,
    online: c.dealOnlineAlerts,
  };
}
