import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
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
  STAMP_CODE_REPOSITORY, type IStampCodeRepository,
  type TransactionClient,
} from '../../common/repositories';
import { NotificationsService } from '../../notifications/notifications.service';
import { EventsGateway } from '../../events';
import { MerchantPlanService } from './merchant-plan.service';
import type { MerchantPlan } from '@prisma/client';
import { DEFAULT_AMOUNT_PER_STAMP } from '../../common/constants';
import { errMsg, maskName } from '../../common/utils';
import { MERCHANT_LOYALTY_SELECT } from '../../common/prisma-selects';
import { buildPagination } from '../../common/utils';
import { withRetry } from '../../common/utils/retry-transaction.helper';
import { computeEarnedStamps, computeRewardThreshold } from '../utils/loyalty.utils';
import { awardLuckyWheelTicketsInTx } from '../utils/lucky-wheel-tickets';
import type { MerchantTransactionType } from '../dto/create-transaction.dto';
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

/** Shown as "performed by" on transactions credited from an e-commerce QR code. */
export const STAMP_CODE_PERFORMER = 'E-commerce';

export interface StampCodeRedeemResult {
  success: true;
  /** True when this client had already used the code (re-scan): nothing was credited again */
  alreadyRedeemed: boolean;
  stamps: number;
  newBalance: number;
  merchant: { id: string; nom: string };
}

interface ApplyTransactionParams {
  clientId: string;
  merchantId: string;
  type: MerchantTransactionType;
  amount: number;
  stamps: number;
  rewardId?: string;
  teamMemberId?: string;
  performedByName?: string;
  idempotencyKey?: string;
  allowEnroll: boolean;
  accumulationLimit: number | null;
  stampCodeId?: string;
  /** Resolved before the transaction when enrolment is possible (see assertCanAddClient). */
  plan?: MerchantPlan;
}

