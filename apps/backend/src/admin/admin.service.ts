import { Injectable, UnauthorizedException, ForbiddenException, NotFoundException, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import {
  ADMIN_USER_REPOSITORY, type IAdminUserRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  CLIENT_REPOSITORY, type IClientRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  REWARD_REPOSITORY, type IRewardRepository,
  NOTIFICATION_REPOSITORY, type INotificationRepository,
  UPGRADE_REQUEST_REPOSITORY, type IUpgradeRequestRepository,
  AUDIT_LOG_REPOSITORY, type IAuditLogRepository,
  DEVICE_SESSION_REPOSITORY, type IDeviceSessionRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../common/repositories';
import { checkLockout, handleFailedLogin, resetLoginAttempts, LockoutDbOps } from '../common/utils/login-lockout.helper';

import { ADMIN_STATS_CACHE_TTL } from '../common/constants';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private adminRepo: IAdminUserRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(TRANSACTION_REPOSITORY) private transactionRepo: ITransactionRepository,
    @Inject(REWARD_REPOSITORY) private rewardRepo: IRewardRepository,
    @Inject(NOTIFICATION_REPOSITORY) private notificationRepo: INotificationRepository,
    @Inject(UPGRADE_REQUEST_REPOSITORY) private upgradeRequestRepo: IUpgradeRequestRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private auditLogRepo: IAuditLogRepository,
    @Inject(DEVICE_SESSION_REPOSITORY) private deviceSessionRepo: IDeviceSessionRepository,
    @Inject(TRANSACTION_RUNNER) private txRunner: ITransactionRunner,
    @Inject(RAW_QUERY_RUNNER) private rawQuery: IRawQueryRunner,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private jwtService: JwtService,
  ) {}

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
  async listMerchants(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [merchants, total] = await Promise.all([
      this.merchantRepo.findMany({
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
      this.merchantRepo.count(),
    ]);

    return {
      merchants: merchants.map((m) => ({
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
      totalMerchants,
      activeMerchants,
      bannedMerchants,
      freeMerchants,
      premiumMerchants,
      totalClients,
      newClientsThisMonth,
      totalTransactions,
      transactionsThisMonth,
      earnPointsCount,
      redeemRewardCount,
      adjustPointsCount,
      totalRewards,
      totalNotifications,
      pendingUpgradeCount,
      recentMerchants,
      recentAuditLogs,
      pendingRequests,
      notifAgg,
    ] = await Promise.all([
      this.merchantRepo.count(),
      this.merchantRepo.count({ where: { isActive: true } }),
      this.merchantRepo.count({ where: { isActive: false } }),
      this.merchantRepo.count({ where: { plan: 'FREE' } }),
      this.merchantRepo.count({ where: { plan: 'PREMIUM' } }),
      this.clientRepo.count(),
      this.clientRepo.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.transactionRepo.count({ where: { status: 'ACTIVE' } }),
      this.transactionRepo.count({ where: { status: 'ACTIVE', createdAt: { gte: startOfMonth } } }),
      this.transactionRepo.count({ where: { type: 'EARN_POINTS' } }),
      this.transactionRepo.count({ where: { type: 'REDEEM_REWARD' } }),
      this.transactionRepo.count({ where: { type: 'ADJUST_POINTS' } }),
      this.rewardRepo.count(),
      this.notificationRepo.count(),
      this.upgradeRequestRepo.count({ where: { status: 'PENDING' } }),
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
      this.upgradeRequestRepo.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          createdAt: true,
          message: true,
          merchant: { select: { id: true, nom: true, email: true, plan: true } },
        },
      }),
      this.notificationRepo.aggregate({
        _sum: { recipientCount: true, successCount: true },
      }),
    ]);

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
      channelCounts.map((c) => [c.channel, c._count.id]),
    );
    const pushCount = channelMap['PUSH'] ?? 0;
    const whatsappCount = channelMap['WHATSAPP'] ?? 0;
    const emailCount = channelMap['EMAIL'] ?? 0;

    // Map raw trend rows into month buckets
    const merchantTrendMap = Object.fromEntries(
      merchantTrendRaw.map((r) => [r.month, Number(r.count)]),
    );
    const transactionTrendMap = Object.fromEntries(
      transactionTrendRaw.map((r) => [r.month, Number(r.count)]),
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
      upgradeRequests: { pending: pendingUpgradeCount },
      trends,
      recentMerchants,
      recentAuditLogs,
      pendingRequests,
    };

    await this.cache.set(cacheKey, result, ADMIN_STATS_CACHE_TTL);
    return result;
  }

  /**
   * List all registered clients with contact info (for admin dashboard).
   */
  async listClients(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { nom: { contains: search, mode: 'insensitive' as const } },
            { prenom: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { telephone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

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
      clients: clients.map(({ _count, ...rest }) => ({
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
      where.channel = channel;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
        { merchant: { nom: { contains: search, mode: 'insensitive' } } },
        { merchant: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [notifications, total] = await Promise.all([
      this.notificationRepo.findMany({
        where,
        select: {
          id: true,
          title: true,
          body: true,
          channel: true,
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
}
