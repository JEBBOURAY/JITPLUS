import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { withRetry } from '../common/utils/retry-transaction.helper';
import { assertClean } from '../common/utils/content-moderation';
import { detectProhibitedContent } from '../notifications/content-filter';
import { errMsg, maskName } from '../common/utils';
import { formatMoroccoDayMonth, moroccoYmd } from '../common/utils/morocco-time';
import { AuditLogService, AuditAction, AuditTargetType } from '../admin/audit-log.service';
import { EventsGateway } from '../events';
import type {
  AudienceEstimateDto,
  CreateScratchCampaignDto,
  ExtendScratchDatesDto,
  ScratchAudienceTypeValue,
} from './dto';
import {
  normalizeRewards,
  plannedSendAt,
  resolveCampaignDates,
  resolveExtendedDates,
  validateAudience,
} from './scratch-campaign-rules';
import { buildAudienceWhere } from './scratch-audience';
import {
  SCRATCH_DISMISS_WINDOW_DAYS,
  SCRATCH_LIMITS,
  SCRATCH_MAX_CAMPAIGNS_PER_30_DAYS,
  SCRATCH_MAX_SCHEDULE_DAYS,
  scratchQuietHoursIgnored,
} from './scratch-limits';
import { ScratchPushService } from './scratch-push.service';
import { getScratchTexts } from './scratch-notif-i18n';
import { ScratchDispatchService } from './scratch-dispatch.service';
import { nextAllowedSendTime } from '../common/tasks/cron-utils';

const DAY_MS = 86_400_000;
const DEFAULT_DESIGN = 'violet';
const DISMISS_CHUNK = 1000;

/** A planned send must not land in quiet hours; "send now" is the merchant's explicit choice and is not moved. */
function outsideQuietHours(sendAt: Date): Date {
  return scratchQuietHoursIgnored() ? sendAt : nextAllowedSendTime(sendAt);
}

