import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DealsClientService, interleave, parseCursor } from './deals-client.service';

const CLIENT = 'client-1';

function dealRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    merchantId: 'm1',
    scope: 'LOCAL',
    type: 'PERCENT_OFF',
    title: `Deal ${id}`,
    imageUrl: null,
    linkUrl: null,
    originalPrice: null,
    dealPrice: null,
    percentOff: 20,
    buyQty: null,
    freeQty: null,
    allStores: true,
    startsAt: new Date(Date.now() - 3_600_000),
    endsAt: new Date(Date.now() + 86_400_000),
    isPopular: false,
    stores: [],
    description: null,
    conditions: null,
    status: 'ACTIVE',
    merchant: {
      id: 'm1',
      nom: 'Shop',
      logoUrl: null,
      coverUrl: null,
      categorie: 'CAFE',
      themeColor: null,
      phoneNumber: null,
      isActive: true,
      deletedAt: null,
      stores: [{ id: 's1', nom: 'A', ville: 'Rabat', quartier: null, adresse: null, latitude: 34.02, longitude: -6.84, telephone: null }],
    },
    ...overrides,
  };
}

function setup() {
  const prisma: any = {
    deal: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    dealReport: { create: jest.fn() },
    clientMerchantBlock: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
  return { prisma, cache, service: new DealsClientService(prisma, cache as any) };
}

describe('interleave / parseCursor', () => {
  it('puts one online item after every n local ones, leftovers at the end', () => {
    expect(interleave<number | string>([1, 2, 3, 4, 5], ['a', 'b', 'c'], 2)).toEqual([1, 2, 'a', 3, 4, 'b', 5, 'c']);
    expect(interleave([], ['a'], 8)).toEqual(['a']);
  });

  it('parses composite cursors', () => {
    expect(parseCursor(undefined)).toEqual([0, 0]);
    expect(parseCursor('18.2')).toEqual([18, 2]);
    expect(parseCursor('40')).toEqual([40, 0]);
  });
});

describe('DealsClientService.feed', () => {
  it('online tab: live ONLINE deals, hides blocked merchants and reported deals', async () => {
    const { prisma, service } = setup();
    prisma.clientMerchantBlock.findMany.mockResolvedValue([{ merchantId: 'blocked' }]);
    await service.feed(CLIENT, { tab: 'online' });
    const where = prisma.deal.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      status: 'ACTIVE',
      scope: 'ONLINE',
      merchantId: { notIn: ['blocked'] },
      reports: { none: { clientId: CLIENT } },
      merchant: { isActive: true, deletedAt: null },
    });
  });

  it('ending tab: city deals plus online ones ending within 48 h, soonest first', async () => {
    const { prisma, service } = setup();
    const res = await service.feed(CLIENT, { tab: 'ending', cityKey: 'rabat' });
    const args = prisma.deal.findMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([{ scope: 'ONLINE' }, { scope: 'LOCAL', cityKeys: { has: 'rabat' } }]);
    expect(args.orderBy[0]).toEqual({ endsAt: 'asc' });
    expect(res.cityKey).toBe('rabat');
  });

  it('ignores an unknown city or category', async () => {
    const { prisma, service } = setup();
    const res = await service.feed(CLIENT, { tab: 'new', cityKey: 'atlantis', category: 'NOPE' });
    expect(res.cityKey).toBeNull();
    expect(prisma.deal.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });

  it('nearby with a position: SQL distance order, hydrated in that order, with online deals interleaved', async () => {
    const { prisma, service } = setup();
    const ids = Array.from({ length: 19 }, (_, i) => `l${i}`);
    prisma.$queryRaw.mockResolvedValue(ids.map((id) => ({ id })));
    prisma.deal.findMany
      .mockResolvedValueOnce([...ids].reverse().map((id) => dealRow(id)))
      .mockResolvedValueOnce([dealRow('o1', { scope: 'ONLINE' }), dealRow('o2', { scope: 'ONLINE' })]);
    const res = await service.feed(CLIENT, { tab: 'nearby', lat: 34.02, lng: -6.84 });
    expect(res.items).toHaveLength(20);
    expect(res.items[0].id).toBe('l0');
    expect(res.items[8].id).toBe('o1');
    expect(res.items[17].id).toBe('o2');
    expect(res.items[0].distanceKm).toBe(0);
    expect(res.nextCursor).toBe('18.2');
    expect(res.cityKey).toBe('rabat');
  });

  it('nearby fills the page with online deals once local ones run out', async () => {
    const { prisma, service } = setup();
    prisma.deal.findMany
      .mockResolvedValueOnce([dealRow('l1')])
      .mockResolvedValueOnce(Array.from({ length: 20 }, (_, i) => dealRow(`o${i}`, { scope: 'ONLINE' })));
    const res = await service.feed(CLIENT, { tab: 'nearby', cityKey: 'rabat', cursor: '36.4' });
    expect(prisma.deal.findMany.mock.calls[1][0]).toMatchObject({ skip: 4, take: 20 });
    expect(res.items).toHaveLength(20);
    expect(res.nextCursor).toBe('37.23');
  });

  it('stops paginating past the maximum depth', async () => {
    const { prisma, service } = setup();
    const res = await service.feed(CLIENT, { tab: 'new', cursor: '9999' });
    expect(res).toEqual({ items: [], nextCursor: null, cityKey: null });
    expect(prisma.deal.findMany).not.toHaveBeenCalled();
  });
});