interface AppliedTransaction {
  transaction: any;
  newStamps: number;
  actualStampsAdded: number;
  luckyWheelTicketsAwarded: number;
  _replayed?: boolean;
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
    @Inject(STAMP_CODE_REPOSITORY) private stampCodeRepo: IStampCodeRepository,
  ) {}

  async createTransaction(
    clientId: string,
    merchantId: string,
    type: MerchantTransactionType,
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
    } else if (type === 'PURCHASE') {
      // Stamp-less purchase: only exists to give a lucky-wheel spin (checked in the transaction)
      if (stamps !== 0) {
        throw new BadRequestException('Un achat sans tampon ne peut pas attribuer de tampons');
      }
      if (amount <= 0) {
        throw new BadRequestException('Un montant d\'achat est requis');
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

    // Resolved outside the transaction: enrolment checks the FREE client limit.
    const plan = options.allowEnroll ? (await this.planService.resolveEffectivePlan(merchantId)).plan : undefined;

    let result: AppliedTransaction;
    try {
      result = await withRetry(() =>
        this.txRunner.run(
          (prisma) => this.applyTransactionInTx(prisma, {
            clientId,
            merchantId,
            type,
            amount,
            stamps,
            rewardId,
            teamMemberId,
            performedByName,
            idempotencyKey,
            allowEnroll: !!options.allowEnroll,
            accumulationLimit: merchant.accumulationLimit,
            plan,
          }),
          // RepeatableRead prevents lost-update race conditions on the loyalty card balance
          // while being significantly less contended than Serializable.
          { isolationLevel: 'RepeatableRead' },
        ),
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

    this.dispatchTransactionSideEffects({
      clientId,
      merchantId,
      merchant: merchant!,
      clientLanguage: client.language,
      type,
      stamps,
      rewardId,
      rewardTitle,
      result,
    });

    return result.transaction;
  }

  // ─── E-commerce QR code (scanned by the client from a parcel) ────────────
  /**
   * Credit the stamps of a single-use e-commerce QR code to the scanning
   * client. Marking the code used and crediting the card happen in the same
   * database transaction: a failure (plan limit, accumulation cap…) leaves
   * the code usable, and two concurrent scans can never both succeed.
   * Scanning again a code this client already used is an idempotent success.
   */
  async redeemStampCode(clientId: string, codeId: string): Promise<StampCodeRedeemResult> {
    const code = await this.stampCodeRepo.findUnique({
      where: { id: codeId },
      select: { id: true, merchantId: true, stamps: true, amount: true, status: true, redeemedByClientId: true },
    });
    if (!code) throw new NotFoundException({ code: 'STAMP_CODE_INVALID', message: 'QR code invalide' });
    if (code.status === 'REVOKED') {
      throw new GoneException({ code: 'STAMP_CODE_REVOKED', message: 'Ce QR code a été désactivé par le commerce' });
    }

    const [client, merchant] = await Promise.all([
      this.clientRepo.findUnique({
        where: { id: clientId },
        select: { id: true, language: true, deletedAt: true },
      }),
      this.merchantRepo.findUnique({
        where: { id: code.merchantId },
        select: { id: true, nom: true, isActive: true, deletedAt: true, ...MERCHANT_LOYALTY_SELECT },
      }),
    ]);
    if (!client || client.deletedAt) throw new NotFoundException('Client non trouvé');
    if (!merchant || merchant.deletedAt || !merchant.isActive) {
      throw new NotFoundException({ code: 'STAMP_CODE_INVALID', message: 'Commerce non trouvé' });
    }
    const merchantInfo = { id: merchant.id, nom: merchant.nom };

    if (code.status === 'REDEEMED') {
      return this.stampCodeReplay(clientId, code, merchantInfo);
    }

    const plan = (await this.planService.resolveEffectivePlan(code.merchantId)).plan;
    const claimAndCredit = () => withRetry(() =>
      this.txRunner.run(async (prisma) => {
        // Claim the code first: only one scan can move it out of ACTIVE.
        const claimed = await prisma.stampCode.updateMany({
          where: { id: code.id, status: 'ACTIVE' },
          data: { status: 'REDEEMED', redeemedByClientId: clientId, redeemedAt: new Date() },
        });
        if (claimed.count !== 1) {
          throw new ConflictException({ code: 'STAMP_CODE_USED', message: 'Ce QR code a déjà été utilisé' });
        }

        // The client scanning the code is the proof of consent to join. Any
        // refusal below (plan limit, accumulation cap) rolls the claim back.
        return this.applyTransactionInTx(prisma, {
          clientId,
          merchantId: code.merchantId,
          type: 'EARN_STAMPS',
          amount: code.amount,
          stamps: code.stamps,
          performedByName: STAMP_CODE_PERFORMER,
          allowEnroll: true,
          accumulationLimit: merchant.accumulationLimit,
          stampCodeId: code.id,
          plan,
        });
      }, { isolationLevel: 'RepeatableRead' }),
    );

    let result: AppliedTransaction;
    try {
      try {
        result = await claimAndCredit();
      } catch (err: any) {
        // A new client redeeming two parcels at once: both transactions create
        // the same loyalty card and the loser hits the unique index (P2002, not
        // a serialization failure). Its claim rolled back: one retry finds the card.
        if (err?.code !== 'P2002') throw err;
        result = await claimAndCredit();
      }
    } catch (err) {
      // Lost a race against a double tap of the same client: same answer as a re-scan.
      if (err instanceof ConflictException) {
        const fresh = await this.stampCodeRepo.findUnique({ where: { id: code.id }, select: { redeemedByClientId: true } });
        if (fresh?.redeemedByClientId === clientId) {
          return this.stampCodeReplay(clientId, { ...code, redeemedByClientId: clientId }, merchantInfo);
        }
      }
      // FREE plan full: the client must not see the merchant's upsell message.
      if (err instanceof ForbiddenException) {
        throw new ForbiddenException({
          code: 'MERCHANT_CLIENT_LIMIT',
          message: 'Ce commerce ne peut pas ajouter de nouveaux clients pour le moment',
        });
      }
      throw err;
    }

    this.dispatchTransactionSideEffects({
      clientId,
      merchantId: code.merchantId,
      merchant,
      clientLanguage: client.language,
      type: 'EARN_STAMPS',
      stamps: code.stamps,
      result,
    });

    return {
      success: true,
      alreadyRedeemed: false,
      stamps: result.actualStampsAdded,
      newBalance: result.newStamps,
      merchant: merchantInfo,
    };
  }

  private async stampCodeReplay(
    clientId: string,
    code: { merchantId: string; stamps: number; redeemedByClientId: string | null },
    merchant: StampCodeRedeemResult['merchant'],
  ): Promise<StampCodeRedeemResult> {
    if (code.redeemedByClientId !== clientId) {
      throw new ConflictException({ code: 'STAMP_CODE_USED', message: 'Ce QR code a déjà été utilisé' });
    }
    const card = await this.loyaltyCardRepo.findUnique({
      where: { clientId_merchantId: { clientId, merchantId: code.merchantId } },
      select: { stamps: true },
    });
    return { success: true, alreadyRedeemed: true, stamps: code.stamps, newBalance: card?.stamps ?? 0, merchant };
  }

  // ─── Private: credit / debit inside a database transaction ───────────────
  /**
   * Card read-or-enroll, balance update, transaction row and lucky-wheel
   * tickets. Runs inside the caller's database transaction; the caller has
   * already validated the stamps / amount for the transaction type.
   */
  private async applyTransactionInTx(prisma: TransactionClient, p: ApplyTransactionParams): Promise<AppliedTransaction> {
    const { clientId, merchantId, type, amount, stamps, accumulationLimit } = p;

    // Re-check client/merchant state INSIDE the transaction to avoid TOCTOU
    // (time-of-check vs time-of-use) on deletedAt / isActive.
    const [clientTx, merchantTx] = await Promise.all([
      prisma.client.findUnique({ where: { id: clientId }, select: { id: true, deletedAt: true } }),
      prisma.merchant.findUnique({ where: { id: merchantId }, select: { id: true, isActive: true, deletedAt: true } }),
    ]);
    if (!clientTx || clientTx.deletedAt) throw new NotFoundException('Client non trouvé');
    if (!merchantTx || merchantTx.deletedAt || !merchantTx.isActive) throw new NotFoundException('Commerce non trouvé');

    if (type === 'PURCHASE') {
      // Same rule as purchaseTriggersWheel(): free ticket behind a minimum spend this amount reaches
      const now = new Date();
      const wheel = await prisma.luckyWheelCampaign.findFirst({
        where: {
          merchantId,
          status: 'ACTIVE',
          startsAt: { lte: now },
          endsAt: { gte: now },
          ticketCostStamps: 0,
          minSpendAmount: { gt: 0, lte: amount },
        },
        select: { id: true },
      });
      if (!wheel) {
        throw new BadRequestException('Aucune roue de la fortune active pour ce montant');
      }
    }

    // Read (or create) the loyalty card INSIDE the transaction to prevent
    // race conditions where two concurrent requests read the same balance.
    let loyaltyCard = await prisma.loyaltyCard.findUnique({
      where: { clientId_merchantId: { clientId, merchantId } },
      select: { id: true, stamps: true, deactivatedAt: true },
    });

    if (loyaltyCard?.deactivatedAt) {
      if (!p.allowEnroll) {
        throw new BadRequestException(
          'Le client a quitté ce programme de fidélité. Il doit rejoindre à nouveau avant de pouvoir accumuler des tampons.',
        );
      }
      // A reactivated card counts against the FREE plan limit like a new one.
      await this.planService.assertCanAddClient(merchantId, { tx: prisma, plan: p.plan });
      loyaltyCard = await prisma.loyaltyCard.update({
        where: { id: loyaltyCard.id },
        data: { deactivatedAt: null },
        select: { id: true, stamps: true, deactivatedAt: true },
      });
    }

    if (!loyaltyCard) {
      if (!p.allowEnroll) throw new NotFoundException('Client non trouvé');
      // Enforce client limit for FREE plan before creating loyalty card
      await this.planService.assertCanAddClient(merchantId, { tx: prisma, plan: p.plan });
      loyaltyCard = await prisma.loyaltyCard.create({
        data: { clientId, merchantId, stamps: 0 },
        select: { id: true, stamps: true, deactivatedAt: true },
      });
    }

    // Enforce accumulation limit before creating the transaction
    if (type === 'EARN_STAMPS' && accumulationLimit != null) {
      if (loyaltyCard.stamps >= accumulationLimit) {
        // `code` lets the client app explain it in its own language (parcel QR codes)
        throw new BadRequestException({
          code: 'ACCUMULATION_LIMIT',
          message: `Le client a atteint la limite d'accumulation (${accumulationLimit} tampons)`,
        });
      }
    }

    let newStamps: number;
    let actualStampsAdded = stamps;

    if (type === 'EARN_STAMPS') {
      newStamps = loyaltyCard.stamps + stamps;
      // Cap balance at accumulation limit if configured
      if (accumulationLimit != null && newStamps > accumulationLimit) {
        newStamps = accumulationLimit;
        // Provide accurate added stamps (capped)
        actualStampsAdded = newStamps - loyaltyCard.stamps;
      }
    } else if (type === 'REDEEM_REWARD') {
      if (loyaltyCard.stamps < stamps) {
        throw new BadRequestException('Pas assez de tampons pour cette récompense');
      }
      newStamps = loyaltyCard.stamps - stamps;
    } else if (type === 'PURCHASE') {
      newStamps = loyaltyCard.stamps;
    } else {
      throw new BadRequestException('Type de transaction invalide');
    }

    const newTransaction = await prisma.transaction.create({
      data: {
        clientId,
        merchantId,
        rewardId: p.rewardId || null,
        teamMemberId: p.teamMemberId || null,
        performedByName: p.performedByName || null,
        type,
        amount,
        stamps: type === 'EARN_STAMPS' ? actualStampsAdded : stamps,
        idempotencyKey: p.idempotencyKey || null,
        stampCodeId: p.stampCodeId ?? null,
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
  }

  // ─── Private: real-time events + pushes after a committed transaction ────
  private dispatchTransactionSideEffects(p: {
    clientId: string;
    merchantId: string;
    merchant: { nom: string; stampsForReward: number | null; rewards?: { cout: number }[] };
    clientLanguage?: string | null;
    type: MerchantTransactionType;
    stamps: number;
    rewardId?: string;
    rewardTitle?: string;
    result: AppliedTransaction;
  }): void {
    const { clientId, merchantId, merchant, type, stamps, rewardId, rewardTitle, result } = p;
    const shownStamps = type === 'EARN_STAMPS' ? result.actualStampsAdded : stamps;

    // ── Real-time: emit WebSocket events IMMEDIATELY (sub-100ms) ──
    // A PURCHASE moves no stamp: the client hears about it through the
    // lucky-wheel ticket push below, and only the merchant devices refresh.
    if (type !== 'PURCHASE') {
      this.eventsGateway.emitStampsUpdated(clientId, {
        clientId,
        merchantId,
        merchantName: merchant.nom,
        stamps: shownStamps,
        newBalance: result.newStamps,
        type,
        rewardTitle,
      });
    }

    this.eventsGateway.emitTransactionRecorded(merchantId, {
      merchantId,
      clientId,
      clientName: '', // Filled by the client lookup below (non-blocking)
      transactionId: result.transaction.id,
      type,
      stamps: shownStamps,
      newBalance: result.newStamps,
    });

    // ── Send push notifications (fire-and-forget — FCM fallback for background/offline) ──
    if (type !== 'PURCHASE') {
      this.sendTransactionNotifications(
        clientId,
        merchantId,
        merchant,
        type,
        shownStamps,
        result.newStamps,
        p.clientLanguage,
        rewardId,
        rewardTitle,
      ).catch((err) => this.logger.warn(`Transaction notification failed: ${errMsg(err)}`));
    }

    // ── Lucky-wheel ticket notification ──
    if (result.luckyWheelTicketsAwarded > 0) {
      const t = getNotifTranslations(p.clientLanguage);
      this.notifications.sendToClient(
        merchantId,
        clientId,
        t.luckyWheelTicketTitle(result.luckyWheelTicketsAwarded),
        t.luckyWheelTicketBody(result.luckyWheelTicketsAwarded, merchant.nom),
        { event: 'lucky_wheel_ticket', merchantId, tickets: String(result.luckyWheelTicketsAwarded) },
      ).catch((err) => this.logger.warn(`Lucky-wheel ticket notification failed: ${errMsg(err)}`));
    }
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
