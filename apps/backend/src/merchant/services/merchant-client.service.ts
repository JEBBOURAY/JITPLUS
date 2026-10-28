import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
} from '../../common/repositories';
import { computeRewardThreshold } from '../utils/loyalty.utils';
import {
  MAX_SCAN_RESULTS,
  DEFAULT_PAGE_SIZE,
  INACTIVE_CLIENT_DAYS,
  MS_PER_DAY,
} from '../../common/constants';
import { MERCHANT_LOYALTY_SELECT, CLIENT_SCAN_SELECT } from '../../common/prisma-selects';
import { buildClientSearchFilter, buildTxMap, mapClientResponse, buildPagination, maskName } from '../../common/utils';
import type { MerchantClientView } from '../../common/dto/pagination-query.dto';
import { tryToE164Phone } from '../../common/utils/phone';
import { ScanTicketService } from './scan-ticket.service';

const CARD_STATS_SELECT = { clientId: true, stamps: true, createdAt: true } satisfies Prisma.LoyaltyCardSelect;
/** Characters a typed phone number may contain; anything else is a name/email search. */
const PHONE_SEARCH_PATTERN = /^\+?[\d\s().-]{8,20}$/;

@Injectable()
export class MerchantClientService {
  constructor(
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private transactionRepo: ITransactionRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    private scanTickets: ScanTicketService,
  ) {}

  async getClients(
    merchantId: string,
    search?: string,
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
    view?: MerchantClientView,
  ) {
    const skip = (page - 1) * limit;

    // The threshold drives both the "reward" filter and the progress bars in the app.
    const thresholdPromise = this.merchantRepo
      .findUnique({ where: { id: merchantId }, select: MERCHANT_LOYALTY_SELECT })
      .then((merchant) => computeRewardThreshold(merchant));
    const pagePromise = view
      ? thresholdPromise.then((threshold) => this.findCardsForView(merchantId, view, threshold, search, skip, limit))
      : this.findClientsByJoinDate(merchantId, search, skip, limit);
    const [rewardThreshold, { clients, cards, total }] = await Promise.all([thresholdPromise, pagePromise]);

    const pagination = buildPagination(total, page, limit);
    if (clients.length === 0) {
      return { clients: [], pagination, rewardThreshold };
    }

    const clientIds = clients.map((c) => c.id);

    // Batch-fetch the remaining stats in parallel (no N+1 sub-queries)
    const [loyaltyCards, lastTransactions] = await Promise.all([
      cards ??
        this.loyaltyCardRepo.findMany({
          where: { merchantId, clientId: { in: clientIds } },
          select: CARD_STATS_SELECT,
        }),
      this.transactionRepo.groupBy({
        by: ['clientId'],
        where: { merchantId, clientId: { in: clientIds }, status: 'ACTIVE' },
        _max: { createdAt: true },
        _count: true,
      }),
    ]);

    const loyaltyMap = new Map(loyaltyCards.map((card) => [card.clientId, card]));
    const txMap = buildTxMap(lastTransactions);

    return {
      clients: clients.map((client) => mapClientResponse(client, loyaltyMap.get(client.id), txMap.get(client.id))),
      pagination,
      rewardThreshold,
    };
  }

  /** Default list: newest clients first, cards fetched afterwards. */
  private async findClientsByJoinDate(merchantId: string, search: string | undefined, skip: number, take: number) {
    const where: Prisma.ClientWhereInput = {
      loyaltyCards: { some: { merchantId, deactivatedAt: null } },
      deletedAt: null,
      ...(search ? { OR: buildClientSearchFilter(search) } : {}),
    };
    const [clients, total] = await Promise.all([
      this.clientRepo.findMany({ where, select: CLIENT_SCAN_SELECT, orderBy: [{ createdAt: 'desc' }], skip, take }),
      this.clientRepo.count({ where }),
    ]);
    return { clients, cards: null, total };
  }

