import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { withRetry } from '../common/utils/retry-transaction.helper';
import { DEFAULT_AMOUNT_PER_STAMP } from '../common/constants';
import { errMsg, maskName } from '../common/utils';
import { formatMoroccoDayMonth } from '../common/utils/morocco-time';
import { AuditLogService, AuditAction, AuditTargetType } from '../admin/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { EventsGateway } from '../events';
import { computeEarnedStamps } from '../merchant/utils/loyalty.utils';
import { awardLuckyWheelTicketsInTx } from '../merchant/utils/lucky-wheel-tickets';
import { getNotifTranslations } from '../common/utils/notification-i18n';
import {
  capStampsToLimit,
  computeCouponDiscount,
  computeCouponValidFrom,
  computePurchaseStamps,
  evaluateCouponConditions,
  parseCouponConditions,
  type CouponCheck,
} from './coupon-rules';
import {
  generateCouponCode,
  isCouponToken,
  normalizeCouponCode,
  signCouponToken,
  verifyCouponToken,
} from './coupon-token';
import { getScratchTexts } from './scratch-notif-i18n';

type Tx = Prisma.TransactionClient;

const COUPON_MERCHANT_SELECT = { id: true, nom: true, logoUrl: true } as const;

/** Columns of a coupon returned to the apps. */
export const COUPON_PUBLIC_SELECT = {
  id: true,
  source: true,
  code: true,
  type: true,
  label: true,
  value: true,
  maxDiscount: true,
  conditions: true,
  status: true,
  validFrom: true,
  expiresAt: true,
  redeemedAt: true,
  cancelledAt: true,
  createdAt: true,
  clientId: true,
  merchantId: true,
  purchaseAmount: true,
  discountAmount: true,
  scratchCardId: true,
} satisfies Prisma.CouponSelect;

type PublicCoupon = Prisma.CouponGetPayload<{ select: typeof COUPON_PUBLIC_SELECT }>;

const CODE_ATTEMPTS = 12;

function isActiveCodeConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes('code');
}

/** Retries the whole operation when two coupons drew the same code concurrently. */
export async function withCodeRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i < attempts && isActiveCodeConflict(err)) continue;
      throw err;
    }
  }
}

@Injectable()
export class CouponService {
  private readonly logger = new Logger(CouponService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly planService: MerchantPlanService,
    private readonly eventsGateway: EventsGateway,
    private readonly auditLogService: AuditLogService,
  ) {}

  // ── Token & DTO ─────────────────────────────────────────────

  private secret(): string {
    const secret = this.config.get<string>('COUPON_HMAC_SECRET') || this.config.get<string>('QR_HMAC_SECRET');
    if (!secret) throw new Error('COUPON_HMAC_SECRET (or QR_HMAC_SECRET) is not configured');
    return secret;
  }

  toDto(
    coupon: PublicCoupon & { merchant?: { id: string; nom: string; logoUrl: string | null } | null },
    options: { withToken?: boolean } = {},
    now: Date = new Date(),
  ) {
    const status =
      coupon.status === 'ACTIVE' && coupon.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : coupon.status;
    return {
      id: coupon.id,
      source: coupon.source,
      code: coupon.code,
      type: coupon.type,
      label: coupon.label,
      value: coupon.value,
      maxDiscount: coupon.maxDiscount,
      conditions: parseCouponConditions(coupon.conditions),
      status,
      validFrom: coupon.validFrom.toISOString(),
      expiresAt: coupon.expiresAt.toISOString(),
      redeemedAt: coupon.redeemedAt?.toISOString() ?? null,
      cancelledAt: coupon.cancelledAt?.toISOString() ?? null,
      createdAt: coupon.createdAt.toISOString(),
      ...(coupon.merchant ? { merchant: coupon.merchant } : {}),
      ...(options.withToken && status === 'ACTIVE' ? { qrToken: signCouponToken(coupon.id, this.secret()) } : {}),
    };
  }

  // ── Creation (inside the scratch transaction) ───────────────

