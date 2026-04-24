import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  REWARD_REPOSITORY, type IRewardRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../../common/repositories';
import { AuditLogService, AuditAction, AuditTargetType } from '../../admin/audit-log.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { EventsGateway } from '../../events';
import { MerchantPlanService } from './merchant-plan.service';
import { DEFAULT_POINTS_RATE, MAX_STAMPS_PER_TX, MAX_POINTS_PER_TX } from '../../common/constants';
import { errMsg, maskName } from '../../common/utils';
import { MERCHANT_LOYALTY_SELECT } from '../../common/prisma-selects';
import { buildPagination } from '../../common/utils';
import { withRetry } from '../../common/utils/retry-transaction.helper';
import { PointsRules } from '../interfaces/points-rules.interface';
import { computeRewardThreshold } from '../utils/loyalty.utils';
import { getNotifTranslations } from '../../common/utils/notification-i18n';

@Injectable()
export class MerchantTransactionService {
  private readonly logger = new Logger(MerchantTransactionService.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(REWARD_REPOSITORY) private rewardRepo: IRewardRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private transactionRepoDelegate: ITransactionRepository,
    @Inject(TRANSACTION_RUNNER) private txRunner: ITransactionRunner,
    private notifications: NotificationsService,
    private eventsGateway: EventsGateway,
    private planService: MerchantPlanService,
    private auditLogService: AuditLogService,
  ) {}

