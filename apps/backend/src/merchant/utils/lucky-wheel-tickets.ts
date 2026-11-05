/**
 * A campaign gives its spin for the purchase amount alone, independently of
 * stamps: free tickets (no stamp cost) behind a minimum spend. Only these
 * campaigns accept a stamp-less PURCHASE transaction.
 */
export function purchaseTriggersWheel(c: { ticketCostStamps: number; minSpendAmount: number }): boolean {
  return c.ticketCostStamps === 0 && c.minSpendAmount > 0;
}

/**
 * Grants lucky-wheel tickets for a transaction that was just created inside
 * `prisma` (an interactive transaction client). Returns the number of tickets.
 *
 * Rules:
 *   ticketCostStamps > 0  → ticket granted on REDEEM_REWARD when stamps spent >= threshold
 *   ticketCostStamps == 0 → ticket granted on every EARN_STAMPS (each visit), and on
 *                           PURCHASE when the campaign has a minimum spend
 *   ticketEveryNVisits    → only grant on every N-th qualifying transaction
 *   minSpendAmount        → the transaction amount must reach it
 */
export async function awardLuckyWheelTicketsInTx(
  prisma: any,
  params: {
    clientId: string;
    merchantId: string;
    type: string;
    amount: number;
    stamps: number;
    transactionId: string;
    /**
     * Effective plan of the merchant. The lucky wheel is a PREMIUM feature:
     * a campaign left ACTIVE when the trial / subscription ended must stop
     * granting tickets (security audit 2026-11-05).
     */
    plan: 'FREE' | 'PREMIUM' | string;
    now?: Date;
  },
): Promise<number> {
  const { clientId, merchantId, type, amount, stamps, transactionId } = params;
  if (params.plan !== 'PREMIUM') return 0;
  if (type !== 'EARN_STAMPS' && type !== 'REDEEM_REWARD' && type !== 'PURCHASE') return 0;
  const now = params.now ?? new Date();

  const activeCampaigns: {
    id: string;
    ticketCostStamps: number;
    ticketEveryNVisits: number | null;
    minSpendAmount: number;
    startsAt: Date;
  }[] = await prisma.luckyWheelCampaign.findMany({
    where: {
      merchantId,
      status: 'ACTIVE',
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    select: { id: true, ticketCostStamps: true, ticketEveryNVisits: true, minSpendAmount: true, startsAt: true },
  });

  const eligibleCampaignIds: string[] = [];
  for (const c of activeCampaigns) {
    if (c.minSpendAmount > 0 && amount < c.minSpendAmount) continue;
    if (c.ticketCostStamps > 0) {
      if (type !== 'REDEEM_REWARD' || stamps < c.ticketCostStamps) continue;
    } else if (type === 'PURCHASE') {
      if (!purchaseTriggersWheel(c)) continue;
    } else if (type !== 'EARN_STAMPS') {
      continue;
    }
    if (c.ticketEveryNVisits && c.ticketEveryNVisits > 1) {
      // Count qualifying transactions (not tickets): tickets are only created
      // when the modulo passes, so counting tickets would stay at 0 forever.
      // The count includes the current transaction (already created).
      const qualifyingTxCount = await prisma.transaction.count({
        where: {
          clientId,
          merchantId,
          type: c.ticketCostStamps > 0
            ? 'REDEEM_REWARD'
            : purchaseTriggersWheel(c) ? { in: ['EARN_STAMPS', 'PURCHASE'] } : 'EARN_STAMPS',
          createdAt: { gte: c.startsAt },
          ...(c.minSpendAmount > 0 ? { amount: { gte: c.minSpendAmount } } : {}),
        },
      });
      if (qualifyingTxCount % c.ticketEveryNVisits !== 0) continue;
    }
    eligibleCampaignIds.push(c.id);
  }

  if (eligibleCampaignIds.length === 0) return 0;
  await prisma.luckyWheelTicket.createMany({
    data: eligibleCampaignIds.map((campaignId) => ({ campaignId, clientId, transactionId })),
  });
  return eligibleCampaignIds.length;
}