  /**
   * Creates the coupon won on a card, copying the reward as a snapshot.
   * The code is unique among the ACTIVE coupons of the merchant.
   */
  async createFromReward(
    tx: Tx,
    params: {
      card: { id: string; clientId: string; merchantId: string };
      reward: {
        type: PublicCoupon['type'];
        label: string;
        value: number | null;
        maxDiscount: number | null;
        minPurchaseAmount: number | null;
        minDelayHours: number;
        allowedWeekdays: number | null;
        allowedFromMin: number | null;
        allowedToMin: number | null;
      };
      expiresAt: Date;
      now: Date;
    },
  ) {
    const { card, reward, expiresAt, now } = params;
    let code: string | null = null;
    for (let i = 0; i < CODE_ATTEMPTS && !code; i++) {
      const candidate = generateCouponCode();
      const taken = await tx.coupon.findFirst({
        where: { merchantId: card.merchantId, code: candidate, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!taken) code = candidate;
    }
    if (!code) throw new ConflictException('Impossible de générer un code de coupon, réessayez');

    return tx.coupon.create({
      data: {
        source: 'SCRATCH_CARD',
        scratchCardId: card.id,
        clientId: card.clientId,
        merchantId: card.merchantId,
        code,
        type: reward.type,
        label: reward.label,
        value: reward.value,
        maxDiscount: reward.maxDiscount,
        conditions: {
          minPurchaseAmount: reward.minPurchaseAmount,
          allowedWeekdays: reward.allowedWeekdays,
          allowedFromMin: reward.allowedFromMin,
          allowedToMin: reward.allowedToMin,
        },
        status: 'ACTIVE',
        validFrom: computeCouponValidFrom(now, reward.minDelayHours, expiresAt),
        expiresAt,
      },
      select: { ...COUPON_PUBLIC_SELECT, merchant: { select: COUPON_MERCHANT_SELECT } },
    });
  }

  // ── Client ──────────────────────────────────────────────────

  async listClientCoupons(clientId: string, status?: 'active' | 'used' | 'expired', merchantId?: string) {
    const now = new Date();
    const where: Prisma.CouponWhereInput = { clientId, ...(merchantId ? { merchantId } : {}) };
    if (status === 'active') Object.assign(where, { status: 'ACTIVE', expiresAt: { gt: now } });
    else if (status === 'used') Object.assign(where, { status: 'REDEEMED' });
    else if (status === 'expired') {
      where.OR = [{ status: { in: ['EXPIRED', 'CANCELLED'] } }, { status: 'ACTIVE', expiresAt: { lte: now } }];
    }
    const coupons = await this.prisma.coupon.findMany({
      where,
      select: { ...COUPON_PUBLIC_SELECT, merchant: { select: COUPON_MERCHANT_SELECT } },
      orderBy: status === 'active' ? { expiresAt: 'asc' } : { updatedAt: 'desc' },
      take: 100,
    });
    return coupons.map((c) => this.toDto(c, {}, now));
  }

  async getClientCoupon(clientId: string, couponId: string) {
    const coupon = await this.prisma.coupon.findFirst({
      where: { id: couponId, clientId },
      select: { ...COUPON_PUBLIC_SELECT, merchant: { select: COUPON_MERCHANT_SELECT } },
    });
    if (!coupon) throw new NotFoundException('Coupon introuvable');
    return this.toDto(coupon, { withToken: true });
  }

  // ── Merchant: check ─────────────────────────────────────────

  private async findForMerchant(merchantId: string, input: { token?: string; code?: string; id?: string }) {
    const select = {
      ...COUPON_PUBLIC_SELECT,
      client: {
        select: { id: true, prenom: true, nom: true, shareInfoMerchants: true, isAnonymous: true, deletedAt: true },
      },
    } satisfies Prisma.CouponSelect;

    if (input.id) {
      return this.prisma.coupon.findFirst({ where: { id: input.id, merchantId }, select });
    }
    if (input.token && isCouponToken(input.token)) {
      const couponId = verifyCouponToken(input.token, this.secret());
      if (!couponId) throw new BadRequestException('QR code de coupon invalide');
      return this.prisma.coupon.findFirst({ where: { id: couponId, merchantId }, select });
    }
    const code = normalizeCouponCode(input.code ?? input.token ?? '');
    if (!code) throw new BadRequestException('Saisissez le code à 6 chiffres du coupon');
    // An active coupon wins over older (used / expired) coupons that reused the same code.
    const active = await this.prisma.coupon.findFirst({ where: { merchantId, code, status: 'ACTIVE' }, select });
    if (active) return active;
    return this.prisma.coupon.findFirst({ where: { merchantId, code }, select, orderBy: { updatedAt: 'desc' } });
  }

  async check(merchantId: string, input: { token?: string; code?: string }) {
    if (!input.token && !input.code) throw new BadRequestException('QR code ou code requis');
    const coupon = await this.findForMerchant(merchantId, input);
    if (!coupon) throw new NotFoundException('Coupon introuvable pour ce commerce');

    const now = new Date();
    const { checks, canRedeem } = evaluateCouponConditions(coupon, now);
    const masked = coupon.client.shareInfoMerchants === false;
    return {
      coupon: this.toDto(coupon, {}, now),
      client: {
        id: coupon.client.id,
        prenom: masked ? maskName(coupon.client.prenom) : coupon.client.prenom,
        nom: masked ? maskName(coupon.client.nom) : coupon.client.nom,
      },
      checks,
      canRedeem: canRedeem && !coupon.client.isAnonymous && !coupon.client.deletedAt,
    };
  }

  /** Usable coupons of one client, with the same checks as a scan, so the till can hand them over. */
  async listForClientAtTill(merchantId: string, clientId: string) {
    const now = new Date();
    const rows = await this.prisma.coupon.findMany({
      where: { merchantId, clientId, status: 'ACTIVE', expiresAt: { gt: now } },
      select: { ...COUPON_PUBLIC_SELECT, client: { select: { isAnonymous: true, deletedAt: true } } },
      orderBy: { expiresAt: 'asc' },
      take: 50,
    });
    return rows.map((coupon) => {
      const { checks, canRedeem } = evaluateCouponConditions(coupon, now);
      return {
        coupon: this.toDto(coupon, {}, now),
        checks,
        canRedeem: canRedeem && !coupon.client.isAnonymous && !coupon.client.deletedAt,
      };
    });
  }

  // ── Merchant: redeem ────────────────────────────────────────

  async redeem(
    merchantId: string,
    couponId: string,
    purchaseAmount: number,
    actor: { teamMemberId?: string; performedByName?: string; redeemedBy: string },
    idempotencyKey?: string,
  ) {
    const amount = Math.round(Math.max(0, purchaseAmount || 0) * 100) / 100;

    const result = await withRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const coupon = await tx.coupon.findFirst({
            where: { id: couponId, merchantId },
            select: {
              ...COUPON_PUBLIC_SELECT,
              redeemTransactionId: true,
              client: { select: { id: true, isAnonymous: true, deletedAt: true, language: true } },
            },
          });
          if (!coupon) throw new NotFoundException('Coupon introuvable pour ce commerce');

          if (coupon.status === 'REDEEMED') {
            if (idempotencyKey && coupon.redeemTransactionId) {
              const previous = await tx.transaction.findFirst({
                where: { id: coupon.redeemTransactionId, merchantId, idempotencyKey },
                select: { id: true },
              });
              if (previous) return { replayed: true as const, couponId: coupon.id };
            }
            throw new ConflictException(
              `Ce coupon a déjà été utilisé le ${formatMoroccoDayMonth(coupon.redeemedAt ?? now)}`,
            );
          }
          if (coupon.status === 'CANCELLED') {
            throw new BadRequestException(
              `Ce coupon a été annulé par le commerçant le ${formatMoroccoDayMonth(coupon.cancelledAt ?? now)}`,
            );
          }
          if (coupon.client.deletedAt || coupon.client.isAnonymous) {
            throw new BadRequestException('Le client doit utiliser l\'application JitPlus pour ce coupon');
          }
          if ((coupon.type === 'PERCENT_DISCOUNT' || coupon.type === 'FIXED_DISCOUNT') && amount <= 0) {
            throw new BadRequestException('Saisissez le montant du ticket pour calculer la remise');
          }

          const { checks, canRedeem } = evaluateCouponConditions(coupon, now, amount);
          if (!canRedeem) throw new BadRequestException(this.describeFailure(checks));

          if (idempotencyKey) {
            const reused = await tx.transaction.findFirst({
              where: { merchantId, idempotencyKey },
              select: { id: true },
            });
            if (reused) throw new ConflictException('Idempotency-Key déjà utilisée pour une autre opération');
          }

          const discountAmount = computeCouponDiscount(coupon, amount);
          const paidAmount = Math.round((amount - discountAmount) * 100) / 100;

          // Single-use guarantee: only one concurrent redemption can flip the status.
          const claimed = await tx.coupon.updateMany({
            where: { id: coupon.id, merchantId, status: 'ACTIVE', validFrom: { lte: now }, expiresAt: { gt: now } },
            data: {
              status: 'REDEEMED',
              redeemedAt: now,
              redeemedBy: actor.redeemedBy,
              purchaseAmount: amount,
              discountAmount,
            },
          });
          if (claimed.count !== 1) throw new ConflictException('Ce coupon vient d\'être utilisé ou n\'est plus valable');

          const merchant = await tx.merchant.findUnique({
            where: { id: merchantId },
            select: { nom: true, isActive: true, deletedAt: true, stampEarningMode: true, amountPerStamp: true, accumulationLimit: true },
          });
          if (!merchant || merchant.deletedAt || !merchant.isActive) throw new NotFoundException('Commerce non trouvé');

          let loyaltyCard = await tx.loyaltyCard.findUnique({
            where: { clientId_merchantId: { clientId: coupon.clientId, merchantId } },
            select: { id: true, stamps: true, deactivatedAt: true },
          });
          if (!loyaltyCard) {
            await this.planService.assertCanAddClient(merchantId);
            loyaltyCard = await tx.loyaltyCard.create({
              data: { clientId: coupon.clientId, merchantId, stamps: 0 },
              select: { id: true, stamps: true, deactivatedAt: true },
            });
          }
          // A client who left the programme keeps their coupon but earns no stamps.
          const canEarn = !loyaltyCard.deactivatedAt;

          const purchaseStamps = canEarn
            ? computePurchaseStamps(merchant, paidAmount, amount, computeEarnedStamps, DEFAULT_AMOUNT_PER_STAMP)
            : 0;
          const bonusWanted = canEarn && coupon.type === 'BONUS_STAMPS' ? Math.max(0, Math.round(coupon.value ?? 0)) : 0;
          const stampsEarned = capStampsToLimit(loyaltyCard.stamps, purchaseStamps, merchant.accumulationLimit);
          const bonusStamps = capStampsToLimit(loyaltyCard.stamps + stampsEarned, bonusWanted, merchant.accumulationLimit);
          const newBalance = loyaltyCard.stamps + stampsEarned + bonusStamps;

          let earnTransactionId: string | null = null;
          let luckyWheelTickets = 0;
          if (stampsEarned > 0) {
            const earnTx = await tx.transaction.create({
              data: {
                clientId: coupon.clientId,
                merchantId,
                teamMemberId: actor.teamMemberId || null,
                performedByName: actor.performedByName || null,
                type: 'EARN_STAMPS',
                amount: paidAmount,
                stamps: stampsEarned,
              },
              select: { id: true },
            });
            earnTransactionId = earnTx.id;
            luckyWheelTickets = await awardLuckyWheelTicketsInTx(tx, {
              clientId: coupon.clientId,
              merchantId,
              type: 'EARN_STAMPS',
              amount: paidAmount,
              stamps: stampsEarned,
              transactionId: earnTx.id,
              now,
            });
          }

          const redeemTx = await tx.transaction.create({
            data: {
              clientId: coupon.clientId,
              merchantId,
              teamMemberId: actor.teamMemberId || null,
              performedByName: actor.performedByName || null,
              type: 'COUPON_REDEEM',
              // The purchase is already counted on the EARN_STAMPS row when there is one.
              amount: earnTransactionId ? 0 : paidAmount,
              stamps: bonusStamps,
              note: `🎟️ ${coupon.label}`.slice(0, 255),
              idempotencyKey: idempotencyKey || null,
            },
            select: { id: true },
          });

          if (canEarn && (amount > 0 || bonusStamps > 0)) {
            await tx.loyaltyCard.update({
              where: { id: loyaltyCard.id },
              data: { stamps: newBalance, lastVisitAt: now, expiryReminderSentAt: null },
            });
          }

          await tx.coupon.update({
            where: { id: coupon.id },
            data: { redeemTransactionId: redeemTx.id, earnTransactionId },
          });

          return {
            replayed: false as const,
            couponId: coupon.id,
            clientId: coupon.clientId,
            clientLanguage: coupon.client.language,
            label: coupon.label,
            merchantName: merchant.nom,
            discountAmount,
            paidAmount,
            stampsEarned,
            bonusStamps,
            newBalance,
            luckyWheelTickets,
            redeemTransactionId: redeemTx.id,
          };
        },
        { isolationLevel: 'Serializable' },
      ),
    );

