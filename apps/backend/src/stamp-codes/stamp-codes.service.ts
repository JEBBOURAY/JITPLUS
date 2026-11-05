import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { AuditAction, AuditLogService, AuditTargetType } from '../admin/audit-log.service';
import { computeEarnedStamps } from '../merchant/utils/loyalty.utils';
import { maskName } from '../common/utils';
import { withRetry } from '../common/utils/retry-transaction.helper';
import { DEFAULT_AMOUNT_PER_STAMP, FREE_MAX_STAMP_CODES_PER_MONTH } from '../common/constants';
import { StampCodeTokenService } from './stamp-code-token.service';
import { CreateStampCodeBatchDto } from './dto';

/** Morocco time (UTC+1, no DST), as in MerchantDashboardService.getHomeStats. */
const MOROCCO_OFFSET_MS = 3_600_000;

/** Exported: part of the merchant controller's public return type. */
export interface StampCodeBatchSummary {
  batchId: string;
  label: string;
  stamps: number;
  amount: number;
  createdAt: Date;
  total: number;
  redeemed: number;
  revoked: number;
  active: number;
}

/** Start of the current calendar month and of the next one, Morocco time. */
export function currentMonthWindow(nowMs = Date.now()): { start: Date; end: Date } {
  const local = new Date(nowMs + MOROCCO_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1) - MOROCCO_OFFSET_MS),
    end: new Date(Date.UTC(y, m + 1, 1) - MOROCCO_OFFSET_MS),
  };
}

/** QR codes a merchant created in the current calendar month (FREE monthly allowance). */
function countCreatedThisMonth(db: Pick<Prisma.TransactionClient, 'stampCode'>, merchantId: string): Promise<number> {
  const { start, end } = currentMonthWindow();
  return db.stampCode.count({ where: { merchantId, createdAt: { gte: start, lt: end } } });
}

/**
 * Merchant side of the e-commerce QR codes: batches the merchant prints and
 * slips into parcels. Crediting a scanned code lives in
 * MerchantTransactionService.redeemStampCode, next to every other stamp move.
 */
