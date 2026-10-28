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
import { NotificationsService } from '../../notifications/notifications.service';
import { EventsGateway } from '../../events';
import { MerchantPlanService } from './merchant-plan.service';
import { DEFAULT_AMOUNT_PER_STAMP } from '../../common/constants';
import { errMsg, maskName } from '../../common/utils';
import { MERCHANT_LOYALTY_SELECT } from '../../common/prisma-selects';
import { buildPagination } from '../../common/utils';
import { withRetry } from '../../common/utils/retry-transaction.helper';
import { computeEarnedStamps, computeRewardThreshold } from '../utils/loyalty.utils';
import { awardLuckyWheelTicketsInTx } from '../utils/lucky-wheel-tickets';
import { getNotifTranslations } from '../../common/utils/notification-i18n';

export interface CreateTransactionOptions {
  /**
   * Allow creating or reactivating the loyalty card. Only set when the caller
   * proved the client agreed to join (scan ticket from a signed QR / exact
   * phone match, or a merchant Quick-Add); otherwise an existing active card
   * is required, so a bare clientId cannot enroll anyone.
   */
  allowEnroll?: boolean;
}

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
  ) {}

  async createTransaction(
    clientId: string,
    merchantId: string,
    type: 'EARN_STAMPS' | 'REDEEM_REWARD',
    amount: number,
    stamps: number,
    rewardId?: string,
    teamMemberId?: string,
    performedByName?: string,
    idempotencyKey?: string,
    options: CreateTransactionOptions = {},
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

    // Validate stamps
    if (type === 'EARN_STAMPS') {
      if (merchant.stampEarningMode === 'PER_AMOUNT') {
        // PER_AMOUNT — a purchase amount is required to derive expected stamps
        if (amount <= 0) {
          throw new BadRequestException(
            'Un montant d\'achat est requis pour calculer les tampons',
          );
        }
        const amountPerStamp = merchant.amountPerStamp || DEFAULT_AMOUNT_PER_STAMP;
        // Capped at MAX_STAMPS_PER_TX (anti-fraud) — large purchases earn the cap, not an error
        const expectedStamps = computeEarnedStamps(amount, amountPerStamp);
        if (expectedStamps === 0) {
          throw new BadRequestException(
            `Montant insuffisant pour gagner un tampon (minimum ${amountPerStamp})`,
          );
        }
        if (stamps !== expectedStamps) {
          throw new BadRequestException(
            `Nombre de tampons invalide. Attendu: ${expectedStamps}, reçu: ${stamps}`,
          );
        }
      } else {
        // PER_VISIT (default) — exactly 1 stamp per visit, amount optional but never negative
        if (stamps !== 1) {
          throw new BadRequestException(
            'En mode tampon par visite, 1 seul tampon est attribué par visite',
          );
        }
        if (amount < 0) {
          throw new BadRequestException('Le montant ne peut pas être négatif');
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
      if (stamps !== reward.cout) {
        throw new BadRequestException(
          `Nombre de tampons invalide. Attendu: ${reward.cout}, reçu: ${stamps}`,
        );
      }
      rewardTitle = reward.titre;
    }

    let result: {
      transaction: any;
      newStamps: number;
      actualStampsAdded: number;
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
          select: { id: true, stamps: true, deactivatedAt: true },
        });

        if (loyaltyCard?.deactivatedAt) {
          if (!options.allowEnroll) {
            throw new BadRequestException(
              'Le client a quitté ce programme de fidélité. Il doit rejoindre à nouveau avant de pouvoir accumuler des tampons.',
            );
          }
          // A reactivated card counts against the FREE plan limit like a new one.
          await this.planService.assertCanAddClient(merchantId);
          loyaltyCard = await prisma.loyaltyCard.update({
            where: { id: loyaltyCard.id },
            data: { deactivatedAt: null },
            select: { id: true, stamps: true, deactivatedAt: true },
          });
        }

        if (!loyaltyCard) {
          if (!options.allowEnroll) throw new NotFoundException('Client non trouvé');
          // Enforce client limit for FREE plan before creating loyalty card
          await this.planService.assertCanAddClient(merchantId);
          loyaltyCard = await prisma.loyaltyCard.create({
            data: { clientId, merchantId, stamps: 0 },
            select: { id: true, stamps: true, deactivatedAt: true },
          });
        }

        // Enforce accumulation limit before creating the transaction
        if (type === 'EARN_STAMPS' && merchant.accumulationLimit != null) {
          if (loyaltyCard.stamps >= merchant.accumulationLimit) {
            throw new BadRequestException(
              `Le client a atteint la limite d'accumulation (${merchant.accumulationLimit} tampons)`,
            );
          }
        }

        let newStamps: number;
        let actualStampsAdded = stamps;

        if (type === 'EARN_STAMPS') {
          newStamps = loyaltyCard.stamps + stamps;
          // Cap balance at accumulation limit if configured
          if (merchant.accumulationLimit != null && newStamps > merchant.accumulationLimit) {
            newStamps = merchant.accumulationLimit;
            // Provide accurate added stamps (capped)
            actualStampsAdded = newStamps - loyaltyCard.stamps;
          }
        } else if (type === 'REDEEM_REWARD') {
          if (loyaltyCard.stamps < stamps) {
            throw new BadRequestException('Pas assez de tampons pour cette récompense');
          }
          newStamps = loyaltyCard.stamps - stamps;
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
            amount,
            stamps: type === 'EARN_STAMPS' ? actualStampsAdded : stamps,
            idempotencyKey: idempotencyKey || null,
            ...(type === 'REDEEM_REWARD' ? { giftStatus: 'FULFILLED', fulfilledAt: new Date() } : {}),
          },
        });

        await prisma.loyaltyCard.update({
          where: { clientId_merchantId: { clientId, merchantId } },
          data: { stamps: newStamps, lastVisitAt: new Date(), expiryReminderSentAt: null },
        });

        const luckyWheelTicketsAwarded = await awardLuckyWheelTicketsInTx(prisma, {
          clientId,
          merchantId,
          type,
          amount,
          stamps,
          transactionId: newTransaction.id,
        });

        return { transaction: newTransaction, newStamps, actualStampsAdded, luckyWheelTicketsAwarded };
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
            select: { stamps: true },
          });
          result = {
            transaction: existing,
            newStamps: currentCard?.stamps ?? 0,
            actualStampsAdded: existing.stamps,
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
    this.eventsGateway.emitStampsUpdated(clientId, {
      clientId,
      merchantId,
      merchantName: merchant!.nom,
      stamps: type === 'EARN_STAMPS' ? result.actualStampsAdded : stamps,
      newBalance: result.newStamps,
      type,
      rewardTitle,
    });

    this.eventsGateway.emitTransactionRecorded(merchantId, {
      merchantId,
      clientId,
      clientName: '', // Filled by the client lookup below (non-blocking)
      transactionId: result.transaction.id,
      type,
      stamps: type === 'EARN_STAMPS' ? result.actualStampsAdded : stamps,
      newBalance: result.newStamps,
    });

    // ── Send push notifications (fire-and-forget — FCM fallback for background/offline) ──
    this.sendTransactionNotifications(
      clientId,
      merchantId,
      merchant!,
      type,
      type === 'EARN_STAMPS' ? result.actualStampsAdded : stamps,
      result.newStamps,
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
          amount: true,
          stamps: true,
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

  // ─── Private: Transaction Notifications ──────────────────────────────────
  private async sendTransactionNotifications(
    clientId: string,
    merchantId: string,
    merchant: { nom: string; stampsForReward: number | null; rewards?: { cout: number }[] },
    type: 'EARN_STAMPS' | 'REDEEM_REWARD',
    stamps: number,
    newStamps: number,
    clientLanguage?: string | null,
    rewardId?: string,
    rewardTitle?: string,
  ): Promise<void> {
    const t = getNotifTranslations(clientLanguage);
    const unit = t.unitStamps(stamps);

    // FCM data payload for instant client-side cache invalidation
    const pushData: Record<string, string> = {
      event: 'stamps_updated',
      merchantId,
      merchantName: merchant.nom,
      newBalance: String(newStamps),
      stamps: String(stamps),
      type,
    };

    if (type === 'EARN_STAMPS') {
      // 1. Notify: stamps earned
      await this.notifications.sendToClient(
        merchantId,
        clientId,
        t.earnTitle(stamps, unit),
        t.earnBody(stamps, unit, merchant.nom, newStamps, t.unitStamps(newStamps)),
        pushData,
      );

      // 2. Check if client just reached the reward threshold → reward available!
      const threshold = computeRewardThreshold(merchant);
      const previousStamps = newStamps - stamps;

      if (previousStamps < threshold && newStamps >= threshold) {
        await this.notifications.sendToClient(
          merchantId,
          clientId,
          t.rewardAvailableTitle,
          t.rewardAvailableBody(threshold, t.unitStamps(threshold), merchant.nom),
          { ...pushData, event: 'reward_available' },
        );
      }
    } else if (type === 'REDEEM_REWARD') {
      // 3. Notify: stamps redeemed (rewardTitle passed from createTransaction — no extra DB query)
      const rewardName = rewardTitle ?? t.redeemFallbackReward;

      await this.notifications.sendToClient(
        merchantId,
        clientId,
        t.redeemTitle,
        t.redeemBody(stamps, unit, rewardName, merchant.nom, newStamps, t.unitStamps(newStamps)),
        { ...pushData, event: 'reward_redeemed', rewardTitle: rewardName },
      );
    }
  }

  // ─── Adjust Stamps (add / modify / remove) ───────────────────────────────
  async adjustStamps(
    clientId: string,
    merchantId: string,
    stamps: number,
    note?: string,
    teamMemberId?: string,
    performedByName?: string,
  ) {
    if (stamps === 0) {
      throw new BadRequestException('Le nombre de tampons ne peut pas être zéro');
    }

    const [client, merchant] = await Promise.all([
      this.clientRepo.findUnique({
        where: { id: clientId },
        select: { id: true, language: true, deletedAt: true },
      }),
      this.merchantRepo.findUnique({
        where: { id: merchantId },
        select: { nom: true, accumulationLimit: true, isActive: true, deletedAt: true },
      }),
    ]);
    if (!client || client.deletedAt) throw new NotFoundException('Client non trouvé');
    if (!merchant || merchant.deletedAt || !merchant.isActive) throw new NotFoundException('Commerce non trouvé');

    const result = await withRetry(() =>
      this.txRunner.run(async (prisma) => {
        // Re-check inside the transaction (TOCTOU on deletedAt / isActive).
        const [clientTx, merchantTx] = await Promise.all([
          prisma.client.findUnique({ where: { id: clientId }, select: { id: true, deletedAt: true } }),
          prisma.merchant.findUnique({ where: { id: merchantId }, select: { id: true, isActive: true, deletedAt: true } }),
        ]);
        if (!clientTx || clientTx.deletedAt) throw new NotFoundException('Client non trouvé');
        if (!merchantTx || merchantTx.deletedAt || !merchantTx.isActive) throw new NotFoundException('Commerce non trouvé');

        // Adjustments only apply to existing members: they never enroll a client.
        const loyaltyCard = await prisma.loyaltyCard.findUnique({
          where: { clientId_merchantId: { clientId, merchantId } },
          select: { id: true, stamps: true, deactivatedAt: true },
        });
        if (!loyaltyCard) throw new NotFoundException('Client non trouvé');

        if (loyaltyCard.deactivatedAt) {
          throw new BadRequestException(
            'Le client a quitté ce programme de fidélité. Il doit rejoindre à nouveau.',
          );
        }

        let newStamps = loyaltyCard.stamps + stamps;
        let actualStampsAdjusted = stamps;

        // Cap at accumulation limit for positive adjustments
        if (stamps > 0 && merchant.accumulationLimit != null && newStamps > merchant.accumulationLimit) {
          newStamps = merchant.accumulationLimit;
          actualStampsAdjusted = newStamps - loyaltyCard.stamps;
        }

        // If capping resulted in 0 effective stamps, the client is already at the limit
        if (stamps > 0 && actualStampsAdjusted <= 0) {
          throw new BadRequestException(
            `Le client a atteint la limite d'accumulation (${merchant.accumulationLimit} tampons)`,
          );
        }

        if (newStamps < 0) {
          throw new BadRequestException(
            `Tampons insuffisants. Le client a ${loyaltyCard.stamps} tampons, impossible de retirer ${Math.abs(stamps)}.`,
          );
        }

        const newTransaction = await prisma.transaction.create({
          data: {
            clientId,
            merchantId,
            teamMemberId: teamMemberId || null,
            performedByName: performedByName || null,
            type: 'ADJUST_STAMPS',
            amount: 0,
            stamps: actualStampsAdjusted,
            note: note || null,
          },
        });

        await prisma.loyaltyCard.update({
          where: { clientId_merchantId: { clientId, merchantId } },
          data: { stamps: newStamps },
        });

        return { transaction: newTransaction, newStamps, previousStamps: loyaltyCard.stamps, actualStampsAdjusted };
      }, { isolationLevel: 'Serializable' }),
    );

    // ── Send push notification (fire-and-forget) ──
    const t = getNotifTranslations(client.language);
    const isAdd = result.actualStampsAdjusted > 0;
    const absStamps = Math.abs(result.actualStampsAdjusted);
    const unit = t.unitStamps(absStamps);

    const title = isAdd
      ? t.adjustAddTitle(absStamps, unit)
      : t.adjustRemoveTitle(absStamps, unit);

    let body = isAdd
      ? t.adjustAddBody(absStamps, unit, merchant.nom)
      : t.adjustRemoveBody(absStamps, unit, merchant.nom);

    if (note) {
      body += t.adjustReason(note);
    }

    body += t.adjustBalance(result.newStamps, t.unitStamps(result.newStamps));

    // ── Real-time: emit WebSocket event for instant UI update ──
    this.eventsGateway.emitStampsUpdated(clientId, {
      clientId,
      merchantId,
      merchantName: merchant.nom,
      stamps: absStamps,
      newBalance: result.newStamps,
      type: 'ADJUST_STAMPS',
    });

    this.eventsGateway.emitTransactionRecorded(merchantId, {
      merchantId,
      clientId,
      clientName: '',
      transactionId: result.transaction.id,
      type: 'ADJUST_STAMPS',
      stamps: absStamps,
      newBalance: result.newStamps,
    });

    this.notifications.sendToClient(merchantId, clientId, title, body, {
      event: 'stamps_updated',
      merchantId,
      newBalance: String(result.newStamps),
      stamps: String(absStamps),
      type: 'ADJUST_STAMPS',
    })
      .catch((err) => this.logger.warn(`Adjust notification failed: ${errMsg(err)}`));

    return {
      transaction: result.transaction,
      previousStamps: result.previousStamps,
      newStamps: result.newStamps,
    };
  }
}
