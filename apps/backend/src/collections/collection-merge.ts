/**
 * Moves the collection progress of a ghost (quick-add) client to the real
 * account during a claim. Must run inside the claim transaction. Gift coupons
 * are moved with the other coupons (reassignScratchDataInTx).
 *
 * One progress per (collection, client, cycle): when the real account already
 * collects the same collection, it keeps its own progress and the ghost's is
 * dropped (rare: the real account would have to be a client before the claim).
 */
export async function reassignCollectionProgressInTx(
  tx: any,
  anonymousId: string,
  realClientId: string,
  merchantId: string,
): Promise<void> {
  const ghost: { id: string; collectionId: string }[] = await tx.collectionProgress.findMany({
    where: { clientId: anonymousId, merchantId },
    select: { id: true, collectionId: true },
  });
  if (ghost.length === 0) return;

  const real: { collectionId: string }[] = await tx.collectionProgress.findMany({
    where: { clientId: realClientId, collectionId: { in: ghost.map((g) => g.collectionId) } },
    select: { collectionId: true },
  });
  const taken = new Set(real.map((r) => r.collectionId));
  const toDrop = ghost.filter((g) => taken.has(g.collectionId)).map((g) => g.id);
  const toMove = ghost.filter((g) => !taken.has(g.collectionId)).map((g) => g.id);

  if (toDrop.length > 0) await tx.collectionProgress.deleteMany({ where: { id: { in: toDrop } } });
  if (toMove.length > 0) {
    await tx.collectionProgress.updateMany({ where: { id: { in: toMove } }, data: { clientId: realClientId } });
  }
}