@Injectable()
export class StampCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planService: MerchantPlanService,
    private readonly tokens: StampCodeTokenService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** FREE: codes created this calendar month out of the monthly allowance. PREMIUM: unlimited (limit null). */
  async getQuota(merchantId: string) {
    const { plan } = await this.planService.resolveEffectivePlan(merchantId);
    const used = await countCreatedThisMonth(this.prisma, merchantId);
    if (plan === 'PREMIUM') return { used, limit: null, remaining: null };
    return { used, limit: FREE_MAX_STAMP_CODES_PER_MONTH, remaining: Math.max(0, FREE_MAX_STAMP_CODES_PER_MONTH - used) };
  }

  async createBatch(merchantId: string, dto: CreateStampCodeBatchDto) {
    const hasStamps = dto.stamps != null;
    const hasAmount = dto.amount != null;
    if (hasStamps === hasAmount) {
      throw new BadRequestException('Indiquez soit un nombre de tampons, soit un montant');
    }

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { isActive: true, deletedAt: true, amountPerStamp: true },
    });
    if (!merchant || merchant.deletedAt || !merchant.isActive) throw new NotFoundException('Commerce non trouvé');

    let stamps = dto.stamps ?? 0;
    const amount = dto.amount ?? 0;
    if (hasAmount) {
      const amountPerStamp = merchant.amountPerStamp || DEFAULT_AMOUNT_PER_STAMP;
      stamps = computeEarnedStamps(amount, amountPerStamp);
      if (stamps === 0) {
        throw new BadRequestException(`Montant insuffisant pour gagner un tampon (minimum ${amountPerStamp})`);
      }
    }

    const { plan } = await this.planService.resolveEffectivePlan(merchantId);
    const batchId = randomUUID();
    const ids = Array.from({ length: dto.quantity }, () => randomUUID());
    // Already trimmed by the DTO
    const { label } = dto;

    // Count + insert in one Serializable transaction so two parallel requests
    // cannot both fit in the last slots of the FREE monthly allowance.
    await withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        if (plan !== 'PREMIUM') {
          const used = await countCreatedThisMonth(tx, merchantId);
          const remaining = Math.max(0, FREE_MAX_STAMP_CODES_PER_MONTH - used);
          if (dto.quantity > remaining) {
            throw new ForbiddenException({
              code: 'STAMP_CODE_QUOTA',
              meta: { remaining, limit: FREE_MAX_STAMP_CODES_PER_MONTH },
              message: `Le plan Gratuit permet ${FREE_MAX_STAMP_CODES_PER_MONTH} QR codes e-commerce par mois (${remaining} restant${remaining > 1 ? 's' : ''}). Passez au plan Pro pour des QR codes illimités.`,
            });
          }
        }
        await tx.stampCode.createMany({
          data: ids.map((id) => ({
            id,
            merchantId,
            batchId,
            label,
            stamps,
            amount,
          })),
        });
      }, { isolationLevel: 'Serializable' }),
    );

    this.auditLogService.log({
      ctx: { actorType: 'MERCHANT', merchantId },
      action: AuditAction.CREATE_STAMP_CODES,
      targetType: AuditTargetType.MERCHANT,
      targetId: merchantId,
      targetLabel: label,
      metadata: { batchId, quantity: dto.quantity, stamps, amount },
    });

    return this.getBatch(merchantId, batchId);
  }

  /** Most recent batches first. The app pages until a page comes back short (no total count). */
  async listBatches(merchantId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const rows = await this.prisma.$queryRaw<Array<{
        batch_id: string; label: string; stamps: number; amount: number; created_at: Date;
        total: number; redeemed: number; revoked: number;
      }>>(Prisma.sql`
        SELECT
          batch_id,
          MIN(label) AS label,
          MIN(stamps)::int AS stamps,
          MIN(amount)::float AS amount,
          MIN(created_at) AS created_at,
          COUNT(*)::int AS total,
          (COUNT(*) FILTER (WHERE status = 'REDEEMED'))::int AS redeemed,
          (COUNT(*) FILTER (WHERE status = 'REVOKED'))::int AS revoked
        FROM stamp_codes
        WHERE merchant_id = ${merchantId}
        GROUP BY batch_id
        ORDER BY MIN(created_at) DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

    return {
      batches: rows.map((r): StampCodeBatchSummary => ({
        batchId: r.batch_id,
        label: r.label,
        stamps: r.stamps,
        amount: r.amount,
        createdAt: r.created_at,
        total: r.total,
        redeemed: r.redeemed,
        revoked: r.revoked,
        active: r.total - r.redeemed - r.revoked,
      })),
    };
  }

  /** Batch detail with every code: the printable link for usable ones, who used the others. */
  async getBatch(merchantId: string, batchId: string) {
    const codes = await this.prisma.stampCode.findMany({
      where: { merchantId, batchId },
      orderBy: { id: 'asc' },
      select: {
        id: true, label: true, stamps: true, amount: true, status: true, createdAt: true, redeemedAt: true,
        redeemedByClient: { select: { prenom: true, nom: true, shareInfoMerchants: true } },
      },
    });
    if (codes.length === 0) throw new NotFoundException('Lot introuvable');

    const first = codes[0];
    const redeemed = codes.filter((c) => c.status === 'REDEEMED').length;
    const revoked = codes.filter((c) => c.status === 'REVOKED').length;

    return {
      batchId,
      label: first.label,
      stamps: first.stamps,
      amount: first.amount,
      // One createMany per batch: every code shares the same timestamp
      createdAt: first.createdAt,
      total: codes.length,
      redeemed,
      revoked,
      active: codes.length - redeemed - revoked,
      codes: codes.map((c) => {
        const client = c.redeemedByClient;
        const hide = client?.shareInfoMerchants === false;
        return {
          id: c.id,
          status: c.status,
          url: c.status === 'ACTIVE' ? this.tokens.buildUrl(c.id) : null,
          redeemedAt: c.redeemedAt,
          redeemedBy: client
            ? { prenom: hide ? maskName(client.prenom) : client.prenom, nom: hide ? maskName(client.nom) : client.nom }
            : null,
        };
      }),
    };
  }

  /** Disable every unused code of the batch (lost sheet, cancelled orders). */
  async revokeBatch(merchantId: string, batchId: string) {
    const { count } = await this.prisma.stampCode.updateMany({
      where: { merchantId, batchId, status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
    if (count === 0) {
      // Nothing left to revoke: only tell an unknown batch apart, no audit entry
      const exists = await this.prisma.stampCode.count({ where: { merchantId, batchId } });
      if (!exists) throw new NotFoundException('Lot introuvable');
      return { revoked: 0 };
    }
    this.auditRevoke(merchantId, { batchId, revoked: count });
    return { revoked: count };
  }

  async revokeCode(merchantId: string, codeId: string) {
    const { count } = await this.prisma.stampCode.updateMany({
      where: { id: codeId, merchantId, status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
    if (count === 0) {
      const code = await this.prisma.stampCode.findFirst({ where: { id: codeId, merchantId }, select: { status: true } });
      if (!code) throw new NotFoundException('QR code introuvable');
      throw new BadRequestException(code.status === 'REDEEMED' ? 'Ce QR code a déjà été utilisé' : 'Ce QR code est déjà désactivé');
    }
    this.auditRevoke(merchantId, { codeId, revoked: 1 });
    return { revoked: 1 };
  }

  private auditRevoke(merchantId: string, metadata: Record<string, unknown>) {
    this.auditLogService.log({
      ctx: { actorType: 'MERCHANT', merchantId },
      action: AuditAction.REVOKE_STAMP_CODES,
      targetType: AuditTargetType.MERCHANT,
      targetId: merchantId,
      metadata,
    });
  }
}

