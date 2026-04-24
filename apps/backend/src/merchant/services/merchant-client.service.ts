import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
} from '../../common/repositories';
import { MerchantPlanService } from './merchant-plan.service';
import { PointsRules } from '../interfaces/points-rules.interface';
import { computeRewardThreshold } from '../utils/loyalty.utils';
import {
  MAX_SCAN_RESULTS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_STAMPS_FOR_REWARD,
  DEFAULT_LOYALTY_TYPE,
} from '../../common/constants';
import { MERCHANT_LOYALTY_SELECT, CLIENT_SCAN_SELECT } from '../../common/prisma-selects';
import { buildClientSearchFilter, buildTxMap, mapClientResponse, buildPagination, maskName } from '../../common/utils';

@Injectable()
export class MerchantClientService {
  constructor(
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private transactionRepo: ITransactionRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    private planService: MerchantPlanService,
  ) {}

  async getClients(merchantId: string, search?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          AND: [
            { loyaltyCards: { some: { merchantId, deactivatedAt: null } } },
            { OR: buildClientSearchFilter(search) },
            { deletedAt: null },
          ],
        }
      : { loyaltyCards: { some: { merchantId, deactivatedAt: null } }, deletedAt: null };

    // 1. Fetch clients + count (no nested includes — avoids N+1 sub-queries)
    const [clients, total] = await Promise.all([
      this.clientRepo.findMany({
        where,
        select: CLIENT_SCAN_SELECT,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.clientRepo.count({ where }),
    ]);

    if (clients.length === 0) {
      return { clients: [], pagination: buildPagination(total, page, limit) };
    }

    const clientIds = clients.map((c: any) => c.id);

    // 2. Batch-fetch loyalty cards + transaction stats for all clients in 2 queries
    const [loyaltyCards, lastTransactions] = await Promise.all([
      this.loyaltyCardRepo.findMany({
        where: { merchantId, clientId: { in: clientIds } },
        select: { clientId: true, points: true, createdAt: true },
      }),
      this.transactionRepo.groupBy({
        by: ['clientId'],
        where: { merchantId, clientId: { in: clientIds }, status: 'ACTIVE' },
        _max: { createdAt: true },
        _count: true,
      }),
    ]);

    // 3. Build maps for O(1) lookups
    const loyaltyMap = new Map(loyaltyCards.map((card: any) => [card.clientId, card]));
    const txMap = buildTxMap(lastTransactions);

    return {
      clients: clients.map((client: any) => {
        const loyaltyCard = loyaltyMap.get(client.id) as { points: number; createdAt: Date } | undefined;
        const tx = txMap.get(client.id);
        return mapClientResponse(client, loyaltyCard, tx);
      }),
      pagination: buildPagination(total, page, limit),
    };
  }

  /**
   * Verify that a client UUID exists and belongs to this merchant.
   * Prevents IDOR by confirming the client has a loyalty card with the merchant.
   *
   * @param allowFirstScan When true, accepts clients without an existing loyalty card
   *   (used by the HMAC-signed QR path where the signature already proves the client's
   *   consent to be scanned). When false (legacy unsigned UUID), requires an existing
   *   loyalty card to block silent cross-merchant enrollment.
   */
  async verifyClient(
    clientId: string,
    merchantId: string,
    allowFirstScan = false,
  ): Promise<{ clientId: string }> {
    const loyaltyCard = await this.loyaltyCardRepo.findUnique({
      where: { clientId_merchantId: { clientId, merchantId } },
      select: { clientId: true },
    });
    if (!loyaltyCard) {
      if (!allowFirstScan) {
        // Legacy unsigned path: refuse first-scan to prevent unsolicited enrollment.
        throw new NotFoundException('Client non trouvé');
      }
      // Signed-QR path: confirm the client exists at all (deleted accounts rejected).
      const client = await this.clientRepo.findUnique({
        where: { id: clientId },
        select: { id: true, deletedAt: true },
      });
      if (!client || client.deletedAt) throw new NotFoundException('Client non trouvé');
    }
    return { clientId };
  }

  async getClientsForScan(merchantId: string, search?: string) {
    if (!search) return [];

    // First, search among existing loyalty card holders (exclude deleted accounts)
    const existingClients = await this.clientRepo.findMany({
      where: {
        AND: [
          { loyaltyCards: { some: { merchantId } } },
          { OR: buildClientSearchFilter(search) },
          { deletedAt: null },
        ],
      },
      select: CLIENT_SCAN_SELECT,
      take: MAX_SCAN_RESULTS,
    });

    // If no existing clients found, search all clients (for adding new ones)
    // Only search by phone to avoid leaking unrelated client data
    let clients = existingClients;
    if (existingClients.length === 0) {
      clients = await this.clientRepo.findMany({
        where: {
          deletedAt: null,
          OR: buildClientSearchFilter(search),
        },
        select: CLIENT_SCAN_SELECT,
        take: MAX_SCAN_RESULTS,
      });
    }

    const clientIds = clients.map((c: any) => c.id);

    const [loyaltyCards, lastTransactions] = clientIds.length
      ? await Promise.all([
          this.loyaltyCardRepo.findMany({
            where: { merchantId, clientId: { in: clientIds } },
            select: { clientId: true, points: true, createdAt: true, deactivatedAt: true },
          }),
          this.transactionRepo.groupBy({
            by: ['clientId'],
            where: { merchantId, clientId: { in: clientIds }, status: 'ACTIVE' },
            _max: { createdAt: true },
            _count: true,
          }),
        ])
      : [[], []];

    const loyaltyMap = new Map(loyaltyCards.map((card: any) => [card.clientId, card]));

    const txMap = buildTxMap(lastTransactions);

    return clients.map((client: any) => {
      const loyaltyCard = loyaltyMap.get(client.id) as { points: number; createdAt: Date } | undefined;
      const tx = txMap.get(client.id);
      return mapClientResponse(client, loyaltyCard, tx);
    });
  }

  async getClientStatus(clientId: string, merchantId: string) {
    const [client, loyaltyCardResult, merchant] = await Promise.all([
      this.clientRepo.findUnique({
        where: { id: clientId },
        select: { id: true, nom: true, email: true, telephone: true, shareInfoMerchants: true, dateNaissance: true },
      }),
      this.loyaltyCardRepo.findUnique({
        where: { clientId_merchantId: { clientId, merchantId } },
        select: { id: true, points: true, createdAt: true, deactivatedAt: true },
      }),
      this.merchantRepo.findUnique({
        where: { id: merchantId },
        select: MERCHANT_LOYALTY_SELECT,
      }),
    ]);
    if (!client) throw new NotFoundException('Client non trouvé');

    // If the card exists but is deactivated, reactivate it (merchant scanning = implicit rejoin)
    let loyaltyCard = loyaltyCardResult;
    if (loyaltyCard?.deactivatedAt) {
      loyaltyCard = await this.loyaltyCardRepo.update({
        where: { id: loyaltyCard.id },
        data: { deactivatedAt: null },
        select: { id: true, points: true, createdAt: true, deactivatedAt: true },
      });
    }
    if (!loyaltyCard) {
      // Enforce client limit for FREE plan before creating loyalty card
      await this.planService.assertCanAddClient(merchantId);
      try {
        loyaltyCard = await this.loyaltyCardRepo.create({
          data: { clientId, merchantId, points: 0 },
          select: { id: true, points: true, createdAt: true, deactivatedAt: true },
        });
      } catch (e: any) {
        // P2002 = unique constraint: a concurrent request created the card first
        if (e?.code === 'P2002') {
          loyaltyCard = await this.loyaltyCardRepo.findUnique({
            where: { clientId_merchantId: { clientId, merchantId } },
            select: { id: true, points: true, createdAt: true, deactivatedAt: true },
          });
          if (!loyaltyCard) throw e;
        } else {
          throw e;
        }
      }
    }

    const pointsRules = merchant?.pointsRules as PointsRules | null;
    const rewardThreshold = computeRewardThreshold(merchant, pointsRules);

    const shared = client.shareInfoMerchants !== false;

    // Check if today is the client's birthday (only reveal if they share info)
    let isBirthday = false;
    if (shared && client.dateNaissance) {
      const today = new Date();
      const bday = new Date(client.dateNaissance);
      isBirthday = today.getMonth() === bday.getMonth() && today.getDate() === bday.getDate();
    }

    return {
      id: client.id,
      nom: shared ? client.nom : maskName(client.nom),
      email: shared ? client.email : null,
      telephone: shared ? client.telephone : null,
      points: loyaltyCard!.points,
      hasReward: loyaltyCard!.points >= rewardThreshold,
      rewardThreshold,
      loyaltyType: merchant?.loyaltyType || DEFAULT_LOYALTY_TYPE,
      stampsForReward: rewardThreshold,
      isBirthday,
    };
  }

  async getClientDetail(clientId: string, merchantId: string) {
    // IDOR protection: verify the client has an active loyalty card with this merchant
    const ownershipCheck = await this.loyaltyCardRepo.findUnique({
      where: { clientId_merchantId: { clientId, merchantId } },
      select: { id: true, deactivatedAt: true },
    });
    if (!ownershipCheck || ownershipCheck.deactivatedAt) throw new NotFoundException('Client non trouvé');

    const [client, loyaltyCard, transactions, merchant] = await Promise.all([
      this.clientRepo.findUnique({
        where: { id: clientId },
        select: { id: true, nom: true, email: true, telephone: true, shareInfoMerchants: true, termsAccepted: true, createdAt: true },
      }),
      this.loyaltyCardRepo.findUnique({
        where: { clientId_merchantId: { clientId, merchantId } },
        select: { points: true, createdAt: true, deactivatedAt: true },
      }),
      this.transactionRepo.findMany({
        where: { clientId, merchantId },
        select: {
          id: true, type: true, loyaltyType: true, amount: true, points: true,
          status: true, createdAt: true, note: true,
          reward: { select: { id: true, titre: true, cout: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: DEFAULT_PAGE_SIZE,
      }),
      this.merchantRepo.findUnique({
        where: { id: merchantId },
        select: MERCHANT_LOYALTY_SELECT,
      }),
    ]);
    if (!client) throw new NotFoundException('Client non trouvé');

    const pointsRules = merchant?.pointsRules as PointsRules | null;
    const rewardThreshold = computeRewardThreshold(merchant, pointsRules);

    const shared = client.shareInfoMerchants !== false;

    return {
      id: client.id,
      nom: shared ? client.nom : maskName(client.nom),
      email: shared ? client.email : null,
      telephone: shared ? client.telephone : null,
      points: loyaltyCard?.points ?? 0,
      rewardThreshold,
      hasReward: (loyaltyCard?.points ?? 0) >= rewardThreshold,
      memberSince: loyaltyCard?.createdAt ?? client.createdAt,
      termsAccepted: client.termsAccepted,
      transactions: transactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        loyaltyType: t.loyaltyType ?? null,
        amount: t.amount,
        points: t.points,
        status: t.status,
        createdAt: t.createdAt,
        note: t.note ?? null,
        reward: t.reward ? { id: t.reward.id, titre: t.reward.titre, cout: t.reward.cout } : null,
      })),
      loyaltyType: merchant?.loyaltyType || DEFAULT_LOYALTY_TYPE,
      stampsForReward: rewardThreshold,
    };
  }
}
