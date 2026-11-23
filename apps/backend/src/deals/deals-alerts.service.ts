import { notificationLink } from '../notifications/notification-link';
import { randomUUID } from 'crypto';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { MerchantCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IPushProvider, PUSH_PROVIDER } from '../common/interfaces';
import { dayTag, weekTag, cronAllowedOnce } from '../common/tasks/cron-utils';
import { MOROCCO_TZ } from '../common/utils/morocco-time';
import { errMsg } from '../common/utils';
import {
  DEAL_ALERT_FRESH_DAYS,
  DEAL_DIGEST_AUDIENCE,
  DEAL_DIGEST_BATCH,
  DEAL_DIGEST_MAX_DEALS,
  DEAL_ONLINE_ALERTS_PER_WEEK,
  DEAL_SAVED_REMINDER_HOURS,
} from './deal-limits';
import { liveDealWhere } from './deal-rules';
import { MOROCCO_CITY_KEYS } from './morocco-cities';
import { dealCardholderTexts, dealSavedReminderTexts } from './deal-notif-i18n';
import {
  dealsForClient,
  digestGroupKey,
  digestMessage,
  groupByCity,
  pickFeaturedOnline,
  type DigestDeal,
  type DigestMessage,
} from './deal-digest';
import type { DealAlertsDto } from './dto';
import { MS_PER_DAY } from '../common/constants';

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
}

/** Recipients of each distinct message, keyed by what makes the message unique. */
type Outbox = Map<string, { msg: DigestMessage; members: Recipient[] }>;

function addToOutbox(outbox: Outbox, key: string, message: () => DigestMessage, member: Recipient) {
  const entry = outbox.get(key);
  if (entry) entry.members.push(member);
  else outbox.set(key, { msg: message(), members: [member] });
}

interface DigestRecipient extends Recipient {
  deals: DigestDeal[];
}

/** One in-app entry per distinct message, shared by its recipients across batches. */
type DigestNotifications = Map<string, string>;

/** A new or soon-ended deal announced on its own: the push opens it. */
interface AnnouncedDeal {
  id: string;
  title: string;
  merchantId: string;
  merchant: { nom: string };
}

const ANNOUNCED_SELECT = { id: true, title: true, merchantId: true, merchant: { select: { nom: true } } } as const;

const openDeal = (dealId: string) => ({ event: 'deals_digest', action: 'open_deal', dealId });
/** Tracker of "this cardholder was told about this deal". */
const cardDealCampaign = (dealId: string) => `deal_card_${dealId}`;

const PREFS_SELECT = {
  dealAlertsEnabled: true,
  dealAlertCityKey: true,
  dealAlertCategories: true,
  dealOnlineAlerts: true,
} as const;

const pushable = { deletedAt: null, notifPush: true, pushToken: { not: null } } as const;

