import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CollectionProgressService } from './collection-progress.service';

const OLD = new Date(Date.now() - 3 * 86_400_000);
const COLLECTION = {
  id: 'col1',
  name: 'Été',
  giftLabel: 'Un café glacé',
  onePerVisit: false,
  repeatable: true,
  couponValidityDays: 30,
  giftDelayHours: 0,
  items: [
    { id: 'i1', label: 'Espresso' },
    { id: 'i2', label: 'Mojito' },
    { id: 'i3', label: 'Jus' },
  ],
};
const check = (itemId: string) => ({ itemId, createdAt: OLD });
const COUPON = { id: 'coupon1', validFrom: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 86_400_000) };

function setup(opts: {
  collection?: any;
  premium?: boolean;
  card?: any;
  progress?: any;
  createChecksError?: unknown;
  replayed?: any;
} = {}) {
  const collection = opts.collection === undefined ? COLLECTION : opts.collection;
  const createManyAndReturn = jest.fn().mockImplementation(({ data }: any) =>
    Promise.resolve(data.map((d: any) => ({ itemId: d.itemId, createdAt: new Date() }))),
  );
  if (opts.createChecksError) createManyAndReturn.mockRejectedValueOnce(opts.createChecksError);
  const tx = {
    collection: { findFirst: jest.fn().mockResolvedValue(collection) },
    loyaltyCard: {
      findUnique: jest.fn().mockResolvedValue(
        opts.card === undefined
          ? { deactivatedAt: null, client: { deletedAt: null, language: 'fr' }, merchant: { nom: 'Café Atlas' } }
          : opts.card,
      ),
    },
    collectionProgress: {
      findFirst: jest.fn().mockResolvedValue(opts.progress ?? null),
      create: jest.fn().mockResolvedValue({ id: 'p-new' }),
      update: jest.fn().mockResolvedValue({}),
    },
    collectionCheck: {
      createManyAndReturn,
      findFirst: jest.fn().mockResolvedValue(opts.replayed ?? null),
    },
  };
  const prisma = { ...tx, $transaction: jest.fn((fn: any) => fn(tx)) };
  const coupons = {
    createCollectionGift: jest.fn().mockResolvedValue(COUPON),
    toDto: jest.fn((c: any) => ({ id: c.id })),
  };
  const notifications = { sendToClient: jest.fn().mockResolvedValue(undefined) };
  const events = { emitCollectionUpdated: jest.fn() };
  const service = new CollectionProgressService(
    prisma as any,
    { isPremium: jest.fn().mockResolvedValue(opts.premium ?? true) } as any,
    coupons as any,
    notifications as any,
    events as any,
  );
  return { service, tx, coupons, notifications, events };
}