  async createTransaction(
    clientId: string,
    merchantId: string,
    type: 'EARN_POINTS' | 'REDEEM_REWARD',
    amount: number,
    points: number,
    rewardId?: string,
    teamMemberId?: string,
    performedByName?: string,
    idempotencyKey?: string,
  ) {
    // Idempotency: if a key was supplied and a transaction with the same
    // (merchantId, idempotencyKey) already exists, return it verbatim instead
    // of creating a duplicate. Prevents double-credits on network retries.
    if (idempotencyKey) {
      const existing = await this.transactionRepoDelegate.findFirst({
        where: { merchantId, idempotencyKey },
      });
      if (existing) return existing;
    }

    const [client, merchant] = await Promise.all([
      this.clientRepo.findUnique({
        where: { id: clientId },
        select: { id: true, language: true, deletedAt: true },
      }),
      this.merchantRepo.findUnique({
        where: { id: merchantId },
        select: { nom: true, isActive: true, deletedAt: true, ...MERCHANT_LOYALTY_SELECT },
      }),
    ]);
    if (!client || client.deletedAt) throw new NotFoundException('Client non trouvé');
    if (!merchant || merchant.deletedAt || !merchant.isActive) throw new NotFoundException('Commerce non trouvé');

    // Anti-fraud: force amount=0 on REDEEM_REWARD (client-provided amount must never inflate analytics / lucky-wheel)
    if (type === 'REDEEM_REWARD') {
      amount = 0;
    }

    // Validate points
    if (type === 'EARN_POINTS') {
      if (merchant.loyaltyType === 'STAMPS') {
        if (merchant.stampEarningMode === 'PER_AMOUNT') {
          // PER_AMOUNT — a purchase amount is required to derive expected stamps
          if (amount <= 0) {
            throw new BadRequestException(
              'Un montant d\'achat est requis pour les transactions en mode tampons',
            );
          }
          const pointsRate = merchant.pointsRate || DEFAULT_POINTS_RATE;
          const expectedStamps = Math.floor(amount / pointsRate);
          if (points !== expectedStamps) {
            throw new BadRequestException(
              `Nombre de tampons invalide. Attendu: ${expectedStamps}, reçu: ${points}`,
            );
          }
          // Anti-fraud: hard cap on stamps per single transaction
          if (points > MAX_STAMPS_PER_TX) {
            throw new BadRequestException(
              `Un maximum de ${MAX_STAMPS_PER_TX} tampons peut être attribué par transaction`,
            );
          }
        } else {
          // PER_VISIT (default) — exactly 1 stamp per visit, amount optional but never negative
          if (points !== 1) {
            throw new BadRequestException(
              'En mode tampon par visite, 1 seul tampon est attribué par visite',
            );
          }
          if (amount < 0) {
            throw new BadRequestException('Le montant ne peut pas être négatif');
          }
        }
      } else {
        // POINTS mode — a purchase amount is required to derive expected points
        if (amount <= 0) {
          throw new BadRequestException(
            'Un montant d\'achat est requis pour les transactions en mode points',
          );
        }
        const pointsRate = merchant.pointsRate || DEFAULT_POINTS_RATE;
        const expectedPoints = Math.floor(amount / pointsRate);
        if (points !== expectedPoints) {
          throw new BadRequestException(
            `Nombre de points invalide. Attendu: ${expectedPoints}, reçu: ${points}`,
          );
        }
        // Anti-fraud: hard cap on points per single transaction
        if (points > MAX_POINTS_PER_TX) {
          throw new BadRequestException(
            `Un maximum de ${MAX_POINTS_PER_TX} points peut être attribué par transaction`,
          );
        }
      }
    }

    let rewardTitle: string | undefined;
    if (type === 'REDEEM_REWARD') {
      if (!rewardId) {
        throw new BadRequestException('rewardId requis pour une récompense');
      }
      const reward = await this.rewardRepo.findFirst({
        where: { id: rewardId, merchantId },
        select: { cout: true, titre: true },
      });
      if (!reward) throw new BadRequestException('Cadeau invalide');
      if (points !== reward.cout) {
        throw new BadRequestException(
          `Nombre de points invalide. Attendu: ${reward.cout}, reçu: ${points}`,
        );
      }
      rewardTitle = reward.titre;
    }

    let result: {
      transaction: any;
      newPoints: number;
      actualPointsAdded: number;
      luckyWheelTicketsAwarded: number;
      _replayed?: boolean;
    };
    try {
      result = await withRetry(() =>
      this.txRunner.run(async (prisma) => {
        // Re-check client/merchant state INSIDE the transaction to avoid TOCTOU
        // (time-of-check vs time-of-use) on deletedAt / isActive.
        const [clientTx, merchantTx] = await Promise.all([
          prisma.client.findUnique({ where: { id: clientId }, select: { id: true, deletedAt: true } }),
          prisma.merchant.findUnique({ where: { id: merchantId }, select: { id: true, isActive: true, deletedAt: true } }),
        ]);
        if (!clientTx || clientTx.deletedAt) throw new NotFoundException('Client non trouvé');
        if (!merchantTx || merchantTx.deletedAt || !merchantTx.isActive) throw new NotFoundException('Commerce non trouvé');

        // Read (or create) the loyalty card INSIDE the transaction to prevent
        // race conditions where two concurrent requests read the same balance.
        let loyaltyCard = await prisma.loyaltyCard.findUnique({
          where: { clientId_merchantId: { clientId, merchantId } },
          select: { id: true, points: true, deactivatedAt: true },
        });

        if (loyaltyCard?.deactivatedAt) {
          throw new BadRequestException(
            'Le client a quitté ce programme de fidélité. Il doit rejoindre à nouveau avant de pouvoir accumuler des points.',
          );
        }

        if (!loyaltyCard) {
          // Enforce client limit for FREE plan before creating loyalty card
          await this.planService.assertCanAddClient(merchantId);
          loyaltyCard = await prisma.loyaltyCard.create({
            data: { clientId, merchantId, points: 0 },
            select: { id: true, points: true, deactivatedAt: true },
          });
        }

        // Enforce accumulation limit before creating the transaction
        if (type === 'EARN_POINTS' && merchant.accumulationLimit != null) {
          if (loyaltyCard.points >= merchant.accumulationLimit) {
            throw new BadRequestException(
              `Le client a atteint la limite d'accumulation (${merchant.accumulationLimit} ${merchant.loyaltyType === 'STAMPS' ? 'tampons' : 'points'})`,
            );
          }
        }

        let newPoints: number;
        let actualPointsAdded = points;

        if (type === 'EARN_POINTS') {
          newPoints = loyaltyCard.points + points;
          // Cap balance at accumulation limit if configured
          if (merchant.accumulationLimit != null && newPoints > merchant.accumulationLimit) {
            newPoints = merchant.accumulationLimit;
            // Provide accurate added points (capped)
            actualPointsAdded = newPoints - loyaltyCard.points;
          }
        } else if (type === 'REDEEM_REWARD') {
          if (loyaltyCard.points < points) {
            throw new BadRequestException('Pas assez de points pour cette récompense');
          }
          newPoints = loyaltyCard.points - points;
        } else {
          throw new BadRequestException('Type de transaction invalide');
        }

        const newTransaction = await prisma.transaction.create({
          data: {
            clientId,
            merchantId,
            rewardId: rewardId || null,
            teamMemberId: teamMemberId || null,
            performedByName: performedByName || null,
            type,
            loyaltyType: merchant.loyaltyType || 'POINTS',
            amount,
            points: type === 'EARN_POINTS' ? actualPointsAdded : points,
            idempotencyKey: idempotencyKey || null,
            ...(type === 'REDEEM_REWARD' ? { giftStatus: 'FULFILLED', fulfilledAt: new Date() } : {}),
          },
        });

        await prisma.loyaltyCard.update({
          where: { clientId_merchantId: { clientId, merchantId } },
          data: { points: newPoints },
        });

        // ── Lucky wheel: auto-create ticket for eligible active campaigns ──
        // Rules:
        //   ticketCostPoints > 0  → ticket granted on REDEEM_REWARD when points spent >= threshold
        //   ticketCostPoints == 0 → ticket granted on every EARN_POINTS (each visit)
        //   ticketEveryNVisits    → only grant on every N-th qualifying transaction
        let luckyWheelTicketsAwarded = 0;
        if (type === 'EARN_POINTS' || type === 'REDEEM_REWARD') {
          const activeCampaigns = await prisma.luckyWheelCampaign.findMany({
            where: {
              merchantId,
              status: 'ACTIVE',
              startsAt: { lte: new Date() },
              endsAt: { gte: new Date() },
            },
            select: { id: true, ticketCostPoints: true, ticketEveryNVisits: true, minSpendAmount: true, startsAt: true },
          });

          const eligibleCampaignIds: string[] = [];
          for (const c of activeCampaigns) {
            // Check minimum purchase amount threshold
            if (c.minSpendAmount > 0 && amount < c.minSpendAmount) continue;
            // Determine if this transaction type qualifies
            if (c.ticketCostPoints > 0) {
              // Cost-based: only on REDEEM_REWARD with enough points spent
              if (type !== 'REDEEM_REWARD' || points < c.ticketCostPoints) continue;
            } else {
              // Free: only on EARN_POINTS (each visit)
              if (type !== 'EARN_POINTS') continue;
            }
            // Check every-N-visits rule
            if (c.ticketEveryNVisits && c.ticketEveryNVisits > 1) {
              // Count qualifying transactions (not tickets) to avoid deadlock:
              // tickets are only created when the modulo passes, so counting
              // tickets would keep the count at 0 forever.
              const qualifyingTxCount = await prisma.transaction.count({
                where: {
                  clientId,
                  merchantId,
                  type: c.ticketCostPoints > 0 ? 'REDEEM_REWARD' : 'EARN_POINTS',
                  createdAt: { gte: c.startsAt },
                },
              });
              // qualifyingTxCount includes the current transaction (already created above)
              if (qualifyingTxCount % c.ticketEveryNVisits !== 0) continue;
            }
            eligibleCampaignIds.push(c.id);
          }

          if (eligibleCampaignIds.length > 0) {
            await prisma.luckyWheelTicket.createMany({
              data: eligibleCampaignIds.map((cId) => ({
                campaignId: cId,
                clientId,
                transactionId: newTransaction.id,
              })),
            });
            luckyWheelTicketsAwarded = eligibleCampaignIds.length;
          }
        }

        return { transaction: newTransaction, newPoints, actualPointsAdded, luckyWheelTicketsAwarded };
      }, {
        // RepeatableRead prevents lost-update race conditions on the loyalty card balance
        // while being significantly less contended than Serializable.
        isolationLevel: 'RepeatableRead',
      }),
    );
    } catch (err: any) {
      // Race-condition idempotency: two concurrent requests with the same
      // (merchantId, idempotencyKey) passed the pre-check and both tried to
      // INSERT. The second hits the partial UNIQUE index (P2002). Resolve by
      // returning the transaction that won the race (tagged as _replayed so
      // downstream side-effects — WS/push notifications — are skipped).
      if (idempotencyKey && err?.code === 'P2002') {
        const existing = await this.transactionRepoDelegate.findFirst({
          where: { merchantId, idempotencyKey },
        });
        if (existing) {
          const currentCard = await this.loyaltyCardRepo.findUnique({
            where: { clientId_merchantId: { clientId, merchantId } },
            select: { points: true },
          });
          result = {
            transaction: existing,
            newPoints: currentCard?.points ?? 0,
            actualPointsAdded: existing.points,
            luckyWheelTicketsAwarded: 0,
            _replayed: true,
          };
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    // Idempotency replay: skip side-effects (WS, push) — the winning request already fired them.
    if (result._replayed) {
      return result.transaction;
    }

    // ── Real-time: emit WebSocket events IMMEDIATELY (sub-100ms) ──
    this.eventsGateway.emitPointsUpdated(clientId, {
      clientId,
      merchantId,
      merchantName: merchant!.nom,
      loyaltyType: (merchant!.loyaltyType as 'POINTS' | 'STAMPS') || 'POINTS',
      points: type === 'EARN_POINTS' ? result.actualPointsAdded : points,
      newBalance: result.newPoints,
      type,
      rewardTitle,
    });

    this.eventsGateway.emitTransactionRecorded(merchantId, {
      merchantId,
      clientId,
      clientName: '', // Filled by the client lookup below (non-blocking)
      transactionId: result.transaction.id,
      type,
      points: type === 'EARN_POINTS' ? result.actualPointsAdded : points,
      newBalance: result.newPoints,
    });

    // ── Send push notifications (fire-and-forget — FCM fallback for background/offline) ──
    this.sendTransactionNotifications(
      clientId,
      merchantId,
      merchant!,
      type,
      type === 'EARN_POINTS' ? result.actualPointsAdded : points,
      result.newPoints,
      client.language,
      rewardId,
      rewardTitle,
    ).catch((err) => this.logger.warn(`Transaction notification failed: ${errMsg(err)}`));

    // ── Lucky-wheel ticket notification ──
    if (result.luckyWheelTicketsAwarded > 0) {
      const t = getNotifTranslations(client.language);
      this.notifications.sendToClient(
        merchantId,
        clientId,
        t.luckyWheelTicketTitle(result.luckyWheelTicketsAwarded),
        t.luckyWheelTicketBody(result.luckyWheelTicketsAwarded, merchant!.nom),
        { event: 'lucky_wheel_ticket', merchantId, tickets: String(result.luckyWheelTicketsAwarded) },
      ).catch((err) => this.logger.warn(`Lucky-wheel ticket notification failed: ${errMsg(err)}`));
    }

    return result.transaction;
  }

  async getTransactions(merchantId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const where = { merchantId, type: { not: 'LOYALTY_PROGRAM_CHANGE' as const } };

    const [transactions, total] = await Promise.all([
      this.transactionRepoDelegate.findMany({
        where,
        select: {
          id: true,
          clientId: true,
          merchantId: true,
          rewardId: true,
          teamMemberId: true,
          performedByName: true,
          type: true,
          loyaltyType: true,
          amount: true,
          points: true,
          status: true,
          giftStatus: true,
          fulfilledAt: true,
          note: true,
          createdAt: true,
          client: { select: { id: true, prenom: true, nom: true, shareInfoMerchants: true } },
          teamMember: { select: { id: true, nom: true } },
          reward: { select: { titre: true, cout: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.transactionRepoDelegate.count({ where }),
    ]);

    const maskedTransactions = transactions.map((tx: any) => {
      if (tx.client && tx.client.shareInfoMerchants === false) {
        return {
          ...tx,
          client: {
            ...tx.client,
            prenom: maskName(tx.client.prenom),
            nom: maskName(tx.client.nom),
          },
        };
      }
      return tx;
    });

    return {
      transactions: maskedTransactions,
      pagination: buildPagination(total, page, limit),
    };
  }

  async cancelTransaction(transactionId: string, merchantId: string) {
    // Race-condition fix: all checks + mutations inside a Serializable transaction
    const result = await withRetry(() =>
      this.txRunner.run(async (prisma) => {
        const transaction = await prisma.transaction.findUnique({
          where: { id: transactionId },
          select: { id: true, merchantId: true, clientId: true, type: true, points: true, status: true },
        });

        if (!transaction) throw new NotFoundException('Transaction non trouvée');
        if (transaction.merchantId !== merchantId) {
          throw new BadRequestException('Cette transaction ne vous appartient pas');
        }
        if (transaction.status === 'CANCELLED') {
          throw new BadRequestException('Cette transaction est déjà annulée');
        }
        const cancelledTransaction = await prisma.transaction.update({
          where: { id: transactionId },
          data: { status: 'CANCELLED' },
        });

        const loyaltyCard = await prisma.loyaltyCard.findUnique({
          where: { clientId_merchantId: { clientId: transaction.clientId, merchantId } },
          select: { id: true, points: true },
        });

        if (!loyaltyCard) throw new NotFoundException('Carte de fidélité non trouvée');

        let newPoints: number;
        if (transaction.type === 'EARN_POINTS') {
          newPoints = Math.max(0, loyaltyCard.points - transaction.points);
        } else if (transaction.type === 'REDEEM_REWARD') {
          newPoints = loyaltyCard.points + transaction.points;
        } else if (transaction.type === 'ADJUST_POINTS') {
          newPoints = Math.max(0, loyaltyCard.points - transaction.points);
        } else {
          throw new BadRequestException('Type de transaction invalide');
        }

        await prisma.loyaltyCard.update({
          where: { clientId_merchantId: { clientId: transaction.clientId, merchantId } },
          data: { points: newPoints },
        });

        return cancelledTransaction;
      }, { isolationLevel: 'Serializable' }),
    );

    this.auditLogService.log({
      ctx: { actorType: 'MERCHANT', merchantId },
      action: AuditAction.CANCEL_TRANSACTION,
      targetType: AuditTargetType.MERCHANT,
      targetId: transactionId,
      metadata: { transactionType: result.type },
    });

    return result;
  }


  async fulfillGift(transactionId: string, merchantId: string) {
    return withRetry(() =>
      this.txRunner.run(async (prisma) => {
        const transaction = await prisma.transaction.findUnique({
          where: { id: transactionId },
          select: { id: true, merchantId: true, type: true, status: true, giftStatus: true },
        });

        if (!transaction) throw new NotFoundException('Transaction non trouvee');
        if (transaction.merchantId !== merchantId) {
          throw new BadRequestException('Cette transaction ne vous appartient pas');
        }
        if (transaction.type !== 'REDEEM_REWARD') {
          throw new BadRequestException('Seules les transactions cadeau peuvent etre marquees comme remises');
        }
        if (transaction.status === 'CANCELLED') {
          throw new BadRequestException('Cette transaction est annulee');
        }
        if (transaction.giftStatus === 'FULFILLED') {
          throw new BadRequestException('Ce cadeau a deja ete remis');
        }

        return prisma.transaction.update({
          where: { id: transactionId },
          data: { giftStatus: 'FULFILLED', fulfilledAt: new Date() },
        });
      }, { isolationLevel: 'Serializable' }),
    );
  }

  async getPendingGifts(merchantId: string) {
    const transactions = await this.transactionRepoDelegate.findMany({
      where: {
        merchantId,
        type: 'REDEEM_REWARD',
        status: 'ACTIVE',
        giftStatus: 'PENDING',
      },
      select: {
        id: true,
        clientId: true,
        rewardId: true,
        points: true,
        giftStatus: true,
        createdAt: true,
        client: { select: { id: true, prenom: true, nom: true, email: true, shareInfoMerchants: true } },
        reward: { select: { id: true, titre: true, cout: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return transactions.map((tx: any) => {
      if (tx.client && tx.client.shareInfoMerchants === false) {
        return {
          ...tx,
          client: {
            ...tx.client,
            prenom: maskName(tx.client.prenom),
            nom: maskName(tx.client.nom),
            email: null,
          },
        };
      }
      return tx;
    });
  }

  // â”€â”€â”€ Private: Transaction Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // ─── Private: Transaction Notifications ──────────────────────────────────
  private async sendTransactionNotifications(
    clientId: string,
    merchantId: string,
    merchant: { nom: string; loyaltyType: string | null; stampsForReward: number | null; pointsRules: unknown; conversionRate: number | null },
    type: 'EARN_POINTS' | 'REDEEM_REWARD',
    points: number,
    newPoints: number,
    clientLanguage?: string | null,
    rewardId?: string,
    rewardTitle?: string,
  ): Promise<void> {
    const t = getNotifTranslations(clientLanguage);
    const isStamps = merchant.loyaltyType === 'STAMPS';
    const unitFor = (n: number) => isStamps ? t.unitStamps(n) : t.unitPoints(n);
    const unit = unitFor(points);

    // FCM data payload for instant client-side cache invalidation
    const pushData: Record<string, string> = {
      event: 'points_updated',
      merchantId,
      newBalance: String(newPoints),
      points: String(points),
      type,
      loyaltyType: merchant.loyaltyType || 'POINTS',
    };

    if (type === 'EARN_POINTS') {
      // 1. Notify: points/stamps earned
      await this.notifications.sendToClient(
        merchantId,
        clientId,
        t.earnTitle(points, unit),
        t.earnBody(points, unit, merchant.nom, newPoints, unitFor(newPoints)),
        pushData,
      );

      // 2. Check if client just reached the reward threshold → reward available!
      const pointsRules = merchant.pointsRules as PointsRules | null;
      const threshold = computeRewardThreshold(merchant, pointsRules);
      const previousPoints = newPoints - points;

      if (previousPoints < threshold && newPoints >= threshold) {
        await this.notifications.sendToClient(
          merchantId,
          clientId,
          t.rewardAvailableTitle,
          t.rewardAvailableBody(threshold, isStamps ? t.unitStamps(threshold) : t.unitPoints(threshold), merchant.nom),
          { ...pushData, event: 'reward_available' },
        );
      }
    } else if (type === 'REDEEM_REWARD') {
      // 3. Notify: points redeemed (rewardTitle passed from createTransaction — no extra DB query)
      const rewardName = rewardTitle ?? t.redeemFallbackReward;

      await this.notifications.sendToClient(
        merchantId,
        clientId,
        t.redeemTitle,
        t.redeemBody(points, unit, rewardName, merchant.nom, newPoints, unitFor(newPoints)),
        { ...pushData, event: 'reward_redeemed', rewardTitle: rewardName },
      );
    }
  }

  // â”€â”€â”€ Adjust Points (add / modify / remove) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async adjustPoints(
    clientId: string,
    merchantId: string,
    points: number,
    note?: string,
    teamMemberId?: string,
    performedByName?: string,
  ) {
    if (points === 0) {
      throw new BadRequestException('Le nombre de points ne peut pas être zéro');
    }

    const [client, merchant] = await Promise.all([
      this.clientRepo.findUnique({
        where: { id: clientId },
        select: { id: true, language: true },
      }),
      this.merchantRepo.findUnique({
        where: { id: merchantId },
        select: { nom: true, loyaltyType: true, accumulationLimit: true },
      }),
    ]);
    if (!client) throw new NotFoundException('Client non trouvé');
    if (!merchant) throw new NotFoundException('Commerce non trouvé');

    const result = await withRetry(() =>
      this.txRunner.run(async (prisma) => {
        let loyaltyCard = await prisma.loyaltyCard.findUnique({
          where: { clientId_merchantId: { clientId, merchantId } },
          select: { id: true, points: true, deactivatedAt: true },
        });

        if (loyaltyCard?.deactivatedAt) {
          throw new BadRequestException(
            'Le client a quitté ce programme de fidélité. Il doit rejoindre à nouveau.',
          );
        }

        if (!loyaltyCard) {
          // Enforce client limit for FREE plan
          await this.planService.assertCanAddClient(merchantId);
          loyaltyCard = await prisma.loyaltyCard.create({
            data: { clientId, merchantId, points: 0 },
            select: { id: true, points: true, deactivatedAt: true },
          });
        }

        let newPoints = loyaltyCard.points + points;
        let actualPointsAdjusted = points;

        // Cap at accumulation limit for positive adjustments
        if (points > 0 && merchant.accumulationLimit != null && newPoints > merchant.accumulationLimit) {
          newPoints = merchant.accumulationLimit;
          actualPointsAdjusted = newPoints - loyaltyCard.points;
        }

        // If capping resulted in 0 effective points, the client is already at the limit
        if (points > 0 && actualPointsAdjusted <= 0) {
          throw new BadRequestException(
            `Le client a atteint la limite d'accumulation (${merchant.accumulationLimit} ${merchant.loyaltyType === 'STAMPS' ? 'tampons' : 'points'})`,
          );
        }

        if (newPoints < 0) {
          throw new BadRequestException(
            `Points insuffisants. Le client a ${loyaltyCard.points} ${merchant.loyaltyType === 'STAMPS' ? 'tampons' : 'points'}, impossible de retirer ${Math.abs(points)}.`,
          );
        }

        const newTransaction = await prisma.transaction.create({
          data: {
            clientId,
            merchantId,
            teamMemberId: teamMemberId || null,
            performedByName: performedByName || null,
            type: 'ADJUST_POINTS',
            loyaltyType: merchant.loyaltyType || 'POINTS',
            amount: 0,
            points: actualPointsAdjusted,
            note: note || null,
          },
        });

        await prisma.loyaltyCard.update({
          where: { clientId_merchantId: { clientId, merchantId } },
          data: { points: newPoints },
        });

        return { transaction: newTransaction, newPoints, previousPoints: loyaltyCard.points, actualPointsAdjusted };
      }, { isolationLevel: 'Serializable' }),
    );

    // â”€â”€ Send push notification (fire-and-forget) â”€â”€
    const t = getNotifTranslations(client.language);
    const isStamps = merchant.loyaltyType === 'STAMPS';
    const isAdd = result.actualPointsAdjusted > 0;
    const absPoints = Math.abs(result.actualPointsAdjusted);
    const unit = isStamps ? t.unitStamps(absPoints) : t.unitPoints(absPoints);

    const title = isAdd
      ? t.adjustAddTitle(absPoints, unit)
      : t.adjustRemoveTitle(absPoints, unit);

    let body = isAdd
      ? t.adjustAddBody(absPoints, unit, merchant.nom)
      : t.adjustRemoveBody(absPoints, unit, merchant.nom);

    if (note) {
      body += t.adjustReason(note);
    }

    body += t.adjustBalance(result.newPoints, isStamps ? t.unitStamps(result.newPoints) : t.unitPoints(result.newPoints));

    // ── Real-time: emit WebSocket event for instant UI update ──
    this.eventsGateway.emitPointsUpdated(clientId, {
      clientId,
      merchantId,
      merchantName: merchant.nom,
      loyaltyType: (merchant.loyaltyType as 'POINTS' | 'STAMPS') || 'POINTS',
      points: absPoints,
      newBalance: result.newPoints,
      type: 'ADJUST_POINTS',
    });

    this.eventsGateway.emitTransactionRecorded(merchantId, {
      merchantId,
      clientId,
      clientName: '',
      transactionId: result.transaction.id,
      type: 'ADJUST_POINTS',
      points: absPoints,
      newBalance: result.newPoints,
    });

    this.notifications.sendToClient(merchantId, clientId, title, body, {
      event: 'points_updated',
      merchantId,
      newBalance: String(result.newPoints),
      points: String(absPoints),
      type: 'ADJUST_POINTS',
      loyaltyType: merchant.loyaltyType || 'POINTS',
    })
      .catch((err) => this.logger.warn(`Adjust notification failed: ${errMsg(err)}`));

    return {
      transaction: result.transaction,
      previousPoints: result.previousPoints,
      newPoints: result.newPoints,
    };
  }
}
