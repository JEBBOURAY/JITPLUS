/**
 * Moves the scratch cards and coupons of a ghost (quick-add) client to the
 * real account during a claim. Must run inside the claim transaction.
 *
 * One card per (campaign, client): when both accounts got a card from the
 * same campaign, the real account keeps its own card, except when only the
 * ghost card was scratched. Ghosts cannot scratch, so in practice the ghost
 * card is the one dropped; it had not been drawn yet, so stocks are untouched.
 *
 * Returns the number of pending (still scratchable) cards now on the real account.
 */
export async function reassignScratchDataInTx(
  tx: any,
  anonymousId: string,
  realClientId: string,
  now: Date = new Date(),
): Promise<number> {
  const ghostCards: { id: string; campaignId: string; status: string }[] = await tx.scratchCard.findMany({
    where: { clientId: anonymousId },
    select: { id: true, campaignId: true, status: true },
  });

  if (ghostCards.length > 0) {
    const realCards: { id: string; campaignId: string; status: string }[] = await tx.scratchCard.findMany({
      where: { clientId: realClientId, campaignId: { in: ghostCards.map((c) => c.campaignId) } },
      select: { id: true, campaignId: true, status: true },
    });
    const realByCampaign = new Map(realCards.map((c) => [c.campaignId, c]));

    const toMove: string[] = [];
    for (const ghost of ghostCards) {
      const real = realByCampaign.get(ghost.campaignId);
      if (!real) {
        toMove.push(ghost.id);
      } else if (ghost.status === 'SCRATCHED' && real.status !== 'SCRATCHED') {
        await tx.scratchCard.delete({ where: { id: real.id } });
        toMove.push(ghost.id);
      } else {
        await tx.scratchCard.delete({ where: { id: ghost.id } });
      }
    }
    if (toMove.length > 0) {
      await tx.scratchCard.updateMany({
        where: { id: { in: toMove } },
        data: { clientId: realClientId, claimedFromGhostAt: now },
      });
    }
  }

  await tx.coupon.updateMany({ where: { clientId: anonymousId }, data: { clientId: realClientId } });

  return tx.scratchCard.count({
    where: {
      clientId: realClientId,
      status: 'PENDING',
      expiresAt: { gt: now },
      campaign: { status: { not: 'CANCELLED' } },
    },
  });
}