describe('CollectionProgressService.check', () => {
  it('opens the first cycle and ticks the item', async () => {
    const { service, tx, coupons, notifications, events } = setup();
    const res = await service.check('m1', 'c1', ['i1'], { teamMemberId: 'tm1', performedByName: 'Sara' }, 'key1');

    expect(tx.collectionProgress.create.mock.calls[0][0].data).toMatchObject({ collectionId: 'col1', clientId: 'c1', merchantId: 'm1', cycle: 1 });
    expect(tx.collectionCheck.createManyAndReturn.mock.calls[0][0].data).toEqual([
      { progressId: 'p-new', itemId: 'i1', teamMemberId: 'tm1', performedByName: 'Sara', requestKey: 'key1' },
    ]);
    expect(res).toMatchObject({ added: 1, gift: null, collection: { checked: 1, total: 3, completed: false } });
    expect(coupons.createCollectionGift).not.toHaveBeenCalled();
    expect(events.emitCollectionUpdated).toHaveBeenCalledWith('c1', { merchantId: 'm1', collectionId: 'col1', checked: 1, total: 3 });
    expect(notifications.sendToClient.mock.calls[0][4]).toMatchObject({ event: 'collection_progress' });
  });

  it('tells the client when one product is left', async () => {
    const { service, notifications } = setup({ progress: { id: 'p1', cycle: 1, completedAt: null, checks: [check('i1')] } });
    await service.check('m1', 'c1', ['i2'], {}, 'key1');
    expect(notifications.sendToClient.mock.calls[0][2]).toBe('Plus qu\'un produit chez Café Atlas');
  });

  it('creates the gift coupon when the last item is ticked', async () => {
    const { service, tx, coupons, notifications } = setup({
      progress: { id: 'p1', cycle: 1, completedAt: null, checks: [check('i1'), check('i2')] },
    });
    const res = await service.check('m1', 'c1', ['i3'], {}, 'key1');

    expect(coupons.createCollectionGift).toHaveBeenCalledTimes(1);
    expect(coupons.createCollectionGift.mock.calls[0][1]).toMatchObject({ clientId: 'c1', merchantId: 'm1', label: 'Un café glacé' });
    expect(tx.collectionProgress.update.mock.calls[0][0]).toMatchObject({ where: { id: 'p1' }, data: { couponId: 'coupon1' } });
    expect(res).toMatchObject({ added: 1, gift: { id: 'coupon1' }, collection: { completed: true, canCheck: false } });
    expect(notifications.sendToClient.mock.calls[0][4]).toMatchObject({ event: 'collection_completed', action: 'open_coupon', couponId: 'coupon1' });
  });

  it('does nothing on a retry (item already ticked): no row, no coupon, no push', async () => {
    const { service, tx, coupons, notifications, events } = setup({
      progress: { id: 'p1', cycle: 1, completedAt: null, checks: [check('i1')] },
    });
    const res = await service.check('m1', 'c1', ['i1'], {}, 'key1');
    expect(res).toMatchObject({ added: 0, gift: null, collection: { checked: 1 } });
    expect(tx.collectionCheck.createManyAndReturn).not.toHaveBeenCalled();
    expect(coupons.createCollectionGift).not.toHaveBeenCalled();
    expect(notifications.sendToClient).not.toHaveBeenCalled();
    expect(events.emitCollectionUpdated).not.toHaveBeenCalled();
  });

  it('replays a request already applied, even after it completed the cycle', async () => {
    const all = [check('i1'), check('i2'), check('i3')];
    const { service, tx, coupons, notifications } = setup({
      // The cycle this key completed; a repeatable collection would otherwise open cycle 2.
      replayed: { progress: { completedAt: OLD, checks: all, coupon: COUPON } },
      progress: { id: 'p1', cycle: 1, completedAt: OLD, checks: all },
    });
    const res = await service.check('m1', 'c1', ['i3'], {}, 'key1');

    expect(tx.collectionCheck.findFirst.mock.calls[0][0].where).toEqual({
      requestKey: 'key1',
      progress: { merchantId: 'm1', clientId: 'c1', collectionId: 'col1' },
    });
    expect(res).toMatchObject({ added: 0, gift: { id: 'coupon1' }, collection: { checked: 3, completed: true } });
    expect(tx.collectionProgress.create).not.toHaveBeenCalled();
    expect(tx.collectionCheck.createManyAndReturn).not.toHaveBeenCalled();
    expect(coupons.createCollectionGift).not.toHaveBeenCalled();
    expect(notifications.sendToClient).not.toHaveBeenCalled();
  });

  it('starts cycle 2 after a completed cycle of a repeatable collection', async () => {
    const { service, tx } = setup({
      progress: { id: 'p1', cycle: 1, completedAt: OLD, checks: [check('i1'), check('i2'), check('i3')] },
    });
    const res = await service.check('m1', 'c1', ['i2'], {}, 'key1');
    expect(tx.collectionProgress.create.mock.calls[0][0].data.cycle).toBe(2);
    expect(res.collection).toMatchObject({ checked: 1, completed: false });
  });

  it('refuses a second round when the collection is not repeatable', async () => {
    const { service } = setup({
      collection: { ...COLLECTION, repeatable: false },
      progress: { id: 'p1', cycle: 1, completedAt: OLD, checks: [check('i1'), check('i2'), check('i3')] },
    });
    await expect(service.check('m1', 'c1', ['i1'], {}, 'key1')).rejects.toThrow(ConflictException);
  });

  it('replays once when another till ticked the same item at the same time', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    const { service, tx } = setup({ createChecksError: p2002 });
    const res = await service.check('m1', 'c1', ['i1'], {}, 'key1');
    expect(tx.collectionCheck.createManyAndReturn).toHaveBeenCalledTimes(2);
    expect(res.added).toBe(1);
  });

  it('refuses when the plan is not Premium', async () => {
    const { service, tx } = setup({ premium: false });
    await expect(service.check('m1', 'c1', ['i1'], {}, 'key1')).rejects.toThrow(ForbiddenException);
    expect(tx.collection.findFirst).not.toHaveBeenCalled();
  });

  it('refuses without an open collection', async () => {
    const { service } = setup({ collection: null });
    await expect(service.check('m1', 'c1', ['i1'], {}, 'key1')).rejects.toThrow('error.collection.noneActive');
  });

  it('refuses a client of another merchant (no card) or who left the programme', async () => {
    await expect(setup({ card: null }).service.check('m1', 'c1', ['i1'], {}, 'key1')).rejects.toThrow(NotFoundException);
    const left = { deactivatedAt: new Date(), client: { deletedAt: null, language: 'fr' }, merchant: { nom: 'Café Atlas' } };
    await expect(setup({ card: left }).service.check('m1', 'c1', ['i1'], {}, 'key1')).rejects.toThrow('error.collection.clientNotFound');
  });

  it('scopes the collection and the card to the caller\'s merchant', async () => {
    const { service, tx } = setup();
    await service.check('m1', 'c1', ['i1'], {}, 'key1');
    expect(tx.collection.findFirst.mock.calls[0][0].where).toMatchObject({ merchantId: 'm1', status: 'ACTIVE' });
    expect(tx.loyaltyCard.findUnique.mock.calls[0][0].where).toEqual({ clientId_merchantId: { clientId: 'c1', merchantId: 'm1' } });
  });
});

