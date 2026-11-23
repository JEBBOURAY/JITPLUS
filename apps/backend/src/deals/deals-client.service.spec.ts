import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    priceFrom: false,
    priceUnit: null,
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
    dealReport: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    dealSave: { findUnique: jest.fn().mockResolvedValue(null), createMany: jest.fn(), deleteMany: jest.fn() },
    dealClaim: { findUnique: jest.fn().mockResolvedValue(null), findUniqueOrThrow: jest.fn() },
    loyaltyCard: { findFirst: jest.fn().mockResolvedValue(null) },
    clientMerchantBlock: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
  const inbox = { record: jest.fn().mockResolvedValue('inbox-1') };
  const mail = { sendContentReport: jest.fn().mockResolvedValue(undefined) };
  return { prisma, cache, inbox, mail, service: new DealsClientService(prisma, cache as any, inbox as any, mail as any) };
}

/** Bound values of the n-th counter statement (the SQL fragments of its columns left out). */
const countedWith = (prisma: any, call = 0): unknown[] => prisma.$executeRaw.mock.calls[call].slice(1);

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

  it('a search or the discount sort reads the city list instead of the distance order', async () => {
    const { prisma, service } = setup();
    await service.feed(CLIENT, { tab: 'nearby', lat: 34.02, lng: -6.84, q: 'pizza', sort: 'discount' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    const { where, orderBy } = prisma.deal.findMany.mock.calls[0][0];
    expect(where.OR).toEqual([{ scope: 'ONLINE' }, { scope: 'LOCAL', cityKeys: { has: 'rabat' } }]);
    const contains = { contains: 'pizza', mode: 'insensitive' };
    expect(where.AND).toEqual([{ OR: [{ title: contains }, { merchant: { nom: contains } }] }]);
    expect(orderBy[0]).toEqual({ percentOff: { sort: 'desc', nulls: 'last' } });
  });

  it('saved tab: the live deals the client bookmarked, wherever they are; nothing for a guest', async () => {
    const { prisma, service } = setup();
    await service.feed(CLIENT, { tab: 'saved', cityKey: 'rabat' });
    const { where, orderBy } = prisma.deal.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ status: 'ACTIVE', saves: { some: { clientId: CLIENT } } });
    expect(where.OR).toBeUndefined();
    expect(orderBy[0]).toEqual({ endsAt: 'asc' });

    prisma.deal.findMany.mockClear();
    expect((await service.feed(null, { tab: 'saved' })).items).toEqual([]);
    expect(prisma.deal.findMany).not.toHaveBeenCalled();
    await expect(service.categoryCounts(CLIENT, { tab: 'saved' })).resolves.toEqual({ counts: {} });
  });

  it('nearby with nothing around suggests the closest city that has deals', async () => {
    const { prisma, service } = setup();
    // 1st raw query: no local deal around; 2nd: deals per city.
    prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { key: 'casablanca', count: 9 },
      { key: 'rabat', count: 4 },
    ]);
    const res = await service.feed(CLIENT, { tab: 'nearby', lat: 34.26, lng: -6.58 });
    expect(res).toMatchObject({ suggestedCity: { key: 'rabat', dealCount: 4 } });
  });

  it('stops paginating past the maximum depth', async () => {
    const { prisma, service } = setup();
    const res = await service.feed(CLIENT, { tab: 'new', cursor: '9999' });
    expect(res).toEqual({ items: [], nextCursor: null, cityKey: null });
    expect(prisma.deal.findMany).not.toHaveBeenCalled();
  });
});

