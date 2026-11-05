import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AuditAction, MerchantCategory, Prisma } from '@prisma/client';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  AUDIT_LOG_REPOSITORY, type IAuditLogRepository,
  DEVICE_SESSION_REPOSITORY, type IDeviceSessionRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../common/repositories';
import { evictSessionCache } from '../common/utils/session-cache';
import { invalidateMerchantListCache } from '../common/utils/merchant-list-cache';
import { MS_PER_DAY } from '../common/constants';
import { maskEmail } from '../common/utils/pii-mask';
import { AdminDetailsService } from './admin-details.service';
import { MerchantNotifierService, NOTIFY_TARGET_SELECT } from '../merchant-inbox/merchant-notifier.service';
import { NOTIF_MESSAGES, lang as notifLang } from '../common/tasks/merchant-notif-messages';

/**
 * Admin merchant management: listing, detail, subscription history and
 * moderation (ban / unban / soft-delete).
 */
@Injectable()
export class AdminMerchantService {
  private readonly logger = new Logger(AdminMerchantService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogRepo: IAuditLogRepository,
    @Inject(DEVICE_SESSION_REPOSITORY) private readonly deviceSessionRepo: IDeviceSessionRepository,
    @Inject(TRANSACTION_RUNNER) private readonly txRunner: ITransactionRunner,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly details: AdminDetailsService,
    private readonly notifier: MerchantNotifierService,
  ) {}