describe('DealsClientService.detail', () => {
  it('counts one view per client and hides the link of an ended deal', async () => {
    const { prisma, service } = setup();
    prisma.deal.findUnique.mockResolvedValue(dealRow('d1', { linkUrl: 'https://x.ma' }));
    await service.detail(CLIENT, 'd1', {});
    await service.detail(CLIENT, 'd1', {});
    expect(prisma.deal.updateMany).toHaveBeenCalledTimes(1);

    prisma.deal.findUnique.mockResolvedValue(dealRow('d2', { status: 'ENDED', linkUrl: 'https://x.ma' }));
    const ended = await service.detail(CLIENT, 'd2', {});
    expect(ended).toMatchObject({ isOver: true, linkUrl: null });
  });

  it.each([
    [{ status: 'REMOVED' }],
    [{ status: 'DELETED' }],
    [{ startsAt: new Date(Date.now() + 3_600_000) }],
  ])('404 for %o', async (overrides) => {
    const { prisma, service } = setup();
    prisma.deal.findUnique.mockResolvedValue(dealRow('d1', overrides));
    await expect(service.detail(CLIENT, 'd1', {})).rejects.toThrow(NotFoundException);
  });

  it('404 when the merchant is blocked', async () => {
    const { prisma, service } = setup();
    prisma.deal.findUnique.mockResolvedValue(dealRow('d1'));
    prisma.clientMerchantBlock.findUnique.mockResolvedValue({ id: 'b' });
    await expect(service.detail(CLIENT, 'd1', {})).rejects.toThrow(NotFoundException);
  });
});

describe('DealsClientService.report', () => {
  it('hides the deal after enough distinct reports', async () => {
    const { prisma, service } = setup();
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1' });
    prisma.deal.update.mockResolvedValue({ reportCount: 5 });
    await service.report(CLIENT, 'd1', { reason: 'MISLEADING' });
    expect(prisma.deal.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', status: 'ACTIVE' },
      data: { status: 'REMOVED', endedReason: 'AUTO_REPORTS' },
    });
  });

  it('is idempotent per client', async () => {
    const { prisma, service } = setup();
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1' });
    prisma.dealReport.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    expect(await service.report(CLIENT, 'd1', { reason: 'OTHER' })).toEqual({ success: true, alreadyReported: true });
    expect(prisma.deal.update).not.toHaveBeenCalled();
  });
});

describe('DealsClientService shared counters', () => {
  it('records each event type once per window', async () => {
    const { prisma, service } = setup();
    await service.recordEvent(CLIENT, 'd1', 'LINK_CLICK');
    await service.recordEvent(CLIENT, 'd1', 'LINK_CLICK');
    await service.recordEvent(CLIENT, 'd1', 'SHARE');
    expect(prisma.deal.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.deal.updateMany.mock.calls[1][0].data).toEqual({ shareCount: { increment: 1 } });
  });

  it('teaser returns counters and pictures only, cached per city', async () => {
    const { prisma, cache, service } = setup();
    prisma.deal.count.mockResolvedValue(12);
    prisma.deal.findMany.mockResolvedValue([
      { imageUrl: 'a', merchant: { coverUrl: 'c' } },
      { imageUrl: null, merchant: { coverUrl: 'c' } },
      { imageUrl: 'a', merchant: { coverUrl: null } },
      { imageUrl: 'b', merchant: { coverUrl: null } },
    ]);
    const res = await service.teaser({ lat: 33.57, lng: -7.59 });
    expect(res).toEqual({ count: 12, cityKey: 'casablanca', thumbs: ['a', 'c', 'b'] });
    expect(cache.set).toHaveBeenCalledWith('deals:teaser:casablanca', res, expect.any(Number));
  });

  it('merchant badges map one SQL row per merchant (top deal + live count) and are cached', async () => {
    const { prisma, cache, service } = setup();
    const row = { title: 'A', type: 'PERCENT_OFF', percent_off: 20, buy_qty: null, free_qty: null };
    prisma.$queryRaw.mockResolvedValue([
      { ...row, merchant_id: 'm1', id: 'd1', deal_count: 2 },
      { ...row, merchant_id: 'm2', id: 'd3', deal_count: 1 },
    ]);
    const badges = await service.merchantBadges();
    expect(badges.m1).toEqual({
      activeDealCount: 2,
      topDeal: { id: 'd1', title: 'A', type: 'PERCENT_OFF', percentOff: 20, buyQty: null, freeQty: null },
    });
    expect(badges.m2.activeDealCount).toBe(1);
    expect(cache.set).toHaveBeenCalledWith('deals:merchant-badges', badges, expect.any(Number));
  });
});
