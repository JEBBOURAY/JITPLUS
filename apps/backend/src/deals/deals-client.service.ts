import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { MerchantCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { errMsg } from '../common/utils';
import type { DealCategoryCountsQueryDto, DealEventType, DealFeedQueryDto, DealPositionQueryDto, ReportDealDto } from './dto';
import {
  DEAL_AUTO_HIDE_REPORTS,
  DEAL_BADGES_CACHE_TTL,
  DEAL_CITIES_CACHE_TTL,
  DEAL_ENDING_SOON_HOURS,
  DEAL_EVENT_DEDUP_MS,
  DEAL_FEED_MAX_PAGES,
  DEAL_FEED_PAGE_SIZE,
  DEAL_NEARBY_RADIUS_KM,
  DEAL_ONLINE_INTERLEAVE,
  DEAL_TEASER_CACHE_TTL,
  DEAL_VIEW_DEDUP_MS,
} from './deal-limits';
import { liveDealWhere } from './deal-rules';
import {
  CLIENT_DEAL_DETAIL_SELECT,
  CLIENT_DEAL_SELECT,
  ClientDealRow,
  Position,
  toClientDealDetail,
  toClientDealSummary,
} from './deal-mapper';
import { MOROCCO_CITIES, MOROCCO_CITY_KEYS, nearestCityKey } from './morocco-cities';

const CATEGORIES = new Set<string>(Object.values(MerchantCategory));
/** LOCAL deals per "Près de moi" page; the rest of the page is ONLINE deals. */
const NEARBY_LOCAL_PER_PAGE = DEAL_FEED_PAGE_SIZE - Math.floor(DEAL_FEED_PAGE_SIZE / (DEAL_ONLINE_INTERLEAVE + 1));
const MAX_OFFSET = DEAL_FEED_MAX_PAGES * DEAL_FEED_PAGE_SIZE;
const DEDUP_MAX_ENTRIES = 50_000;
const EVENT_FIELDS: Record<DealEventType, 'linkClickCount' | 'directionsCount' | 'shareCount'> = {
  LINK_CLICK: 'linkClickCount',
  DIRECTIONS: 'directionsCount',
  SHARE: 'shareCount',
};

interface BadgeRow {
  merchant_id: string;
  id: string;
  title: string;
  type: string;
  percent_off: number | null;
  buy_qty: number | null;
  free_qty: number | null;
  deal_count: number;
}

export interface MerchantDealBadge {
  activeDealCount: number;
  topDeal: {
    id: string;
    title: string;
    type: string;
    percentOff: number | null;
    buyQty: number | null;
    freeQty: number | null;
  } | null;
}

/** One ONLINE deal after every `every` LOCAL ones; leftovers go at the end. */
export function interleave<T>(local: T[], online: T[], every: number): T[] {
  const out: T[] = [];
  let o = 0;
  local.forEach((item, i) => {
    out.push(item);
    if ((i + 1) % every === 0 && o < online.length) out.push(online[o++]);
  });
  while (o < online.length) out.push(online[o++]);
  return out;
}

/** Stores within this box are candidates for "Près de moi"; served by the stores lat/lng index. */
function nearbyBox(pos: Position) {
  const dLat = DEAL_NEARBY_RADIUS_KM / 111.32;
  const dLng = DEAL_NEARBY_RADIUS_KM / (111.32 * Math.max(0.1, Math.cos((pos.lat * Math.PI) / 180)));
  return { minLat: pos.lat - dLat, maxLat: pos.lat + dLat, minLng: pos.lng - dLng, maxLng: pos.lng + dLng };
}

/** "18.2" → local offset 18, online offset 2. */
export function parseCursor(cursor: string | undefined): [number, number] {
  if (!cursor) return [0, 0];
  const [a, b] = cursor.split('.');
  return [Number(a) || 0, Number(b) || 0];
}

interface FeedContext {
  clientId: string;
  now: Date;
  pos: Position | null;
  cityKey: string | null;
  category: string | null;
  blocked: string[];
}

@Injectable()
export class DealsClientService {
  private readonly logger = new Logger(DealsClientService.name);
  /** Per-instance de-duplication of views and clicks (kept out of the shared cache, which is small). */
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // ── Feed ────────────────────────────────────────────────────

  async feed(clientId: string, q: DealFeedQueryDto) {
    const now = new Date();
    const pos = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
    const ctx: FeedContext = {
      clientId,
      now,
      pos,
      cityKey: this.resolveCity(q.cityKey, pos),
      category: q.category && CATEGORIES.has(q.category) ? q.category : null,
      blocked: await this.blockedIds(clientId),
    };
    const [localOffset, onlineOffset] = parseCursor(q.cursor);
    if (localOffset + onlineOffset >= MAX_OFFSET) return { items: [], nextCursor: null, cityKey: ctx.cityKey };

    const tab = q.tab ?? 'nearby';
    if (tab === 'nearby') return this.nearbyFeed(ctx, localOffset, onlineOffset);

    const where: Prisma.DealWhereInput = { ...this.baseWhere(ctx) };
    let orderBy: Prisma.DealOrderByWithRelationInput[] = [{ startsAt: 'desc' }, { id: 'asc' }];
    if (tab === 'online') {
      where.scope = 'ONLINE';
    } else {
      if (ctx.cityKey) where.OR = [{ scope: 'ONLINE' }, { scope: 'LOCAL', cityKeys: { has: ctx.cityKey } }];
      if (tab === 'ending') {
        where.endsAt = { gt: now, lte: new Date(now.getTime() + DEAL_ENDING_SOON_HOURS * 3_600_000) };
        orderBy = [{ endsAt: 'asc' }, { id: 'asc' }];
      }
    }
    const rows = await this.prisma.deal.findMany({
      where,
      select: CLIENT_DEAL_SELECT,
      orderBy,
      skip: localOffset,
      take: DEAL_FEED_PAGE_SIZE + 1,
    });
    const hasMore = rows.length > DEAL_FEED_PAGE_SIZE;
    const page = rows.slice(0, DEAL_FEED_PAGE_SIZE);
    return {
      items: page.map((d) => toClientDealSummary(d, pos)),
      nextCursor: hasMore ? String(localOffset + page.length) : null,
      cityKey: ctx.cityKey,
    };
  }

  /** LOCAL deals by distance (or of the city), with ONLINE deals interleaved. */
  private async nearbyFeed(ctx: FeedContext, localOffset: number, onlineOffset: number) {
    const localRows = await this.nearbyLocal(ctx, localOffset, NEARBY_LOCAL_PER_PAGE + 1);
    const hasMoreLocal = localRows.length > NEARBY_LOCAL_PER_PAGE;
    const local = localRows.slice(0, NEARBY_LOCAL_PER_PAGE);

    // While LOCAL deals remain, a page carries its share of ONLINE ones; after that ONLINE deals fill the pages.
    const onlineWanted = hasMoreLocal ? DEAL_FEED_PAGE_SIZE - NEARBY_LOCAL_PER_PAGE : DEAL_FEED_PAGE_SIZE - local.length;
    const onlineRows = await this.prisma.deal.findMany({
      where: { ...this.baseWhere(ctx), scope: 'ONLINE' },
      select: CLIENT_DEAL_SELECT,
      orderBy: [{ isPopular: 'desc' }, { startsAt: 'desc' }, { id: 'asc' }],
      skip: onlineOffset,
      take: onlineWanted + 1,
    });
    const hasMoreOnline = onlineRows.length > onlineWanted;
    const online = onlineRows.slice(0, onlineWanted);

    const items = interleave(local, online, DEAL_ONLINE_INTERLEAVE).map((d) => toClientDealSummary(d, ctx.pos));
    const more = hasMoreLocal || hasMoreOnline;
    return {
      items,
      nextCursor: more ? `${localOffset + local.length}.${onlineOffset + online.length}` : null,
      cityKey: ctx.cityKey,
    };
  }

  private async nearbyLocal(ctx: FeedContext, offset: number, take: number): Promise<ClientDealRow[]> {
    if (!ctx.pos) {
      return this.prisma.deal.findMany({
        where: { ...this.baseWhere(ctx), scope: 'LOCAL', ...(ctx.cityKey && { cityKeys: { has: ctx.cityKey } }) },
        select: CLIENT_DEAL_SELECT,
        orderBy: [{ isPopular: 'desc' }, { startsAt: 'desc' }, { id: 'asc' }],
        skip: offset,
        take,
      });
    }
    const ids = await this.nearbyLocalIds(ctx, ctx.pos, offset, take);
    if (ids.length === 0) return [];
    const rows = await this.prisma.deal.findMany({ where: { id: { in: ids } }, select: CLIENT_DEAL_SELECT });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is ClientDealRow => !!r);
  }

  /**
   * Distance of a deal = distance to its closest concerned store. A bounding
   * box (served by the stores lat/lng index) keeps the Haversine computation
   * to nearby stores only.
   */
  private async nearbyLocalIds(ctx: FeedContext, pos: Position, offset: number, take: number): Promise<string[]> {
    const box = nearbyBox(pos);
    const category = ctx.category
      ? Prisma.sql`AND (m.categorie = ${ctx.category}::"MerchantCategory" OR ${ctx.category}::"MerchantCategory" = ANY(m.secondary_categories))`
      : Prisma.empty;
    const blocked = ctx.blocked.length ? Prisma.sql`AND d.merchant_id NOT IN (${Prisma.join(ctx.blocked)})` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT d.id
      FROM deals d
      JOIN merchants m ON m.id = d.merchant_id
      JOIN stores s ON s.merchant_id = d.merchant_id
      WHERE d.status = 'ACTIVE'
        AND d.scope = 'LOCAL'
        AND d.starts_at <= ${ctx.now}
        AND d.ends_at > ${ctx.now}
        AND m.is_active = true
        AND m.deleted_at IS NULL
        AND s.is_active = true
        AND s.latitude BETWEEN ${box.minLat} AND ${box.maxLat}
        AND s.longitude BETWEEN ${box.minLng} AND ${box.maxLng}
        AND (d.all_stores OR EXISTS (SELECT 1 FROM deal_stores ds WHERE ds.deal_id = d.id AND ds.store_id = s.id))
        AND NOT EXISTS (SELECT 1 FROM deal_reports r WHERE r.deal_id = d.id AND r.client_id = ${ctx.clientId})
        ${category}
        ${blocked}
      GROUP BY d.id
      ORDER BY MIN(
        2 * 6371 * ASIN(SQRT(
          POWER(SIN(RADIANS(s.latitude - ${pos.lat}) / 2), 2)
          + COS(RADIANS(${pos.lat})) * COS(RADIANS(s.latitude)) * POWER(SIN(RADIANS(s.longitude - ${pos.lng}) / 2), 2)
        ))
      ) ASC, d.id ASC
      OFFSET ${offset}
      LIMIT ${take}`;
    return rows.map((r) => r.id);
  }

  /**
   * Live deals per merchant category for a tab and an area, with the same
   * filters as the feed (blocked merchants, reported deals). A deal counts for
   * its merchant's main and secondary categories.
   */
  async categoryCounts(clientId: string, q: DealCategoryCountsQueryDto): Promise<{ counts: Record<string, number> }> {
    const now = new Date();
    const pos = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
    const cityKey = this.resolveCity(q.cityKey, pos);
    const blockedIds = await this.blockedIds(clientId);
    const tab = q.tab ?? 'nearby';

    const inCity = cityKey
      ? Prisma.sql`(d.scope = 'ONLINE' OR (d.scope = 'LOCAL' AND ${cityKey} = ANY(d.city_keys)))`
      : Prisma.sql`TRUE`;
    let area: Prisma.Sql;
    if (tab === 'online') {
      area = Prisma.sql`d.scope = 'ONLINE'`;
    } else if (tab === 'nearby' && pos) {
      const box = nearbyBox(pos);
      area = Prisma.sql`(d.scope = 'ONLINE' OR (d.scope = 'LOCAL' AND EXISTS (
        SELECT 1 FROM stores s
        WHERE s.merchant_id = d.merchant_id
          AND s.is_active = true
          AND s.latitude BETWEEN ${box.minLat} AND ${box.maxLat}
          AND s.longitude BETWEEN ${box.minLng} AND ${box.maxLng}
          AND (d.all_stores OR EXISTS (SELECT 1 FROM deal_stores ds WHERE ds.deal_id = d.id AND ds.store_id = s.id))
      )))`;
    } else {
      area = inCity;
    }
    const ending =
      tab === 'ending' ? Prisma.sql`AND d.ends_at <= ${new Date(now.getTime() + DEAL_ENDING_SOON_HOURS * 3_600_000)}` : Prisma.empty;
    const blocked = blockedIds.length ? Prisma.sql`AND d.merchant_id NOT IN (${Prisma.join(blockedIds)})` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<{ category: string; count: number }[]>`
      SELECT c::text AS category, COUNT(DISTINCT d.id)::int AS count
      FROM deals d
      JOIN merchants m ON m.id = d.merchant_id
      CROSS JOIN LATERAL unnest(array_append(m.secondary_categories, m.categorie)) AS c
      WHERE d.status = 'ACTIVE'
        AND d.starts_at <= ${now}
        AND d.ends_at > ${now}
        AND m.is_active = true
        AND m.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM deal_reports r WHERE r.deal_id = d.id AND r.client_id = ${clientId})
        AND ${area}
        ${ending}
        ${blocked}
      GROUP BY c`;
    const counts: Record<string, number> = {};
    for (const r of rows) if (CATEGORIES.has(r.category)) counts[r.category] = Number(r.count);
    return { counts };
  }

  private baseWhere(ctx: FeedContext): Prisma.DealWhereInput {
    const live = liveDealWhere(ctx.now);
    return {
      ...live,
      merchant: {
        ...live.merchant,
        ...(ctx.category && {
          OR: [
            { categorie: ctx.category as MerchantCategory },
            { secondaryCategories: { has: ctx.category as MerchantCategory } },
          ],
        }),
      },
      ...(ctx.blocked.length > 0 && { merchantId: { notIn: ctx.blocked } }),
      // A deal the client reported disappears from their lists.
      reports: { none: { clientId: ctx.clientId } },
    };
  }

  private resolveCity(cityKey: string | undefined, pos: Position | null): string | null {
    if (cityKey && MOROCCO_CITY_KEYS.has(cityKey)) return cityKey;
    return pos ? nearestCityKey(pos.lat, pos.lng) : null;
  }

  private async blockedIds(clientId: string): Promise<string[]> {
    const rows = await this.prisma.clientMerchantBlock.findMany({ where: { clientId }, select: { merchantId: true } });
    return rows.map((r) => r.merchantId);
  }

  // ── Detail, merchant section ───────────────────────────────

  async detail(clientId: string, id: string, q: DealPositionQueryDto) {
    const now = new Date();
    const deal = await this.prisma.deal.findUnique({ where: { id }, select: CLIENT_DEAL_DETAIL_SELECT });
    const hidden =
      !deal ||
      deal.status === 'REMOVED' ||
      deal.status === 'DELETED' ||
      !deal.merchant.isActive ||
      deal.merchant.deletedAt != null ||
      deal.startsAt > now;
    if (hidden) throw new NotFoundException('Bon plan introuvable');

    const blocked = await this.prisma.clientMerchantBlock.findUnique({
      where: { clientId_merchantId: { clientId, merchantId: deal.merchantId } },
      select: { id: true },
    });
    if (blocked) throw new NotFoundException('Bon plan introuvable');

    const isOver = deal.status === 'ENDED' || deal.endsAt <= now;
    if (!isOver && this.firstTime(`v:${id}:${clientId}`, DEAL_VIEW_DEDUP_MS)) {
      this.increment(id, 'viewCount');
    }
    const pos = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
    return toClientDealDetail(deal, isOver, pos);
  }

  async merchantDeals(clientId: string, merchantId: string, q: DealPositionQueryDto) {
    const blocked = await this.prisma.clientMerchantBlock.findUnique({
      where: { clientId_merchantId: { clientId, merchantId } },
      select: { id: true },
    });
    if (blocked) return { items: [] };
    const rows = await this.prisma.deal.findMany({
      where: { ...liveDealWhere(), merchantId, reports: { none: { clientId } } },
      select: CLIENT_DEAL_SELECT,
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      take: 10,
    });
    const pos = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
    return { items: rows.map((d) => toClientDealSummary(d, pos)) };
  }

  // ── Events, reports ────────────────────────────────────────

  async recordEvent(clientId: string, id: string, type: DealEventType) {
    if (this.firstTime(`${type}:${id}:${clientId}`, DEAL_EVENT_DEDUP_MS)) {
      this.increment(id, EVENT_FIELDS[type]);
    }
    return { success: true };
  }

  async report(clientId: string, id: string, dto: ReportDealDto) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, status: { in: ['ACTIVE', 'ENDED'] } },
      select: { id: true },
    });
    if (!deal) throw new NotFoundException('Bon plan introuvable');
    try {
      await this.prisma.dealReport.create({
        data: { dealId: id, clientId, reason: dto.reason, comment: dto.comment ?? null },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { success: true, alreadyReported: true };
      }
      throw err;
    }
    const updated = await this.prisma.deal.update({
      where: { id },
      data: { reportCount: { increment: 1 } },
      select: { reportCount: true },
    });
    if (updated.reportCount >= DEAL_AUTO_HIDE_REPORTS) {
      // Hidden until an admin reviews it (restore or confirm the removal).
      await this.prisma.deal.updateMany({
        where: { id, status: 'ACTIVE' },
        data: { status: 'REMOVED', endedReason: 'AUTO_REPORTS' },
      });
    }
    return { success: true, alreadyReported: false };
  }

  // ── Guests and shared counters ─────────────────────────────

  /** Counters and blurred pictures only: guests never get the content of a deal. */
  async teaser(q: DealPositionQueryDto) {
    const pos = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
    const cityKey = this.resolveCity(q.cityKey, pos);
    const cacheKey = `deals:teaser:${cityKey ?? 'all'}`;
    const cached = await this.cache.get<{ count: number; cityKey: string | null; thumbs: string[] }>(cacheKey);
    if (cached) return cached;

    const live = liveDealWhere();
    const where: Prisma.DealWhereInput = cityKey
      ? { ...live, OR: [{ scope: 'ONLINE' }, { scope: 'LOCAL', cityKeys: { has: cityKey } }] }
      : live;
    const [count, pictures] = await Promise.all([
      this.prisma.deal.count({ where }),
      this.prisma.deal.findMany({
        where,
        select: { imageUrl: true, merchant: { select: { coverUrl: true } } },
        orderBy: [{ isPopular: 'desc' }, { startsAt: 'desc' }],
        take: 8,
      }),
    ]);
    const thumbs = [...new Set(pictures.map((p) => p.imageUrl ?? p.merchant.coverUrl).filter((u): u is string => !!u))].slice(0, 3);
    const result = { count, cityKey, thumbs };
    await this.cache.set(cacheKey, result, DEAL_TEASER_CACHE_TTL);
    return result;
  }

  async cities(q: DealPositionQueryDto) {
    const counts = await this.cityCounts();
    return {
      cities: MOROCCO_CITIES.map((c) => ({ key: c.key, dealCount: counts[c.key] ?? 0 })),
      suggestedCityKey: q.lat != null && q.lng != null ? nearestCityKey(q.lat, q.lng) : null,
    };
  }

  private async cityCounts(): Promise<Record<string, number>> {
    const cacheKey = 'deals:city-counts';
    const cached = await this.cache.get<Record<string, number>>(cacheKey);
    if (cached) return cached;
    const now = new Date();
    const rows = await this.prisma.$queryRaw<{ key: string; count: number }[]>`
      SELECT k AS key, COUNT(*)::int AS count
      FROM deals d
      JOIN merchants m ON m.id = d.merchant_id
      CROSS JOIN LATERAL unnest(d.city_keys) AS k
      WHERE d.status = 'ACTIVE' AND d.scope = 'LOCAL'
        AND d.starts_at <= ${now} AND d.ends_at > ${now}
        AND m.is_active = true AND m.deleted_at IS NULL
      GROUP BY k`;
    const counts = Object.fromEntries(rows.map((r) => [r.key, Number(r.count)]));
    await this.cache.set(cacheKey, counts, DEAL_CITIES_CACHE_TTL);
    return counts;
  }

  /**
   * Live-deal badge of every merchant, for the map and the merchant list.
   * Shared by all clients and cached briefly; callers drop `topDeal` for guests.
   */
  async merchantBadges(): Promise<Record<string, MerchantDealBadge>> {
    const cacheKey = 'deals:merchant-badges';
    const cached = await this.cache.get<Record<string, MerchantDealBadge>>(cacheKey);
    if (cached) return cached;
    const now = new Date();
    // One row per merchant: its top deal (same order as the feed) and its live deal count.
    const rows = await this.prisma.$queryRaw<BadgeRow[]>`
      SELECT DISTINCT ON (d.merchant_id)
        d.merchant_id, d.id, d.title, d.type::text AS type, d.percent_off, d.buy_qty, d.free_qty,
        COUNT(*) OVER (PARTITION BY d.merchant_id)::int AS deal_count
      FROM deals d
      JOIN merchants m ON m.id = d.merchant_id
      WHERE d.status = 'ACTIVE' AND d.starts_at <= ${now} AND d.ends_at > ${now}
        AND m.is_active = true AND m.deleted_at IS NULL
      ORDER BY d.merchant_id, d.is_popular DESC, d.starts_at DESC, d.id`;
    const badges: Record<string, MerchantDealBadge> = {};
    for (const r of rows) {
      badges[r.merchant_id] = {
        activeDealCount: Number(r.deal_count),
        topDeal: { id: r.id, title: r.title, type: r.type, percentOff: r.percent_off, buyQty: r.buy_qty, freeQty: r.free_qty },
      };
    }
    await this.cache.set(cacheKey, badges, DEAL_BADGES_CACHE_TTL);
    return badges;
  }

  // ── Counters ───────────────────────────────────────────────

  private firstTime(key: string, windowMs: number): boolean {
    const now = Date.now();
    const until = this.seen.get(key);
    if (until && until > now) return false;
    this.seen.delete(key);
    this.seen.set(key, now + windowMs);
    if (this.seen.size > DEDUP_MAX_ENTRIES) {
      // Map keeps insertion order: drop the oldest tenth.
      let drop = Math.ceil(DEDUP_MAX_ENTRIES / 10);
      for (const k of this.seen.keys()) {
        this.seen.delete(k);
        if (--drop === 0) break;
      }
    }
    return true;
  }

  /** Fire-and-forget: a counter must never slow down or fail the request. */
  private increment(id: string, field: 'viewCount' | 'linkClickCount' | 'directionsCount' | 'shareCount') {
    this.prisma.deal
      .updateMany({ where: { id, status: 'ACTIVE' }, data: { [field]: { increment: 1 } } })
      .catch((err) => this.logger.warn(`Deal counter ${field} failed for ${id}: ${errMsg(err)}`));
  }
}
