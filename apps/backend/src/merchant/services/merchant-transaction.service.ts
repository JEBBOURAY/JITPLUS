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
import { DEFAULT_POINTS_RATE } from '../../common/constants';
import { errMsg } from '../../common/utils';
import { MERCHANT_LOYALTY_SELECT } from '../../common/prisma-selects';
import { buildPagination } from '../../common/utils';
import { withRetry } from '../../common/utils/retry-transaction.helper';
import { PointsRules } from '../interfaces/points-rules.interface';
import { computeRewardThreshold } from '../utils/loyalty.utils';

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
    type: 'EARN_POINTS' | 'REDEEM_REWARD',
    amount: number,
    points: number,
    rewardId?: string,
    teamMemberId?: string,
    performedByName?: string,
  ) {
    const [client, merchant] = await Promise.all([
      this.clientRepo.findUnique({
        where: { id: clientId },
        select: { id: true },
      }),
      this.merchantRepo.findUnique({
        where: { id: merchantId },
        select: { nom: true, pointsRate: true, ...MERCHANT_LOYALTY_SELECT },
      }),
    ]);
    if (!client) throw new NotFoundException('Client non trouvé');
    if (!merchant) throw new NotFoundException('Commerce non trouvé');

    // Validate points
    if (type === 'EARN_POINTS') {
      if (merchant.loyaltyType === 'STAMPS') {
        if (points < 1 || !Number.isInteger(points)) {
          throw new BadRequestException(
            `En mode tampons, le nombre de tampons est invalide : ${points}`,
          );
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

    const result = await withRetry(() =>
      this.txRunner.run(async (prisma) => {
        // Read (or create) the loyalty card INSIDE the transaction to prevent
        // race conditions where two concurrent requests read the same balance.
        let loyaltyCard = await prisma.loyaltyCard.findUnique({
          where: { clientId_merchantId: { clientId, merchantId } },
          select: { id: true, points: true },
        });

        if (!loyaltyCard) {
          // Enforce client limit for FREE plan before creating loyalty card
          await this.planService.assertCanAddClient(merchantId);
          loyaltyCard = await prisma.loyaltyCard.create({
            data: { clientId, merchantId, points: 0 },
            select: { id: true, points: true },
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
            points,
          },
        });

        let newPoints: number;
        if (type === 'EARN_POINTS') {
          newPoints = loyaltyCard.points + points;
          // Cap balance at accumulation limit if configured
          if (merchant.accumulationLimit != null && newPoints > merchant.accumulationLimit) {
            newPoints = merchant.accumulationLimit;
          }
        } else if (type === 'REDEEM_REWARD') {
          if (loyaltyCard.points < points) {
            throw new BadRequestException('Pas assez de points pour cette récompense');
          }
          newPoints = loyaltyCard.points - points;
        } else {
          throw new BadRequestException('Type de transaction invalide');
        }

        await prisma.loyaltyCard.update({
          where: { clientId_merchantId: { clientId, merchantId } },
          data: { points: newPoints },
        });

        return { transaction: newTransaction, newPoints };
      }, {
        // RepeatableRead prevents lost-update race conditions on the loyalty card balance
        // while being significantly less contended than Serializable.
        isolationLevel: 'RepeatableRead',
      }),
    );

    // ── Real-time: emit WebSocket events IMMEDIATELY (sub-100ms) ──
    this.eventsGateway.emitPointsUpdated(clientId, {
      clientId,
      merchantId,
      merchantName: merchant!.nom,
      loyaltyType: (merchant!.loyaltyType as 'POINTS' | 'STAMPS') || 'POINTS',
      points,
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
      points,
      newBalance: result.newPoints,
    });

    // ── Send push notifications (fire-and-forget — FCM fallback for background/offline) ──
    this.sendTransactionNotifications(
      clientId,
      merchantId,
      merchant!,
      type,
      points,
      result.newPoints,
      rewardId,
      rewardTitle,
    ).catch((err) => this.logger.warn(`Transaction notification failed: ${errMsg(err)}`));

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
          note: true,
          createdAt: true,
          client: { select: { id: true, prenom: true, nom: true, email: true } },
          teamMember: { select: { id: true, nom: true } },
          reward: { select: { id: true, titre: true, cout: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.transactionRepoDelegate.count({ where }),
    ]);

    return {
      transactions,
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

    return result;
  }

  // â”€â”€â”€ Private: Transaction Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private async sendTransactionNotifications(
    clientId: string,
    merchantId: string,
    merchant: { nom: string; loyaltyType: string | null; stampsForReward: number | null; pointsRules: unknown; conversionRate: number | null },
    type: 'EARN_POINTS' | 'REDEEM_REWARD',
    points: number,
    newPoints: number,
    rewardId?: string,
    rewardTitle?: string,
  ): Promise<void> {
    const isStamps = merchant.loyaltyType === 'STAMPS';
    const unit = isStamps ? (points > 1 ? 'tampons' : 'tampon') : (points > 1 ? 'points' : 'point');


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
        `+${points} ${unit} 🎉`,
        `Vous avez gagné ${points} ${unit} chez ${merchant.nom}.`,
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
          'Cadeau disponible ! 🎁',
          `Félicitations ! Vous avez atteint ${threshold} ${isStamps ? 'tampons' : 'points'} chez ${merchant.nom}. Réclamez votre récompense !`,
          { ...pushData, event: 'reward_available' },
        );
      }
    } else if (type === 'REDEEM_REWARD') {
      // 3. Notify: points redeemed (rewardTitle passed from createTransaction — no extra DB query)
      const rewardName = rewardTitle ?? 'une récompense';

      await this.notifications.sendToClient(
        merchantId,
        clientId,
        'Récompense utilisée ✅',
        `Vous avez échangé ${points} ${unit} contre "${rewardName}" chez ${merchant.nom}.`,
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
        select: { id: true },
      }),
      this.merchantRepo.findUnique({
        where: { id: merchantId },
        select: { nom: true, loyaltyType: true },
      }),
    ]);
    if (!client) throw new NotFoundException('Client non trouvé');
    if (!merchant) throw new NotFoundException('Commerce non trouvé');

    const result = await withRetry(() =>
      this.txRunner.run(async (prisma) => {
        let loyaltyCard = await prisma.loyaltyCard.findUnique({
          where: { clientId_merchantId: { clientId, merchantId } },
          select: { id: true, points: true },
        });

        if (!loyaltyCard) {
          // Enforce client limit for FREE plan
          await this.planService.assertCanAddClient(merchantId);
          loyaltyCard = await prisma.loyaltyCard.create({
            data: { clientId, merchantId, points: 0 },
            select: { id: true, points: true },
          });
        }

        const newPoints = loyaltyCard.points + points;
        if (newPoints < 0) {
          throw new BadRequestException(
            `Solde insuffisant. Le client a ${loyaltyCard.points} ${merchant.loyaltyType === 'STAMPS' ? 'tampons' : 'points'}, impossible de retirer ${Math.abs(points)}.`,
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
            points: points,
            note: note || null,
          },
        });

        await prisma.loyaltyCard.update({
          where: { clientId_merchantId: { clientId, merchantId } },
          data: { points: newPoints },
        });

        return { transaction: newTransaction, newPoints, previousPoints: loyaltyCard.points };
      }, { isolationLevel: 'Serializable' }),
    );

    // â”€â”€ Send push notification (fire-and-forget) â”€â”€
    const isStamps = merchant.loyaltyType === 'STAMPS';
    const unit = isStamps ? 'tampons' : 'points';
    const isAdd = points > 0;
    const absPoints = Math.abs(points);

    const title = isAdd
      ? `+${absPoints} ${unit} ajoutés ✏️`
      : `-${absPoints} ${unit} retirés ✏️`;

    let body = isAdd
      ? `${absPoints} ${unit} ont été ajoutés à votre compte chez ${merchant.nom}.`
      : `${absPoints} ${unit} ont été retirés de votre compte chez ${merchant.nom}.`;

    if (note) {
      body += ` Motif : ${note}`;
    }

    body += ` Nouveau solde : ${result.newPoints} ${unit}.`;

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
