import { reassignScratchDataInTx } from './scratch-merge';

function makeTx(ghostCards: any[], realCards: any[]) {
  return {
    scratchCard: {
      findMany: jest.fn().mockResolvedValueOnce(ghostCards).mockResolvedValueOnce(realCards),
      delete: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(1),
    },
    coupon: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
}

describe('reassignScratchDataInTx', () => {
  const now = new Date('2026-01-15T12:00:00Z');

  it('moves ghost cards to the real account and flags them', async () => {
    const tx = makeTx([{ id: 'g1', campaignId: 'c1', status: 'PENDING' }], []);
    await expect(reassignScratchDataInTx(tx, 'ghost', 'real', now)).resolves.toBe(1);
    expect(tx.scratchCard.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['g1'] } },
      data: { clientId: 'real', claimedFromGhostAt: now },
    });
    expect(tx.coupon.updateMany).toHaveBeenCalledWith({ where: { clientId: 'ghost' }, data: { clientId: 'real' } });
  });

  it('drops the ghost card when the real account already has one for the campaign', async () => {
    const tx = makeTx(
      [{ id: 'g1', campaignId: 'c1', status: 'PENDING' }],
      [{ id: 'r1', campaignId: 'c1', status: 'PENDING' }],
    );
    await reassignScratchDataInTx(tx, 'ghost', 'real', now);
    expect(tx.scratchCard.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
    expect(tx.scratchCard.updateMany).not.toHaveBeenCalled();
  });

  it('keeps a scratched ghost card over an unscratched real one', async () => {
    const tx = makeTx(
      [{ id: 'g1', campaignId: 'c1', status: 'SCRATCHED' }],
      [{ id: 'r1', campaignId: 'c1', status: 'PENDING' }],
    );
    await reassignScratchDataInTx(tx, 'ghost', 'real', now);
    expect(tx.scratchCard.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    expect(tx.scratchCard.updateMany).toHaveBeenCalled();
  });
});
