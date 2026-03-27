import { Injectable, BadRequestException, NotFoundException, Logger, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  UPGRADE_REQUEST_REPOSITORY, type IUpgradeRequestRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../../common/repositories';
import { IPushProvider, PUSH_PROVIDER } from '../../common/interfaces';
import { MerchantPlanService } from './merchant-plan.service';
import { ClientReferralService } from '../../client-auth/client-referral.service';
import { MerchantReferralService } from './merchant-referral.service';

export type UpgradeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface UpgradeRequestWithMerchant {
  id: string;
  merchantId: string;
  status: UpgradeRequestStatus;
  message: string | null;
  adminNote: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  merchant: {
    id: string;
    nom: string;
    email: string;
    categorie: string;
    ville: string | null;
    plan: string;
    planExpiresAt: Date | null;
    trialStartedAt: Date | null;
    isActive: boolean;
  };
}

@Injectable()
export class UpgradeRequestService {
  private readonly logger = new Logger(UpgradeRequestService.name);

  constructor(
    @Inject(UPGRADE_REQUEST_REPOSITORY) private upgradeRequestRepo: IUpgradeRequestRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(TRANSACTION_RUNNER) private txRunner: ITransactionRunner,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
    private readonly planService: MerchantPlanService,
    private readonly clientReferralService: ClientReferralService,
    private readonly merchantReferralService: MerchantReferralService,
  ) {}

  /**
   * Merchant submits an upgrade request.
   * Only one PENDING request allowed at a time.
   */
  async submit(merchantId: string, message?: string): Promise<{ id: string; status: UpgradeRequestStatus }> {
    // Check for existing pending request
    const existing = await this.upgradeRequestRepo.findFirst({
      where: { merchantId, status: 'PENDING' },
    });

    if (existing) {
      throw new BadRequestException(
        'Une demande est déjà en cours de traitement. Vous serez notifié dès que l\'équipe JitPlus l\'aura examinée.',
      );
    }

    const request = await this.upgradeRequestRepo.create({
      data: {
        merchantId,
        status: 'PENDING',
        message: message?.trim() || null,
      },
    });

    this.logger.log(`Upgrade request submitted by merchant ${merchantId}`);
    return { id: request.id, status: request.status };
  }

  /**
   * Get the current upgrade request state for a merchant.
   * Returns the most recent request regardless of status.
   */
  async getForMerchant(merchantId: string): Promise<{
    id: string;
    status: UpgradeRequestStatus;
    message: string | null;
    adminNote: string | null;
    createdAt: Date;
  } | null> {
    const req = await this.upgradeRequestRepo.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        message: true,
        adminNote: true,
        createdAt: true,
      },
    });

    return req ?? null;
  }

  /**
   * List all upgrade requests for admin with filters.
   */
  async listAll(opts: {
    status?: UpgradeRequestStatus;
    page?: number;
    limit?: number;
  }): Promise<{ requests: UpgradeRequestWithMerchant[]; total: number; pending: number }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.UpgradeRequestWhereInput = {};
    if (opts.status) where.status = opts.status;

    // When already filtering by PENDING, total === pending — skip the extra count query
    const pendingWhere: Prisma.UpgradeRequestWhereInput | null =
      opts.status === 'PENDING' ? null : { status: 'PENDING' };

    const [requests, total, pendingCount] = await Promise.all([
      this.upgradeRequestRepo.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          merchant: {
            select: {
              id: true,
              nom: true,
              email: true,
              categorie: true,
              ville: true,
              plan: true,
              planExpiresAt: true,
              trialStartedAt: true,
              isActive: true,
            },
          },
        },
      }),
      this.upgradeRequestRepo.count({ where }),
      pendingWhere
        ? this.upgradeRequestRepo.count({ where: pendingWhere })
        : Promise.resolve(0), // will be overridden below
    ]);

    const pending = opts.status === 'PENDING' ? total : pendingCount;
    return { requests, total, pending };
  }

  /**
   * Shared guard: loads a request with merchant data and ensures it is still PENDING.
   * Throws NotFoundException or BadRequestException otherwise.
   */
  private async findPendingOrThrow(
    requestId: string,
    merchantSelect: Record<string, true>,
  ): Promise<any> {
    const req = await this.upgradeRequestRepo.findUnique({
      where: { id: requestId },
      include: { merchant: { select: merchantSelect } },
    });

    if (!req) throw new NotFoundException('Demande introuvable');
    if (req.status !== 'PENDING') {
      throw new BadRequestException(
        `Cette demande est déjà ${req.status === 'APPROVED' ? 'approuvée' : 'rejetée'}.`,
      );
    }
    return req;
  }

  /**
   * Admin approves a request → activates Premium.
   */
  async approve(
    requestId: string,
    adminId: string,
    adminNote?: string,
  ): Promise<{ merchantId: string; merchantNom: string; merchantEmail: string }> {
    const req = await this.findPendingOrThrow(requestId, {
      id: true,
      nom: true,
      email: true,
      pushToken: true,
    });

    await this.txRunner.batch([
      // Mark request as APPROVED
      this.upgradeRequestRepo.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          adminNote: adminNote?.trim() || null,
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      }),
      // Activate Premium permanently
      this.merchantRepo.update({
        where: { id: req.merchantId },
        data: {
          plan: 'PREMIUM',
          planActivatedByAdmin: true,
          planExpiresAt: null,
        },
      }),
    ]);

    // Invalidate the plan cache so the merchant immediately gets PREMIUM access
    await this.planService.invalidatePlanCache(req.merchantId);

    // â”€â”€ Push notification to merchant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (req.merchant.pushToken) {
      const noteMsg = adminNote?.trim()
        ? `\n${adminNote.trim()}`
        : '';
      await this.pushProvider.sendToMerchant(
        req.merchant.pushToken,
        '🎉 Plan Premium activéÂ !',
        `Votre abonnement JitPlus Premium est activé. Profitez de toutes les fonctionnalités sans limite.${noteMsg}`,
        { type: 'plan_activated', requestId },
      );
    }

    this.logger.log(`Upgrade request ${requestId} approved for merchant ${req.merchantId}`);

    // Credit client referrer if this merchant was referred by a client (fire-and-forget)
    this.clientReferralService.creditClientForMerchant(req.merchantId)
      .catch((err) => this.logger.error(`Client referral credit failed for merchant ${req.merchantId}`, err?.stack));

    // Credit merchant referrer now that this merchant has paid (fire-and-forget)
    this.merchantReferralService.creditReferrerOnPayment(req.merchantId)
      .catch((err) => this.logger.error(`Merchant referral credit failed for merchant ${req.merchantId}`, err?.stack));

    return { merchantId: req.merchantId, merchantNom: req.merchant.nom, merchantEmail: req.merchant.email };
  }

  /**
   * Admin rejects a request.
   */
  async reject(
    requestId: string,
    adminId: string,
    adminNote?: string,
  ): Promise<{ merchantId: string }> {
    const req = await this.findPendingOrThrow(requestId, {
      id: true,
      nom: true,
      pushToken: true,
    });

    await this.upgradeRequestRepo.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        adminNote: adminNote?.trim() || null,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });

    // â”€â”€ Push notification to merchant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (req.merchant.pushToken) {
      const noteMsg = adminNote?.trim()
        ? ` ${adminNote.trim()}`
        : " Contactez notre équipe pour plus d'informations.";
      await this.pushProvider.sendToMerchant(
        req.merchant.pushToken,
        'Demande Premium',
        `Votre demande d'activation Premium n'a pas été approuvée.${noteMsg}`,
        { type: 'plan_rejected', requestId },
      );
    }

    this.logger.log(`Upgrade request ${requestId} rejected for merchant ${req.merchantId}`);
    return { merchantId: req.merchantId };
  }
}
