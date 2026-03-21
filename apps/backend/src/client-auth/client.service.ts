import { Injectable, NotFoundException, ConflictException, BadRequestException, UnauthorizedException, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  NOTIFICATION_REPOSITORY, type INotificationRepository,
  CLIENT_NOTIFICATION_STATUS_REPOSITORY, type IClientNotificationStatusRepository,
  PROFILE_VIEW_REPOSITORY, type IProfileViewRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../common/repositories';
import * as bcrypt from 'bcryptjs';
import { buildPagination } from '../common/utils';
import { MERCHANTS_LIST_CACHE_TTL, MERCHANT_DETAIL_CACHE_TTL, UNREAD_COUNT_CACHE_TTL } from '../common/constants';

/** Great-circle distance in km (Haversine formula). */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class ClientService {
  private readonly logger = new Logger(ClientService.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private transactionRepo: ITransactionRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(NOTIFICATION_REPOSITORY) private notificationRepo: INotificationRepository,
    @Inject(CLIENT_NOTIFICATION_STATUS_REPOSITORY) private clientNotifStatusRepo: IClientNotificationStatusRepository,
    @Inject(PROFILE_VIEW_REPOSITORY) private profileViewRepo: IProfileViewRepository,
    @Inject(TRANSACTION_RUNNER) private txRunner: ITransactionRunner,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async getProfile(clientId: string) {
    const client = await this.clientRepo.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        telephone: true,
        countryCode: true,
        shareInfoMerchants: true,
        notifWhatsapp: true,
        dateNaissance: true,
        pushToken: true,
        password: true,
        createdAt: true,
        updatedAt: true,
        loyaltyCards: {
          select: {
            id: true, merchantId: true, points: true, createdAt: true, updatedAt: true,
            merchant: {
              select: {
                id: true,
                nom: true,
                categorie: true,
                loyaltyType: true,
              },
            },
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client non trouvé');
    }

    const { password, ...safeProfile } = client;
    return { ...safeProfile, hasPassword: !!password };
  }

  async updateProfile(
    clientId: string,
    updates: {
      prenom?: string;
      nom?: string;
      email?: string;
      telephone?: string;
      countryCode?: string;
      shareInfoMerchants?: boolean;
      notifWhatsapp?: boolean;
      dateNaissance?: string | null;
    },
  ) {
    // Vérifier l'unicité de l'email s'il est modifié
    if (updates.email) {
      const normalizedEmail = updates.email.trim().toLowerCase();
      const existing = await this.clientRepo.findUnique({
        where: { email: normalizedEmail },
      });
      if (existing && existing.id !== clientId) {
        throw new ConflictException('Cette adresse email est déjà utilisée par un autre compte.');
      }
      updates.email = normalizedEmail;
    }

    // Vérifier l'unicité du téléphone s'il est modifié
    if (updates.telephone) {
      const normalizedPhone = updates.telephone.trim();
      const existing = await this.clientRepo.findUnique({
        where: { telephone: normalizedPhone },
      });
      if (existing && existing.id !== clientId) {
        throw new ConflictException('Ce numéro de téléphone est déjà utilisé par un autre compte.');
      }
      updates.telephone = normalizedPhone;
    }

    // Convert dateNaissance ISO string → Date, or null to clear
    const { dateNaissance: dateNaissanceStr, ...restUpdates } = updates;
    const data: {
      prenom?: string; nom?: string; email?: string; telephone?: string;
      countryCode?: string; shareInfoMerchants?: boolean; notifWhatsapp?: boolean;
      dateNaissance?: Date | null;
    } = { ...restUpdates };
    if ('dateNaissance' in updates) {
      data.dateNaissance = dateNaissanceStr ? new Date(dateNaissanceStr) : null;
    }

    return this.clientRepo.update({
      where: { id: clientId },
      data,
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        telephone: true,
        countryCode: true,
        shareInfoMerchants: true,
        notifWhatsapp: true,
        dateNaissance: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteAccount(clientId: string, password?: string) {
    const client = await this.clientRepo.findUnique({
      where: { id: clientId },
      select: { id: true, password: true },
    });

    if (!client) {
      throw new BadRequestException('Compte introuvable');
    }

    // Always require password for account deletion
    if (!client.password) {
      throw new BadRequestException('Veuillez d\'abord définir un mot de passe depuis votre profil avant de supprimer votre compte');
    }

    if (!password) {
      throw new BadRequestException('Le mot de passe est requis pour supprimer votre compte');
    }

    const isValid = await bcrypt.compare(password, client.password);
    if (!isValid) {
      throw new UnauthorizedException('Mot de passe incorrect');
    }

    // Soft delete: mark as deleted + anonymise sensitive fields so the
    // email/phone can be reused for a new account.
    await this.clientRepo.update({
      where: { id: clientId },
      data: {
        deletedAt: new Date(),
        email: null,
        telephone: null,
        password: null,
        googleId: null,
        pushToken: null,
        refreshTokenHash: null,
      },
    });
    return { success: true, message: 'Compte supprimé avec succès' };
  }

  async updatePushToken(clientId: string, pushToken: string) {
    await this.clientRepo.update({
      where: { id: clientId },
      data: { pushToken },
    });
    return { success: true };
  }

  async getPointsOverview(clientId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const safeTake = Math.min(limit, 100);

    const [cards, totalCards] = await Promise.all([
      this.loyaltyCardRepo.findMany({
        where: { clientId },
        select: {
          id: true,
          merchantId: true,
          points: true,
          createdAt: true,
          updatedAt: true,
          merchant: {
            select: {
              id: true,
              nom: true,
              categorie: true,
              loyaltyType: true,
              stampsForReward: true,
              conversionRate: true,
              latitude: true,
              longitude: true,
              logoUrl: true,
              // Fetch the cheapest reward so the client can show a progress bar
              rewards: {
                select: { cout: true },
                orderBy: { cout: 'asc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: safeTake,
      }),
      this.loyaltyCardRepo.count({ where: { clientId } }),
    ]);

    const totalPoints = cards.reduce((sum, card) => sum + card.points, 0);

    return {
      totalPoints,
      totalCards,
      pagination: buildPagination(totalCards, page, safeTake),
      cards: cards.map((card) => ({
        id: card.id,
        merchantId: card.merchantId,
        balance: card.points,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
        merchant: card.merchant
          ? {
              id: card.merchant.id,
              nomBoutique: card.merchant.nom,
              categorie: card.merchant.categorie,
              loyaltyType: card.merchant.loyaltyType,
              stampsForReward: card.merchant.stampsForReward,
              conversionRate: card.merchant.conversionRate,
              // null if the merchant has no rewards configured yet
              minRewardCost: card.merchant.rewards[0]?.cout ?? null,
              latitude: card.merchant.latitude,
              longitude: card.merchant.longitude,
              logoUrl: card.merchant.logoUrl ?? null,
            }
          : undefined,
      })),
    };
  }

  async getTransactions(clientId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const where = { clientId, type: { not: 'LOYALTY_PROGRAM_CHANGE' as const } };

    const [transactions, total] = await Promise.all([
      this.transactionRepo.findMany({
        where,
        select: {
          id: true,
          merchantId: true,
          clientId: true,
          amount: true,
          points: true,
          type: true,
          note: true,
          createdAt: true,
          merchant: {
            select: {
              id: true,
              nom: true,
              categorie: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.transactionRepo.count({ where }),
    ]);

    return {
      transactions: transactions.map((t) => ({
        id: t.id,
        merchantId: t.merchantId,
        clientId: t.clientId,
        amount: t.amount,
        pointsEarned: t.points,
        type: t.type === 'EARN_POINTS' ? 'EARN' : t.type === 'ADJUST_POINTS' ? 'ADJUST' : 'REDEEM',
        note: t.note ?? null,
        createdAt: t.createdAt,
        merchant: t.merchant
          ? {
              nomBoutique: t.merchant.nom,
              categorie: t.merchant.categorie,
            }
          : undefined,
      })),
      pagination: buildPagination(total, page, limit),
    };
  }

  async getMerchantById(id: string, clientId: string) {
    // Cache the merchant data (shared across all clients)
    const merchantCacheKey = `merchant:detail:${id}`;
    let m = await this.cache.get<any>(merchantCacheKey);

    if (!m) {
      m = await this.merchantRepo.findUnique({
        where: { id, isActive: true },
        select: {
          id: true,
          nom: true,
          categorie: true,
          description: true,
          ville: true,
          quartier: true,
          adresse: true,
          latitude: true,
          longitude: true,
          loyaltyType: true,
          conversionRate: true,
          stampsForReward: true,
          logoUrl: true,
          socialLinks: true,
          profileViews: true,
          stores: {
            where: { isActive: true },
            select: {
              id: true,
              nom: true,
              ville: true,
              quartier: true,
              adresse: true,
              latitude: true,
              longitude: true,
              telephone: true,
            },
          },
          rewards: {
            select: { id: true, titre: true, cout: true, description: true },
            orderBy: { cout: 'asc' },
          },
          _count: { select: { loyaltyCards: true } },
        },
      });
      if (!m) throw new NotFoundException('Merchant not found');
      await this.cache.set(merchantCacheKey, m, MERCHANT_DETAIL_CACHE_TTL);
    }

    // Record unique view: one per client per merchant per day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.profileViewRepo.create({
      data: { merchantId: id, clientId, viewDate: today },
    })
    .then(() =>
      // New view today → increment the denormalized counter
      this.merchantRepo.update({
        where: { id },
        data: { profileViews: { increment: 1 } },
      }),
    )
    .catch((err) => {
      // P2002 = unique constraint violation → already viewed today, skip
      if (err?.code !== 'P2002') {
        this.logger.warn('Profile view tracking failed', err);
      }
    });

    // Check if the client already has a loyalty card with this merchant
    const existingCard = await this.loyaltyCardRepo.findUnique({
      where: { clientId_merchantId: { clientId, merchantId: id } },
      select: { id: true },
    });

    return {
      id: m.id,
      nomBoutique: m.nom,
      categorie: m.categorie,
      description: m.description,
      ville: m.ville,
      adresse: m.adresse || (m.quartier ? `${m.quartier}, ${m.ville}` : m.ville),
      latitude: m.latitude,
      longitude: m.longitude,
      loyaltyType: m.loyaltyType,
      conversionRate: m.conversionRate,
      stampsForReward: m.stampsForReward,
      logoUrl: m.logoUrl ?? null,
      socialLinks: (m.socialLinks as Record<string, string> | null) ?? null,
      profileViews: m.profileViews,
      clientCount: m._count.loyaltyCards,
      hasCard: !!existingCard,
      rewards: m.rewards.map((r: any) => ({
        id: r.id,
        titre: r.titre,
        cout: r.cout,
        description: r.description ?? null,
      })),
    };
  }

  /**
   * Self-associate: client joins a merchant and gets a loyalty card with 0 balance.
   * If the card already exists, returns it without error (idempotent).
   */
  async joinMerchant(clientId: string, merchantId: string) {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId, isActive: true },
      select: { id: true, nom: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const card = await this.loyaltyCardRepo.upsert({
      where: { clientId_merchantId: { clientId, merchantId } },
      create: { clientId, merchantId, points: 0 },
      update: {},
      select: { id: true, points: true, createdAt: true },
    });

    return { success: true, card };
  }

  async getMerchants(page: number = 1, limit: number = 50) {
    const cacheKey = `merchants:list:p${page}:l${limit}`;
    const cached = await this.cache.get<ReturnType<typeof this.formatMerchantList>>(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * limit;
    const [merchants, total] = await Promise.all([
      this.merchantRepo.findMany({
        where: { isActive: true },
        select: {
          id: true,
          nom: true,
          categorie: true,
          description: true,
          ville: true,
          quartier: true,
          adresse: true,
          latitude: true,
          longitude: true,
          loyaltyType: true,
          conversionRate: true,
          stampsForReward: true,
          logoUrl: true,
          stores: {
            where: { isActive: true },
            select: {
              id: true,
              nom: true,
              ville: true,
              quartier: true,
              adresse: true,
              latitude: true,
              longitude: true,
            },
          },
        },
        orderBy: { nom: 'asc' },
        skip,
        take: limit,
      }),
      this.merchantRepo.count({ where: { isActive: true } }),
    ]);

    const result = this.formatMerchantList(merchants, total, page, limit);
    await this.cache.set(cacheKey, result, MERCHANTS_LIST_CACHE_TTL);
    return result;
  }

  private formatMerchantList(merchants: any[], total: number, page: number, limit: number) {
    const entries: any[] = [];

    for (const m of merchants) {
      const base = {
        id: m.id,
        nomBoutique: m.nom,
        categorie: m.categorie,
        description: m.description,
        ville: m.ville,
        adresse: m.adresse || (m.quartier ? `${m.quartier}, ${m.ville}` : m.ville),
        latitude: m.latitude,
        longitude: m.longitude,
        loyaltyType: m.loyaltyType,
        conversionRate: m.conversionRate,
        stampsForReward: m.stampsForReward,
        logoUrl: m.logoUrl ?? null,
      };

      // Always include the merchant as a primary entry
      entries.push(base);

      // Add each store that has its own coordinates as a separate map point
      if (m.stores?.length) {
        for (const s of m.stores) {
          if (s.latitude == null || s.longitude == null) continue;
          // Skip if store coords are identical to merchant's main coords
          if (s.latitude === m.latitude && s.longitude === m.longitude) continue;
          entries.push({
            ...base,
            latitude: s.latitude,
            longitude: s.longitude,
            ville: s.ville ?? base.ville,
            adresse: s.adresse || (s.quartier ? `${s.quartier}, ${s.ville ?? base.ville}` : base.adresse),
            storeId: s.id,
            storeName: s.nom,
          });
        }
      }
    }

    return {
      merchants: entries,
      pagination: buildPagination(total, page, limit),
    };
  }

  /**
   * Returns active merchants within `radiusKm` of the given coordinates,
   * enriched with the client's loyalty-card balance (userPoints) for each.
   * Distance filtering is done in-process with the Haversine formula.
   * Max radius is capped at 50 km to prevent accidental large queries.
   */
  async getNearbyMerchants(clientId: string, lat: number, lng: number, radiusKm = 5) {
    const safeRadius = Math.min(radiusKm, 50);

    // Bounding-box pre-filter: 1° lat ≈ 111 km
    const latDelta = safeRadius / 111;
    const lngDelta = safeRadius / (111 * Math.cos((lat * Math.PI) / 180));

    const merchants = await this.merchantRepo.findMany({
      where: {
        isActive: true,
        latitude:  { gte: lat - latDelta, lte: lat + latDelta },
        longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
      },
      select: {
        id: true, nom: true, categorie: true, description: true,
        ville: true, quartier: true, adresse: true,
        latitude: true, longitude: true,
        loyaltyType: true, conversionRate: true, stampsForReward: true,
        logoUrl: true,
        stores: {
          where: { isActive: true },
          select: {
            id: true, nom: true, ville: true, quartier: true,
            adresse: true, latitude: true, longitude: true,
          },
        },
      },
      take: 200,
    });

    // Also find merchants whose stores are in the bounding box even if the merchant itself isn't
    const merchantsViaStores = await this.merchantRepo.findMany({
      where: {
        isActive: true,
        stores: {
          some: {
            isActive: true,
            latitude:  { gte: lat - latDelta, lte: lat + latDelta },
            longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
          },
        },
        // Exclude merchants already fetched above
        NOT: {
          latitude:  { gte: lat - latDelta, lte: lat + latDelta },
          longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
        },
      },
      select: {
        id: true, nom: true, categorie: true, description: true,
        ville: true, quartier: true, adresse: true,
        latitude: true, longitude: true,
        loyaltyType: true, conversionRate: true, stampsForReward: true,
        logoUrl: true,
        stores: {
          where: { isActive: true },
          select: {
            id: true, nom: true, ville: true, quartier: true,
            adresse: true, latitude: true, longitude: true,
          },
        },
      },
      take: 200,
    });

    const allMerchants = [...merchants, ...merchantsViaStores];

    // Build flat list of points: merchant itself + each store with coords
    type NearbyEntry = {
      merchantId: string; lat: number; lng: number;
      merchant: (typeof allMerchants)[0]; store?: (typeof allMerchants)[0]['stores'][0];
    };
    
    // Set a strict candidate ceiling to protect the event loop.
    // At most 400 points to evaluate.
    const candidates: NearbyEntry[] = [];
    const MAX_CANDIDATES = 400; 

    for (const m of allMerchants) {
      if (candidates.length >= MAX_CANDIDATES) break;
      if (m.latitude != null && m.longitude != null) {
        candidates.push({ merchantId: m.id, lat: m.latitude, lng: m.longitude, merchant: m });
      }
      for (const s of m.stores) {
        if (candidates.length >= MAX_CANDIDATES) break;
        if (s.latitude != null && s.longitude != null) {
          // Skip if store coords are identical to merchant's main coords
          if (s.latitude === m.latitude && s.longitude === m.longitude) continue;
          candidates.push({ merchantId: m.id, lat: s.latitude, lng: s.longitude, merchant: m, store: s });
        }
      }
    }

    const nearby = candidates.filter((c) => haversineKm(lat, lng, c.lat, c.lng) <= safeRadius)
      // Cap final returned array size to save network payload weight
      .slice(0, 100);

    if (nearby.length === 0) return [];

    const nearbyIds = [...new Set(nearby.map((c) => c.merchantId))];
    const cards = await this.loyaltyCardRepo.findMany({
      where: { clientId, merchantId: { in: nearbyIds } },
      select: { merchantId: true, points: true },
    });

    const pointsMap = new Map(cards.map((c) => [c.merchantId, c.points]));

    return nearby.map((c) => {
      const m = c.merchant;
      const s = c.store;
      return {
        id: m.id,
        nomBoutique: m.nom,
        categorie: m.categorie,
        description: m.description,
        ville: s?.ville ?? m.ville,
        adresse: s
          ? (s.adresse || (s.quartier ? `${s.quartier}, ${s.ville ?? m.ville}` : (m.adresse || m.ville)))
          : (m.adresse || (m.quartier ? `${m.quartier}, ${m.ville}` : m.ville)),
        latitude: c.lat,
        longitude: c.lng,
        loyaltyType: m.loyaltyType,
        conversionRate: m.conversionRate,
        stampsForReward: m.stampsForReward,
        logoUrl: m.logoUrl ?? null,
        userPoints: pointsMap.get(m.id) ?? 0,
        ...(s ? { storeId: s.id, storeName: s.nom } : {}),
      };
    });
  }

  /**
   * Get notifications relevant to the client.
   * Returns notifications from merchants where the client holds a loyalty card,
   * excluding dismissed ones, with per-client read status.
   */
  async getNotifications(clientId: string, page: number = 1, limit: number = 30) {
    // Parallelize the two independent lookups: loyalty cards + dismissed notification IDs
    const [cards, dismissedStatuses] = await Promise.all([
      this.loyaltyCardRepo.findMany({
        where: { clientId },
        select: { merchantId: true, createdAt: true },
      }),
      this.clientNotifStatusRepo.findMany({
        where: { clientId, isDismissed: true },
        select: { notificationId: true },
      }),
    ]);

    if (cards.length === 0) {
      return { notifications: [], pagination: buildPagination(0, page, limit) };
    }

    const dismissedIds = dismissedStatuses.map((s) => s.notificationId);

    // Only show notifications created after the client joined each merchant
    const merchantFilters = cards.map((card) => ({
      merchantId: card.merchantId,
      createdAt: { gte: card.createdAt },
    }));

    const where = {
      OR: merchantFilters,
      ...(dismissedIds.length > 0 ? { id: { notIn: dismissedIds } } : {}),
    };

    const skip = (page - 1) * limit;
    const [notifications, total] = await Promise.all([
      this.notificationRepo.findMany({
        where,
        select: {
          id: true,
          title: true,
          body: true,
          createdAt: true,
          merchant: { select: { id: true, nom: true, categorie: true, logoUrl: true } },
          clientStatuses: {
            where: { clientId },
            select: { isRead: true, readAt: true },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.notificationRepo.count({ where }),
    ]);

    return {
      notifications: notifications.map((n) => {
        const status = n.clientStatuses?.[0];
        return {
          id: n.id,
          title: n.title,
          body: n.body,
          type: 'promo' as const,
          merchantName: n.merchant?.nom ?? null,
          merchantCategory: n.merchant?.categorie ?? null,
          merchantLogoUrl: n.merchant?.logoUrl || 'https://jitplus.com/jitpluslogo.png',
          isRead: status?.isRead ?? false,
          readAt: status?.readAt ?? null,
          createdAt: n.createdAt,
        };
      }),
      pagination: buildPagination(total, page, limit),
    };
  }

  /**
   * Count unread notifications for the client (not dismissed).
   */
  async getUnreadCount(clientId: string): Promise<{ unreadCount: number }> {
    const cacheKey = `client:unread:${clientId}`;
    const cached = await this.cache.get<{ unreadCount: number }>(cacheKey);
    if (cached) return cached;

    const cards = await this.loyaltyCardRepo.findMany({
      where: { clientId },
      select: { merchantId: true, createdAt: true },
    });

    if (cards.length === 0) return { unreadCount: 0 };

    // Only count notifications created after the client joined each merchant
    const merchantFilters = cards.map((card) => ({
      merchantId: card.merchantId,
      createdAt: { gte: card.createdAt },
    }));

    // Parallelize the two independent counts
    const [totalNotifs, readOrDismissedCount] = await Promise.all([
      // Total non-dismissed notifications (only since client joined)
      this.notificationRepo.count({
        where: { OR: merchantFilters },
      }),
      // Notifications the client has explicitly read or dismissed
      this.clientNotifStatusRepo.count({
        where: {
          clientId,
          notification: { OR: merchantFilters },
          OR: [{ isRead: true }, { isDismissed: true }],
        },
      }),
    ]);

    const result = { unreadCount: Math.max(0, totalNotifs - readOrDismissedCount) };
    await this.cache.set(cacheKey, result, UNREAD_COUNT_CACHE_TTL);
    return result;
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(clientId: string, notificationId: string) {
    await this.clientNotifStatusRepo.upsert({
      where: { clientId_notificationId: { clientId, notificationId } },
      create: { clientId, notificationId, isRead: true, readAt: new Date() },
      update: { isRead: true, readAt: new Date() },
    });
    await this.cache.del(`client:unread:${clientId}`);
    return { success: true };
  }

  /**
   * Mark all visible notifications as read for the client.
   * Uses bulk updateMany + createMany instead of N individual upserts.
   */
  async markAllAsRead(clientId: string) {
    const cards = await this.loyaltyCardRepo.findMany({
      where: { clientId },
      select: { merchantId: true, createdAt: true },
    });
    if (cards.length === 0) return { success: true, count: 0 };

    // Only target notifications created after the client joined each merchant
    const merchantFilters = cards.map((card) => ({
      merchantId: card.merchantId,
      createdAt: { gte: card.createdAt },
    }));

    const notifIds = (
      await this.notificationRepo.findMany({
        where: { OR: merchantFilters },
        select: { id: true },
      })
    ).map((n) => n.id);

    if (notifIds.length === 0) return { success: true, count: 0 };

    const now = new Date();

    // Bulk update existing statuses + bulk create missing ones in a single transaction
    await this.txRunner.batch([
      // 1. Update all existing status rows for this client
      this.clientNotifStatusRepo.updateMany({
        where: { clientId, notificationId: { in: notifIds } },
        data: { isRead: true, readAt: now },
      }),
      // 2. Create rows for notifications the client hasn't interacted with yet
      this.clientNotifStatusRepo.createMany({
        data: notifIds.map((notificationId) => ({
          clientId,
          notificationId,
          isRead: true,
          readAt: now,
        })),
        skipDuplicates: true,
      }),
    ]);

    await this.cache.del(`client:unread:${clientId}`);
    return { success: true, count: notifIds.length };
  }

  /**
   * Dismiss (soft-delete) a single notification for the client.
   */
  async dismissNotification(clientId: string, notificationId: string) {
    await this.clientNotifStatusRepo.upsert({
      where: { clientId_notificationId: { clientId, notificationId } },
      create: { clientId, notificationId, isDismissed: true, dismissedAt: new Date(), isRead: true, readAt: new Date() },
      update: { isDismissed: true, dismissedAt: new Date() },
    });
    await this.cache.del(`client:unread:${clientId}`);
    return { success: true };
  }

  /**
   * Dismiss (soft-delete) all notifications for the client.
   * Uses bulk updateMany + createMany instead of N individual upserts.
   */
  async dismissAllNotifications(clientId: string) {
    const cards = await this.loyaltyCardRepo.findMany({
      where: { clientId },
      select: { merchantId: true, createdAt: true },
    });
    if (cards.length === 0) return { success: true, count: 0 };

    // Only target notifications created after the client joined each merchant
    const merchantFilters = cards.map((card) => ({
      merchantId: card.merchantId,
      createdAt: { gte: card.createdAt },
    }));

    const notifIds = (
      await this.notificationRepo.findMany({
        where: { OR: merchantFilters },
        select: { id: true },
      })
    ).map((n) => n.id);

    if (notifIds.length === 0) return { success: true, count: 0 };

    const now = new Date();

    // Bulk update existing + bulk create missing in a single transaction
    await this.txRunner.batch([
      this.clientNotifStatusRepo.updateMany({
        where: { clientId, notificationId: { in: notifIds } },
        data: { isDismissed: true, dismissedAt: now },
      }),
      this.clientNotifStatusRepo.createMany({
        data: notifIds.map((notificationId) => ({
          clientId,
          notificationId,
          isDismissed: true,
          dismissedAt: now,
          isRead: true,
          readAt: now,
        })),
        skipDuplicates: true,
      }),
    ]);

    await this.cache.del(`client:unread:${clientId}`);
    return { success: true, count: notifIds.length };
  }
}
