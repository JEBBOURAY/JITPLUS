import type { Prisma, TransactionType } from '@prisma/client';
import type { TransactionKind } from '../dto/transactions-query.dto';

/** Types each history chip shows. `cancelled` is a status, not a type: every type, cancelled only. */
const KIND_TYPES: Record<Exclude<TransactionKind, 'cancelled'>, TransactionType[]> = {
  stamps: ['EARN_STAMPS', 'WELCOME_BONUS'],
  rewards: ['REDEEM_REWARD'],
  games: ['LUCKY_WHEEL_WIN'],
  coupons: ['COUPON_REDEEM'],
  adjustments: ['ADJUST_STAMPS'],
};

export interface TransactionFilters {
  kind?: TransactionKind;
  from?: Date;
  staff?: string;
  /** Matching clients of this merchant, already resolved from the search text. */
  clientIds?: string[];
}

/** Where clause of the merchant history. The informational program-change rows never show. */
export function buildTransactionWhere(merchantId: string, f: TransactionFilters): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {
    merchantId,
    type: f.kind && f.kind !== 'cancelled' ? { in: KIND_TYPES[f.kind] } : { not: 'LOYALTY_PROGRAM_CHANGE' },
  };
  if (f.kind === 'cancelled') where.status = 'CANCELLED';
  if (f.from) where.createdAt = { gte: f.from };
  if (f.staff === 'owner') where.teamMemberId = null;
  else if (f.staff) where.teamMemberId = f.staff;
  if (f.clientIds) where.clientId = { in: f.clientIds };
  return where;
}

export interface TransactionSummary {
  /** Stamps given by visits and welcome gifts (adjustments left out: they correct, they don't reward). */
  stampsGiven: number;
  rewardsRedeemed: number;
  /** Sum of the amounts typed at the till. */
  revenue: number;
}

/** Totals of the ACTIVE rows, from one `groupBy(type)` over the filtered history. */
export function summarizeByType(
  groups: Array<{ type: TransactionType; _count: number; _sum: { stamps: number | null; amount: number | null } }>,
): TransactionSummary {
  const summary: TransactionSummary = { stampsGiven: 0, rewardsRedeemed: 0, revenue: 0 };
  for (const g of groups) {
    if (g.type === 'EARN_STAMPS' || g.type === 'WELCOME_BONUS') summary.stampsGiven += g._sum.stamps ?? 0;
    if (g.type === 'REDEEM_REWARD') summary.rewardsRedeemed += g._count;
    summary.revenue += g._sum.amount ?? 0;
  }
  summary.revenue = Math.round(summary.revenue * 100) / 100;
  return summary;
}