  /**
   * Filtered views are driven from the merchant's loyalty cards so that the
   * (merchantId, stamps) and (merchantId, lastVisitAt) indexes serve the sort.
   * `id` is a tie-breaker that keeps pagination stable between pages.
   */
  private async findCardsForView(
    merchantId: string,
    view: MerchantClientView,
    rewardThreshold: number,
    search: string | undefined,
    skip: number,
    take: number,
  ) {
    const where: Prisma.LoyaltyCardWhereInput = {
      merchantId,
      deactivatedAt: null,
      client: { deletedAt: null, ...(search ? { OR: buildClientSearchFilter(search) } : {}) },
      ...(view === 'reward' && { stamps: { gte: rewardThreshold } }),
      ...(view === 'inactive' && {
        lastVisitAt: { lt: new Date(Date.now() - INACTIVE_CLIENT_DAYS * MS_PER_DAY) },
      }),
    };
    const orderBy: Prisma.LoyaltyCardOrderByWithRelationInput[] =
      view === 'inactive' ? [{ lastVisitAt: 'desc' }, { id: 'asc' }] : [{ stamps: 'desc' }, { id: 'asc' }];

    const [rows, total] = await Promise.all([
      this.loyaltyCardRepo.findMany({
        where,
        orderBy,
        skip,
        take,
        select: { ...CARD_STATS_SELECT, client: { select: CLIENT_SCAN_SELECT } },
      }),
      this.loyaltyCardRepo.count({ where }),
    ]);
    return { clients: rows.map((row) => row.client), cards: rows, total };
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
    const term = search?.trim();
    if (!term) return [];

    // Free-text search is limited to the merchant's own active members.
    const clients = await this.clientRepo.findMany({
      where: {
        AND: [
          { loyaltyCards: { some: { merchantId, deactivatedAt: null } } },
          { OR: buildClientSearchFilter(term) },
          { deletedAt: null },
        ],
      },
      select: CLIENT_SCAN_SELECT,
      take: MAX_SCAN_RESULTS,
    });

    if (clients.length === 0) return this.findNonMemberByExactPhone(merchantId, term);

    const clientIds = clients.map((c) => c.id);

    const [loyaltyCards, lastTransactions] = clientIds.length
      ? await Promise.all([
          this.loyaltyCardRepo.findMany({
            where: { merchantId, clientId: { in: clientIds } },
            select: { clientId: true, stamps: true, createdAt: true, deactivatedAt: true },
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
      const loyaltyCard = loyaltyMap.get(client.id) as { stamps: number; createdAt: Date } | undefined;
      const tx = txMap.get(client.id);
      return mapClientResponse(client, loyaltyCard, tx);
    });
  }

  /**
   * Lookup outside the merchant's members, used to enroll a customer standing
   * at the till. Only an exact, complete phone number matches (no partial or
   * name/email search), and the result is reduced to masked initials plus a
   * scan ticket so it cannot be used to browse the client base.
   */
  private async findNonMemberByExactPhone(merchantId: string, term: string) {
    if (!PHONE_SEARCH_PATTERN.test(term)) return [];
    const telephone = tryToE164Phone(term);
    if (!telephone) return [];

    const client = await this.clientRepo.findUnique({
      where: { telephone },
      select: { id: true, prenom: true, nom: true, deletedAt: true },
    });
    if (!client || client.deletedAt) return [];

    return [
      {
        id: client.id,
        prenom: maskName(client.prenom),
        nom: maskName(client.nom),
        email: null,
        telephone: null,
        stamps: 0,
        totalTransactions: 0,
        lastVisit: null,
        memberSince: null,
        cardDeactivated: false,
        scanTicket: this.scanTickets.issue(client.id, merchantId),
      },
    ];
  }

  /**
   * Read-only: enrollment and reactivation happen in createTransaction, and
   * only with a valid scan ticket. Without an active card, the client is only
   * visible with a ticket, and then with masked details until enrolled.
   */
  async getClientStatus(clientId: string, merchantId: string, scanTicket?: string) {
    const [client, loyaltyCard, merchant] = await Promise.all([
      this.clientRepo.findUnique({
        where: { id: clientId },
        select: { id: true, nom: true, email: true, telephone: true, shareInfoMerchants: true, dateNaissance: true, deletedAt: true },
      }),
      this.loyaltyCardRepo.findUnique({
        where: { clientId_merchantId: { clientId, merchantId } },
        select: { id: true, stamps: true, createdAt: true, deactivatedAt: true },
      }),
      this.merchantRepo.findUnique({
        where: { id: merchantId },
        select: MERCHANT_LOYALTY_SELECT,
      }),
    ]);
    if (!client || client.deletedAt) throw new NotFoundException('Client non trouvé');

    const isMember = !!loyaltyCard && !loyaltyCard.deactivatedAt;
    if (!isMember && !this.scanTickets.verify(scanTicket, clientId, merchantId)) {
      throw new NotFoundException('Client non trouvé');
    }

    const stamps = loyaltyCard?.stamps ?? 0;
    const rewardThreshold = computeRewardThreshold(merchant);

    const shared = isMember && client.shareInfoMerchants !== false;

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
      stamps,
      hasReward: stamps >= rewardThreshold,
      rewardThreshold,
      stampsForReward: rewardThreshold,
      isBirthday,
    };
  }

  async getClientDetail(clientId: string, merchantId: string) {
    // IDOR protection: verify the client has an active loyalty card with this merchant
    const loyaltyCard = await this.loyaltyCardRepo.findUnique({
      where: { clientId_merchantId: { clientId, merchantId } },
      select: { stamps: true, createdAt: true, deactivatedAt: true },
    });
    if (!loyaltyCard || loyaltyCard.deactivatedAt) throw new NotFoundException('Client non trouvé');

    const [client, transactions, merchant] = await Promise.all([
      this.clientRepo.findUnique({
        where: { id: clientId },
        select: { id: true, prenom: true, nom: true, email: true, telephone: true, shareInfoMerchants: true, termsAccepted: true, isAnonymous: true, createdAt: true },
      }),
      this.transactionRepo.findMany({
        where: { clientId, merchantId },
        select: {
          id: true, type: true, amount: true, stamps: true,
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

    const rewardThreshold = computeRewardThreshold(merchant);

    const shared = client.shareInfoMerchants !== false;
    // Anonymous clients were created by the merchant via Quick-Add — the merchant
    // already typed the phone themselves, so phone/prenom stay visible regardless
    // of shareInfoMerchants. This lets the "Renvoyer le lien WhatsApp" button work.
    const isAnon = (client as { isAnonymous?: boolean }).isAnonymous === true;

    return {
      id: client.id,
      prenom: isAnon ? (client as { prenom?: string | null }).prenom ?? null : null,
      nom: shared ? client.nom : maskName(client.nom),
      email: shared ? client.email : null,
      telephone: shared || isAnon ? client.telephone : null,
      isAnonymous: isAnon,
      stamps: loyaltyCard?.stamps ?? 0,
      rewardThreshold,
      hasReward: (loyaltyCard?.stamps ?? 0) >= rewardThreshold,
      memberSince: loyaltyCard?.createdAt ?? client.createdAt,
      termsAccepted: client.termsAccepted,
      transactions: transactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        stamps: t.stamps,
        status: t.status,
        createdAt: t.createdAt,
        note: t.note ?? null,
        reward: t.reward ? { id: t.reward.id, titre: t.reward.titre, cout: t.reward.cout } : null,
      })),
      stampsForReward: rewardThreshold,
    };
  }
}