describe('DealsClientService.categoryCounts', () => {
  const sqlOf = (prisma: any) => {
    const [strings, ...values] = prisma.$queryRaw.mock.calls[0];
    return { sql: (strings as string[]).join('?'), values: JSON.stringify(values) };
  };

  it('maps the SQL rows to known categories only', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([
      { category: 'CAFE', count: 3 },
      { category: 'RESTAURANT', count: 1 },
      { category: 'NOT_A_CATEGORY', count: 9 },
    ]);
    expect(await service.categoryCounts(CLIENT, { tab: 'new' })).toEqual({ counts: { CAFE: 3, RESTAURANT: 1 } });
  });

  it('online tab counts ONLINE deals only, without blocked merchants', async () => {
    const { prisma, service } = setup();
    prisma.clientMerchantBlock.findMany.mockResolvedValue([{ merchantId: 'blocked' }]);
    await service.categoryCounts(CLIENT, { tab: 'online', cityKey: 'rabat' });
    const { values } = sqlOf(prisma);
    expect(values).toContain("d.scope = 'ONLINE'");
    expect(values).toContain('blocked');
    expect(values).not.toContain('rabat');
  });

  it('nearby with a position looks at the stores around it', async () => {
    const { prisma, service } = setup();
    await service.categoryCounts(CLIENT, { tab: 'nearby', lat: 34.02, lng: -6.84 });
    expect(sqlOf(prisma).values).toContain('FROM stores s');
  });

  it('ending tab keeps the city and adds the ending window', async () => {
    const { prisma, service } = setup();
    await service.categoryCounts(CLIENT, { tab: 'ending', cityKey: 'rabat' });
    const { values } = sqlOf(prisma);
    expect(values).toContain('rabat');
    expect(values).toContain('d.ends_at <=');
  });
});