const CAMPAIGN_INCLUDE = { rewards: { orderBy: { createdAt: 'asc' } } } satisfies Prisma.ScratchCampaignInclude;
type CampaignWithRewards = Prisma.ScratchCampaignGetPayload<{ include: typeof CAMPAIGN_INCLUDE }>;

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class ScratchCampaignService {
  private readonly logger = new Logger(ScratchCampaignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: ScratchPushService,
    private readonly eventsGateway: EventsGateway,
    private readonly auditLogService: AuditLogService,
    private readonly dispatcher: ScratchDispatchService,
  ) {}

  // ── Mapping ─────────────────────────────────────────────────

  toDto(c: CampaignWithRewards) {
    return {
      id: c.id,
      name: c.name,
      message: c.message,
      designId: c.designId,
      status: c.status,
      audienceType: c.audienceType,
      audienceValue: c.audienceValue,
      sendAt: c.sendAt?.toISOString() ?? null,
      sentAt: c.sentAt?.toISOString() ?? null,
      cancelledAt: c.cancelledAt?.toISOString() ?? null,
      cardExpiresAt: c.cardExpiresAt.toISOString(),
      couponExpiresAt: c.couponExpiresAt.toISOString(),
      cardExpiresOn: moroccoYmd(c.cardExpiresAt),
      couponExpiresOn: moroccoYmd(c.couponExpiresAt),
      recipientCount: c.recipientCount,
      pushSuccessCount: c.pushSuccessCount,
      createdAt: c.createdAt.toISOString(),
      rewards: c.rewards.map((r) => ({
        id: r.id,
        type: r.type,
        label: r.label,
        value: r.value,
        maxDiscount: r.maxDiscount,
        rewardId: r.rewardId,
        weight: r.weight,
        totalStock: r.totalStock,
        remaining: r.remaining,
        minPurchaseAmount: r.minPurchaseAmount,
        minDelayHours: r.minDelayHours,
        allowedWeekdays: r.allowedWeekdays,
        allowedFromMin: r.allowedFromMin,
        allowedToMin: r.allowedToMin,
      })),
    };
  }

  private async findOwned(merchantId: string, id: string): Promise<CampaignWithRewards> {
    const campaign = await this.prisma.scratchCampaign.findFirst({
      where: { id, merchantId },
      include: CAMPAIGN_INCLUDE,
    });
    if (!campaign) throw new NotFoundException('Campagne introuvable');
    return campaign;
  }

  private moderate(name: string, message?: string | null, rewardLabels: string[] = []) {
    assertClean({ name, message: message ?? null, ...Object.fromEntries(rewardLabels.map((l, i) => [`récompense ${i + 1}`, l])) });
    const violation = detectProhibitedContent(name, message ?? '', ...rewardLabels);
    if (violation) throw new BadRequestException(violation.message);
  }

  private async assertRewardLinks(merchantId: string, rewardIds: (string | null)[]) {
    const ids = [...new Set(rewardIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return;
    const count = await this.prisma.reward.count({ where: { id: { in: ids }, merchantId } });
    if (count !== ids.length) throw new BadRequestException('Récompense du catalogue invalide');
  }

  // ── CRUD ────────────────────────────────────────────────────

  async list(merchantId: string) {
    const campaigns = await this.prisma.scratchCampaign.findMany({
      where: { merchantId },
      include: CAMPAIGN_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const ids = campaigns.map((c) => c.id);
    const [scratched, redeemed] = ids.length
      ? await Promise.all([
          this.prisma.scratchCard.groupBy({
            by: ['campaignId'],
            where: { campaignId: { in: ids }, status: 'SCRATCHED' },
            _count: { _all: true },
          }),
          this.prisma.scratchCard.groupBy({
            by: ['campaignId'],
            where: { campaignId: { in: ids }, coupon: { status: 'REDEEMED' } },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const scratchedBy = new Map(scratched.map((g) => [g.campaignId, g._count._all]));
    const redeemedBy = new Map(redeemed.map((g) => [g.campaignId, g._count._all]));
    return campaigns.map((c) => ({
      ...this.toDto(c),
      scratchedCount: scratchedBy.get(c.id) ?? 0,
      redeemedCount: redeemedBy.get(c.id) ?? 0,
    }));
  }

  async get(merchantId: string, id: string) {
    return this.toDto(await this.findOwned(merchantId, id));
  }

  async create(merchantId: string, dto: CreateScratchCampaignDto) {
    const rewards = normalizeRewards(dto.rewards);
    const audienceValue = validateAudience(dto.audienceType, dto.audienceValue);
    const name = dto.name.trim();
    const message = dto.message?.trim() || null;
    this.moderate(name, message, rewards.map((r) => r.label));
    await this.assertRewardLinks(merchantId, rewards.map((r) => r.rewardId));
    const dates = resolveCampaignDates(dto.cardExpiresOn, dto.couponExpiresOn, plannedSendAt(dto.sendAt, new Date()));

    const campaign = await this.prisma.scratchCampaign.create({
      data: {
        merchantId,
        name,
        message,
        designId: dto.designId || DEFAULT_DESIGN,
        audienceType: dto.audienceType,
        audienceValue,
        cardExpiresAt: dates.cardExpiresAt,
        couponExpiresAt: dates.couponExpiresAt,
        rewards: { create: rewards },
      },
      include: CAMPAIGN_INCLUDE,
    });

    this.auditLogService.log({
      ctx: { actorType: 'MERCHANT', merchantId },
      action: AuditAction.CREATE_SCRATCH_CAMPAIGN,
      targetType: AuditTargetType.MERCHANT,
      targetId: merchantId,
      targetLabel: name,
      metadata: { campaignId: campaign.id, rewards: rewards.length },
    });
    return this.toDto(campaign);
  }

  /** Full replacement of a campaign that has not been sent yet. */
  async update(merchantId: string, id: string, dto: CreateScratchCampaignDto) {
    const existing = await this.findOwned(merchantId, id);
    if (existing.status !== 'DRAFT' && existing.status !== 'SCHEDULED') {
      throw new BadRequestException('Une campagne envoyée ne peut plus être modifiée (seules les dates peuvent être prolongées)');
    }
    const rewards = normalizeRewards(dto.rewards);
    const audienceValue = validateAudience(dto.audienceType, dto.audienceValue);
    const name = dto.name.trim();
    const message = dto.message?.trim() || null;
    this.moderate(name, message, rewards.map((r) => r.label));
    await this.assertRewardLinks(merchantId, rewards.map((r) => r.rewardId));
    // Older clients do not send sendAt: fall back to the current schedule.
    const fallback = existing.status === 'SCHEDULED' && existing.sendAt ? existing.sendAt : new Date();
    const dates = resolveCampaignDates(dto.cardExpiresOn, dto.couponExpiresOn, plannedSendAt(dto.sendAt, fallback));

    const updated = await withRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const res = await tx.scratchCampaign.updateMany({
            where: { id, merchantId, status: { in: ['DRAFT', 'SCHEDULED'] } },
            data: {
              name,
              message,
              designId: dto.designId || existing.designId,
              audienceType: dto.audienceType,
              audienceValue,
              cardExpiresAt: dates.cardExpiresAt,
              couponExpiresAt: dates.couponExpiresAt,
            },
          });
          if (res.count !== 1) throw new ConflictException('La campagne est en cours d\'envoi');
          await tx.scratchReward.deleteMany({ where: { campaignId: id } });
          await tx.scratchReward.createMany({ data: rewards.map((r) => ({ ...r, campaignId: id })) });
          return tx.scratchCampaign.findUniqueOrThrow({ where: { id }, include: CAMPAIGN_INCLUDE });
        },
        { isolationLevel: 'Serializable' },
      ),
    );
    return this.toDto(updated);
  }

  async remove(merchantId: string, id: string) {
    const res = await this.prisma.scratchCampaign.deleteMany({ where: { id, merchantId, status: 'DRAFT' } });
    if (res.count !== 1) {
      await this.findOwned(merchantId, id);
      throw new BadRequestException('Seul un brouillon peut être supprimé. Annulez la campagne à la place.');
    }
    return { success: true };
  }

  async duplicate(merchantId: string, id: string) {
    const source = await this.findOwned(merchantId, id);
    const today = moroccoYmd(new Date());
    const cardYmd = addDaysYmd(today, 7);
    const suffix = ' (copie)';
    const campaign = await this.prisma.scratchCampaign.create({
      data: {
        merchantId,
        name: `${source.name.slice(0, SCRATCH_LIMITS.NAME_MAX - suffix.length)}${suffix}`,
        message: source.message,
        designId: source.designId,
        audienceType: source.audienceType,
        audienceValue: source.audienceValue,
        ...resolveCampaignDates(cardYmd, addDaysYmd(cardYmd, 7), new Date()),
        rewards: {
          create: source.rewards.map((r) => ({
            type: r.type,
            label: r.label,
            value: r.value,
            maxDiscount: r.maxDiscount,
            rewardId: r.rewardId,
            weight: r.weight,
            totalStock: r.totalStock,
            remaining: r.totalStock,
            minPurchaseAmount: r.minPurchaseAmount,
            minDelayHours: r.minDelayHours,
            allowedWeekdays: r.allowedWeekdays,
            allowedFromMin: r.allowedFromMin,
            allowedToMin: r.allowedToMin,
          })),
        },
      },
      include: CAMPAIGN_INCLUDE,
    });
    return this.toDto(campaign);
  }

  // ── Scheduling ──────────────────────────────────────────────

  async schedule(merchantId: string, id: string, sendAtInput?: string) {
    const campaign = await this.findOwned(merchantId, id);
    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
      throw new BadRequestException('Cette campagne a déjà été envoyée');
    }
    const now = new Date();
    let sendAt = sendAtInput ? new Date(sendAtInput) : now;
    if (Number.isNaN(sendAt.getTime())) throw new BadRequestException('Date d\'envoi invalide');
    const immediate = sendAt.getTime() <= now.getTime();
    sendAt = immediate ? now : outsideQuietHours(sendAt);
    if (sendAt.getTime() > now.getTime() + SCRATCH_MAX_SCHEDULE_DAYS * DAY_MS) {
      throw new BadRequestException(`L'envoi peut être programmé au plus ${SCRATCH_MAX_SCHEDULE_DAYS} jours à l'avance`);
    }

    normalizeRewards(campaign.rewards.map((r) => ({ ...r, type: r.type })));
    resolveCampaignDates(moroccoYmd(campaign.cardExpiresAt), moroccoYmd(campaign.couponExpiresAt), sendAt);

    const audience = await this.estimateAudience(merchantId, {
      audienceType: campaign.audienceType as ScratchAudienceTypeValue,
      audienceValue: campaign.audienceValue,
    });
    if (audience.total === 0) throw new BadRequestException('Aucun client ne correspond à ce ciblage');

    const since = new Date(now.getTime() - 30 * DAY_MS);
    // Serializable so that two campaigns scheduled at the same time cannot
    // both pass the quota count.
    await withRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const recent = await tx.scratchCampaign.count({
            where: {
              merchantId,
              id: { not: id },
              OR: [
                { status: { in: ['SCHEDULED', 'SENDING'] } },
                { status: { in: ['SENT', 'ENDED', 'CANCELLED'] }, sentAt: { gte: since } },
              ],
            },
          });
          if (recent >= SCRATCH_MAX_CAMPAIGNS_PER_30_DAYS) {
            throw new BadRequestException(
              `Limite atteinte : ${SCRATCH_MAX_CAMPAIGNS_PER_30_DAYS} campagnes de cartes à gratter par période de 30 jours`,
            );
          }

          // An immediate send is claimed here (SENDING + lock) so the dispatcher
          // starts right away instead of waiting for the next cron tick; a dead
          // dispatch is retaken by the cron once the lock expires.
          const res = await tx.scratchCampaign.updateMany({
            where: { id, merchantId, status: { in: ['DRAFT', 'SCHEDULED'] } },
            data: immediate ? { status: 'SENDING', sendAt, sendingLockedAt: now } : { status: 'SCHEDULED', sendAt },
          });
          if (res.count !== 1) throw new ConflictException('La campagne est déjà en cours d\'envoi');
        },
        { isolationLevel: 'Serializable' },
      ),
    );
    if (immediate) {
      void this.dispatcher
        .dispatch(id)
        .catch((err) => this.logger.error(`Immediate dispatch of ${id} failed: ${errMsg(err)}`));
    }
    return { ...(await this.get(merchantId, id)), audience };
  }

  async unschedule(merchantId: string, id: string) {
    const res = await this.prisma.scratchCampaign.updateMany({
      where: { id, merchantId, status: 'SCHEDULED' },
      data: { status: 'DRAFT', sendAt: null },
    });
    if (res.count !== 1) {
      await this.findOwned(merchantId, id);
      throw new BadRequestException('Seule une campagne programmée peut être déprogrammée');
    }
    return this.get(merchantId, id);
  }

  // ── Audience ────────────────────────────────────────────────

  async estimateAudience(merchantId: string, dto: Pick<AudienceEstimateDto, 'audienceType' | 'audienceValue'>) {
    const audienceValue = validateAudience(dto.audienceType, dto.audienceValue);
    const where = buildAudienceWhere(merchantId, dto.audienceType, audienceValue, new Date());
    const clientWhere = where.client as Prisma.ClientWhereInput;
    const [total, withoutApp, reachableByPush] = await Promise.all([
      this.prisma.loyaltyCard.count({ where }),
      this.prisma.loyaltyCard.count({ where: { ...where, client: { ...clientWhere, isAnonymous: true } } }),
      this.prisma.loyaltyCard.count({
        where: {
          ...where,
          client: { ...clientWhere, isAnonymous: false, notifPush: true, pushToken: { not: null } },
        },
      }),
    ]);
    return { total, reachableByPush, withoutApp };
  }

  // ── Cancellation ────────────────────────────────────────────

  async cancelPreview(merchantId: string, id: string) {
    await this.findOwned(merchantId, id);
    const [pendingCards, activeCoupons, redeemedCoupons] = await Promise.all([
      this.prisma.scratchCard.count({ where: { campaignId: id, status: 'PENDING' } }),
      this.prisma.coupon.count({ where: { scratchCard: { campaignId: id }, status: 'ACTIVE' } }),
      this.prisma.coupon.count({ where: { scratchCard: { campaignId: id }, status: 'REDEEMED' } }),
    ]);
    return { pendingCards, activeCoupons, redeemedCoupons };
  }

  /**
   * Definitive cancellation: no unused card or coupon stays valid. Coupons
   * already redeemed keep their status (the discount was given at the till).
   */
  async cancel(merchantId: string, id: string) {
    const result = await withRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const campaign = await tx.scratchCampaign.findFirst({
            where: { id, merchantId },
            select: {
              id: true,
              status: true,
              name: true,
              message: true,
              sentAt: true,
              merchant: { select: { id: true, nom: true, logoUrl: true } },
            },
          });
          if (!campaign) throw new NotFoundException('Campagne introuvable');
          if (campaign.status === 'CANCELLED') throw new BadRequestException('Cette campagne est déjà annulée');
          if (campaign.status === 'ENDED') throw new BadRequestException('Cette campagne est déjà terminée');

          await tx.scratchCampaign.update({
            where: { id },
            data: { status: 'CANCELLED', cancelledAt: now, sendingLockedAt: null },
          });

          const pendingCardClients = await tx.scratchCard.findMany({
            where: { campaignId: id, status: 'PENDING' },
            select: { clientId: true },
          });
          const cards = await tx.scratchCard.updateMany({
            where: { campaignId: id, status: 'PENDING' },
            data: { status: 'CANCELLED' },
          });

          const activeCoupons = await tx.coupon.findMany({
            where: { scratchCard: { campaignId: id }, status: 'ACTIVE' },
            select: {
              id: true,
              label: true,
              client: { select: { id: true, language: true, pushToken: true, notifPush: true } },
            },
          });
          const coupons = await tx.coupon.updateMany({
            where: { id: { in: activeCoupons.map((c) => c.id) }, status: 'ACTIVE' },
            data: { status: 'CANCELLED', cancelledAt: now },
          });

          return {
            merchant: campaign.merchant,
            name: campaign.name,
            message: campaign.message,
            sentAt: campaign.sentAt,
            cancelledCards: cards.count,
            cancelledCoupons: coupons.count,
            pendingCardClientIds: pendingCardClients.map((c) => c.clientId),
            activeCoupons,
          };
        },
        { isolationLevel: 'Serializable' },
      ),
    );

    this.auditLogService.log({
      ctx: { actorType: 'MERCHANT', merchantId },
      action: AuditAction.CANCEL_SCRATCH_CAMPAIGN,
      targetType: AuditTargetType.MERCHANT,
      targetId: merchantId,
      targetLabel: result.name,
      metadata: { campaignId: id, cancelledCards: result.cancelledCards, cancelledCoupons: result.cancelledCoupons },
    });

    this.notifyCancellation(id, result).catch((err) =>
      this.logger.warn(`Cancellation side effects failed for ${id}: ${errMsg(err)}`),
    );

    return { ...(await this.get(merchantId, id)), cancelledCards: result.cancelledCards, cancelledCoupons: result.cancelledCoupons };
  }

  private async notifyCancellation(
    campaignId: string,
    r: {
      merchant: { id: string; nom: string; logoUrl: string | null };
      message: string | null;
      sentAt: Date | null;
      pendingCardClientIds: string[];
      activeCoupons: { id: string; label: string; client: { id: string; language: string; pushToken: string | null; notifPush: boolean } }[];
    },
  ) {
    for (const c of r.activeCoupons) {
      this.eventsGateway.emitCouponUpdated(c.client.id, {
        couponId: c.id,
        merchantId: r.merchant.id,
        status: 'CANCELLED',
        reason: 'cancelled',
      });
    }
    this.eventsGateway.emitScratchCardsChanged(r.pendingCardClientIds, { merchantId: r.merchant.id, reason: 'cancelled' });
    await this.dismissReceivedNotifications(r).catch((err) =>
      this.logger.warn(`Dismissing card notifications failed for ${campaignId}: ${errMsg(err)}`),
    );

    // Neutral push to coupon holders only: they might otherwise come to the shop
    // with a coupon they believe is still valid.
    const labelByClient = new Map(r.activeCoupons.map((c) => [c.client.id, c.label]));
    await this.push.send(
      r.merchant,
      r.activeCoupons.map((c) => ({
        clientId: c.client.id,
        language: c.client.language,
        pushToken: c.client.pushToken,
        notifPush: c.client.notifPush,
      })),
      (recipient) => {
        const t = getScratchTexts(recipient.language);
        return {
          title: t.campaignCancelledTitle(r.merchant.nom),
          body: t.campaignCancelledBody(labelByClient.get(recipient.clientId) ?? ''),
        };
      },
      { event: 'coupon_cancelled', action: 'open_coupons', merchantId: r.merchant.id, campaignId },
    );
  }

  /**
   * Hides the "you received a card" in-app entry of the cards that were never
   * scratched. Notification rows carry no campaign id, so they are matched by
   * merchant + exact texts + creation window. Two campaigns of the same
   * merchant sent within the window with the identical message text would
   * both match; that only hides an in-app entry, no data is lost.
   */
  private async dismissReceivedNotifications(r: {
    merchant: { id: string; nom: string };
    message: string | null;
    sentAt: Date | null;
    pendingCardClientIds: string[];
  }) {
    if (!r.sentAt || r.pendingCardClientIds.length === 0) return;
    const locales = ['fr', 'en', 'ar'] as const;
    const texts = locales.map((l) => getScratchTexts(l));
    const notifications = await this.prisma.notification.findMany({
      where: {
        merchantId: r.merchant.id,
        channel: 'PUSH',
        createdAt: { gte: r.sentAt, lt: new Date(r.sentAt.getTime() + SCRATCH_DISMISS_WINDOW_DAYS * DAY_MS) },
        title: { in: texts.map((t) => t.cardReceivedTitle(r.merchant.nom).slice(0, 255)) },
        body: { in: texts.map((t) => t.cardReceivedBody(r.message).slice(0, 2000)) },
      },
      select: { id: true },
    });
    if (notifications.length === 0) return;
    const notificationIds = notifications.map((n) => n.id);
    const now = new Date();
    for (let i = 0; i < r.pendingCardClientIds.length; i += DISMISS_CHUNK) {
      await this.prisma.clientNotificationStatus.updateMany({
        where: {
          notificationId: { in: notificationIds },
          clientId: { in: r.pendingCardClientIds.slice(i, i + DISMISS_CHUNK) },
          isDismissed: false,
        },
        data: { isDismissed: true, dismissedAt: now },
      });
    }
  }

  // ── Date extension ──────────────────────────────────────────

  async extendDates(merchantId: string, id: string, dto: ExtendScratchDatesDto) {
    if (!dto.cardExpiresOn && !dto.couponExpiresOn) throw new BadRequestException('Aucune date à modifier');
    const campaign = await this.findOwned(merchantId, id);
    if (campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') {
      throw new BadRequestException('Avant l\'envoi, modifiez directement la campagne');
    }
    if (campaign.status !== 'SENT' && campaign.status !== 'SENDING') {
      throw new BadRequestException('Les dates de cette campagne ne peuvent plus être modifiées');
    }
    const now = new Date();
    const dates = resolveExtendedDates(
      { cardExpiresAt: campaign.cardExpiresAt, couponExpiresAt: campaign.couponExpiresAt, sentAt: campaign.sentAt ?? campaign.sendAt ?? now },
      dto,
      now,
    );
    const couponChanged = dates.couponExpiresAt.getTime() !== campaign.couponExpiresAt.getTime();
    const cardChanged = dates.cardExpiresAt.getTime() !== campaign.cardExpiresAt.getTime();
    if (!couponChanged && !cardChanged) return this.toDto(campaign);

    const affected = await withRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const res = await tx.scratchCampaign.updateMany({
            where: { id, merchantId, status: { in: ['SENT', 'SENDING'] } },
            data: { cardExpiresAt: dates.cardExpiresAt, couponExpiresAt: dates.couponExpiresAt },
          });
          if (res.count !== 1) throw new ConflictException('La campagne a changé de statut, réessayez');

          let cardClientIds: string[] = [];
          if (cardChanged) {
            const cards = await tx.scratchCard.findMany({
              where: { campaignId: id, status: { in: ['PENDING', 'EXPIRED'] } },
              select: { clientId: true },
            });
            cardClientIds = cards.map((c) => c.clientId);
            // Unscratched cards that already expired come back to life.
            await tx.scratchCard.updateMany({
              where: { campaignId: id, status: { in: ['PENDING', 'EXPIRED'] } },
              data: { status: 'PENDING', expiresAt: dates.cardExpiresAt, reminderSentAt: null },
            });
          }

          let coupons: { id: string; client: { id: string; language: string; pushToken: string | null; notifPush: boolean } }[] = [];
          if (couponChanged) {
            coupons = await tx.coupon.findMany({
              where: { scratchCard: { campaignId: id }, status: 'ACTIVE' },
              select: { id: true, client: { select: { id: true, language: true, pushToken: true, notifPush: true } } },
            });
            await tx.coupon.updateMany({
              where: { id: { in: coupons.map((c) => c.id) }, status: 'ACTIVE' },
              data: { expiresAt: dates.couponExpiresAt, reminderSentAt: null },
            });
          }
          return { cardClientIds, coupons };
        },
        { isolationLevel: 'Serializable' },
      ),
    );

    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { id: true, nom: true, logoUrl: true } });
    if (merchant) {
      this.eventsGateway.emitScratchCardsChanged(affected.cardClientIds, { merchantId, reason: 'extended' });
      for (const c of affected.coupons) {
        this.eventsGateway.emitCouponUpdated(c.client.id, { couponId: c.id, merchantId, status: 'ACTIVE', reason: 'extended' });
      }
      const date = formatMoroccoDayMonth(dates.couponExpiresAt);
      this.push
        .send(
          merchant,
          affected.coupons.map((c) => ({ clientId: c.client.id, language: c.client.language, pushToken: c.client.pushToken, notifPush: c.client.notifPush })),
          (recipient) => {
            const t = getScratchTexts(recipient.language);
            return { title: t.datesExtendedTitle, body: t.datesExtendedBody(merchant.nom, date) };
          },
          { event: 'coupon_extended', action: 'open_coupons', merchantId, campaignId: id },
        )
        .catch((err) => this.logger.warn(`Extension push failed: ${errMsg(err)}`));
    }
    return this.get(merchantId, id);
  }

  // ── Stats ───────────────────────────────────────────────────

  async stats(merchantId: string, id: string) {
    const campaign = await this.findOwned(merchantId, id);
    const cardWhere = { campaignId: id };
    const couponWhere = { scratchCard: { campaignId: id } };

    const [sent, opened, scratched, cancelledCards, withoutApp, convertedFromGhost, redeemed, cancelledCoupons, sums, bonus, wonByReward, redeemedByReward] =
      await Promise.all([
        this.prisma.scratchCard.count({ where: cardWhere }),
        this.prisma.scratchCard.count({ where: { ...cardWhere, openedAt: { not: null } } }),
        this.prisma.scratchCard.count({ where: { ...cardWhere, status: 'SCRATCHED' } }),
        this.prisma.scratchCard.count({ where: { ...cardWhere, status: 'CANCELLED' } }),
        this.prisma.scratchCard.count({ where: { ...cardWhere, client: { isAnonymous: true } } }),
        this.prisma.scratchCard.count({ where: { ...cardWhere, claimedFromGhostAt: { not: null } } }),
        this.prisma.coupon.count({ where: { ...couponWhere, status: 'REDEEMED' } }),
        this.prisma.coupon.count({ where: { ...couponWhere, status: 'CANCELLED' } }),
        this.prisma.coupon.aggregate({
          where: { ...couponWhere, status: 'REDEEMED' },
          _sum: { purchaseAmount: true, discountAmount: true },
        }),
        this.prisma.coupon.aggregate({
          where: { ...couponWhere, status: 'REDEEMED', type: 'BONUS_STAMPS' },
          _sum: { value: true },
        }),
        this.prisma.scratchCard.groupBy({
          by: ['rewardId'],
          where: { ...cardWhere, rewardId: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.scratchCard.groupBy({
          by: ['rewardId'],
          where: { ...cardWhere, rewardId: { not: null }, coupon: { status: 'REDEEMED' } },
          _count: { _all: true },
        }),
      ]);

    const wonMap = new Map(wonByReward.map((g) => [g.rewardId, g._count._all]));
    const redeemedMap = new Map(redeemedByReward.map((g) => [g.rewardId, g._count._all]));
    return {
      sent,
      pushDelivered: campaign.pushSuccessCount,
      opened,
      scratched,
      redeemed,
      cancelledCards,
      cancelledCoupons,
      withoutApp,
      convertedFromGhost,
      revenue: Math.round((sums._sum.purchaseAmount ?? 0) * 100) / 100,
      discountGiven: Math.round((sums._sum.discountAmount ?? 0) * 100) / 100,
      bonusStamps: Math.round(bonus._sum.value ?? 0),
      rewards: campaign.rewards.map((r) => ({
        rewardId: r.id,
        label: r.label,
        type: r.type,
        won: wonMap.get(r.id) ?? 0,
        redeemed: redeemedMap.get(r.id) ?? 0,
        remaining: r.remaining,
      })),
    };
  }

  async clientsWithoutApp(merchantId: string, id: string) {
    await this.findOwned(merchantId, id);
    const cards = await this.prisma.scratchCard.findMany({
      where: { campaignId: id, client: { isAnonymous: true, deletedAt: null } },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        client: { select: { id: true, prenom: true, nom: true, telephone: true, shareInfoMerchants: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return cards.map((c) => {
      const masked = c.client.shareInfoMerchants === false;
      return {
        cardId: c.id,
        status: c.status,
        expiresAt: c.expiresAt.toISOString(),
        client: {
          id: c.client.id,
          prenom: masked ? maskName(c.client.prenom) : c.client.prenom,
          nom: masked ? maskName(c.client.nom) : c.client.nom,
          telephone: c.client.telephone,
        },
      };
    });
  }
}
