import { reassignCollectionProgressInTx } from './collection-merge';

function setup(ghost: { id: string; collectionId: string }[], real: { collectionId: string }[]) {
  const tx = {
    collectionProgress: {
      findMany: jest.fn().mockResolvedValueOnce(ghost).mockResolvedValueOnce(real),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  return tx;
}

describe('reassignCollectionProgressInTx', () => {
  it('does nothing when the ghost never collected', async () => {
    const tx = setup([], []);
    await reassignCollectionProgressInTx(tx, 'ghost', 'real', 'm1');
    expect(tx.collectionProgress.findMany).toHaveBeenCalledTimes(1);
    expect(tx.collectionProgress.updateMany).not.toHaveBeenCalled();
  });

  it('only reads the progress given by the issuing merchant', async () => {
    const tx = setup([], []);
    await reassignCollectionProgressInTx(tx, 'ghost', 'real', 'm1');
    expect(tx.collectionProgress.findMany.mock.calls[0][0].where).toEqual({ clientId: 'ghost', merchantId: 'm1' });
  });

  it('moves the progress to the real account', async () => {
    const tx = setup([{ id: 'p1', collectionId: 'col1' }, { id: 'p2', collectionId: 'col1' }], []);
    await reassignCollectionProgressInTx(tx, 'ghost', 'real', 'm1');
    expect(tx.collectionProgress.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['p1', 'p2'] } }, data: { clientId: 'real' } });
    expect(tx.collectionProgress.deleteMany).not.toHaveBeenCalled();
  });

  it('keeps the real account\'s own progress on a collection both collected', async () => {
    const tx = setup([{ id: 'p1', collectionId: 'col1' }, { id: 'p2', collectionId: 'col2' }], [{ collectionId: 'col1' }]);
    await reassignCollectionProgressInTx(tx, 'ghost', 'real', 'm1');
    expect(tx.collectionProgress.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['p1'] } } });
    expect(tx.collectionProgress.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['p2'] } }, data: { clientId: 'real' } });
  });
});