    const coupon = await this.prisma.coupon.findUniqueOrThrow({
      where: { id: result.couponId },
      select: { ...COUPON_PUBLIC_SELECT, merchant: { select: COUPON_MERCHANT_SELECT } },
    });

    if (result.replayed) {
      const card = await this.prisma.loyaltyCard.findUnique({
        where: { clientId_merchantId: { clientId: coupon.clientId, merchantId } },
        select: { stamps: true },
      });
      const discountAmount = coupon.discountAmount ?? 0;
      return {
        coupon: this.toDto(coupon),
        discountAmount,
        paidAmount: Math.max(0, (coupon.purchaseAmount ?? 0) - discountAmount),
        stampsEarned: 0,
        bonusStamps: 0,
        newBalance: card?.stamps ?? 0,
        replayed: true,
      };
    }

    this.afterRedeem(merchantId, result);

    return {
      coupon: this.toDto(coupon),
      discountAmount: result.discountAmount,
      paidAmount: result.paidAmount,
      stampsEarned: result.stampsEarned,
      bonusStamps: result.bonusStamps,
      newBalance: result.newBalance,
    };
  }

  private afterRedeem(
    merchantId: string,
    r: {
      couponId: string;
      clientId: string;
      clientLanguage: string | null;
      label: string;
      merchantName: string;
      stampsEarned: number;
      bonusStamps: number;
      newBalance: number;
      luckyWheelTickets: number;
      redeemTransactionId: string;
    },
  ) {
    const totalStamps = r.stampsEarned + r.bonusStamps;
    try {
      this.eventsGateway.emitCouponUpdated(r.clientId, {
        couponId: r.couponId,
        merchantId,
        status: 'REDEEMED',
        reason: 'redeemed',
      });
      this.eventsGateway.emitCouponRedeemed(merchantId, { merchantId, couponId: r.couponId, clientId: r.clientId });
      if (totalStamps > 0) {
        this.eventsGateway.emitStampsUpdated(r.clientId, {
          clientId: r.clientId,
          merchantId,
          merchantName: r.merchantName,
          stamps: totalStamps,
          newBalance: r.newBalance,
          type: 'EARN_STAMPS',
        });
      }
      this.eventsGateway.emitTransactionRecorded(merchantId, {
        merchantId,
        clientId: r.clientId,
        clientName: '',
        transactionId: r.redeemTransactionId,
        type: 'EARN_STAMPS',
        stamps: totalStamps,
        newBalance: r.newBalance,
      });
    } catch (err) {
      this.logger.warn(`Coupon WS emit failed: ${errMsg(err)}`);
    }

    const t = getScratchTexts(r.clientLanguage);
    this.notifications
      .sendToClient(
        merchantId,
        r.clientId,
        t.couponRedeemedTitle,
        t.couponRedeemedBody(r.label, r.merchantName, totalStamps),
        {
          event: 'coupon_redeemed',
          action: 'open_coupon',
          couponId: r.couponId,
          merchantId,
          newBalance: String(r.newBalance),
          stamps: String(totalStamps),
        },
      )
      .catch((err) => this.logger.warn(`Coupon redeemed push failed: ${errMsg(err)}`));

    if (r.luckyWheelTickets > 0) {
      const nt = getNotifTranslations(r.clientLanguage);
      this.notifications
        .sendToClient(
          merchantId,
          r.clientId,
          nt.luckyWheelTicketTitle(r.luckyWheelTickets),
          nt.luckyWheelTicketBody(r.luckyWheelTickets, r.merchantName),
          { event: 'lucky_wheel_ticket', merchantId, tickets: String(r.luckyWheelTickets) },
        )
        .catch((err) => this.logger.warn(`Lucky-wheel ticket push failed: ${errMsg(err)}`));
    }

    this.auditLogService.log({
      ctx: { actorType: 'MERCHANT', merchantId },
      action: AuditAction.REDEEM_COUPON,
      targetType: AuditTargetType.CLIENT,
      targetId: r.clientId,
      metadata: { couponId: r.couponId, stampsEarned: r.stampsEarned, bonusStamps: r.bonusStamps },
    });
  }

  private describeFailure(checks: CouponCheck[]): string {
    const failed = checks.find((c) => c.ok === false);
    switch (failed?.key) {
      case 'status':
        return failed.detail?.status === 'EXPIRED' ? 'Ce coupon a expiré' : 'Ce coupon n\'est plus valable';
      case 'dates': {
        const validFrom = new Date(String(failed.detail?.validFrom));
        return validFrom.getTime() > Date.now()
          ? `Ce coupon sera utilisable à partir du ${formatMoroccoDayMonth(validFrom)}`
          : 'Ce coupon a expiré';
      }
      case 'weekday':
        return 'Ce coupon n\'est pas utilisable aujourd\'hui';
      case 'hours':
        return 'Ce coupon n\'est pas utilisable à cette heure-ci';
      case 'minPurchase':
        return `Montant minimum d'achat : ${failed.detail?.min} MAD`;
      default:
        return 'Ce coupon ne peut pas être utilisé';
    }
  }

  // ── Merchant: history ───────────────────────────────────────

  async listMerchantCoupons(
    merchantId: string,
    query: { status?: 'REDEEMED' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED'; campaignId?: string; page?: number },
  ) {
    const page = query.page ?? 1;
    const take = 30;
    const now = new Date();
    const status = query.status ?? 'REDEEMED';
    // The hourly expiry cron lags behind expiresAt, so filter on the effective status.
    const statusWhere: Prisma.CouponWhereInput =
      status === 'ACTIVE'
        ? { status: 'ACTIVE', expiresAt: { gt: now } }
        : status === 'EXPIRED'
          ? { OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', expiresAt: { lte: now } }] }
          : { status };
    const where: Prisma.CouponWhereInput = {
      merchantId,
      ...statusWhere,
      ...(query.campaignId ? { scratchCard: { campaignId: query.campaignId } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        select: {
          ...COUPON_PUBLIC_SELECT,
          redeemedBy: true,
          client: { select: { id: true, prenom: true, nom: true, shareInfoMerchants: true } },
          scratchCard: { select: { campaign: { select: { id: true, name: true } } } },
        },
        orderBy: query.status === 'ACTIVE' ? { expiresAt: 'asc' } : { updatedAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.coupon.count({ where }),
    ]);

    const teamIds = [...new Set(rows.map((r) => r.redeemedBy).filter((id): id is string => !!id && id !== merchantId))];
    const team = teamIds.length
      ? await this.prisma.teamMember.findMany({ where: { id: { in: teamIds } }, select: { id: true, nom: true } })
      : [];
    const teamNames = new Map(team.map((m) => [m.id, m.nom]));

    return {
      coupons: rows.map((r) => {
        const masked = r.client.shareInfoMerchants === false;
        return {
          ...this.toDto(r),
          purchaseAmount: r.purchaseAmount,
          discountAmount: r.discountAmount,
          redeemedByName: r.redeemedBy ? teamNames.get(r.redeemedBy) ?? null : null,
          campaign: r.scratchCard?.campaign ?? null,
          client: {
            id: r.client.id,
            prenom: masked ? maskName(r.client.prenom) : r.client.prenom,
            nom: masked ? maskName(r.client.nom) : r.client.nom,
          },
        };
      }),
      total,
      page,
      hasMore: page * take < total,
    };
  }
}
