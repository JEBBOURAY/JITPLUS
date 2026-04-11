import { Injectable, UnauthorizedException, ForbiddenException, NotFoundException, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { AuditAction, PayoutStatus } from '@prisma/client';
import {
  ADMIN_USER_REPOSITORY, type IAdminUserRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  CLIENT_REPOSITORY, type IClientRepository,
  CLIENT_REFERRAL_REPOSITORY, type IClientReferralRepository,
  PAYOUT_REQUEST_REPOSITORY, type IPayoutRequestRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  REWARD_REPOSITORY, type IRewardRepository,
  NOTIFICATION_REPOSITORY, type INotificationRepository,
  AUDIT_LOG_REPOSITORY, type IAuditLogRepository,
  DEVICE_SESSION_REPOSITORY, type IDeviceSessionRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../common/repositories';
import { checkLockout, handleFailedLogin, resetLoginAttempts, LockoutDbOps } from '../common/utils/login-lockout.helper';

import { ADMIN_STATS_CACHE_TTL } from '../common/constants';

/** TTL for admin session revocation cache entries (24 hours) */
const ADMIN_REVOKE_TTL = 24 * 60 * 60 * 1000;

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private adminRepo: IAdminUserRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(CLIENT_REFERRAL_REPOSITORY) private clientReferralRepo: IClientReferralRepository,
    @Inject(PAYOUT_REQUEST_REPOSITORY) private payoutReqRepo: IPayoutRequestRepository,
    @Inject(TRANSACTION_REPOSITORY) private transactionRepo: ITransactionRepository,
    @Inject(REWARD_REPOSITORY) private rewardRepo: IRewardRepository,
    @Inject(NOTIFICATION_REPOSITORY) private notificationRepo: INotificationRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private auditLogRepo: IAuditLogRepository,
    @Inject(DEVICE_SESSION_REPOSITORY) private deviceSessionRepo: IDeviceSessionRepository,
    @Inject(TRANSACTION_RUNNER) private txRunner: ITransactionRunner,
    @Inject(RAW_QUERY_RUNNER) private rawQuery: IRawQueryRunner,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private jwtService: JwtService,
  ) {}

  /**
   * Revoke an admin session by blacklisting its jti in cache.
   * The JWT remains cryptographically valid but will be rejected by JwtStrategy.
   */
  async logout(jti: string): Promise<{ message: string }> {
    await this.cache.set(`admin-revoked:${jti}`, true, ADMIN_REVOKE_TTL);
    await this.cache.del(`admin-session:${jti}`);
    this.logger.log(`Admin session revoked (jti: ${jti})`);
    return { message: 'Déconnecté' };
  }

  /**
   * Authenticate an admin by email + password.
   * Returns a JWT token with type: 'admin'.
   */
  // Dummy hash for timing-safe comparison when admin not found
  private static readonly DUMMY_HASH = '$2a$12$LJ3m4ys3Lz0KDlu0BRahYOiFMfGHgdOUmrGfEdKnXqJRikMOFbECi';

  /** Lockout DB ops for Admin model */
  private get adminLockoutOps(): LockoutDbOps {
    return {
      incrementFailedAttempts: (id, newAttempts, lockedUntil) =>
        this.adminRepo.update({
          where: { id },
          data: { failedLoginAttempts: newAttempts, ...(lockedUntil && { lockedUntil }) },
        }).then(() => {}),
      resetFailedAttempts: (id) =>
        this.adminRepo.update({
          where: { id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        }).then(() => {}),
    };
  }

  async login(email: string, password: string) {
    const admin = await this.adminRepo.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Always run bcrypt.compare to prevent timing attacks (email enumeration)
    const passwordValid = await bcrypt.compare(
      password,
      admin?.password ?? AdminAuthService.DUMMY_HASH,
    );

    if (!admin || !passwordValid) {
      // If admin exists, track failed attempt for lockout
      if (admin) {
        await handleFailedLogin(admin, this.adminLockoutOps);
      }
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Check if account is active
    if (!admin.isActive) {
      throw new ForbiddenException('Ce compte administrateur est désactivé.');
    }

    // Check lockout (too many failed attempts)
    checkLockout(admin);

    // Successful login — reset failed attempts
    await resetLoginAttempts(admin, this.adminLockoutOps);

    const jti = randomUUID();
    const payload = {
      sub: admin.id,
      email: admin.email,
      type: 'admin' as const,
      role: 'admin' as const,
      jti,
    };

    const token = this.jwtService.sign(payload);
    this.logger.log(`Admin ${admin.email} logged in (jti: ${jti})`);

    // Cache admin session for revocation support
    // TTL = 24h (max reasonable JWT lifetime), auto-cleans expired entries
    await this.cache.set(`admin-session:${jti}`, true, 24 * 60 * 60 * 1000);

    return {
      access_token: token,
      admin: {
        id: admin.id,
        email: admin.email,
        nom: admin.nom,
        role: admin.role,
      },
    };
  }

  /**
   * List all merchants with their plan info (for admin dashboard).
   */
  async listMerchants(page = 1, limit = 20, search?: string, plan?: string, status?: string, categorie?: string) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { nom: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
        { phoneNumber: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    if (plan === 'FREE' || plan === 'PREMIUM') {
      where.plan = plan;
    }

    if (status === 'active') {
      where.isActive = true;
      where.deletedAt = null;
    } else if (status === 'banned') {
      where.isActive = false;
      where.deletedAt = null;
    } else if (status === 'deleted') {
      where.deletedAt = { not: null };
    }

    if (categorie) {
      where.categorie = categorie;
    }

    const [merchants, total] = await Promise.all([
      this.merchantRepo.findMany({
        where,
        select: {
          id: true,
          nom: true,
          email: true,
          phoneNumber: true,
          categorie: true,
          ville: true,
          plan: true,
          planExpiresAt: true,
          planActivatedByAdmin: true,
          trialStartedAt: true,
          profileViews: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: {
              loyaltyCards: true,
              stores: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.merchantRepo.count({ where }),
    ]);

    return {
      merchants: merchants.map((m: any) => ({
        ...m,
        clientCount: m._count.loyaltyCards,
        storeCount: m._count.stores,
        _count: undefined,
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
   * Get a single merchant's plan details.
   */
  async getMerchantDetail(merchantId: string) {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        nom: true,
        email: true,
        categorie: true,
        ville: true,
        phoneNumber: true,
        plan: true,
        planExpiresAt: true,
        planActivatedByAdmin: true,
        trialStartedAt: true,
        profileViews: true,
        socialLinks: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            loyaltyCards: true,
            stores: true,
            notifications: true,
            transactions: true,
          },
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException('Commerçant non trouvé');
    }

    return {
      ...merchant,
      clientCount: merchant._count.loyaltyCards,
      storeCount: merchant._count.stores,
      notificationCount: merchant._count.notifications,
      transactionCount: merchant._count.transactions,
      _count: undefined,
    };
  }

  /**
   * Subscription history for a merchant.
   * Built from audit logs + current plan snapshot.
   */
  async getMerchantSubscriptionHistory(merchantId: string) {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        nom: true,
        email: true,
        plan: true,
        planActivatedByAdmin: true,
        planExpiresAt: true,
        trialStartedAt: true,
        createdAt: true,
      },
    });

    if (!merchant) throw new NotFoundException('Commerçant non trouvé');

    const actions: AuditAction[] = [
      AuditAction.ACTIVATE_PREMIUM,
      AuditAction.REVOKE_PREMIUM,
      AuditAction.UPDATE_PLAN_DURATION,
    ];

    const logs = await this.auditLogRepo.findMany({
      where: {
        targetType: 'MERCHANT',
        targetId: merchantId,
        action: { in: actions },
      },
      select: {
        id: true,
        action: true,
        adminEmail: true,
        createdAt: true,
        metadata: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const events = [
      {
        id: `created-${merchant.id}`,
        action: 'ACCOUNT_CREATED',
        createdAt: merchant.createdAt,
        adminEmail: null,
        summary: 'Création du compte commerçant',
        metadata: null,
      },
      ...logs.map((log: any) => {
        if (log.action === AuditAction.ACTIVATE_PREMIUM) {
          return {
            id: log.id,
            action: log.action,
            createdAt: log.createdAt,
            adminEmail: log.adminEmail,
            summary: 'Activation Premium',
            metadata: log.metadata ?? null,
          };
        }

        if (log.action === AuditAction.REVOKE_PREMIUM) {
          return {
            id: log.id,
            action: log.action,
            createdAt: log.createdAt,
            adminEmail: log.adminEmail,
            summary: 'Révocation Premium',
            metadata: log.metadata ?? null,
          };
        }

        const md = (log.metadata ?? {}) as Record<string, unknown>;
        const startDate = typeof md.startDate === 'string' ? md.startDate : null;
        const endDate = typeof md.endDate === 'string' ? md.endDate : null;
        const dateSummary = [
          startDate ? `début: ${startDate}` : null,
          endDate ? `fin: ${endDate}` : null,
        ].filter(Boolean).join(' | ');

        return {
          id: log.id,
          action: log.action,
          createdAt: log.createdAt,
          adminEmail: log.adminEmail,
          summary: dateSummary ? `Mise à jour des dates (${dateSummary})` : 'Mise à jour des dates d\'abonnement',
          metadata: log.metadata ?? null,
        };
      }),
      {
        id: `current-${merchant.id}`,
        action: 'CURRENT_STATE',
        createdAt: new Date().toISOString(),
        adminEmail: null,
        summary: `État actuel: ${merchant.plan}${merchant.planActivatedByAdmin ? ' (activé par admin)' : ''}`,
        metadata: {
          plan: merchant.plan,
          planActivatedByAdmin: merchant.planActivatedByAdmin,
          trialStartedAt: merchant.trialStartedAt,
          planExpiresAt: merchant.planExpiresAt,
        },
      },
    ];

    return {
      merchant,
      events,
    };
  }

  /**
   * Ban a merchant account (sets isActive = false).
   * Returns the merchant name + email for the audit label.
   */
  async banMerchant(merchantId: string): Promise<{ nom: string; email: string }> {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { nom: true, email: true, isActive: true },
    });
    if (!merchant) throw new NotFoundException('Commerçant non trouvé');

    await this.txRunner.batch([
      this.merchantRepo.update({
        where: { id: merchantId },
        data: { isActive: false },
      }),
      // Invalidate all active sessions so existing JWTs stop working immediately
      this.deviceSessionRepo.deleteMany({
        where: { merchantId },
      }),
    ]);

    this.logger.log(`Merchant ${merchantId} (${merchant.email}) banned`);
    return { nom: merchant.nom, email: merchant.email };
  }

  /**
   * Unban a merchant account (sets isActive = true).
   */
  async unbanMerchant(merchantId: string): Promise<{ nom: string; email: string }> {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { nom: true, email: true },
    });
    if (!merchant) throw new NotFoundException('Commerçant non trouvé');

    await this.merchantRepo.update({
      where: { id: merchantId },
      data: { isActive: true },
    });

    this.logger.log(`Merchant ${merchantId} (${merchant.email}) unbanned`);
    return { nom: merchant.nom, email: merchant.email };
  }

  /**
   * Global platform statistics — comprehensive data for the admin dashboard.
   */
  async getGlobalStats() {
    const cacheKey = 'admin:global-stats';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Last 6 calendar months (oldest → newest)
    const monthBuckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        start: new Date(d.getFullYear(), d.getMonth(), 1),
        end: new Date(d.getFullYear(), d.getMonth() + 1, 1),
        label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      };
    });

    const [
      merchantStats,
      clientStats,
      transactionStats,
      totalRewards,
      totalNotifications,
      recentMerchants,
      recentAuditLogs,
      notifAgg,
    ] = await Promise.all([
      // Single raw query replaces 5 separate merchant count() calls
      this.rawQuery.queryRaw<{ total: bigint; active: bigint; banned: bigint; free: bigint; premium: bigint }>`
        SELECT
          COUNT(*)                              AS total,
          COUNT(*) FILTER (WHERE is_active)     AS active,
          COUNT(*) FILTER (WHERE NOT is_active) AS banned,
          COUNT(*) FILTER (WHERE plan = 'FREE') AS free,
          COUNT(*) FILTER (WHERE plan = 'PREMIUM') AS premium
        FROM merchants
      `,
      // Single raw query replaces 2 separate client count() calls
      this.rawQuery.queryRaw<{ total: bigint; new_this_month: bigint }>`
        SELECT
          COUNT(*)                                         AS total,
          COUNT(*) FILTER (WHERE created_at >= ${startOfMonth}) AS new_this_month
        FROM clients
      `,
      // Single raw query replaces 5 separate transaction count() calls
      this.rawQuery.queryRaw<{ total: bigint; this_month: bigint; earn: bigint; redeem: bigint; adjust: bigint }>`
        SELECT
          COUNT(*) FILTER (WHERE status = 'ACTIVE')                                    AS total,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= ${startOfMonth})  AS this_month,
          COUNT(*) FILTER (WHERE type = 'EARN_POINTS')                                 AS earn,
          COUNT(*) FILTER (WHERE type = 'REDEEM_REWARD')                               AS redeem,
          COUNT(*) FILTER (WHERE type = 'ADJUST_POINTS')                               AS adjust
        FROM transactions
      `,
      this.rewardRepo.count(),
      this.notificationRepo.count(),
      this.merchantRepo.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, nom: true, email: true, plan: true, createdAt: true, isActive: true },
      }),
      this.auditLogRepo.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          adminEmail: true,
          action: true,
          targetType: true,
          targetLabel: true,
          createdAt: true,
          ipAddress: true,
        },
      }),
      this.notificationRepo.aggregate({
        _sum: { recipientCount: true, successCount: true },
      }),
    ]);

    const merchantRow = merchantStats[0];
    const clientRow = clientStats[0];
    const txRow = transactionStats[0];

    const totalMerchants = Number(merchantRow?.total ?? 0);
    const activeMerchants = Number(merchantRow?.active ?? 0);
    const bannedMerchants = Number(merchantRow?.banned ?? 0);
    const freeMerchants = Number(merchantRow?.free ?? 0);
    const premiumMerchants = Number(merchantRow?.premium ?? 0);
    const totalClients = Number(clientRow?.total ?? 0);
    const newClientsThisMonth = Number(clientRow?.new_this_month ?? 0);
    const totalTransactions = Number(txRow?.total ?? 0);
    const transactionsThisMonth = Number(txRow?.this_month ?? 0);
    const earnPointsCount = Number(txRow?.earn ?? 0);
    const redeemRewardCount = Number(txRow?.redeem ?? 0);
    const adjustPointsCount = Number(txRow?.adjust ?? 0);

    // Per-channel notification counts + monthly trends in 2 raw queries instead of 15 individual counts
    const sixMonthsAgo = monthBuckets[0].start;

    const [channelCounts, merchantTrendRaw, transactionTrendRaw] = await Promise.all([
      this.notificationRepo.groupBy({
        by: ['channel'],
        _count: { id: true },
      }),
      this.rawQuery.queryRaw<{ month: string; count: bigint }>`
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS count
        FROM merchants
        WHERE created_at >= ${sixMonthsAgo}
        GROUP BY date_trunc('month', created_at)
        ORDER BY month
      `,
      this.rawQuery.queryRaw<{ month: string; count: bigint }>`
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS count
        FROM transactions
        WHERE status = 'ACTIVE' AND created_at >= ${sixMonthsAgo}
        GROUP BY date_trunc('month', created_at)
        ORDER BY month
      `,
    ]);

    const channelMap = Object.fromEntries(
      channelCounts.map((c: any) => [c.channel, c._count.id]),
    );
    const pushCount = channelMap['PUSH'] ?? 0;
    const whatsappCount = channelMap['WHATSAPP'] ?? 0;
    const emailCount = channelMap['EMAIL'] ?? 0;

    // Map raw trend rows into month buckets
    const merchantTrendMap = Object.fromEntries(
      merchantTrendRaw.map((r: any) => [r.month, Number(r.count)]),
    );
    const transactionTrendMap = Object.fromEntries(
      transactionTrendRaw.map((r: any) => [r.month, Number(r.count)]),
    );
    const trends = monthBuckets.map(({ label, start }) => {
      const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      return {
        label,
        merchants: merchantTrendMap[key] ?? 0,
        transactions: transactionTrendMap[key] ?? 0,
      };
    });

    const totalSent = notifAgg._sum.recipientCount ?? 0;
    const totalSuccess = notifAgg._sum.successCount ?? 0;

    const result = {
      merchants: {
        total: totalMerchants,
        active: activeMerchants,
        banned: bannedMerchants,
        free: freeMerchants,
        premium: premiumMerchants,
      },
      clients: { total: totalClients, newThisMonth: newClientsThisMonth },
      transactions: {
        total: totalTransactions,
        thisMonth: transactionsThisMonth,
        earnPoints: earnPointsCount,
        redeemReward: redeemRewardCount,
        adjustPoints: adjustPointsCount,
      },
      rewards: { total: totalRewards },
      notifications: {
        total: totalNotifications,
        totalSent,
        totalSuccess,
        successRate: totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : 0,
        pushCount,
        whatsappCount,
        emailCount,
      },
      trends,
      recentMerchants,
      recentAuditLogs,
    };

    await this.cache.set(cacheKey, result, ADMIN_STATS_CACHE_TTL);
    return result;
  }

  /**
   * List all registered clients with contact info (for admin dashboard).
   */
  async listClients(page = 1, limit = 20, search?: string, status?: string) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { nom: { contains: search, mode: 'insensitive' as const } },
        { prenom: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
        { telephone: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    if (status === 'active') {
      where.deletedAt = null;
    } else if (status === 'deactivated') {
      where.deletedAt = { not: null };
    }

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
          createdAt: true,
          _count: { select: { loyaltyCards: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.clientRepo.count({ where }),
    ]);

    return {
      clients: clients.map(({ _count, ...rest }: any) => ({
        ...rest,
        merchantCount: _count.loyaltyCards,
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
   * Soft-delete a merchant: mark as deleted + anonymise sensitive fields.
   * Related data (stores, cards, transactions) stays intact for analytics.
   */
  async deleteMerchant(merchantId: string): Promise<{ nom: string; email: string }> {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { nom: true, email: true },
    });
    if (!merchant) throw new NotFoundException('Commerçant non trouvé');

    await this.merchantRepo.update({
      where: { id: merchantId },
      data: {
        deletedAt: new Date(),
        email: `deleted_${merchantId}`,
        password: '',
        googleId: null,
        pushToken: null,
        phoneNumber: null,
        isActive: false,
      },
    });

    this.logger.warn(`Merchant ${merchantId} (${merchant.email}) soft-deleted`);
    return { nom: merchant.nom, email: merchant.email };
  }

  /**
   * List all notifications across all merchants (for admin dashboard tracking).
   */
  async listNotifications(page = 1, limit = 20, channel?: string, search?: string) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (channel) {
      // Treat null channel as 'PUSH' (legacy records before channel was set)
      if (channel === 'PUSH') {
        where.OR = [{ channel: 'PUSH' }, { channel: null }];
      } else {
        where.channel = channel;
      }
    }

    if (search) {
      const searchConditions: Record<string, unknown>[] = [
        { title: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
        { merchant: { nom: { contains: search, mode: 'insensitive' } } },
        { merchant: { email: { contains: search, mode: 'insensitive' } } },
        { audience: { contains: search, mode: 'insensitive' } },
      ];
      // When both channel and search are active, use AND to combine them
      if (where.OR) {
        const channelFilter = where.OR;
        delete where.OR;
        where.AND = [
          { OR: channelFilter as any },
          { OR: searchConditions },
        ];
      } else {
        where.OR = searchConditions;
      }
    }

    const [notifications, total] = await Promise.all([
      this.notificationRepo.findMany({
        where,
        select: {
          id: true,
          title: true,
          body: true,
          channel: true,
          audience: true,
          recipientCount: true,
          successCount: true,
          failureCount: true,
          isBroadcast: true,
          createdAt: true,
          merchant: {
            select: { id: true, nom: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.notificationRepo.count({ where }),
    ]);

    return {
      notifications,
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
    const client = await this.clientRepo.findUnique({
      where: { id: clientId },
      select: {
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
            loyaltyCards: true,
            transactions: true,
            notificationStatuses: true,
          },
        },
        loyaltyCards: {
          select: {
            id: true,
            points: true,
            deactivatedAt: true,
            createdAt: true,
            merchant: {
              select: { id: true, nom: true, categorie: true, logoUrl: true },
            },
          },
          orderBy: { createdAt: 'desc' as const },
          take: 50,
        },
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
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Client ${clientId} deactivated`);
    return { nom: client.nom, email: client.email };
  }

  /**
   * Reactivate a client: clear deletedAt.
   */
  async activateClient(clientId: string): Promise<{ nom: string | null; email: string | null }> {
    const client = await this.clientRepo.findUnique({
      where: { id: clientId },
      select: { nom: true, email: true },
    });
    if (!client) throw new NotFoundException('Client non trouvé');

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
    const client = await this.clientRepo.findUnique({
      where: { id: clientId },
      select: { nom: true, email: true },
    });
    if (!client) throw new NotFoundException('Client non trouvé');

    await this.clientRepo.update({
      where: { id: clientId },
      data: {
        deletedAt: new Date(),
        email: `deleted_${clientId}`,
        telephone: null,
        password: null,
        googleId: null,
        pushToken: null,
        nom: null,
        prenom: null,
      },
    });

    this.logger.warn(`Client ${clientId} (${client.email}) soft-deleted`);
    return { nom: client.nom, email: client.email };
  }

  // ── Referral management ──────────────────────────────────────────────────

  /**
   * Get referral stats + list of both merchant-to-merchant and client-to-merchant referrals.
   */
  async getReferralStats() {
    const [
      totalMerchantReferrals,
      totalClientReferrals,
      pendingClientReferrals,
      validatedClientReferrals,
      totalReferralMonthsEarned,
      totalClientReferralBalance,
    ] = await Promise.all([
      // Merchants that have a referrer
      this.merchantRepo.count({ where: { referredById: { not: null } } }),
      this.clientReferralRepo.count({}),
      this.clientReferralRepo.count({ where: { status: 'PENDING' } }),
      this.clientReferralRepo.count({ where: { status: 'VALIDATED' } }),
      // Sum of referral months
      this.rawQuery.queryRaw<{ sum: number }>`SELECT COALESCE(SUM("referral_months_earned"), 0)::int as sum FROM "merchants" WHERE "referral_months_earned" > 0`,
      // Sum of client referral balances
      this.rawQuery.queryRaw<{ sum: number }>`SELECT COALESCE(SUM("referral_balance"), 0)::float as sum FROM "clients" WHERE "referral_balance" > 0`,
    ]);

    return {
      merchantToMerchant: {
        total: totalMerchantReferrals,
        totalMonthsEarned: totalReferralMonthsEarned[0]?.sum ?? 0,
      },
      clientToMerchant: {
        total: totalClientReferrals,
        pending: pendingClientReferrals,
        validated: validatedClientReferrals,
        totalBalance: totalClientReferralBalance[0]?.sum ?? 0,
      },
    };
  }

  /**
   * List merchant-to-merchant referrals (merchants that were referred by another merchant).
   */
  async listMerchantReferrals(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { referredById: { not: null } };
    if (search) {
      (where as any).OR = [
        { nom: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { referredBy: { nom: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [referrals, total] = await Promise.all([
      this.merchantRepo.findMany({
        where,
        select: {
          id: true,
          nom: true,
          email: true,
          categorie: true,
          ville: true,
          plan: true,
          referralBonusCredited: true,
          createdAt: true,
          referredBy: {
            select: {
              id: true,
              nom: true,
              email: true,
              referralCode: true,
              referralMonthsEarned: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.merchantRepo.count({ where }),
    ]);

    return {
      referrals: referrals.map((r: any) => ({
        id: r.id,
        nom: r.nom,
        email: r.email,
        categorie: r.categorie,
        ville: r.ville,
        plan: r.plan,
        bonusCredited: r.referralBonusCredited,
        createdAt: r.createdAt,
        referrer: r.referredBy
          ? {
              id: r.referredBy.id,
              nom: r.referredBy.nom,
              email: r.referredBy.email,
              referralCode: r.referredBy.referralCode,
              monthsEarned: r.referredBy.referralMonthsEarned,
            }
          : null,
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * List client-to-merchant referrals.
   */
  async listClientReferrals(page = 1, limit = 20, status?: 'PENDING' | 'VALIDATED', search?: string) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      (where as any).OR = [
        { client: { nom: { contains: search, mode: 'insensitive' } } },
        { client: { prenom: { contains: search, mode: 'insensitive' } } },
        { client: { email: { contains: search, mode: 'insensitive' } } },
        { merchant: { nom: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [referrals, total] = await Promise.all([
      this.clientReferralRepo.findMany({
        where,
        select: {
          id: true,
          status: true,
          amount: true,
          createdAt: true,
          validatedAt: true,
          client: {
            select: {
              id: true,
              prenom: true,
              nom: true,
              email: true,
              referralCode: true,
              referralBalance: true,
            },
          },
          merchant: {
            select: {
              id: true,
              nom: true,
              email: true,
              categorie: true,
              plan: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.clientReferralRepo.count({ where }),
    ]);

    return {
      referrals: referrals.map((r: any) => ({
        id: r.id,
        status: r.status,
        amount: r.amount,
        createdAt: r.createdAt,
        validatedAt: r.validatedAt,
        client: {
          id: r.client.id,
          prenom: r.client.prenom,
          nom: r.client.nom,
          email: r.client.email,
          referralCode: r.client.referralCode,
          referralBalance: r.client.referralBalance,
        },
        merchant: {
          id: r.merchant.id,
          nom: r.merchant.nom,
          email: r.merchant.email,
          categorie: r.merchant.categorie,
          plan: r.merchant.plan,
        },
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * List top referrers (merchants who referred the most other merchants).
   */
  async listTopReferrers(limit = 20) {
    const topReferrers = await this.merchantRepo.findMany({
      where: { referralMonthsEarned: { gt: 0 } },
      select: {
        id: true,
        nom: true,
        email: true,
        referralCode: true,
        referralMonthsEarned: true,
        plan: true,
        _count: { select: { referrals: true } },
      },
      orderBy: { referralMonthsEarned: 'desc' },
      take: limit,
    });

    return topReferrers.map((m: any) => ({
      id: m.id,
      nom: m.nom,
      email: m.email,
      referralCode: m.referralCode,
      monthsEarned: m.referralMonthsEarned,
      referredCount: m._count.referrals,
      plan: m.plan,
    }));
  }

    /**
     * List client payout requests.
     */
    async listPayoutRequests(page = 1, limit = 20, status?: PayoutStatus, search?: string) {
      const skip = (page - 1) * limit;

      const where: any = {};
      if (status) where.status = status;
      if (search) {
        where.client = {
          OR: [
            { nom: { contains: search, mode: 'insensitive' } },
            { prenom: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { telephone: { contains: search, mode: 'insensitive' } },
          ],
        };
      }

      const [requests, total] = await Promise.all([
        this.payoutReqRepo.findMany({
          where,
          include: {
            client: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                email: true,
                telephone: true,
                referralBalance: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.payoutReqRepo.count({ where }),
      ]);

      return {
        requests,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    }

    /**
     * Update payout request status.
     * Note: If rejected, we must refund the client's balance.
     */
    async updatePayoutRequestStatus(id: string, status: PayoutStatus, adminId: string) {
      return this.txRunner.run(async (prisma) => {
        const req = await prisma.payoutRequest.findUnique({ where: { id } });
        if (!req) throw new NotFoundException('Demande de paiement non trouvée');
        if (req.status === status) return req;

        const oldStatus = req.status;

        if (oldStatus === PayoutStatus.REJECTED || oldStatus === PayoutStatus.PAID) {
          throw new ForbiddenException('Impossible de modifier une demande déjà traitée');
        }

        const updated = await prisma.payoutRequest.update({
          where: { id },
          data: { status },
        });

        // Refund if rejected
        if (status === PayoutStatus.REJECTED) {
          await prisma.client.update({
            where: { id: req.clientId },
            data: { referralBalance: { increment: req.amount } },
          });
        }

        // Fetch admin email for audit log
        const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: { email: true } });

        await prisma.auditLog.create({
          data: {
            adminId,
            adminEmail: admin?.email ?? 'unknown',
            action: AuditAction.UPDATE_PAYOUT,
            targetType: 'CLIENT',
            targetId: id,
            targetLabel: `PayoutRequest ${id}`,
            metadata: { oldStatus, newStatus: status, amount: req.amount },
            ipAddress: 'admin-dashboard',
          },
        });

        return updated;
      });
    }
}
