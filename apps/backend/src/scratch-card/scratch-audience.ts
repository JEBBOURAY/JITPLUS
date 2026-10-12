import { Prisma } from '@prisma/client';
import type { ScratchAudienceTypeValue } from './dto';

const DAY_MS = 86_400_000;

/**
 * Loyalty cards targeted by a campaign: active card, client not deleted and
 * not blocking the merchant, filtered by the audience rule. Ghost clients
 * (isAnonymous) are included on purpose — they see the card once they claim
 * their account.
 */
export function buildAudienceWhere(
  merchantId: string,
  audienceType: ScratchAudienceTypeValue,
  audienceValue: number | null | undefined,
  now: Date,
): Prisma.LoyaltyCardWhereInput {
  const since = audienceValue ? new Date(now.getTime() - audienceValue * DAY_MS) : null;

  const where: Prisma.LoyaltyCardWhereInput = {
    merchantId,
    deactivatedAt: null,
    client: {
      deletedAt: null,
      merchantBlocks: { none: { merchantId } },
    },
  };

  switch (audienceType) {
    case 'ACTIVE_SINCE':
      if (since) where.lastVisitAt = { gte: since };
      break;
    case 'INACTIVE_SINCE':
      if (since) where.lastVisitAt = { lt: since };
      break;
    case 'MIN_STAMPS':
      if (audienceValue) where.stamps = { gte: audienceValue };
      break;
    case 'NEW_SINCE':
      if (since) where.createdAt = { gte: since };
      break;
    default:
      break;
  }
  return where;
}
