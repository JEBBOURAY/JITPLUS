import { Injectable, NotFoundException, ConflictException, BadRequestException, UnauthorizedException, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  NOTIFICATION_REPOSITORY, type INotificationRepository,
  CLIENT_NOTIFICATION_STATUS_REPOSITORY, type IClientNotificationStatusRepository,
  PROFILE_VIEW_REPOSITORY, type IProfileViewRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../common/repositories';
import * as bcrypt from 'bcryptjs';
import { buildPagination } from '../common/utils';
import { MERCHANTS_LIST_CACHE_TTL, MERCHANT_DETAIL_CACHE_TTL, PROFILE_STATS_CACHE_TTL, UNREAD_COUNT_CACHE_TTL } from '../common/constants';

@Injectable()
export class ClientService {
  private readonly logger = new Logger(ClientService.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(NOTIFICATION_REPOSITORY) private notificationRepo: INotificationRepository,
    @Inject(CLIENT_NOTIFICATION_STATUS_REPOSITORY) private clientNotifStatusRepo: IClientNotificationStatusRepository,
    @Inject(PROFILE_VIEW_REPOSITORY) private profileViewRepo: IProfileViewRepository,
    @Inject(TRANSACTION_REPOSITORY) private transactionRepo: ITransactionRepository,
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
        emailVerified: true,
        telephone: true,
        telephoneVerified: true,
        countryCode: true,
        shareInfoMerchants: true,
        notifPush: true,
        notifEmail: true,
        notifWhatsapp: true,
        language: true,
        dateNaissance: true,
        pushToken: true,
        password: true,
        createdAt: true,
        updatedAt: true,
        loyaltyCards: {
          where: { merchant: { deletedAt: null } },
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
      notifPush?: boolean;
      notifEmail?: boolean;
      notifWhatsapp?: boolean;
      language?: string;
      dateNaissance?: string | null;
    },
  ) {
    // Vérifier l'unicité de l'email s'il est modifié
    if (updates.email) {
      const normalizedEmail = updates.email.trim().toLowerCase();
      const existing = await this.clientRepo.findFirst({
        where: { email: normalizedEmail, deletedAt: null },
      });
      if (existing && existing.id !== clientId) {
        throw new ConflictException('Cette adresse email est déjà utilisée par un autre compte.');
      }
      updates.email = normalizedEmail;
    }

    // Vérifier l'unicité du téléphone s'il est modifié (comptes actifs uniquement)
    if (updates.telephone) {
      const normalizedPhone = updates.telephone.trim();
      const existing = await this.clientRepo.findFirst({
        where: { telephone: normalizedPhone, deletedAt: null },
      });
      if (existing && existing.id !== clientId) {
        throw new ConflictException('Ce numéro de téléphone est déjà utilisé par un autre compte.');
      }
      updates.telephone = normalizedPhone;
    }

    // Convert dateNaissance ISO string → Date, or null to clear
    const { dateNaissance: dateNaissanceStr, language, ...restUpdates } = updates;
    const data: {
      prenom?: string; nom?: string; email?: string; telephone?: string;
      countryCode?: string; shareInfoMerchants?: boolean; notifPush?: boolean; notifEmail?: boolean; notifWhatsapp?: boolean;
      language?: string;
      dateNaissance?: Date | null;
      emailVerified?: boolean; telephoneVerified?: boolean;
    } = { ...restUpdates };
    if (language) {
      data.language = language;
    }
    if ('dateNaissance' in updates) {
      data.dateNaissance = dateNaissanceStr ? new Date(dateNaissanceStr) : null;
    }

    // Reset verification when contact info changes
    if (updates.email) {
      const current = await this.clientRepo.findUnique({ where: { id: clientId }, select: { email: true } });
      if (current && current.email !== updates.email) {
        data.emailVerified = false;
      }
    }
    if (updates.telephone) {
      const current = await this.clientRepo.findUnique({ where: { id: clientId }, select: { telephone: true } });
      if (current && current.telephone !== updates.telephone) {
        data.telephoneVerified = false;
      }
    }

    return this.clientRepo.update({
      where: { id: clientId },
      data,
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        emailVerified: true,
        telephone: true,
        telephoneVerified: true,
        countryCode: true,
        shareInfoMerchants: true,
        notifPush: true,
        notifEmail: true,
        notifWhatsapp: true,
        language: true,
        dateNaissance: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteAccount(clientId: string, password?: string) {
    const client = await this.clientRepo.findUnique({
      where: { id: clientId },
      select: { id: true, password: true, googleId: true, appleId: true },
    });

    if (!client) {
      throw new BadRequestException('Compte introuvable');
    }

    // Identity verification: password required for password-based accounts,
    // social-only accounts (no password) can delete without re-auth since
    // they are already authenticated via JWT.
    if (client.password) {
      if (!password) {
        throw new BadRequestException('Le mot de passe est requis pour supprimer votre compte');
      }
      const isValid = await bcrypt.compare(password, client.password);
      if (!isValid) {
        throw new UnauthorizedException('Mot de passe incorrect');
      }
    }
    // Social-only users (Google/Apple, no password) are already authenticated
    // via their JWT — no additional re-auth needed.

    // Atomic soft-delete inside a transaction to ensure all related data
    // is cleaned up. Prevents orphaned records leaking to recreated accounts.
    const now = new Date();

    await this.txRunner.run(async (tx) => {
      // 1. Soft-delete client: anonymise ALL PII so email/phone/social IDs can be reused
      await tx.client.update({
        where: { id: clientId },
        data: {
          deletedAt: now,
          prenom: null,
          nom: null,
          email: null,
          telephone: null,
          password: null,
          dateNaissance: null,
          googleId: null,
          appleId: null,
          pushToken: null,
          refreshTokenHash: null,
          referralCode: null,
          referralBalance: 0,
        },
      });

      // 2. Deactivate all loyalty cards (cannot delete — Transaction references with Restrict)
      await tx.loyaltyCard.updateMany({
        where: { clientId, deactivatedAt: null },
        data: { deactivatedAt: now },
      });

      // 3. Clean up notification read statuses
      await tx.clientNotificationStatus.deleteMany({
        where: { clientId },
      });

      // 4. Clean up browsing history (privacy)
      await tx.profileView.deleteMany({
        where: { clientId },
      });

      // 5. Clean up referral records
      await tx.clientReferral.deleteMany({
        where: { clientId },
      });

      // 6. Clean up payout requests
      await tx.payoutRequest.deleteMany({
        where: { clientId },
      });
    });

    return { success: true, message: 'Compte supprimé avec succès' };
  }

  async updatePushToken(clientId: string, pushToken: string) {
    // Empty string means "clear the token" (e.g. on logout)
    const tokenValue = pushToken || null;

    if (tokenValue) {
      // Reject Expo push tokens — the backend uses Firebase Admin SDK which
      // only accepts native FCM (Android) or APNs (iOS) device tokens.
      if (tokenValue.startsWith('ExponentPushToken[') || tokenValue.startsWith('ExpoPushToken[')) {
        this.logger.warn(`Rejected Expo push token for client ${clientId} — only native FCM/APNs tokens are accepted`);
        return { success: false, reason: 'expo_token_not_supported' };
      }

      // Clear the same token from any other client to prevent duplicate notifications
      await this.clientRepo.updateMany({
        where: { pushToken: tokenValue, id: { not: clientId } },
        data: { pushToken: null },
      });
    }

    await this.clientRepo.update({
      where: { id: clientId },
      data: { pushToken: tokenValue },
    });
    this.logger.log(`Push token ${tokenValue ? 'updated' : 'cleared'} for client ${clientId}`);
    return { success: true };
  }

  async getProfileStats(clientId: string) {
    const cacheKey = `profile-stats:${clientId}`;
    const cached = await this.cache.get<{ totalScans: number; totalRewards: number }>(cacheKey);
    if (cached) return cached;

    const [totalScans, totalRewards] = await Promise.all([
      this.transactionRepo.count({
        where: { clientId, type: 'EARN_POINTS', status: 'ACTIVE' },
      }),
      this.transactionRepo.count({
        where: { clientId, type: { in: ['REDEEM_REWARD', 'LUCKY_WHEEL_WIN'] }, status: 'ACTIVE' },
      }),
    ]);
    const result = { totalScans, totalRewards };
    await this.cache.set(cacheKey, result, PROFILE_STATS_CACHE_TTL);
    return result;
  }

  async getPointsOverview(clientId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const safeTake = Math.min(limit, 100);

    const [cards, totalCards] = await Promise.all([
      this.loyaltyCardRepo.findMany({
          where: { clientId, deactivatedAt: null, merchant: { deletedAt: null } },
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
              pointsRate: true,
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
      this.loyaltyCardRepo.count({ where: { clientId, deactivatedAt: null, merchant: { deletedAt: null } } }),
    ]);
    const totalPoints = cards.reduce((sum: number, card: any) => sum + card.points, 0);

    return {
      totalPoints,
      totalCards,
      pagination: buildPagination(totalCards, page, safeTake),
      cards: cards.map((card: any) => ({
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
              pointsRate: card.merchant.pointsRate,
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

  async getRewardsHistory(clientId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const safeTake = Math.min(limit, 100);

    const [transactions, total] = await Promise.all([
      this.transactionRepo.findMany({
        where: { 
          clientId, 
          type: { in: ['REDEEM_REWARD', 'LUCKY_WHEEL_WIN'] },
          status: 'ACTIVE' 
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeTake,
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          points: true,
          loyaltyType: true,
          createdAt: true,
          merchant: {
            select: {
              id: true,
              nom: true,
              categorie: true,
              logoUrl: true,
            },
          },
          reward: {
            select: {
              id: true,
              titre: true,
            },
          },
        },
      }),
      this.transactionRepo.count({
        where: { 
          clientId, 
          type: { in: ['REDEEM_REWARD', 'LUCKY_WHEEL_WIN'] },
          status: 'ACTIVE' 
        },
      }),
    ]);

    return {
      transactions,
      meta: {
        total,
        page,
        limit: safeTake,
        totalPages: Math.ceil(total / safeTake),
      },
    };
  }

  async getTransactionsHistory(clientId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const safeTake = Math.min(limit, 100);

    const [transactions, total] = await Promise.all([
      this.transactionRepo.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeTake,
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          points: true,
          loyaltyType: true,
          createdAt: true,
          merchant: {
            select: {
              id: true,
              nom: true,
              categorie: true,
              logoUrl: true,
            },
          },
          reward: {
            select: {
              id: true,
              titre: true,
            },
          },
        },
      }),
      this.transactionRepo.count({
        where: { clientId },
      }),
    ]);

    return {
      transactions,
      pagination: buildPagination(total, page, safeTake),
    };
  }

  async getMerchantById(id: string, clientId: string) {
    // Cache the merchant data (shared across all clients)
    const merchantCacheKey = `merchant:detail:${id}`;
    let m = await this.cache.get<any>(merchantCacheKey);

    if (!m) {
      m = await this.merchantRepo.findFirst({
        where: { id, isActive: true, stores: { some: { isActive: true } } },
        select: {
          id: true,
          nom: true,
          email: true,
          categorie: true,
          description: true,
          ville: true,
          quartier: true,
          adresse: true,
          latitude: true,
          longitude: true,
          loyaltyType: true,
          conversionRate: true,
          pointsRate: true,
                stampsForReward: true,
          logoUrl: true,
          coverUrl: true,
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
              email: true,
            },
          },
          rewards: {
            select: { id: true, titre: true, cout: true, description: true },
            orderBy: { cout: 'asc' },
          },
          luckyWheelCampaigns: {
            where: {
              status: 'ACTIVE',
              startsAt: { lte: new Date() },
              endsAt: { gte: new Date() },
            },
            select: {
              id: true,
              name: true,
              description: true,
              endsAt: true,
              minSpendAmount: true,
              globalWinRate: true,
              prizes: {
                where: { remaining: { gt: 0 } },
                select: { id: true, label: true, description: true, weight: true },
                orderBy: { weight: 'desc' },
              },
            },
            take: 1,
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
    .catch((err: any) => {
      // P2002 = unique constraint violation → already viewed today, skip
      if (err?.code !== 'P2002') {
        this.logger.warn('Profile view tracking failed', err);
      }
    });

    // Check if the client already has a loyalty card with this merchant
    const existingCard = await this.loyaltyCardRepo.findUnique({
      where: { clientId_merchantId: { clientId, merchantId: id } },
      select: { id: true, points: true, deactivatedAt: true },
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
      pointsRate: m.pointsRate,
        stampsForReward: m.stampsForReward,
      logoUrl: m.logoUrl ?? null,
      coverUrl: m.coverUrl ?? null,
      socialLinks: (m.socialLinks as Record<string, string> | null) ?? null,
      profileViews: m.profileViews,
      clientCount: m._count.loyaltyCards,
      hasCard: !!existingCard && !existingCard.deactivatedAt,
      cardDeactivated: !!existingCard?.deactivatedAt,
      cardBalance: existingCard?.points ?? 0,
      stores: m.stores ?? [],
      rewards: m.rewards.map((r: any) => ({
        id: r.id,
        titre: r.titre,
        cout: r.cout,
        description: r.description ?? null,
      })),
      activeLuckyWheel: m.luckyWheelCampaigns?.[0]
        ? {
            id: m.luckyWheelCampaigns[0].id,
            name: m.luckyWheelCampaigns[0].name,
            description: m.luckyWheelCampaigns[0].description ?? null,
            endsAt: m.luckyWheelCampaigns[0].endsAt,
            minSpendAmount: m.luckyWheelCampaigns[0].minSpendAmount,
            globalWinRate: m.luckyWheelCampaigns[0].globalWinRate,
            prizes: m.luckyWheelCampaigns[0].prizes.map((p: any) => ({
              id: p.id,
              label: p.label,
              description: p.description ?? null,
              weight: p.weight ?? 1,
            })),
          }
        : null,
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
      update: { deactivatedAt: null },
      select: { id: true, points: true, createdAt: true },
    });

    return { success: true, card };
  }

  /**
   * Soft-deactivate the client's loyalty card with a merchant.
   * The card is not deleted — points are preserved but the client is
   * excluded from all merchant notifications (push, email, WhatsApp).
   */
  async deactivateCard(clientId: string, merchantId: string) {
    const card = await this.loyaltyCardRepo.findUnique({
      where: { clientId_merchantId: { clientId, merchantId } },
      select: { id: true, deactivatedAt: true },
    });
    if (!card) throw new NotFoundException('Card not found');
    if (card.deactivatedAt) return { success: true };

    await this.loyaltyCardRepo.update({
      where: { id: card.id },
      data: { deactivatedAt: new Date(), points: 0 },
    });

    return { success: true };
  }

  async getMerchants(page: number = 1, limit: number = 50) {
    const cacheKey = `merchants:list:p${page}:l${limit}`;
    const cached = await this.cache.get<ReturnType<typeof this.formatMerchantList>>(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * limit;
    const [merchants, total] = await Promise.all([
      this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          stores: { some: { isActive: true } },
        },
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
          pointsRate: true,
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
      this.merchantRepo.count({
        where: {
          isActive: true,
          deletedAt: null,
          stores: { some: { isActive: true } },
        },
      }),
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
        pointsRate: m.pointsRate,
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

    const dismissedIds = dismissedStatuses.map((s: any) => s.notificationId);

    // Only show notifications created after the client joined each merchant
    const merchantFilters = cards.map((card: any) => ({
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
      notifications: notifications.map((n: any) => {
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
    const merchantFilters = cards.map((card: any) => ({
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
    const merchantFilters = cards.map((card: any) => ({
      merchantId: card.merchantId,
      createdAt: { gte: card.createdAt },
    }));

    const notifIds = (
      await this.notificationRepo.findMany({
        where: { OR: merchantFilters },
        select: { id: true },
      })
    ).map((n: any) => n.id);

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
        data: notifIds.map((notificationId: string) => ({
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
   * Navigate to email preferences settings endpoint to unsubscribe from all marketing emails
   */
  async unsubscribeEmail(clientId: string) {
    await this.clientRepo.update({
      where: { id: clientId },
      data: { notifEmail: false },
    });
    return { success: true, message: 'Désinscription des e-mails réussie' };
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
    const merchantFilters = cards.map((card: any) => ({
      merchantId: card.merchantId,
      createdAt: { gte: card.createdAt },
    }));

    const notifIds = (
      await this.notificationRepo.findMany({
        where: { OR: merchantFilters },
        select: { id: true },
      })
    ).map((n: any) => n.id);

    if (notifIds.length === 0) return { success: true, count: 0 };

    const now = new Date();

    // Bulk update existing + bulk create missing in a single transaction
    await this.txRunner.batch([
      this.clientNotifStatusRepo.updateMany({
        where: { clientId, notificationId: { in: notifIds } },
        data: { isDismissed: true, dismissedAt: now },
      }),
      this.clientNotifStatusRepo.createMany({
        data: notifIds.map((notificationId: string) => ({
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