describe('CollectionProgressService.forClientAtTill', () => {
  it('shows what is left to collect', async () => {
    const { service } = setup({ progress: { id: 'p1', cycle: 1, completedAt: null, checks: [check('i2')] } });
    const { collection } = await service.forClientAtTill('m1', 'c1');
    expect(collection!.items.map((i) => i.checked)).toEqual([false, true, false]);
    expect(collection).toMatchObject({ checked: 1, total: 3, canCheck: true });
  });

  it('shows nothing when the plan is not Premium or no collection is open', async () => {
    expect(await setup({ premium: false }).service.forClientAtTill('m1', 'c1')).toEqual({ collection: null });
    expect(await setup({ collection: null }).service.forClientAtTill('m1', 'c1')).toEqual({ collection: null });
  });

  it('blocks ticking for the day once an item was ticked (one per visit)', async () => {
    const { service } = setup({
      collection: { ...COLLECTION, onePerVisit: true },
      progress: { id: 'p1', cycle: 1, completedAt: null, checks: [{ itemId: 'i1', createdAt: new Date() }] },
    });
    expect((await service.forClientAtTill('m1', 'c1')).collection!.canCheck).toBe(false);
  });
});

describe('CollectionProgressService.listForClient', () => {
  const MERCHANT = { id: 'm1', nom: 'Café Atlas', logoUrl: null };
  const COMPLETED = new Date('2026-11-01T10:00:00Z');

  function list(opts: {
    open?: any[];
    won?: any[];
    cycles?: any[];
    gifts?: any[];
    premium?: (merchantId: string) => boolean;
  }) {
    const progressFindMany = jest.fn()
      .mockResolvedValueOnce(opts.won ?? [])
      .mockResolvedValueOnce(opts.cycles ?? []);
    const prisma = {
      collection: { findMany: jest.fn().mockResolvedValue(opts.open ?? []) },
      collectionProgress: { findMany: progressFindMany },
      coupon: { findMany: jest.fn().mockResolvedValue(opts.gifts ?? []) },
    };
    const isPremium = jest.fn((id: string) => Promise.resolve(opts.premium ? opts.premium(id) : true));
    const service = new CollectionProgressService(prisma as any, { isPremium } as any, {} as any, {} as any, {} as any);
    return { service, prisma };
  }

  it('lists the open collections of the client shops with their progress and unused gift', async () => {
    const { service, prisma } = list({
      open: [{ ...COLLECTION, endsAt: null, items: COLLECTION.items.map((i) => ({ ...i, imageUrl: null })), merchant: MERCHANT }],
      cycles: [{ collectionId: 'col1', completedAt: null, checks: [check('i1'), check('i3')] }],
      gifts: [
        { id: 'g-old', collectionProgress: { collectionId: 'col1' } },
        { id: 'g-new', collectionProgress: { collectionId: 'col1' } },
        { id: 'g-other', collectionProgress: { collectionId: 'col-ended' } },
      ],
    });
    const { collections, history } = await service.listForClient('c1');
    expect(collections).toHaveLength(1);
    expect(collections[0]).toMatchObject({
      id: 'col1', checked: 2, total: 3, completed: false, giftCouponId: 'g-old', merchant: MERCHANT,
    });
    expect(collections[0].items.map((i) => i.checked)).toEqual([true, false, true]);
    expect(history).toEqual([]);
    // Only shops where the client holds an active card.
    expect(prisma.collection.findMany.mock.calls[0][0].where.merchant.loyaltyCards).toEqual({
      some: { clientId: 'c1', deactivatedAt: null },
    });
  });

  it('starts over after a finished cycle of a repeatable collection', async () => {
    const { service } = list({
      open: [{ ...COLLECTION, endsAt: null, items: [], merchant: MERCHANT }],
      cycles: [{ collectionId: 'col1', completedAt: COMPLETED, checks: [check('i1')] }],
    });
    const [card] = (await service.listForClient('c1')).collections;
    expect(card).toMatchObject({ checked: 0, completed: false });
  });

  it('drops a finished one-shot collection (its gift is in the history)', async () => {
    const { service } = list({
      open: [{ ...COLLECTION, repeatable: false, endsAt: null, items: [], merchant: MERCHANT }],
      cycles: [{ collectionId: 'col1', completedAt: COMPLETED, checks: [check('i1')] }],
    });
    expect((await service.listForClient('c1')).collections).toEqual([]);
  });

  it('ignores a gift won with another collection of the same shop', async () => {
    const { service } = list({
      open: [{ ...COLLECTION, endsAt: null, items: [], merchant: MERCHANT }],
      gifts: [{ id: 'g-ended', collectionProgress: { collectionId: 'col-ended' } }],
    });
    expect((await service.listForClient('c1')).collections[0].giftCouponId).toBeNull();
  });

  it('hides collections of shops without Premium and skips the follow-up reads when none is left', async () => {
    const { service, prisma } = list({
      open: [{ ...COLLECTION, endsAt: null, items: [], merchant: MERCHANT }],
      premium: () => false,
    });
    expect((await service.listForClient('c1')).collections).toEqual([]);
    expect(prisma.coupon.findMany).not.toHaveBeenCalled();
    expect(prisma.collectionProgress.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns the gifts won, with their coupon state, as history', async () => {
    const { service } = list({
      won: [{
        id: 'p1',
        completedAt: COMPLETED,
        collection: { name: 'Été', giftLabel: 'Un café glacé', merchant: MERCHANT },
        coupon: { id: 'k1', status: 'REDEEMED', validFrom: COMPLETED, expiresAt: COMPLETED, redeemedAt: COMPLETED },
      }],
    });
    const { history } = await service.listForClient('c1');
    expect(history).toEqual([{
      id: 'p1',
      collectionName: 'Été',
      giftLabel: 'Un café glacé',
      completedAt: COMPLETED.toISOString(),
      merchant: MERCHANT,
      coupon: {
        id: 'k1', status: 'REDEEMED', validFrom: COMPLETED.toISOString(),
        expiresAt: COMPLETED.toISOString(), redeemedAt: COMPLETED.toISOString(),
      },
    }]);
  });
});
