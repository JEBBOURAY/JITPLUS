import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  CLIENT_SESSION_REPOSITORY, type IClientSessionRepository,
} from '../common/repositories';
import { MS_PER_DAY } from '../common/constants';
import { maskEmail } from '../common/utils/pii-mask';
import { AdminDetailsService } from './admin-details.service';

/**
 * Admin client management: listing, detail and account moderation
 * (deactivate / reactivate / soft-delete + anonymise).
 */
@Injectable()
export class AdminClientService {
  private readonly logger = new Logger(AdminClientService.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @Inject(CLIENT_SESSION_REPOSITORY) private readonly clientSessionRepo: IClientSessionRepository,
    private readonly details: AdminDetailsService,
  ) {}

  /**
   * Lookup that tolerates soft-deleted rows. No Prisma extension filters
   * deletedAt: the client login paths and JwtStrategy enforce it instead
   * (ClientSessionService.assertActive / refresh, session deletion below).
   */
  private async findIncludingDeleted<S extends Prisma.ClientSelect>(id: string, select: S) {
    return (await this.clientRepo.findUnique({ where: { id }, select }))
      ?? this.clientRepo.findFirst({ where: { id, deletedAt: { not: null } }, select });
  }

  /**
   * List all registered clients with contact info (for admin dashboard).
   */
  async listClients(
    page = 1,
    limit = 20,
    search?: string,
    status?: string,
    opts: { activity?: 'active30' | 'inactive' | 'never'; type?: 'registered' | 'anonymous'; sort?: 'recent' | 'oldest' | 'name' | 'cards' } = {},
  ) {
    const skip = (page - 1) * limit;
    const d30 = new Date(Date.now() - 30 * MS_PER_DAY);

    const where: Prisma.ClientWhereInput = {};
    const and: Prisma.ClientWhereInput[] = [];

    if (search) {
      and.push({
        OR: [
          { nom: { contains: search, mode: 'insensitive' as const } },
          { prenom: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { telephone: { contains: search, mode: 'insensitive' as const } },
        ],
      });
    }

    if (status === 'active') {
      where.deletedAt = null;
    } else if (status === 'deactivated') {
      // Deleted accounts are anonymised with a deleted_<id> email: keep them out of "deactivated"
      where.deletedAt = { not: null };
      and.push({ OR: [{ email: null }, { NOT: { email: { startsWith: 'deleted_' } } }] });
    } else if (status === 'deleted') {
      where.deletedAt = { not: null };
      where.email = { startsWith: 'deleted_' };
    }

    if (opts.type === 'anonymous') where.isAnonymous = true;
    else if (opts.type === 'registered') where.isAnonymous = false;

    if (opts.activity === 'active30') {
      where.transactions = { some: { status: 'ACTIVE', createdAt: { gte: d30 } } };
    } else if (opts.activity === 'inactive') {
      and.push(
        { transactions: { some: { status: 'ACTIVE' } } },
        { transactions: { none: { status: 'ACTIVE', createdAt: { gte: d30 } } } },
      );
    } else if (opts.activity === 'never') {
      where.transactions = { none: {} };
    }

    if (and.length) where.AND = and;

    const orderBy =
      opts.sort === 'oldest' ? { createdAt: 'asc' as const }
      : opts.sort === 'name' ? [{ prenom: 'asc' as const }, { nom: 'asc' as const }]
      : opts.sort === 'cards' ? { loyaltyCards: { _count: 'desc' as const } }
      : { createdAt: 'desc' as const };

    const [clients, total] = await Promise.all([
      this.clientRepo.findMany({
        where,
        select: {
          id: true,
          prenom: true,
          nom: true,
          email: true,
          telephone: true,
          countryCode: true,
          isAnonymous: true,
          notifPush: true,
          pushToken: true,
          deletedAt: true,
          createdAt: true,
          _count: { select: { loyaltyCards: { where: { deactivatedAt: null } } } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.clientRepo.count({ where }),
    ]);

    const activity = await this.details.clientActivityByIds(clients.map((c) => c.id));

    return {
      clients: clients.map(({ _count, pushToken, notifPush, ...rest }) => ({
        ...rest,
        merchantCount: _count.loyaltyCards,
        pushReachable: !!pushToken && !!notifPush,
        lastActivityAt: activity.get(rest.id)?.lastActivityAt ?? null,
        transactionCount: activity.get(rest.id)?.transactionCount ?? 0,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single client's detailed profile.
   */
  async getClientDetail(clientId: string) {
    const client = await this.findIncludingDeleted(clientId, {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      telephone: true,
      countryCode: true,
      emailVerified: true,
      telephoneVerified: true,
      dateNaissance: true,
      notifPush: true,
      notifEmail: true,
      notifWhatsapp: true,
      shareInfoMerchants: true,
      termsAccepted: true,
      referralCode: true,
      referralBalance: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      _count: {
        select: {
          loyaltyCards: { where: { deactivatedAt: null } },
          transactions: true,
          notificationStatuses: true,
        },
      },
      loyaltyCards: {
        select: {
          id: true,
          stamps: true,
          deactivatedAt: true,
          createdAt: true,
          merchant: {
            select: { id: true, nom: true, categorie: true, logoUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' as const },
        take: 50,
      },
    });

    if (!client) throw new NotFoundException('Client non trouvé');

    return {
      ...client,
      merchantCount: client._count.loyaltyCards,
      transactionCount: client._count.transactions,
      notificationCount: client._count.notificationStatuses,
      _count: undefined,
    };
  }

  /**
   * Deactivate a client: soft-delete by setting deletedAt.
   */
  async deactivateClient(clientId: string): Promise<{ nom: string | null; email: string | null }> {
    const client = await this.clientRepo.findUnique({
      where: { id: clientId },
      select: { nom: true, email: true, deletedAt: true },
    });
    if (!client) throw new NotFoundException('Client non trouvé');

    await this.clientRepo.update({
      where: { id: clientId },
      data: { deletedAt: new Date(), pushToken: null },
    });
    // Revoke every device: refresh tokens die now, access tokens at the next
    // request (JwtStrategy checks the session). Logins refuse deletedAt.
    await this.clientSessionRepo.deleteMany({ where: { clientId } });

    this.logger.log(`Client ${clientId} deactivated`);
    return { nom: client.nom, email: client.email };
  }

  /**
   * Reactivate a client: clear deletedAt.
   */
  async activateClient(clientId: string): Promise<{ nom: string | null; email: string | null }> {
    const client = await this.findIncludingDeleted(clientId, { nom: true, email: true });
    if (!client) throw new NotFoundException('Client non trouvé');
    if (client.email?.startsWith('deleted_')) {
      throw new BadRequestException('Compte supprimé et anonymisé : impossible de le réactiver');
    }

    await this.clientRepo.update({
      where: { id: clientId },
      data: { deletedAt: null },
    });

    this.logger.log(`Client ${clientId} reactivated`);
    return { nom: client.nom, email: client.email };
  }

  /**
   * Delete a client permanently (soft-delete + anonymise).
   */
  async deleteClient(clientId: string): Promise<{ nom: string | null; email: string | null }> {
    // Deactivated clients must stay deletable, so bypass the soft-delete filter
    const client = await this.findIncludingDeleted(clientId, { nom: true, email: true });
    if (!client) throw new NotFoundException('Client non trouvé');

    await this.clientRepo.update({
      where: { id: clientId },
      data: {
        deletedAt: new Date(),
        email: `deleted_${clientId}`,
        telephone: null,
        password: null,
        googleId: null,
        appleId: null,
        pushToken: null,
        nom: null,
        prenom: null,
      },
    });

    await this.clientSessionRepo.deleteMany({ where: { clientId } });

    this.logger.warn(`Client ${clientId} (${maskEmail(client.email)}) soft-deleted`);
    return { nom: client.nom, email: client.email };
  }
}
