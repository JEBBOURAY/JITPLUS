import { Injectable, NotFoundException, BadRequestException, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Prisma, PayoutMethod, PayoutStatus } from '@prisma/client';
import { RequestPayoutDto } from './dto';
import { Cache } from 'cache-manager';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  CLIENT_REFERRAL_REPOSITORY, type IClientReferralRepository,
  PAYOUT_REQUEST_REPOSITORY, type IPayoutRequestRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  TRANSACTION_RUNNER,
} from '../common/repositories';
import { ITransactionRunner } from '../common/repositories/transaction-runner';
import {
  REFERRAL_CODE_CHARS,
  REFERRAL_CODE_LENGTH,
  REFERRAL_STATS_CACHE_TTL,
  CLIENT_REFERRAL_BONUS_AMOUNT,
} from '../common/constants';

export interface ClientReferralStats {
  referralCode: string;
  referralBalance: number;
  referredCount: number;
  referrals: {
    id: string;
    merchantName: string;
    merchantCategory: string;
    status: 'PENDING' | 'VALIDATED';
    amount: number;
    createdAt: Date;
    validatedAt: Date | null;
  }[];
}

@Injectable()
export class ClientReferralService {
  private readonly logger = new Logger(ClientReferralService.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(CLIENT_REFERRAL_REPOSITORY) private clientReferralRepo: IClientReferralRepository,
    @Inject(PAYOUT_REQUEST_REPOSITORY) private payoutReqRepo: IPayoutRequestRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: ITransactionRunner,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Get (or auto-generate) the referral code + full stats for a client.
   */
  async getReferralStats(clientId: string): Promise<ClientReferralStats> {
    const cacheKey = `client-referral:stats:${clientId}`;
    const cached = await this.cache.get<ClientReferralStats>(cacheKey);
    if (cached) return cached;

    const client = await this.clientRepo.findUnique({
      where: { id: clientId },
      select: {
        referralCode: true,
        referralBalance: true,
        _count: { select: { clientReferrals: true } },
        clientReferrals: {
          select: {
            id: true,
            merchantId: true,
            status: true,
            amount: true,
            createdAt: true,
            validatedAt: true,
            merchant: {
              select: { nom: true, categorie: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!client) throw new NotFoundException('Client non trouvé');

    let referralCode = client.referralCode;

    if (!referralCode) {
      referralCode = await this.generateUniqueCode();
      await this.clientRepo.update({
        where: { id: clientId },
        data: { referralCode },
      });
    }

    const result: ClientReferralStats = {
      referralCode,
      referralBalance: client.referralBalance,
      referredCount: (client as any)._count.clientReferrals,
      referrals: client.clientReferrals.map((r: any) => ({
        id: r.id,
        merchantName: r.merchant.nom,
        merchantCategory: r.merchant.categorie,
        status: r.status as 'PENDING' | 'VALIDATED',
        amount: r.amount,
        createdAt: r.createdAt,
        validatedAt: r.validatedAt,
      })),
    };

    await this.cache.set(cacheKey, result, REFERRAL_STATS_CACHE_TTL);
    return result;
  }

  /**
   * Validate a client referral code (called during merchant registration).
   * Returns the client id, or throws NotFoundException.
   */
  async validateCode(code: string): Promise<{ id: string; nom: string }> {
    if (!code || code.trim().length === 0) {
      throw new NotFoundException('Code de parrainage requis');
    }

    const sanitized = code.trim().toUpperCase();
    if (sanitized.length !== REFERRAL_CODE_LENGTH || !/^[A-Z2-9]+$/.test(sanitized)) {
      throw new NotFoundException('Code de parrainage client invalide');
    }

    const client = await this.clientRepo.findUnique({
      where: { referralCode: sanitized },
      select: { id: true, prenom: true, nom: true },
    });

    if (!client) {
      throw new NotFoundException('Code de parrainage client invalide');
    }

    return { id: client.id, nom: [client.prenom, client.nom].filter(Boolean).join(' ') || 'Client' };
  }

  /**
   * Create a client referral record when a merchant registers with a client code.
   * Idempotent: silently ignores if a referral for this merchant already exists.
   */
  async createReferral(clientId: string, merchantId: string): Promise<void> {
    try {
      await this.clientReferralRepo.create({
        data: {
          clientId,
          merchantId,
          status: 'PENDING',
          amount: 0,
        },
      });
      await this.invalidateCache(clientId);
      this.logger.log(`Client referral created: client=${clientId} → merchant=${merchantId}`);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.warn(`Client referral already exists for merchant=${merchantId}, skipping`);
        return;
      }
      throw err;
    }
  }

  /**
   * Credit the client when a referred merchant converts to paid PREMIUM.
   * Called from upgrade-request approval or admin activate-premium.
   * Uses atomic updateMany + transaction to prevent double-crediting race conditions.
   */
  async creditClientForMerchant(merchantId: string): Promise<void> {
    // Atomic guard: only update PENDING → VALIDATED (prevents double-credit)
    const { count } = await this.clientReferralRepo.updateMany({
      where: { merchantId, status: 'PENDING' },
      data: {
        status: 'VALIDATED',
        amount: CLIENT_REFERRAL_BONUS_AMOUNT,
        validatedAt: new Date(),
      },
    });

    if (count === 0) return; // no pending referral or already validated

    // Fetch the clientId to credit (needed after atomic update)
    const referral = await this.clientReferralRepo.findUnique({
      where: { merchantId },
      select: { clientId: true },
    });

    if (!referral) return;

    await this.clientRepo.update({
      where: { id: referral.clientId },
      data: {
        referralBalance: { increment: CLIENT_REFERRAL_BONUS_AMOUNT },
      },
    });

    await this.invalidateCache(referral.clientId);

    this.logger.log(
      `Client ${referral.clientId} credited ${CLIENT_REFERRAL_BONUS_AMOUNT} DH for merchant ${merchantId} going PREMIUM`,
    );
  }


  async requestPayout(clientId: string, dto: RequestPayoutDto) {
    if (dto.amount < 100) {
      throw new BadRequestException('Le montant minimum est de 100 DH');
    }
    return this.tx.run(async (prisma) => {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { referralBalance: true },
      });

      if (!client) throw new NotFoundException('Client non trouv\u00e9');
      if (client.referralBalance < dto.amount) {
        throw new BadRequestException('Solde de parrainage insuffisant');
      }

      await prisma.client.update({
        where: { id: clientId },
        data: { referralBalance: { decrement: dto.amount } },
      });

      const request = await prisma.payoutRequest.create({
        data: {
          clientId,
          amount: dto.amount,
          method: dto.method as PayoutMethod,
          accountDetails: dto.accountDetails ?? Prisma.DbNull,
          status: PayoutStatus.PENDING,
        },
      });

      await this.invalidateCache(clientId);
      return request;
    });
  }

  async getPayoutHistory(clientId: string) {
    return this.payoutReqRepo.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async invalidateCache(clientId: string): Promise<void> {
    await this.cache.del(`client-referral:stats:${clientId}`);
  }

  /** Generate a random alphanumeric code that doesn't already exist among client codes. */
  private async generateUniqueCode(): Promise<string> {
    let code: string;
    do {
      code = Array.from(
        { length: REFERRAL_CODE_LENGTH },
        () => REFERRAL_CODE_CHARS[Math.floor(Math.random() * REFERRAL_CODE_CHARS.length)],
      ).join('');
    } while (
      await this.clientRepo.findUnique({
        where: { referralCode: code },
        select: { id: true },
      })
    );
    return code;
  }
}

