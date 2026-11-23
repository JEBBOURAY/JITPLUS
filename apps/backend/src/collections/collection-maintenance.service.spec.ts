import { CollectionMaintenanceService } from './collection-maintenance.service';

const item = (id: string, merchantId: string) => ({
  id,
  imageUrl: `https://cdn.test/collections/${merchantId}/${id}.webp`,
  collection: { merchantId },
});

function setup(batches: ReturnType<typeof item>[][] = [], gifts: { id: string; merchantId: string; giftImageUrl: string }[] = []) {
  const findMany = jest.fn();
  batches.forEach((b) => findMany.mockResolvedValueOnce(b));
  findMany.mockResolvedValue([]);
  const prisma = {
    collection: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      findMany: jest.fn().mockResolvedValueOnce(gifts).mockResolvedValue([]),
    },
    collectionItem: { findMany, updateMany: jest.fn().mockResolvedValue({}) },
  };
  const storage = {
    isOwnedBy: (url: string, owner: string) => url.includes(`/${owner}/`),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };
  return { service: new CollectionMaintenanceService(prisma as any, storage as any), prisma, storage };
}

describe('CollectionMaintenanceService', () => {
  it('ends the collections whose end date has passed', async () => {
    const { service, prisma } = setup();
    const now = new Date();
    expect(await service.expire(now)).toBe(2);
    expect(prisma.collection.updateMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', endsAt: { lte: now } },
      data: { status: 'ENDED', endedAt: now },
    });
  });

  it('removes the photos of ended collections only: link cleared, then file deleted', async () => {
    const { service, prisma, storage } = setup([[item('i1', 'm1'), item('i2', 'm2')]]);
    expect(await service.purgePhotos()).toBe(2);
    expect(prisma.collectionItem.findMany.mock.calls[0][0].where).toEqual({ imageUrl: { not: null }, collection: { status: 'ENDED' } });
    expect(prisma.collectionItem.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['i1', 'i2'] } }, data: { imageUrl: null } });
    expect(storage.deleteFile.mock.calls.map((c: string[]) => c[0])).toEqual([
      'https://cdn.test/collections/m1/i1.webp',
      'https://cdn.test/collections/m2/i2.webp',
    ]);
  });

  it('can be limited to one merchant', async () => {
    const { service, prisma } = setup();
    await service.purgePhotos('m1');
    expect(prisma.collectionItem.findMany.mock.calls[0][0].where.collection).toEqual({ status: 'ENDED', merchantId: 'm1' });
  });

  it('never deletes a file stored under another owner', async () => {
    const stray = { id: 'i9', imageUrl: 'https://cdn.test/collections/m2/x.webp', collection: { merchantId: 'm1' } };
    const { service, storage } = setup([[stray]]);
    await service.purgePhotos();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('also removes the gift photo of ended collections', async () => {
    const gift = { id: 'col1', merchantId: 'm1', giftImageUrl: 'https://cdn.test/collections/m1/gift.webp' };
    const { service, prisma, storage } = setup([], [gift]);
    expect(await service.purgePhotos('m1')).toBe(1);
    expect(prisma.collection.findMany.mock.calls[0][0].where).toEqual({ status: 'ENDED', giftImageUrl: { not: null }, merchantId: 'm1' });
    expect(prisma.collection.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['col1'] } }, data: { giftImageUrl: null } });
    expect(storage.deleteFile).toHaveBeenCalledWith(gift.giftImageUrl);
  });
});
