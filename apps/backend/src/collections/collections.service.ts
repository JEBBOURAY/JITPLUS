import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertClean } from '../common/utils/content-moderation';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { IStorageProvider, STORAGE_PROVIDER } from '../common/interfaces';
import { assertImageAssignable, deleteOwnedFiles } from '../storage/image-ownership';
import { COLLECTION_LIMITS, isCollectionImage, isCollectionOpen, normalizeItemLabels, resolveEndsAt } from './collection-rules';
import { CollectionMaintenanceService } from './collection-maintenance.service';
import type { CreateCollectionDto } from './dto';

const COLLECTION_SELECT = {
  id: true,
  name: true,
  giftLabel: true,
  giftImageUrl: true,
  status: true,
  onePerVisit: true,
  repeatable: true,
  couponValidityDays: true,
  giftDelayHours: true,
  endsAt: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  items: { select: { id: true, label: true, imageUrl: true, position: true }, orderBy: { position: 'asc' } },
} satisfies Prisma.CollectionSelect;

type CollectionRow = Prisma.CollectionGetPayload<{ select: typeof COLLECTION_SELECT }>;

/** Collections of a merchant: creation, edition, life cycle and stats. */
@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    private readonly maintenance: CollectionMaintenanceService,
  ) {}

  /** The public merchant page says whether the merchant runs a collection. */
  private invalidateMerchantPage(merchantId: string): Promise<unknown> {
    return this.cache.del(`merchant:detail:${merchantId}`);
  }

  /** An ACTIVE collection past its end date reads as ENDED before the row is updated. */
  private toDto(c: CollectionRow, now: Date = new Date()) {
    return {
      id: c.id,
      name: c.name,
      giftLabel: c.giftLabel,
      giftImageUrl: c.giftImageUrl,
      status: c.status === 'ACTIVE' && !isCollectionOpen(c, now) ? ('ENDED' as const) : c.status,
      onePerVisit: c.onePerVisit,
      repeatable: c.repeatable,
      couponValidityDays: c.couponValidityDays,
      giftDelayHours: c.giftDelayHours,
      endsAt: c.endsAt?.toISOString() ?? null,
      startedAt: c.startedAt?.toISOString() ?? null,
      endedAt: c.endedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      items: c.items.map((i) => ({ id: i.id, label: i.label, imageUrl: i.imageUrl })),
    };
  }

  /**
   * `currentImages`: photos the collection already uses (a collection being edited).
   * A photo must come from the merchant's own collection uploads: it is
   * deleted with the collection, so it can never be a logo or a reward image.
   */
  private validated(merchantId: string, dto: CreateCollectionDto, now: Date, currentImages: string[] = []) {
    const name = dto.name.trim();
    const giftLabel = dto.giftLabel.trim();
    if (!name || !giftLabel) throw new BadRequestException('error.collection.nameAndGiftRequired');
    const labels = normalizeItemLabels(dto.items.map((i) => i.label));
    assertClean({ nom: name, cadeau: giftLabel, ...Object.fromEntries(labels.map((l, i) => [`produit ${i + 1}`, l])) });
    const checkImage = (url: string | null) => {
      if (url && !isCollectionImage(url, merchantId)) throw new BadRequestException('error.collection.invalidImage');
      assertImageAssignable(this.storage, merchantId, url, currentImages);
      return url;
    };
    const items = labels.map((label, position) => ({
      id: dto.items[position].id,
      label,
      imageUrl: checkImage(dto.items[position].imageUrl || null),
      position,
    }));
    return {
      items,
      data: {
        name,
        giftLabel,
        giftImageUrl: checkImage(dto.giftImageUrl || null),
        onePerVisit: dto.onePerVisit ?? false,
        repeatable: dto.repeatable ?? true,
        couponValidityDays: dto.couponValidityDays ?? COLLECTION_LIMITS.DEFAULT_COUPON_DAYS,
        giftDelayHours: dto.giftDelayHours ?? 0,
        endsAt: resolveEndsAt(dto.endsOn, now),
      },
    };
  }

  // ── Reads ───────────────────────────────────────────────────

  async list(merchantId: string) {
    const now = new Date();
    const rows = await this.prisma.collection.findMany({
      where: { merchantId },
      select: COLLECTION_SELECT,
      orderBy: { createdAt: 'desc' },
      take: COLLECTION_LIMITS.MAX_PER_MERCHANT,
    });
    const stats = await this.statsByCollection(merchantId, rows.map((r) => r.id));
    return rows.map((r) => ({ ...this.toDto(r, now), ...(stats.get(r.id) ?? { participants: 0, completed: 0 }) }));
  }

  async get(merchantId: string, id: string) {
    const row = await this.prisma.collection.findFirst({ where: { id, merchantId }, select: COLLECTION_SELECT });
    if (!row) throw new NotFoundException('error.collection.notFound');

    const [stats, perItem, giftsUsed] = await Promise.all([
      this.statsByCollection(merchantId, [id]),
      this.prisma.collectionCheck.groupBy({
        by: ['itemId'],
        where: { itemId: { in: row.items.map((i) => i.id) } },
        _count: { _all: true },
      }),
      this.prisma.coupon.count({
        where: { merchantId, source: 'COLLECTION', status: 'REDEEMED', collectionProgress: { collectionId: id } },
      }),
    ]);
    const counts = new Map(perItem.map((p) => [p.itemId, p._count._all]));
    const dto = this.toDto(row);
    return {
      ...dto,
      // How many times each product was collected: what clients try.
      items: dto.items.map((i) => ({ ...i, checks: counts.get(i.id) ?? 0 })),
      ...(stats.get(id) ?? { participants: 0, completed: 0 }),
      giftsUsed,
    };
  }

  /** Clients who started (first cycle) and gifts won, per collection. */
  private async statsByCollection(merchantId: string, ids: string[]) {
    const out = new Map<string, { participants: number; completed: number }>();
    if (ids.length === 0) return out;
    const [started, completed] = await Promise.all([
      this.prisma.collectionProgress.groupBy({
        by: ['collectionId'],
        where: { merchantId, collectionId: { in: ids }, cycle: 1 },
        _count: { _all: true },
      }),
      this.prisma.collectionProgress.groupBy({
        by: ['collectionId'],
        where: { merchantId, collectionId: { in: ids }, completedAt: { not: null } },
        _count: { _all: true },
      }),
    ]);
    for (const id of ids) out.set(id, { participants: 0, completed: 0 });
    for (const s of started) out.get(s.collectionId)!.participants = s._count._all;
    for (const c of completed) out.get(c.collectionId)!.completed = c._count._all;
    return out;
  }

  // ── Draft ───────────────────────────────────────────────────

  async create(merchantId: string, dto: CreateCollectionDto) {
    const { items, data } = this.validated(merchantId, dto, new Date());
    const count = await this.prisma.collection.count({ where: { merchantId } });
    if (count >= COLLECTION_LIMITS.MAX_PER_MERCHANT) throw new ConflictException('error.collection.tooMany');

    const row = await this.prisma.collection.create({
      data: {
        ...data,
        merchantId,
        items: { create: items.map(({ id: _id, ...item }) => item) },
      },
      select: COLLECTION_SELECT,
    });
    return this.toDto(row);
  }

  /**
   * Edit of a draft or of a running collection. Products are matched by `id` so
   * what clients already collected stays ticked. A running collection can be
   * renamed, get new photos, a new gift or more products, but no product can be
   * removed from it: clients who bought it would lose that progress.
   */
  async update(merchantId: string, id: string, dto: CreateCollectionDto) {
    const now = new Date();
    const current = await this.prisma.collection.findFirst({
      where: { id, merchantId },
      select: { status: true, endsAt: true, items: { select: { id: true } } },
    });
    if (!current) throw new NotFoundException('error.collection.notFound');
    const running = current.status === 'ACTIVE' && isCollectionOpen(current, now);
    if (current.status !== 'DRAFT' && !running) throw new ConflictException('error.collection.notEditable');

    const before = await this.imagesOf(merchantId, id);
    const { items, data } = this.validated(merchantId, dto, now, before);
    const known = new Set(current.items.map((i) => i.id));
    const keptIds = new Set(items.flatMap((i) => (i.id && known.has(i.id) ? [i.id] : [])));
    const removed = [...known].filter((itemId) => !keptIds.has(itemId));
    if (running && removed.length > 0) throw new ConflictException('error.collection.itemsLocked');

    const row = await this.prisma.$transaction(async (tx) => {
      // Same status as read above: a collection launched or ended meanwhile is refused.
      const claimed = await tx.collection.updateMany({ where: { id, merchantId, status: current.status }, data });
      if (claimed.count !== 1) await this.refuse(tx, merchantId, id, 'error.collection.notEditable');
      if (removed.length > 0) await tx.collectionItem.deleteMany({ where: { collectionId: id, id: { in: removed } } });
      for (const { id: itemId, ...item } of items) {
        if (itemId && known.has(itemId)) await tx.collectionItem.update({ where: { id: itemId }, data: item });
        else await tx.collectionItem.create({ data: { ...item, collectionId: id } });
      }
      return tx.collection.findUniqueOrThrow({ where: { id }, select: COLLECTION_SELECT });
    });
    // Photos the collection no longer uses.
    const kept = new Set([...items.map((i) => i.imageUrl), data.giftImageUrl]);
    deleteOwnedFiles(this.storage, merchantId, before.filter((url) => !kept.has(url)));
    if (running) await this.invalidateMerchantPage(merchantId);
    return this.toDto(row);
  }

  async remove(merchantId: string, id: string) {
    const photos = await this.imagesOf(merchantId, id);
    const deleted = await this.prisma.collection.deleteMany({ where: { id, merchantId, status: 'DRAFT' } });
    if (deleted.count !== 1) await this.refuse(this.prisma, merchantId, id, 'error.collection.notDraft');
    deleteOwnedFiles(this.storage, merchantId, photos);
    return { success: true };
  }

  /** Photos of a collection of this merchant, gift included (empty for an unknown collection). */
  private async imagesOf(merchantId: string, id: string): Promise<string[]> {
    const row = await this.prisma.collection.findFirst({
      where: { id, merchantId },
      select: { giftImageUrl: true, items: { where: { imageUrl: { not: null } }, select: { imageUrl: true } } },
    });
    if (!row) return [];
    return [...row.items.map((i) => i.imageUrl!), ...(row.giftImageUrl ? [row.giftImageUrl] : [])];
  }

  /** A conditional write matched no row: unknown collection (404) or wrong status (409 `reason`). */
  private async refuse(db: Prisma.TransactionClient, merchantId: string, id: string, reason: string): Promise<never> {
    const exists = await db.collection.findFirst({ where: { id, merchantId }, select: { id: true } });
    if (!exists) throw new NotFoundException('error.collection.notFound');
    throw new ConflictException(reason);
  }

  // ── Life cycle ──────────────────────────────────────────────

  /** DRAFT → ACTIVE. One ACTIVE collection per merchant (partial unique index). */
  async activate(merchantId: string, id: string) {
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        // A collection past its end date still holds the ACTIVE slot: free it first.
        await tx.collection.updateMany({
          where: { merchantId, status: 'ACTIVE', endsAt: { lte: now } },
          data: { status: 'ENDED', endedAt: now },
        });
        // The end date was valid when the draft was saved; it may have passed since.
        const claimed = await tx.collection.updateMany({
          where: { id, merchantId, status: 'DRAFT', OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          data: { status: 'ACTIVE', startedAt: now },
        });
        if (claimed.count !== 1) {
          const draft = await tx.collection.findFirst({ where: { id, merchantId, status: 'DRAFT' }, select: { id: true } });
          if (draft) throw new BadRequestException('error.collection.endDatePast');
          await this.refuse(tx, merchantId, id, 'error.collection.notDraft');
        }
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('error.collection.alreadyActive');
      throw err;
    }
    // An expired collection was ended above to free the slot: its photos go with it.
    await Promise.all([this.invalidateMerchantPage(merchantId), this.maintenance.purgePhotos(merchantId)]);
    return this.get(merchantId, id);
  }

  /** ACTIVE → ENDED. Progress stops, the product photos are deleted; gift coupons already won stay valid. */
  async end(merchantId: string, id: string) {
    const ended = await this.prisma.collection.updateMany({
      where: { id, merchantId, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    if (ended.count !== 1) await this.refuse(this.prisma, merchantId, id, 'error.collection.notActive');
    await Promise.all([this.invalidateMerchantPage(merchantId), this.maintenance.purgePhotos(merchantId)]);
    return this.get(merchantId, id);
  }
}