describe('DealsClientService.detail', () => {
  it('marks the view of a live deal for the database to de-duplicate, and hides the link of an ended deal', async () => {
    const { prisma, service } = setup();
    prisma.deal.findUnique.mockResolvedValue(dealRow('d1', { linkUrl: 'https://x.ma' }));
    await service.detail(CLIENT, 'd1', {});
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(countedWith(prisma)).toEqual(expect.arrayContaining([CLIENT, 'VIEW', 'd1']));

    prisma.deal.findUnique.mockResolvedValue(dealRow('d2', { status: 'ENDED', linkUrl: 'https://x.ma' }));
    const ended = await service.detail(CLIENT, 'd2', {});
    expect(ended).toMatchObject({ isOver: true, linkUrl: null });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('tells what the client did with the deal: saved, pass taken, card held', async () => {
    const { prisma, service } = setup();
    prisma.deal.findUnique.mockResolvedValue(dealRow('d1'));
    expect(await service.detail(CLIENT, 'd1', {})).toMatchObject({ saved: false, claimedAt: null, hasCard: false });

    const claimedAt = new Date('2026-11-20T10:00:00Z');
    prisma.dealSave.findUnique.mockResolvedValue({ dealId: 'd1' });
    prisma.dealClaim.findUnique.mockResolvedValue({ createdAt: claimedAt });
    prisma.loyaltyCard.findFirst.mockResolvedValue({ id: 'card' });
    expect(await service.detail(CLIENT, 'd1', {})).toMatchObject({ saved: true, claimedAt: claimedAt.toISOString(), hasCard: true });
    expect(prisma.loyaltyCard.findFirst.mock.calls[0][0].where).toEqual({ clientId: CLIENT, merchantId: 'm1', deactivatedAt: null });
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

describe('DealsClientService guests (no account)', () => {
  it('feed: no blocked-merchant lookup and no report filter', async () => {
    const { prisma, service } = setup();
    await service.feed(null, { tab: 'online' });
    expect(prisma.clientMerchantBlock.findMany).not.toHaveBeenCalled();
    const where = prisma.deal.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: 'ACTIVE', scope: 'ONLINE' });
    expect(where.reports).toBeUndefined();
    expect(where.merchantId).toBeUndefined();
  });

  it('nearby feed and category counts run their SQL without a client id', async () => {
    const { prisma, service } = setup();
    await service.feed(null, { tab: 'nearby', lat: 34.02, lng: -6.84 });
    await service.categoryCounts(null, { tab: 'new' });
    // Nearby ids, the deals per city (nothing around: a city is suggested), the category counts.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
    for (const [strings, ...values] of prisma.$queryRaw.mock.calls) {
      expect((strings as string[]).join('?') + JSON.stringify(values)).not.toContain('deal_reports');
    }
    expect(prisma.clientMerchantBlock.findMany).not.toHaveBeenCalled();
  });

  it('detail: no personal lookup, the view is marked under the guest key', async () => {
    const { prisma, service } = setup();
    prisma.deal.findUnique.mockResolvedValue(dealRow('d1'));
    const deal = await service.detail(null, 'd1', {}, 'g:abc');
    expect(deal).toMatchObject({ saved: false, claimedAt: null, hasCard: false });
    expect(prisma.clientMerchantBlock.findUnique).not.toHaveBeenCalled();
    expect(prisma.dealSave.findUnique).not.toHaveBeenCalled();
    expect(countedWith(prisma)).toEqual(expect.arrayContaining(['g:abc', 'VIEW']));
  });
});

const REPORTED = { id: 'd1', title: 'Moins 30', merchantId: 'm1', merchant: { nom: 'Shop', language: 'fr' } };

describe('DealsClientService.report', () => {
  it('hides the deal after enough distinct reports from established accounts, and says so once', async () => {
    const { prisma, inbox, mail, service } = setup();
    prisma.deal.findFirst.mockResolvedValue(REPORTED);
    prisma.deal.update.mockResolvedValue({ reportCount: 5 });
    prisma.dealReport.count.mockResolvedValue(5);
    await service.report(CLIENT, 'd1', { reason: 'MISLEADING' });
    const where = prisma.dealReport.count.mock.calls[0][0].where;
    expect(where.dealId).toBe('d1');
    expect(where.client).toMatchObject({
      deletedAt: null,
      createdAt: { lte: expect.any(Date) },
      OR: [{ emailVerified: true }, { telephoneVerified: true }],
    });
    expect(prisma.deal.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', status: 'ACTIVE' },
      data: { status: 'REMOVED', endedReason: 'AUTO_REPORTS' },
    });
    expect(inbox.record).toHaveBeenCalledWith('m1', expect.objectContaining({ action: 'open_deals', body: expect.stringContaining('Moins 30') }));
    expect(mail.sendContentReport).toHaveBeenCalledWith(expect.objectContaining({ merchantId: 'm1', details: expect.stringContaining('d1') }));

    // A later report finds the deal already hidden: nobody is told twice.
    prisma.deal.updateMany.mockResolvedValue({ count: 0 });
    await service.report('client-2', 'd1', { reason: 'MISLEADING' });
    expect(inbox.record).toHaveBeenCalledTimes(1);
    expect(mail.sendContentReport).toHaveBeenCalledTimes(1);
  });

  // Security audit 2026-11-05: throwaway accounts cannot take a deal down.
  it('keeps the deal up when the reports come from fresh / unverified accounts', async () => {
    const { prisma, inbox, service } = setup();
    prisma.deal.findFirst.mockResolvedValue(REPORTED);
    prisma.deal.update.mockResolvedValue({ reportCount: 12 });
    prisma.dealReport.count.mockResolvedValue(2);
    await service.report(CLIENT, 'd1', { reason: 'MISLEADING' });
    expect(prisma.deal.updateMany).not.toHaveBeenCalled();
    expect(inbox.record).not.toHaveBeenCalled();
  });

  it('is idempotent per client', async () => {
    const { prisma, service } = setup();
    prisma.deal.findFirst.mockResolvedValue(REPORTED);
    prisma.dealReport.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    expect(await service.report(CLIENT, 'd1', { reason: 'OTHER' })).toEqual({ success: true, alreadyReported: true });
    expect(prisma.deal.update).not.toHaveBeenCalled();
  });
});

describe('DealsClientService shared counters', () => {
  it('marks each event with its kind; a failing counter never fails the request', async () => {
    const { prisma, service } = setup();
    await service.recordEvent(CLIENT, 'd1', 'CALL');
    expect(countedWith(prisma)).toEqual(expect.arrayContaining([CLIENT, 'CALL', 'd1']));

    prisma.$executeRaw.mockRejectedValue(new Error('db down'));
    await expect(service.recordEvent(CLIENT, 'd1', 'SHARE')).resolves.toEqual({ success: true });
  });

  it('share preview: title and https picture of a live deal, cached; misses are not cached', async () => {
    const { prisma, cache, service } = setup();
    prisma.deal.findFirst.mockResolvedValue({ title: 'Moins 30', imageUrl: null, merchant: { nom: 'Shop', coverUrl: 'https://cdn/c.webp' } });
    const preview = { title: 'Moins 30', merchant: 'Shop', imageUrl: 'https://cdn/c.webp' };
    expect(await service.sharePreview('d1')).toEqual(preview);
    expect(prisma.deal.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'd1', status: 'ACTIVE' });
    expect(cache.set).toHaveBeenCalledWith('deals:share:d1', { preview }, expect.any(Number));

    prisma.deal.findFirst.mockResolvedValue(null);
    cache.set.mockClear();
    expect(await service.sharePreview('gone')).toBeNull();
    expect(cache.set).not.toHaveBeenCalled();

    cache.get.mockResolvedValue({ preview });
    prisma.deal.findFirst.mockClear();
    expect(await service.sharePreview('d1')).toEqual(preview);
    expect(prisma.deal.findFirst).not.toHaveBeenCalled();
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

describe('DealsClientService "J\'en profite" and saved deals', () => {
  const LIVE = { id: 'd1', scope: 'LOCAL', merchantId: 'm1' };

  it('claim is idempotent: one statement counts it, the stored date comes back', async () => {
    const { prisma, service } = setup();
    const createdAt = new Date('2026-11-20T10:00:00Z');
    prisma.deal.findFirst.mockResolvedValue(LIVE);
    prisma.dealClaim.findUniqueOrThrow.mockResolvedValue({ createdAt });
    expect(await service.claim(CLIENT, 'd1')).toEqual({ claimedAt: createdAt.toISOString() });
    expect(await service.claim(CLIENT, 'd1')).toEqual({ claimedAt: createdAt.toISOString() });
    expect(prisma.deal.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'd1', status: 'ACTIVE' });
    const sql = (prisma.$executeRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(prisma.$executeRaw.mock.calls[0].slice(1)).toEqual(expect.arrayContaining(['d1', CLIENT]));
  });

  it('claim refuses an online deal, an ended deal and a blocked merchant', async () => {
    const { prisma, service } = setup();
    prisma.deal.findFirst.mockResolvedValue({ ...LIVE, scope: 'ONLINE' });
    await expect(service.claim(CLIENT, 'd1')).rejects.toThrow(BadRequestException);

    prisma.deal.findFirst.mockResolvedValue(null);
    await expect(service.claim(CLIENT, 'd1')).rejects.toThrow(NotFoundException);

    prisma.deal.findFirst.mockResolvedValue(LIVE);
    prisma.clientMerchantBlock.findUnique.mockResolvedValue({ id: 'b' });
    await expect(service.claim(CLIENT, 'd1')).rejects.toThrow(NotFoundException);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('saves a live deal once and removes only the caller\'s bookmark', async () => {
    const { prisma, service } = setup();
    prisma.deal.findFirst.mockResolvedValue(LIVE);
    expect(await service.setSaved(CLIENT, 'd1', true)).toEqual({ saved: true });
    expect(prisma.dealSave.createMany).toHaveBeenCalledWith({ data: [{ clientId: CLIENT, dealId: 'd1' }], skipDuplicates: true });

    expect(await service.setSaved(CLIENT, 'd1', false)).toEqual({ saved: false });
    expect(prisma.dealSave.deleteMany).toHaveBeenCalledWith({ where: { clientId: CLIENT, dealId: 'd1' } });

    prisma.deal.findFirst.mockResolvedValue(null);
    await expect(service.setSaved(CLIENT, 'gone', true)).rejects.toThrow(NotFoundException);
  });
});
