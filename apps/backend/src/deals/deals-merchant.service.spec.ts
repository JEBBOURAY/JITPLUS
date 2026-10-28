import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DealsMerchantService } from './deals-merchant.service';
import type { CreateDealDto } from './dto';

const MERCHANT = 'merchant-1';
const STORE = { id: 'store-1', ville: 'Casablanca', latitude: 33.57, longitude: -7.59 };

function makePrisma() {
  const deal = {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const prisma: any = {
    deal,
    dealStore: { deleteMany: jest.fn(), createMany: jest.fn() },
    store: { findMany: jest.fn().mockResolvedValue([STORE]), count: jest.fn().mockResolvedValue(1) },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'deal-1',
    merchantId: MERCHANT,
    scope: 'LOCAL',
    type: 'PERCENT_OFF',
    title: 'Moins 30 sur tout',
    description: null,
    conditions: null,
    imageUrl: null,
    linkUrl: null,
    originalPrice: null,
    dealPrice: null,
    percentOff: 30,
    buyQty: null,
    freeQty: null,
    allStores: true,
    cityKeys: ['casablanca'],
    startsAt: new Date(Date.now() - 86_400_000),
    endsAt: new Date(Date.now() + 5 * 86_400_000),
    status: 'ACTIVE',
    endedReason: null,
    viewCount: 0,
    linkClickCount: 0,
    directionsCount: 0,
    shareCount: 0,
    createdAt: new Date(),
    stores: [],
    ...overrides,
  };
}

/** What Prisma would return for `data`: Decimal prices, store rows instead of the nested create. */
function asStored(data: any, id: string) {
  const decimal = (v: number | null | undefined) => (v == null ? null : new Prisma.Decimal(v));
  return row({
    ...data,
    id,
    originalPrice: decimal(data.originalPrice),
    dealPrice: decimal(data.dealPrice),
    stores: (data.stores?.create ?? []).map((s: { storeId: string }) => ({ storeId: s.storeId })),
  });
}

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function dto(overrides: Partial<CreateDealDto> = {}): CreateDealDto {
  return { scope: 'LOCAL', type: 'PERCENT_OFF', title: 'Moins 30 sur tout', percentOff: 30, endsOn: inDays(5), ...overrides };
}

describe('DealsMerchantService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let storage: { isOwnedBy: jest.Mock; deleteFile: jest.Mock };
  let audit: { log: jest.Mock };
  let service: DealsMerchantService;

  beforeEach(() => {
    prisma = makePrisma();
    storage = { isOwnedBy: jest.fn().mockReturnValue(true), deleteFile: jest.fn().mockResolvedValue(undefined) };
    audit = { log: jest.fn() };
    service = new DealsMerchantService(prisma, storage as any, audit as any);
    prisma.deal.create.mockImplementation(({ data }: any) => Promise.resolve(asStored(data, 'new-deal')));
  });

  describe('create', () => {
    it('publishes a LOCAL deal with the city of its stores, under a per-merchant lock', async () => {
      const result = await service.create(MERCHANT, dto());
      expect(prisma.$executeRaw).toHaveBeenCalled();
      const data = prisma.deal.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ merchantId: MERCHANT, scope: 'LOCAL', percentOff: 30, cityKeys: ['casablanca'], allStores: true });
      expect(result).toMatchObject({ id: 'new-deal', displayStatus: 'LIVE', endsOn: expect.any(String) });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE_DEAL' }));
    });

    it('refuses a LOCAL deal when no concerned store has a position', async () => {
      prisma.store.findMany.mockResolvedValue([{ ...STORE, latitude: null, longitude: null }]);
      await expect(service.create(MERCHANT, dto())).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'DEAL_NEEDS_LOCATION' }),
      });
      expect(prisma.deal.create).not.toHaveBeenCalled();
    });

    it('refuses a store of another merchant', async () => {
      await expect(service.create(MERCHANT, dto({ allStores: false, storeIds: ['other-store'] }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('requires an https link for ONLINE deals and skips the stores', async () => {
      await expect(service.create(MERCHANT, dto({ scope: 'ONLINE' }))).rejects.toThrow(BadRequestException);
      await service.create(MERCHANT, dto({ scope: 'ONLINE', linkUrl: 'https://shop.ma/promo' }));
      expect(prisma.store.findMany).not.toHaveBeenCalled();
      expect(prisma.deal.create.mock.calls[0][0].data).toMatchObject({ cityKeys: [], linkUrl: 'https://shop.ma/promo' });
    });

    it('enforces the active limit', async () => {
      prisma.deal.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
      await expect(service.create(MERCHANT, dto())).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'DEAL_LIMIT_ACTIVE' }),
      });
    });

    it('enforces the daily limit', async () => {
      prisma.deal.count.mockResolvedValueOnce(1).mockResolvedValueOnce(3);
      await expect(service.create(MERCHANT, dto())).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'DEAL_LIMIT_DAILY' }),
      });
    });

    it('refuses a duplicate of a running deal and points to it', async () => {
      prisma.deal.findMany.mockResolvedValue([{ id: 'running', title: 'MOINS 30 sur tout !' }]);
      const err = await service.create(MERCHANT, dto()).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: 'DEAL_DUPLICATE', meta: { dealId: 'running' } });
    });

    it('refuses an image the merchant did not upload', async () => {
      storage.isOwnedBy.mockReturnValue(false);
      await expect(service.create(MERCHANT, dto({ imageUrl: 'https://cdn/x.webp' }))).rejects.toThrow(BadRequestException);
    });

    it('moderates the texts', async () => {
      await expect(service.create(MERCHANT, dto({ description: 'vente cocaine pas chère' }))).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('refuses to edit an ended deal', async () => {
      prisma.deal.findFirst.mockResolvedValue(row({ status: 'ENDED' }));
      await expect(service.update(MERCHANT, 'deal-1', { title: 'Nouveau titre' })).rejects.toThrow(BadRequestException);
    });

    it('extends a live deal from today without touching its start', async () => {
      const existing = row();
      prisma.deal.findFirst.mockResolvedValue(existing);
      prisma.deal.update.mockImplementation(({ data }: any) => Promise.resolve(row({ ...data })));
      await service.update(MERCHANT, 'deal-1', { endsOn: inDays(20) });
      const data = prisma.deal.update.mock.calls[0][0].data;
      expect(data.startsAt).toBe(existing.startsAt);
      expect(data.endsAt.getTime()).toBeGreaterThan(existing.endsAt.getTime());
    });

    it('deletes a replaced deal image once unused, never other images', async () => {
      const url = `https://cdn/deals/${MERCHANT}/a.webp`;
      prisma.deal.findFirst.mockResolvedValue(row({ imageUrl: url }));
      prisma.deal.update.mockResolvedValue(row());
      prisma.deal.count.mockResolvedValue(0);
      await service.update(MERCHANT, 'deal-1', { imageUrl: null });
      expect(storage.deleteFile).toHaveBeenCalledWith(url);

      storage.deleteFile.mockClear();
      prisma.deal.findFirst.mockResolvedValue(row({ imageUrl: `https://cdn/covers/${MERCHANT}/c.webp` }));
      await service.update(MERCHANT, 'deal-1', { imageUrl: null });
      expect(storage.deleteFile).not.toHaveBeenCalled();
    });
  });

  it('stop ends the deal now', async () => {
    prisma.deal.findFirst.mockResolvedValue(row());
    prisma.deal.update.mockImplementation(({ data }: any) => Promise.resolve(row(data)));
    const result = await service.stop(MERCHANT, 'deal-1');
    expect(prisma.deal.update.mock.calls[0][0].data).toMatchObject({ status: 'ENDED', endedReason: 'STOPPED' });
    expect(result.displayStatus).toBe('ENDED');
  });

  it('duplicate relaunches from today with the same length', async () => {
    prisma.deal.findFirst.mockResolvedValue(
      row({
        status: 'ENDED',
        type: 'PRICE_DROP',
        originalPrice: new Prisma.Decimal(100),
        dealPrice: new Prisma.Decimal(80),
        percentOff: 20,
        startsAt: new Date('2026-01-01T12:00:00Z'),
        endsAt: new Date('2026-01-08T22:59:59Z'),
      }),
    );
    await service.duplicate(MERCHANT, 'deal-1', {});
    const data = prisma.deal.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ type: 'PRICE_DROP', originalPrice: 100, dealPrice: 80, percentOff: 20 });
    expect(data.endsAt.getTime() - Date.now()).toBeGreaterThan(6 * 86_400_000);
    expect(data.endsAt.getTime() - Date.now()).toBeLessThan(9 * 86_400_000);
  });

  it('get hides deleted or foreign deals', async () => {
    prisma.deal.findFirst.mockResolvedValue(null);
    await expect(service.get(MERCHANT, 'deal-x')).rejects.toThrow(NotFoundException);
    expect(prisma.deal.findFirst.mock.calls[0][0].where).toMatchObject({ merchantId: MERCHANT, status: { not: 'DELETED' } });
  });

  it('limits reports the counters and the located store', async () => {
    prisma.deal.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    expect(await service.limits(MERCHANT)).toEqual({
      activeCount: 2,
      maxActive: 5,
      createdToday: 1,
      maxPerDay: 3,
      hasLocatedStore: true,
    });
  });

  it('keeps today as default start', async () => {
    await service.create(MERCHANT, dto({ startsOn: today() }));
    expect(prisma.deal.create).toHaveBeenCalled();
  });
});
