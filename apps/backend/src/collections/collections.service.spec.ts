import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CollectionsService } from './collections.service';

const ROW = {
  id: 'col1',
  name: 'Été',
  giftLabel: 'Un café glacé',
  status: 'DRAFT',
  onePerVisit: false,
  repeatable: true,
  couponValidityDays: 30,
  giftDelayHours: 0,
  endsAt: null,
  startedAt: null,
  endedAt: null,
  createdAt: new Date(),
  items: [
    { id: 'i1', label: 'Espresso', imageUrl: null, position: 0 },
    { id: 'i2', label: 'Mojito', imageUrl: null, position: 1 },
  ],
};
const OWN_PHOTO = 'https://cdn.test/collections/m1/espresso_ab12.webp';
const DTO = { name: ' Été ', items: [{ label: 'Espresso' }, { label: ' Mojito ' }], giftLabel: 'Un café glacé' };

function setup(opts: {
  count?: number;
  claimed?: number;
  exists?: boolean;
  draft?: boolean;
  activateError?: unknown;
  photos?: string[];
  giftPhoto?: string;
  /** Overrides of the stored row read by update() */
  row?: Partial<typeof ROW>;
} = {}) {
  const photos = opts.photos ?? [];
  const stored = {
    ...ROW,
    giftImageUrl: opts.giftPhoto ?? null,
    items: ROW.items.map((item, i) => ({ ...item, imageUrl: photos[i] ?? null })),
    ...opts.row,
  };
  const collection = {
    count: jest.fn().mockResolvedValue(opts.count ?? 0),
    create: jest.fn().mockResolvedValue(ROW),
    findFirst: jest.fn().mockImplementation(({ where }: any) =>
      Promise.resolve(where.status === 'DRAFT' ? (opts.draft ? { id: 'col1' } : null) : opts.exists === false ? null : stored),
    ),
    findUniqueOrThrow: jest.fn().mockResolvedValue(ROW),
    updateMany: jest.fn().mockResolvedValue({ count: opts.claimed ?? 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: opts.claimed ?? 1 }),
  };
  const tx = {
    collection,
    collectionItem: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    collectionProgress: { groupBy: jest.fn().mockResolvedValue([]) },
    collectionCheck: { groupBy: jest.fn().mockResolvedValue([]) },
    coupon: { count: jest.fn().mockResolvedValue(0) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((fn: any) => (opts.activateError ? Promise.reject(opts.activateError) : fn(tx))),
  };
  const cache = { del: jest.fn().mockResolvedValue(undefined) };
  // Owned = stored under this merchant's prefix, whatever the folder.
  const storage = { isOwnedBy: (url: string, owner: string) => url.includes(`/${owner}/`), deleteFile: jest.fn().mockResolvedValue(undefined) };
  const maintenance = { purgePhotos: jest.fn().mockResolvedValue(0) };
  const service = new CollectionsService(prisma as any, cache as any, storage as any, maintenance as any);
  return { service, tx, cache, storage, maintenance };
}

describe('CollectionsService', () => {
  it('creates a draft with trimmed labels in order, for the caller\'s merchant', async () => {
    const { service, tx } = setup();
    await service.create('m1', DTO as any);
    expect(tx.collection.create.mock.calls[0][0].data).toMatchObject({
      merchantId: 'm1',
      name: 'Été',
      giftLabel: 'Un café glacé',
      repeatable: true,
      onePerVisit: false,
      couponValidityDays: 30,
      items: { create: [{ label: 'Espresso', imageUrl: null, position: 0 }, { label: 'Mojito', imageUrl: null, position: 1 }] },
    });
  });

  it('refuses duplicate products and a full account', async () => {
    await expect(setup().service.create('m1', { ...DTO, items: [{ label: 'Mojito' }, { label: 'mojito' }] } as any)).rejects.toThrow(BadRequestException);
    await expect(setup({ count: 50 }).service.create('m1', DTO as any)).rejects.toThrow('error.collection.tooMany');
  });

  it('only deletes a draft of the caller\'s merchant', async () => {
    await expect(setup({ claimed: 0 }).service.remove('m1', 'col1')).rejects.toThrow(ConflictException);
    const foreign = setup({ claimed: 0, exists: false });
    await expect(foreign.service.update('m1', 'col1', DTO as any)).rejects.toThrow(NotFoundException);
    await expect(foreign.service.remove('m1', 'col1')).rejects.toThrow('error.collection.notFound');
  });

  describe('edit', () => {
    const KEEP_BOTH = { ...DTO, items: [{ id: 'i1', label: 'Espresso' }, { id: 'i2', label: 'Mojito glacé' }] };

    it('updates the products of a draft in place, adds the new ones and drops the missing ones', async () => {
      const { service, tx } = setup();
      await service.update('m1', 'col1', { ...DTO, items: [{ id: 'i1', label: 'Espresso' }, { label: 'Thé' }] } as any);
      expect(tx.collectionItem.deleteMany).toHaveBeenCalledWith({ where: { collectionId: 'col1', id: { in: ['i2'] } } });
      expect(tx.collectionItem.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { label: 'Espresso', imageUrl: null, position: 0 } });
      expect(tx.collectionItem.create).toHaveBeenCalledWith({ data: { label: 'Thé', imageUrl: null, position: 1, collectionId: 'col1' } });
    });

    it('edits a running collection without losing what clients collected', async () => {
      const { service, tx, cache } = setup({ row: { status: 'ACTIVE' } });
      await service.update('m1', 'col1', { ...KEEP_BOTH, items: [...KEEP_BOTH.items, { label: 'Jus' }] } as any);
      expect(tx.collection.updateMany.mock.calls[0][0].where).toEqual({ id: 'col1', merchantId: 'm1', status: 'ACTIVE' });
      expect(tx.collectionItem.deleteMany).not.toHaveBeenCalled();
      expect(tx.collectionItem.update).toHaveBeenCalledTimes(2);
      expect(tx.collectionItem.create).toHaveBeenCalledTimes(1);
      expect(cache.del).toHaveBeenCalledWith('merchant:detail:m1');
    });

    it('refuses to remove a product from a running collection', async () => {
      const { service, tx } = setup({ row: { status: 'ACTIVE' } });
      await expect(service.update('m1', 'col1', { ...DTO, items: [{ id: 'i1', label: 'Espresso' }, { label: 'Thé' }] } as any))
        .rejects.toThrow('error.collection.itemsLocked');
      expect(tx.collection.updateMany).not.toHaveBeenCalled();
    });

    it('refuses an ended collection, or one past its end date', async () => {
      await expect(setup({ row: { status: 'ENDED' } }).service.update('m1', 'col1', KEEP_BOTH as any)).rejects.toThrow('error.collection.notEditable');
      const expired = setup({ row: { status: 'ACTIVE', endsAt: new Date(Date.now() - 1000) as any } });
      await expect(expired.service.update('m1', 'col1', KEEP_BOTH as any)).rejects.toThrow('error.collection.notEditable');
    });

    it('refuses when the status changed meanwhile (launched or ended)', async () => {
      const { service, tx } = setup({ claimed: 0 });
      await expect(service.update('m1', 'col1', KEEP_BOTH as any)).rejects.toThrow('error.collection.notEditable');
      expect(tx.collectionItem.update).not.toHaveBeenCalled();
    });
  });

  it('activates a draft and frees the slot held by an expired collection first', async () => {
    const { service, tx, cache, maintenance } = setup();
    await service.activate('m1', 'col1');
    expect(cache.del).toHaveBeenCalledWith('merchant:detail:m1');
    expect(maintenance.purgePhotos).toHaveBeenCalledWith('m1');
    const [freeSlot, claim] = tx.collection.updateMany.mock.calls.map((c: any[]) => c[0]);
    expect(freeSlot.where).toMatchObject({ merchantId: 'm1', status: 'ACTIVE' });
    expect(freeSlot.data.status).toBe('ENDED');
    expect(claim.where).toMatchObject({ id: 'col1', merchantId: 'm1', status: 'DRAFT' });
    expect(claim.data.status).toBe('ACTIVE');
  });

  it('refuses a second active collection (partial unique index)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    await expect(setup({ activateError: p2002 }).service.activate('m1', 'col1')).rejects.toThrow('error.collection.alreadyActive');
  });

  it('explains why a draft cannot start: end date passed, already started, unknown', async () => {
    await expect(setup({ claimed: 0, draft: true }).service.activate('m1', 'col1')).rejects.toThrow('error.collection.endDatePast');
    await expect(setup({ claimed: 0 }).service.activate('m1', 'col1')).rejects.toThrow('error.collection.notDraft');
    await expect(setup({ claimed: 0, exists: false }).service.activate('m1', 'col1')).rejects.toThrow(NotFoundException);
  });

  it('ends only an active collection, and deletes its photos', async () => {
    await expect(setup({ claimed: 0 }).service.end('m1', 'col1')).rejects.toThrow('error.collection.notActive');
    const { service, maintenance, cache } = setup();
    await service.end('m1', 'col1');
    expect(maintenance.purgePhotos).toHaveBeenCalledWith('m1');
    expect(cache.del).toHaveBeenCalledWith('merchant:detail:m1');
  });

  describe('product photos', () => {
    const withPhoto = (imageUrl: string) => ({ ...DTO, items: [{ label: 'Espresso', imageUrl }, { label: 'Mojito' }] });

    it('saves a photo uploaded for a collection by this merchant', async () => {
      const { service, tx } = setup();
      await service.create('m1', withPhoto(OWN_PHOTO) as any);
      expect(tx.collection.create.mock.calls[0][0].data.items.create[0]).toEqual({ label: 'Espresso', imageUrl: OWN_PHOTO, position: 0 });
    });

    it('saves the gift photo, with the same ownership rule', async () => {
      const { service, tx } = setup();
      await service.create('m1', { ...DTO, giftImageUrl: OWN_PHOTO } as any);
      expect(tx.collection.create.mock.calls[0][0].data.giftImageUrl).toBe(OWN_PHOTO);
      const logo = 'https://cdn.test/logos/m1/logo.webp';
      await expect(setup().service.create('m1', { ...DTO, giftImageUrl: logo } as any)).rejects.toThrow('error.collection.invalidImage');
    });

    it('deletes the old gift photo when it is replaced', async () => {
      const oldGift = 'https://cdn.test/collections/m1/gift-old.webp';
      const { service, storage } = setup({ giftPhoto: oldGift });
      await service.update('m1', 'col1', { ...DTO, giftImageUrl: OWN_PHOTO } as any);
      expect(storage.deleteFile).toHaveBeenCalledWith(oldGift);
    });

    it('refuses the photo of another merchant', async () => {
      const foreign = 'https://cdn.test/collections/m2/espresso.webp';
      await expect(setup().service.create('m1', withPhoto(foreign) as any)).rejects.toThrow('error.collection.invalidImage');
    });

    it('refuses an image of the merchant that is not a collection photo (it would be deleted with the collection)', async () => {
      const logo = 'https://cdn.test/logos/m1/logo.webp';
      await expect(setup().service.create('m1', withPhoto(logo) as any)).rejects.toThrow('error.collection.invalidImage');
    });

    it('deletes the photos a draft stops using, and keeps the others', async () => {
      const old = 'https://cdn.test/collections/m1/old.webp';
      const { service, storage } = setup({ photos: [OWN_PHOTO, old] });
      await service.update('m1', 'col1', withPhoto(OWN_PHOTO) as any);
      expect(storage.deleteFile).toHaveBeenCalledTimes(1);
      expect(storage.deleteFile).toHaveBeenCalledWith(old);
    });

    it('deletes the photos of a deleted draft, but nothing when the delete is refused', async () => {
      const ok = setup({ photos: [OWN_PHOTO] });
      await ok.service.remove('m1', 'col1');
      expect(ok.storage.deleteFile).toHaveBeenCalledWith(OWN_PHOTO);

      const live = setup({ photos: [OWN_PHOTO], claimed: 0 });
      await expect(live.service.remove('m1', 'col1')).rejects.toThrow('error.collection.notDraft');
      expect(live.storage.deleteFile).not.toHaveBeenCalled();
    });
  });
});