/**
 * Deal alerts: client preferences, the daily push (the deals of the merchants
 * whose card the client holds, else the digest of their city: one a day at
 * most) and the reminder of saved deals. Clients are claimed through
 * CampaignSentTracker rows inserted with ON CONFLICT DO NOTHING, so concurrent
 * instances never push the same client twice.
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

  // ── Daily push ─────────────────────────────────────────────

  @Cron('0 12 * * 0-4,6', { name: 'deals-digest', timeZone: MOROCCO_TZ })
  async dailyDigest() {
    if (!(await cronAllowedOnce(this.logger, 'DealsAlerts.dailyDigest'))) return;
    await this.safeRun();
  }

  /** On Fridays 12:00 falls in the Jumu'ah quiet hours (11:30-14:00). */
  @Cron('0 14 * * 5', { name: 'deals-digest-friday', timeZone: MOROCCO_TZ })
  async fridayDigest() {
    if (!(await cronAllowedOnce(this.logger, 'DealsAlerts.fridayDigest'))) return;
    await this.safeRun();
  }

  /** Cardholders first: they take the client's daily push, the city digest then skips them. */
  private async safeRun() {
    try {
      const cardholders = await this.notifyCardholders();
      const { city, online } = await this.runDigest();
      if (cardholders + city + online > 0) {
        this.logger.log(`[deals:digest] ${cardholders} cardholder push(es), ${city} city push(es), ${online} online push(es)`);
      }
    } catch (err) {
      this.logger.error(`[deals:digest] failed: ${errMsg(err)}`);
    }
  }

  @Cron('0 18 * * *', { name: 'deals-saved-reminder', timeZone: MOROCCO_TZ })
  async savedReminder() {
    if (!(await cronAllowedOnce(this.logger, 'DealsAlerts.savedReminder'))) return;
    try {
      const sent = await this.remindSaved();
      if (sent > 0) this.logger.log(`[deals:saved] ${sent} reminder(s)`);
    } catch (err) {
      this.logger.error(`[deals:saved] failed: ${errMsg(err)}`);
    }
  }

  // ── Cardholders ────────────────────────────────────────────

  /**
   * New deals of a merchant go to the clients holding its loyalty card,
   * wherever they live and whatever their city alerts: one push per merchant.
   */
  async notifyCardholders(now: Date = new Date()): Promise<number> {
    const deals: AnnouncedDeal[] = await this.prisma.deal.findMany({
      where: {
        ...liveDealWhere(now),
        cardAlertSentAt: null,
        reportCount: 0,
        startsAt: { lte: now, gte: new Date(now.getTime() - DEAL_ALERT_FRESH_DAYS * MS_PER_DAY) },
      },
      select: ANNOUNCED_SELECT,
      orderBy: { startsAt: 'desc' },
      take: DEAL_DIGEST_MAX_DEALS,
    });
    if (deals.length === 0) return 0;

    const byMerchant = new Map<string, AnnouncedDeal[]>();
    for (const d of deals) byMerchant.set(d.merchantId, [...(byMerchant.get(d.merchantId) ?? []), d]);
    const daily = `deals_digest_${dayTag(now)}`;
    const notifications: DigestNotifications = new Map();
    let sent = 0;
    const done: string[] = [];
    for (const merchantDeals of byMerchant.values()) {
      const result = await this.sendCardholders(merchantDeals, daily, notifications);
      sent += result.sent;
      // A cardholder whose daily push went to another merchant hears about
      // these deals on a later run (while they are fresh), so keep them open.
      if (!result.deferred) done.push(...merchantDeals.map((d) => d.id));
    }

    if (done.length > 0) {
      await this.prisma.deal.updateMany({
        where: { id: { in: done }, cardAlertSentAt: null },
        data: { cardAlertSentAt: now },
      });
    }
    return sent;
  }

  /**
   * `deals`: the new deals of one merchant, most recent first. Each cardholder
   * is told once per deal (`deal_card_<id>` trackers), so deals kept open for
   * a client who missed them are not pushed again to those already told.
   */
  private async sendCardholders(
    deals: AnnouncedDeal[],
    daily: string,
    notifications: DigestNotifications,
  ): Promise<{ sent: number; deferred: boolean }> {
    const { merchantId } = deals[0];
    const dealKeys = deals.map((d) => cardDealCampaign(d.id));
    let sent = 0;
    let deferred = false;
    let cursor: string | undefined;
    for (;;) {
      const cards = await this.prisma.loyaltyCard.findMany({
        where: {
          merchantId,
          deactivatedAt: null,
          // A card typed by the merchant is not a consent to hear from them.
          consentPending: false,
          client: { ...pushable, merchantBlocks: { none: { merchantId } } },
        },
        select: { clientId: true, client: { select: { pushToken: true, language: true } } },
        orderBy: { clientId: 'asc' },
        take: DEAL_DIGEST_BATCH,
        ...(cursor ? { cursor: { clientId_merchantId: { clientId: cursor, merchantId } }, skip: 1 } : {}),
      });
      if (cards.length === 0) break;
      cursor = cards[cards.length - 1].clientId;

      const reachable = cards.filter((c) => c.client.pushToken);
      const told = reachable.length === 0 ? [] : await this.prisma.campaignSentTracker.findMany({
        where: { clientId: { in: reachable.map((c) => c.clientId) }, campaignId: { in: dealKeys }, channel: 'PUSH' },
        select: { clientId: true, campaignId: true },
      });
      const toldPairs = new Set(told.map((t) => `${t.clientId}|${t.campaignId}`));
      const pending = new Map<string, AnnouncedDeal[]>();
      for (const c of reachable) {
        const mine = deals.filter((d) => !toldPairs.has(`${c.clientId}|${cardDealCampaign(d.id)}`));
        if (mine.length > 0) pending.set(c.clientId, mine);
      }

      const claimed = await this.claim([...pending.keys()], daily);
      if (claimed.size < pending.size) deferred = true;
      const outbox: Outbox = new Map();
      const toldNow: { clientId: string; campaignId: string; channel: string }[] = [];
      for (const c of reachable) {
        const mine = pending.get(c.clientId);
        if (!mine || !claimed.has(c.clientId)) continue;
        const [top] = mine;
        const lang = c.client.language;
        addToOutbox(
          outbox,
          `${lang}|card|${top.id}|${mine.length}`,
          () => ({ ...dealCardholderTexts(lang, top.merchant.nom, top.title, mine.length), data: openDeal(top.id) }),
          { id: c.clientId, token: c.client.pushToken!, lang },
        );
        for (const d of mine) toldNow.push({ clientId: c.clientId, campaignId: cardDealCampaign(d.id), channel: 'PUSH' });
      }
      // Recorded before the push, like the daily claim: at most once.
      if (toldNow.length > 0) await this.prisma.campaignSentTracker.createMany({ data: toldNow, skipDuplicates: true });
      sent += await this.send(outbox, notifications);
      if (cards.length < DEAL_DIGEST_BATCH) break;
    }
    return { sent, deferred };
  }

  // ── Saved deals ────────────────────────────────────────────

  /** One push per saved deal, the day before it ends. */
  async remindSaved(now: Date = new Date()): Promise<number> {
    const deals: AnnouncedDeal[] = await this.prisma.deal.findMany({
      where: {
        ...liveDealWhere(now),
        endsAt: { gt: now, lte: new Date(now.getTime() + DEAL_SAVED_REMINDER_HOURS * 3_600_000) },
        saves: { some: { remindedAt: null } },
      },
      select: ANNOUNCED_SELECT,
      take: DEAL_DIGEST_MAX_DEALS,
    });
    const notifications: DigestNotifications = new Map();
    let sent = 0;
    for (const deal of deals) {
      for (;;) {
        // No cursor: each batch is marked as reminded, so the next read starts after it.
        const saves = await this.prisma.dealSave.findMany({
          where: {
            dealId: deal.id,
            remindedAt: null,
            client: { ...pushable, merchantBlocks: { none: { merchantId: deal.merchantId } } },
          },
          select: { clientId: true, client: { select: { pushToken: true, language: true } } },
          orderBy: { clientId: 'asc' },
          take: DEAL_DIGEST_BATCH,
        });
        if (saves.length === 0) break;
        const clientIds = saves.map((s) => s.clientId);
        // The rows this run marked are the ones it owns.
        const marked = await this.prisma.$queryRaw<{ client_id: string }[]>`
          UPDATE deal_saves SET reminded_at = ${now}
          WHERE deal_id = ${deal.id} AND client_id = ANY(${clientIds}::text[]) AND reminded_at IS NULL
          RETURNING client_id`;
        const mine = new Set(marked.map((m) => m.client_id));
        const outbox: Outbox = new Map();
        for (const s of saves) {
          if (!s.client.pushToken || !mine.has(s.clientId)) continue;
          const lang = s.client.language;
          addToOutbox(
            outbox,
            `${lang}|saved|${deal.id}`,
            () => ({ ...dealSavedReminderTexts(lang, deal.merchant.nom, deal.title), data: openDeal(deal.id) }),
            { id: s.clientId, token: s.client.pushToken, lang },
          );
        }
        sent += await this.send(outbox, notifications);
        if (saves.length < DEAL_DIGEST_BATCH) break;
      }
    }
    return sent;
  }

  // ── City digest ────────────────────────────────────────────

  async runDigest(now: Date = new Date()): Promise<{ city: number; online: number }> {
    const day = dayTag(now);
    const week = weekTag(now);
    const daily = `deals_digest_${day}`;

    const rows = await this.prisma.deal.findMany({
      where: {
        ...liveDealWhere(now),
        alertSentAt: null,
        reportCount: 0,
        startsAt: { lte: now, gte: new Date(now.getTime() - DEAL_ALERT_FRESH_DAYS * MS_PER_DAY) },
      },
      select: {
        id: true,
        merchantId: true,
        scope: true,
        title: true,
        cityKeys: true,
        percentOff: true,
        startsAt: true,
        merchant: { select: { nom: true, categorie: true, secondaryCategories: true } },
      },
      orderBy: { startsAt: 'desc' },
      take: DEAL_DIGEST_MAX_DEALS,
    });
    if (rows.length === 0) return { city: 0, online: 0 };

    const deals: DigestDeal[] = rows.map((r) => ({
      id: r.id,
      merchantId: r.merchantId,
      merchantName: r.merchant.nom,
      categories: [r.merchant.categorie, ...r.merchant.secondaryCategories],
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

      const recipients: DigestRecipient[] = [];
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

  private deliver(recipients: DigestRecipient[], cityKey: string | null, notifications: DigestNotifications): Promise<number> {
    const outbox: Outbox = new Map();
    for (const r of recipients) {
      addToOutbox(outbox, digestGroupKey(r.lang, r.deals, cityKey), () => digestMessage(r.lang, r.deals, cityKey), r);
    }
    return this.send(outbox, notifications);
  }

  /** Stores the in-app entry of each message, pushes it, and returns how many clients it went to. */
  private async send(outbox: Outbox, notifications: DigestNotifications): Promise<number> {
    const staleTokens: string[] = [];
    let recipients = 0;
    for (const [key, { msg, members }] of outbox) {
      recipients += members.length;
      let notificationId = notifications.get(key);
      if (!notificationId) {
        const created = await this.prisma.notification.create({
          data: { title: msg.title, body: msg.body, channel: 'PUSH', audience: DEAL_DIGEST_AUDIENCE, isBroadcast: false, data: notificationLink(msg.data) },
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
    return recipients;
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
