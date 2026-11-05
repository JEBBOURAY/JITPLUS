import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditAction, PayoutStatus, Prisma } from '@prisma/client';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  CLIENT_REFERRAL_REPOSITORY, type IClientReferralRepository,
  PAYOUT_REQUEST_REPOSITORY, type IPayoutRequestRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../common/repositories';
import { IMailProvider, MAIL_PROVIDER } from '../common/interfaces';
import { pickEmailLang } from '../mail/transactional-i18n';
import { formatPayoutAmount, formatPayoutMethod } from '../client-auth/client-referral.service';

/**
 * Referral management: merchant-to-merchant and client-to-merchant referrals,
 * top referrers and client payout requests.
 */
@Injectable()
export class AdminReferralService {
  private readonly logger = new Logger(AdminReferralService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(CLIENT_REFERRAL_REPOSITORY) private readonly clientReferralRepo: IClientReferralRepository,
    @Inject(PAYOUT_REQUEST_REPOSITORY) private readonly payoutReqRepo: IPayoutRequestRepository,
    @Inject(TRANSACTION_RUNNER) private readonly txRunner: ITransactionRunner,
    @Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: IMailProvider,
  ) {}

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

    const where: Prisma.MerchantWhereInput = { referredById: { not: null } };
    if (search) {
      where.OR = [
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
      referrals: referrals.map((r) => ({
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

    const where: Prisma.ClientReferralWhereInput = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
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
      referrals: referrals.map((r) => ({
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

    return topReferrers.map((m) => ({
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

    const where: Prisma.PayoutRequestWhereInput = {};
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
    const result = await this.txRunner.run(async (prisma) => {
      const req = await prisma.payoutRequest.findUnique({ where: { id } });
      if (!req) throw new NotFoundException('Demande de paiement non trouvée');
      if (req.status === status) return { updated: req, notify: false as const };

      const oldStatus = req.status;

      if (oldStatus === PayoutStatus.REJECTED || oldStatus === PayoutStatus.PAID) {
        throw new ForbiddenException('Impossible de modifier une demande déjà traitée');
      }

      // Conditional transition: only the request that still has `oldStatus`
      // is moved. A concurrent call (double-click, two admins) that read the
      // same status gets count=0 and aborts, so the refund below can never
      // be applied twice.
      const transition = await prisma.payoutRequest.updateMany({
        where: { id, status: oldStatus },
        data: { status },
      });
      if (transition.count !== 1) {
        throw new ConflictException('La demande a été modifiée entre-temps, veuillez rafraîchir');
      }
      const updated = await prisma.payoutRequest.findUniqueOrThrow({ where: { id } });

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

      // Fetch client contact info for email notification
      const client = await prisma.client.findUnique({
        where: { id: req.clientId },
        select: { email: true, language: true },
      });

      return {
        updated,
        notify: true as const,
        email: client?.email ?? null,
        language: client?.language ?? null,
      };
    });

    // Send status email outside the transaction (best-effort)
    if (result.notify && result.email) {
      const lang = pickEmailLang(result.language);
      const kind = status === PayoutStatus.APPROVED ? 'approved'
        : status === PayoutStatus.PAID ? 'paid'
        : status === PayoutStatus.REJECTED ? 'rejected'
        : null;
      if (kind) {
        this.mailProvider.sendPayoutStatus(
          result.email,
          kind,
          formatPayoutAmount(result.updated.amount, lang),
          formatPayoutMethod(result.updated.method, lang),
          result.updated.rejectionReason ?? null,
          lang,
        ).catch((err) => this.logger.warn(`Payout ${kind} email failed: ${err}`));
      }
    }

    return result.updated;
  }
}
