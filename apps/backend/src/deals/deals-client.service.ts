import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { MerchantCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { errMsg } from '../common/utils';
import { IMailProvider, MAIL_PROVIDER } from '../common/interfaces';
import { moroccoYmd } from '../common/utils/morocco-time';
import { MerchantInboxService } from '../merchant-inbox/merchant-inbox.service';
import type { DealCategoryCountsQueryDto, DealEventType, DealFeedQueryDto, DealPositionQueryDto, ReportDealDto } from './dto';
import {
  DEAL_AUTO_HIDE_REPORTS,
  DEAL_REPORTER_MIN_ACCOUNT_AGE_DAYS,
  DEAL_BADGES_CACHE_TTL,
  DEAL_CITIES_CACHE_TTL,
  DEAL_ENDING_SOON_HOURS,
  DEAL_FEED_MAX_PAGES,
  DEAL_FEED_PAGE_SIZE,
  DEAL_NEARBY_RADIUS_KM,
  DEAL_ONLINE_INTERLEAVE,
  DEAL_TEASER_CACHE_TTL,
} from './deal-limits';
import { MS_PER_DAY } from '../common/constants';
import { liveDealWhere } from './deal-rules';
import { dealAutoHiddenTexts } from './deal-notif-i18n';
import {
  CLIENT_DEAL_DETAIL_SELECT,
  CLIENT_DEAL_SELECT,
  ClientDealRow,
  DealViewerState,
  GUEST_VIEWER,
  Position,
  toClientDealDetail,
  toClientDealSummary,
} from './deal-mapper';
import { MOROCCO_CITIES, MOROCCO_CITY_KEYS, haversineKm, nearestCityKey } from './morocco-cities';

const CATEGORIES = new Set<string>(Object.values(MerchantCategory));
/** LOCAL deals per "Près de moi" page; the rest of the page is ONLINE deals. */
const NEARBY_LOCAL_PER_PAGE = DEAL_FEED_PAGE_SIZE - Math.floor(DEAL_FEED_PAGE_SIZE / (DEAL_ONLINE_INTERLEAVE + 1));
const MAX_OFFSET = DEAL_FEED_MAX_PAGES * DEAL_FEED_PAGE_SIZE;
const RECENT_FIRST: Prisma.DealOrderByWithRelationInput[] = [{ startsAt: 'desc' }, { id: 'asc' }];
const ENDING_FIRST: Prisma.DealOrderByWithRelationInput[] = [{ endsAt: 'asc' }, { id: 'asc' }];

/** Deal counter of each counted event, and the per-day figure it adds to (a share is not an "action"). */
const COUNTERS: Record<DealEventType | 'VIEW', { column: string; daily: 'views' | 'actions' | null }> = {
  VIEW: { column: 'view_count', daily: 'views' },
  LINK_CLICK: { column: 'link_click_count', daily: 'actions' },
  DIRECTIONS: { column: 'directions_count', daily: 'actions' },
  CALL: { column: 'call_count', daily: 'actions' },
  SHARE: { column: 'share_count', daily: null },
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

/** Title and picture of a live deal, for the preview of its shared link. */
export interface DealSharePreview {
  title: string;
  merchant: string;
  imageUrl: string | null;
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
  /** null for a guest: no blocked merchants, no reported deals to hide. */
  clientId: string | null;
  now: Date;
  pos: Position | null;
  cityKey: string | null;
  category: string | null;
  blocked: string[];
}

@Injectable()
export class DealsClientService {
  private readonly logger = new Logger(DealsClientService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly inbox: MerchantInboxService,
    @Inject(MAIL_PROVIDER) private readonly mail: IMailProvider,
  ) {}

  // ── Feed ────────────────────────────────────────────────────

  async feed(clientId: string | null, q: DealFeedQueryDto) {
    const now = new Date();
    const pos = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
    const ctx: FeedContext = {
      clientId,
      now,
      pos,
      cityKey: this.resolveCity(q.cityKey, pos),
      category: q.category && CATEGORIES.has(q.category) ? q.category : null,
      blocked: clientId ? await this.blockedIds(clientId) : [],
    };
    const [localOffset, onlineOffset] = parseCursor(q.cursor);
    if (localOffset + onlineOffset >= MAX_OFFSET) return { items: [], nextCursor: null, cityKey: ctx.cityKey };

    const tab = q.tab ?? 'nearby';
    const byDiscount = q.sort === 'discount';
    if (tab === 'saved' && !clientId) return { items: [], nextCursor: null, cityKey: ctx.cityKey };
    // The distance order is the plain "Près de moi" list; a search or a sort reads the city instead.
    if (tab === 'nearby' && !q.q && !byDiscount) return this.nearbyFeed(ctx, localOffset, onlineOffset);

    const where: Prisma.DealWhereInput = { ...this.baseWhere(ctx) };
    let orderBy = RECENT_FIRST;
    if (tab === 'online') {
      where.scope = 'ONLINE';
    } else if (tab === 'saved') {
      // Saved deals are listed wherever they are.
      where.saves = { some: { clientId: clientId! } };
      orderBy = ENDING_FIRST;
    } else {
      if (ctx.cityKey) where.OR = [{ scope: 'ONLINE' }, { scope: 'LOCAL', cityKeys: { has: ctx.cityKey } }];
      if (tab === 'ending') {
        where.endsAt = { gt: now, lte: new Date(now.getTime() + DEAL_ENDING_SOON_HOURS * 3_600_000) };
        orderBy = ENDING_FIRST;
      }
    }
    if (q.q) {
      const contains = { contains: q.q, mode: 'insensitive' as const };
      where.AND = [{ OR: [{ title: contains }, { merchant: { nom: contains } }] }];
    }
    if (byDiscount) orderBy = [{ percentOff: { sort: 'desc', nulls: 'last' } }, ...RECENT_FIRST];
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
    const nothingAround = localOffset === 0 && local.length === 0 && ctx.pos && !ctx.category;
    return {
      items,
      nextCursor: more ? `${localOffset + local.length}.${onlineOffset + online.length}` : null,
      cityKey: ctx.cityKey,
      suggestedCity: nothingAround ? await this.nearestCityWithDeals(ctx.pos!) : null,
    };
  }

  /** Where to send a client whose surroundings have no in-store deal. */
  private async nearestCityWithDeals(pos: Position): Promise<{ key: string; dealCount: number } | null> {
    const counts = await this.cityCounts();
    let best: { key: string; dealCount: number } | null = null;
    let bestKm = Infinity;
    for (const city of MOROCCO_CITIES) {
      const dealCount = counts[city.key] ?? 0;
      if (dealCount === 0) continue;
      const km = haversineKm(pos.lat, pos.lng, city.lat, city.lng);
      if (km < bestKm) {
        bestKm = km;
        best = { key: city.key, dealCount };
      }
    }
    return best;
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
        ${notReportedBy(ctx.clientId)}
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
  async categoryCounts(clientId: string | null, q: DealCategoryCountsQueryDto): Promise<{ counts: Record<string, number> }> {
    const now = new Date();
    const pos = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
    const cityKey = this.resolveCity(q.cityKey, pos);
    const blockedIds = clientId ? await this.blockedIds(clientId) : [];
    const tab = q.tab ?? 'nearby';
    // The saved list is short and has no category chips.
    if (tab === 'saved') return { counts: {} };

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
        ${notReportedBy(clientId)}
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
      ...(ctx.clientId && { reports: { none: { clientId: ctx.clientId } } }),
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

  /**
   * clientId null: a guest. `viewerKey` (their hashed IP) then de-duplicates
   * their views, so a guest re-opening a deal does not inflate its count.
   */
  async detail(clientId: string | null, id: string, q: DealPositionQueryDto, viewerKey: string = clientId ?? 'guest') {
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

    const [blocked, viewer] = clientId
      ? await Promise.all([this.isBlocked(clientId, deal.merchantId), this.viewerState(clientId, id, deal.merchantId)])
      : [false, GUEST_VIEWER];
    if (blocked) throw new NotFoundException('Bon plan introuvable');

    const isOver = deal.status === 'ENDED' || deal.endsAt <= now;
    if (!isOver) this.count(id, viewerKey, 'VIEW');
    const pos = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
    return toClientDealDetail(deal, isOver, viewer, pos);
  }

  private async isBlocked(clientId: string, merchantId: string): Promise<boolean> {
    const block = await this.prisma.clientMerchantBlock.findUnique({
      where: { clientId_merchantId: { clientId, merchantId } },
      select: { id: true },
    });
    return !!block;
  }

  private async viewerState(clientId: string, dealId: string, merchantId: string): Promise<DealViewerState> {
    const [save, claim, card] = await Promise.all([
      this.prisma.dealSave.findUnique({ where: { clientId_dealId: { clientId, dealId } }, select: { dealId: true } }),
      this.prisma.dealClaim.findUnique({ where: { dealId_clientId: { dealId, clientId } }, select: { createdAt: true } }),
      this.prisma.loyaltyCard.findFirst({ where: { clientId, merchantId, deactivatedAt: null }, select: { id: true } }),
    ]);
    return { saved: !!save, claimedAt: claim?.createdAt ?? null, hasCard: !!card };
  }

  async merchantDeals(clientId: string, merchantId: string, q: DealPositionQueryDto) {
    if (await this.isBlocked(clientId, merchantId)) return { items: [] };
    const rows = await this.prisma.deal.findMany({
      where: { ...liveDealWhere(), merchantId, reports: { none: { clientId } } },
      select: CLIENT_DEAL_SELECT,
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      take: 10,
    });
    const pos = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
    return { items: rows.map((d) => toClientDealSummary(d, pos)) };
  }

  // ── Events, "J'en profite", saved deals, reports ───────────

  /** viewerKey: the client id, or the hashed IP of a guest. */
  async recordEvent(viewerKey: string, id: string, type: DealEventType) {
    this.count(id, viewerKey, type);
    return { success: true };
  }

  /**
   * "J'en profite": the pass the client shows at the till. Idempotent, one per
   * client and deal; the merchant's counter moves only on the first call.
   */
  async claim(clientId: string, id: string) {
    const deal = await this.findOpen(clientId, id);
    if (deal.scope !== 'LOCAL') throw new BadRequestException('Ce bon plan s’utilise en ligne');
    await this.prisma.$executeRaw`
      WITH claimed AS (
        INSERT INTO deal_claims (deal_id, client_id) VALUES (${id}, ${clientId})
        ON CONFLICT DO NOTHING RETURNING deal_id
      ), bumped AS (
        UPDATE deals SET claim_count = claim_count + 1 WHERE id IN (SELECT deal_id FROM claimed) RETURNING id
      )
      INSERT INTO deal_daily_stats (deal_id, day, claims)
      SELECT id, ${moroccoYmd()}::date, 1 FROM bumped
      ON CONFLICT (deal_id, day) DO UPDATE SET claims = deal_daily_stats.claims + 1`;
    const claim = await this.prisma.dealClaim.findUniqueOrThrow({
      where: { dealId_clientId: { dealId: id, clientId } },
      select: { createdAt: true },
    });
    return { claimedAt: claim.createdAt.toISOString() };
  }

  async setSaved(clientId: string, id: string, saved: boolean) {
    if (saved) {
      await this.findOpen(clientId, id);
      await this.prisma.dealSave.createMany({ data: [{ clientId, dealId: id }], skipDuplicates: true });
    } else {
      await this.prisma.dealSave.deleteMany({ where: { clientId, dealId: id } });
    }
    return { saved };
  }

  /** A deal the client can act on: live, from a merchant they did not block. */
  private async findOpen(clientId: string, id: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, ...liveDealWhere() },
      select: { id: true, scope: true, merchantId: true },
    });
    if (!deal || (await this.isBlocked(clientId, deal.merchantId))) throw new NotFoundException('Bon plan introuvable');
    return deal;
  }

  async report(clientId: string, id: string, dto: ReportDealDto) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, status: { in: ['ACTIVE', 'ENDED'] } },
      select: { id: true, title: true, merchantId: true, merchant: { select: { nom: true, language: true } } },
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
    await this.prisma.deal.update({
      where: { id },
      data: { reportCount: { increment: 1 } },
      select: { reportCount: true },
    });
    const credibleReports = await this.prisma.dealReport.count({
      where: {
        dealId: id,
        client: {
          deletedAt: null,
          createdAt: { lte: new Date(Date.now() - DEAL_REPORTER_MIN_ACCOUNT_AGE_DAYS * MS_PER_DAY) },
          OR: [{ emailVerified: true }, { telephoneVerified: true }],
        },
      },
    });
    if (credibleReports >= DEAL_AUTO_HIDE_REPORTS) {
      // Hidden until an admin reviews it (restore or confirm the removal).
      const { count } = await this.prisma.deal.updateMany({
        where: { id, status: 'ACTIVE' },
        data: { status: 'REMOVED', endedReason: 'AUTO_REPORTS' },
      });
      // The status condition makes the announcement happen once.
      if (count === 1) await this.announceAutoHide(deal, clientId, credibleReports);
    }
    return { success: true, alreadyReported: false };
  }

  /** The merchant learns why the deal disappeared, and moderation that it waits for a review. */
  private async announceAutoHide(
    deal: { id: string; title: string; merchantId: string; merchant: { nom: string; language: string | null } },
    lastReporterId: string,
    reports: number,
  ) {
    const msg = dealAutoHiddenTexts(deal.merchant.language, deal.title);
    await this.inbox.record(deal.merchantId, { category: 'ACTIVITY', title: msg.title, body: msg.body, action: 'open_deals' });
    this.mail
      .sendContentReport({
        merchantId: deal.merchantId,
        merchantName: deal.merchant.nom,
        reporterId: lastReporterId,
        reporterEmail: '—',
        reason: 'Bon plan masqué automatiquement',
        details: `« ${deal.title} » (${deal.id}) masqué après ${reports} signalements. À vérifier dans Admin > Bons plans > Retirés.`,
      })
      .catch((err) => this.logger.warn(`Auto-hide report mail failed for deal ${deal.id}: ${errMsg(err)}`));
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

  /**
   * Public (the shared link is opened by chat apps and people without the
   * app), so live deals are cached. Misses are not: random ids would fill the
   * shared LRU and evict plan and session entries; a miss is one primary-key read.
   */
  async sharePreview(id: string): Promise<DealSharePreview | null> {
    const cacheKey = `deals:share:${id}`;
    const cached = await this.cache.get<{ preview: DealSharePreview }>(cacheKey);
    if (cached) return cached.preview;
    const deal = await this.prisma.deal.findFirst({
      where: { id, ...liveDealWhere() },
      select: { title: true, imageUrl: true, merchant: { select: { nom: true, coverUrl: true } } },
    });
    const picture = deal?.imageUrl ?? deal?.merchant.coverUrl ?? null;
    if (!deal) return null;
    const preview = { title: deal.title, merchant: deal.merchant.nom, imageUrl: picture?.startsWith('https://') ? picture : null };
    await this.cache.set(cacheKey, { preview }, DEAL_TEASER_CACHE_TTL);
    return preview;
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

  /**
   * Counts a view or a click once per viewer and Morocco day, whatever the
   * instance: the mark row is the proof, and only its first insert moves the
   * deal counter and the figure of the day. Fire-and-forget: a counter must
   * never slow down or fail the request.
   */
  private count(id: string, viewerKey: string, kind: DealEventType | 'VIEW') {
    const { column, daily } = COUNTERS[kind];
    const day = moroccoYmd();
    // Identifiers come from COUNTERS only, never from the request.
    const counter = Prisma.raw(column);
    const figure = daily ? Prisma.raw(daily) : null;
    const tail = figure
      ? Prisma.sql`INSERT INTO deal_daily_stats (deal_id, day, ${figure})
          SELECT id, ${day}::date, 1 FROM bumped
          ON CONFLICT (deal_id, day) DO UPDATE SET ${figure} = deal_daily_stats.${figure} + 1`
      : Prisma.sql`SELECT 1 FROM bumped`;
    this.prisma.$executeRaw`
      WITH mark AS (
        INSERT INTO deal_event_marks (deal_id, viewer_key, kind, day)
        SELECT d.id, ${viewerKey}, ${kind}, ${day}::date FROM deals d WHERE d.id = ${id} AND d.status = 'ACTIVE'
        ON CONFLICT DO NOTHING RETURNING deal_id
      ), bumped AS (
        UPDATE deals SET ${counter} = ${counter} + 1 WHERE id IN (SELECT deal_id FROM mark) RETURNING id
      )
      ${tail}`.catch((err) => this.logger.warn(`Deal counter ${kind} failed for ${id}: ${errMsg(err)}`));
  }
}

/** Hides the deals a client reported; a guest has reported nothing. */
function notReportedBy(clientId: string | null): Prisma.Sql {
  return clientId
    ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM deal_reports r WHERE r.deal_id = d.id AND r.client_id = ${clientId})`
    : Prisma.empty;
}