  /** Tells the merchant their account was suspended / reactivated (STATUS, always delivered). */
  private async notifyAccountStatus(merchantId: string, kind: 'accountSuspended' | 'accountReactivated'): Promise<void> {
    const target = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { ...NOTIFY_TARGET_SELECT, language: true },
    });
    if (!target) return;
    const msg = NOTIF_MESSAGES[kind][notifLang(target.language)];
    await this.notifier.notify(target, {
      category: 'STATUS',
      title: msg.title,
      body: msg.body,
      action: kind === 'accountSuspended' ? 'open_support' : 'open_dashboard',
      event: kind === 'accountSuspended' ? 'account_suspended' : 'account_reactivated',
    });
  }

  /** findUnique that also returns soft-deleted rows, which the Prisma extension hides by default. */
  private async findIncludingDeleted<S extends Prisma.MerchantSelect>(id: string, select: S) {
    return (await this.merchantRepo.findUnique({ where: { id }, select }))
      ?? this.merchantRepo.findFirst({ where: { id, deletedAt: { not: null } }, select });
  }

  /**
   * List all merchants with their plan info (for admin dashboard).
   */
  async listMerchants(
    page = 1,
    limit = 20,
    search?: string,
    plan?: string,
    status?: string,
    categorie?: string,
    opts: { activity?: 'active30' | 'dormant' | 'never'; ville?: string; sort?: 'recent' | 'oldest' | 'name' | 'clients' | 'views' | 'expiring' } = {},
  ) {
    const skip = (page - 1) * limit;
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * MS_PER_DAY);

    const where: Prisma.MerchantWhereInput = {};

    if (search) {
      where.OR = [
        { nom: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
        { phoneNumber: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    if (plan === 'FREE' || plan === 'PREMIUM') {
      where.plan = plan;
    } else if (plan === 'TRIAL') {
      where.plan = 'PREMIUM';
      where.planActivatedByAdmin = false;
      where.planExpiresAt = { gt: now };
    } else if (plan === 'PAID') {
      where.plan = 'PREMIUM';
      where.planActivatedByAdmin = true;
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
      // Free-form query string: Prisma rejects values outside MerchantCategory (unchanged behaviour)
      where.categorie = categorie as MerchantCategory;
    }

    if (opts.ville) {
      where.ville = { equals: opts.ville, mode: 'insensitive' as const };
    }

    if (opts.activity === 'active30') {
      where.transactions = { some: { status: 'ACTIVE', createdAt: { gte: d30 } } };
    } else if (opts.activity === 'dormant') {
      where.AND = [
        { transactions: { some: { status: 'ACTIVE' } } },
        { transactions: { none: { status: 'ACTIVE', createdAt: { gte: d30 } } } },
      ];
    } else if (opts.activity === 'never') {
      where.transactions = { none: {} };
    }

    // "expiring" lists plans that still have an upcoming end date, soonest first
    if (opts.sort === 'expiring') {
      where.plan = 'PREMIUM';
      where.planExpiresAt = { gt: now };
    }

    const orderBy =
      opts.sort === 'oldest' ? { createdAt: 'asc' as const }
      : opts.sort === 'name' ? { nom: 'asc' as const }
      : opts.sort === 'clients' ? { loyaltyCards: { _count: 'desc' as const } }
      : opts.sort === 'views' ? { profileViews: 'desc' as const }
      : opts.sort === 'expiring' ? { planExpiresAt: 'asc' as const }
      : { createdAt: 'desc' as const };

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
          deletedAt: true,
          createdAt: true,
          _count: {
            select: {
              loyaltyCards: { where: { deactivatedAt: null } },
              stores: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.merchantRepo.count({ where }),
    ]);

    const activity = await this.details.merchantActivityByIds(merchants.map((m) => m.id));

    return {
      merchants: merchants.map((m) => ({
        ...m,
        clientCount: m._count.loyaltyCards,
        storeCount: m._count.stores,
        isTrial: m.plan === 'PREMIUM' && !m.planActivatedByAdmin && !!m.planExpiresAt,
        lastActivityAt: activity.get(m.id)?.lastActivityAt ?? null,
        transactions30d: activity.get(m.id)?.transactions30d ?? 0,
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
    const merchant = await this.findIncludingDeleted(merchantId, {
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
      deletedAt: true,
      createdAt: true,
      _count: {
        select: {
          loyaltyCards: { where: { deactivatedAt: null } },
          stores: true,
          notifications: true,
          transactions: true,
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException('Commerçant non trouvé');
    }

    return {
      ...merchant,
      isTrial: merchant.plan === 'PREMIUM' && !merchant.planActivatedByAdmin && !!merchant.planExpiresAt,
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
    const merchant = await this.findIncludingDeleted(merchantId, {
      id: true,
      nom: true,
      email: true,
      plan: true,
      planActivatedByAdmin: true,
      planExpiresAt: true,
      trialStartedAt: true,
      createdAt: true,
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
      ...logs.map((log) => {
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

    const liveSessions = await this.deviceSessionRepo.findMany({ where: { merchantId }, select: { tokenId: true } });
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

    await evictSessionCache(this.cache, liveSessions.map((r) => r.tokenId));
    // Off the client map at once, not after the list cache expires.
    await invalidateMerchantListCache(this.cache);
    this.logger.log(`Merchant ${merchantId} (${maskEmail(merchant.email)}) banned`);
    await this.notifyAccountStatus(merchantId, 'accountSuspended');
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

    await invalidateMerchantListCache(this.cache);
    this.logger.log(`Merchant ${merchantId} (${maskEmail(merchant.email)}) unbanned`);
    await this.notifyAccountStatus(merchantId, 'accountReactivated');
    return { nom: merchant.nom, email: merchant.email };
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

    const liveSessions = await this.deviceSessionRepo.findMany({ where: { merchantId }, select: { tokenId: true } });
    const now = new Date();

    await this.txRunner.run(async (tx) => {
      // 1. Soft-delete merchant: anonymise ALL PII so email/phone/social IDs can be reused
      await tx.merchant.update({
        where: { id: merchantId },
        data: {
          deletedAt: now,
          nom: 'Compte supprimé',
          email: `deleted_${merchantId}`,
          password: '',
          googleId: null,
          appleId: null,
          pushToken: null,
          phoneNumber: null,
          description: null,
          ville: null,
          quartier: null,
          adresse: null,
          latitude: null,
          longitude: null,
          logoUrl: null,
          coverUrl: null,
          socialLinks: Prisma.DbNull,
          referralCode: null,
          isActive: false,
        },
      });

      // 2. Deactivate all team members + clear credentials
      await tx.teamMember.updateMany({
        where: { merchantId },
        data: { isActive: false, password: '' },
      });

      // 3. Deactivate all stores so they disappear from search/discovery
      await tx.store.updateMany({
        where: { merchantId },
        data: { isActive: false },
      });

      // 4. Deactivate all loyalty cards so clients see them as expired
      await tx.loyaltyCard.updateMany({
        where: { merchantId, deactivatedAt: null },
        data: { deactivatedAt: now },
      });

      // 5. Revoke all active sessions (access + refresh tokens invalidated)
      await tx.deviceSession.deleteMany({
        where: { merchantId },
      });

      // 6. Clean up notification data so recreated accounts start fresh
      await tx.merchantNotificationRead.deleteMany({
        where: { merchantId },
      });
      await tx.merchantInboxNotification.deleteMany({
        where: { merchantId },
      });
      await tx.notification.deleteMany({
        where: { merchantId },
      });

      // 7. Delete orphan-prone related data
      await tx.reward.deleteMany({ where: { merchantId } });
      await tx.profileView.deleteMany({ where: { merchantId } });
      await tx.clientReferral.deleteMany({ where: { merchantId } });
    });
    await evictSessionCache(this.cache, liveSessions.map((r) => r.tokenId));

    await invalidateMerchantListCache(this.cache);
    this.logger.warn(`Merchant ${merchantId} (${maskEmail(merchant.email)}) soft-deleted by admin`);
    return { nom: merchant.nom, email: merchant.email };
  }
}
