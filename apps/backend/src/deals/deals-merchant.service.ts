import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IStorageProvider, STORAGE_PROVIDER } from '../common/interfaces';
import { assertImageAssignable, deleteOwnedFiles } from '../storage/image-ownership';
import { assertClean } from '../common/utils/content-moderation';
import { detectProhibitedContent } from '../notifications/content-filter';
import { diffDaysYmd, moroccoWallTimeToUtc, moroccoYmd } from '../common/utils/morocco-time';
import { AuditAction, AuditLogService, AuditTargetType } from '../admin/audit-log.service';
import type { CreateDealDto, DuplicateDealDto, UpdateDealDto } from './dto';
import { DEAL_LIMITS } from './deal-limits';
import {
  addDaysYmd,
  normalizeDealLink,
  normalizeOffer,
  normalizeTitleKey,
  resolveDealDates,
  resolveExtendedEnd,
} from './deal-rules';
import { MERCHANT_DEAL_INCLUDE, MerchantDealRow, toMerchantDealDto } from './deal-mapper';
import { resolveCityKey } from './morocco-cities';

type StoreRow = { id: string; ville: string | null; latitude: number | null; longitude: number | null };

/** Distinct cities of the stores a deal applies to. */
export function cityKeysOf(stores: StoreRow[]): string[] {
  const keys = new Set<string>();
  for (const s of stores) {
    const key = resolveCityKey(s.ville, s.latitude, s.longitude);
    if (key) keys.add(key);
  }
  return [...keys];
}

/** Uploaded with type=deal (stored under deals/<merchantId>/). */
export function isDealImage(url: string, merchantId: string): boolean {
  return url.includes(`/deals/${merchantId}/`);
}

interface StoreScope {
  allStores: boolean;
  storeIds: string[];
  cityKeys: string[];
}

@Injectable()
export class DealsMerchantService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    private readonly auditLog: AuditLogService,
  ) {}

  // ── Reads ───────────────────────────────────────────────────

  async list(merchantId: string) {
    const now = new Date();
    const [deals, limits] = await Promise.all([
      this.prisma.deal.findMany({
        where: { merchantId, status: { not: 'DELETED' } },
        include: MERCHANT_DEAL_INCLUDE,
        orderBy: { startsAt: 'desc' },
        take: 100,
      }),
      this.limits(merchantId, now),
    ]);
    return { deals: deals.map((d) => toMerchantDealDto(d, now)), limits };
  }

  async get(merchantId: string, id: string) {
    return toMerchantDealDto(await this.findOwned(merchantId, id));
  }

  async limits(merchantId: string, now: Date = new Date()) {
    const [activeCount, createdToday, locatedStores] = await Promise.all([
      this.prisma.deal.count({ where: { merchantId, status: 'ACTIVE', endsAt: { gt: now } } }),
      this.prisma.deal.count({ where: { merchantId, createdAt: { gte: this.startOfToday(now) } } }),
      this.prisma.store.count({
        where: { merchantId, isActive: true, latitude: { not: null }, longitude: { not: null } },
      }),
    ]);
    return {
      activeCount,
      maxActive: DEAL_LIMITS.MAX_ACTIVE,
      createdToday,
      maxPerDay: DEAL_LIMITS.MAX_CREATED_PER_DAY,
      hasLocatedStore: locatedStores > 0,
    };
  }

  // ── Writes ──────────────────────────────────────────────────

  async create(merchantId: string, dto: CreateDealDto) {
    const now = new Date();
    const title = dto.title.trim();
    const description = dto.description ?? null;
    const conditions = dto.conditions ?? null;
    this.moderate(title, description, conditions);
    const offer = normalizeOffer(dto);
    const linkUrl = normalizeDealLink(dto.linkUrl, dto.scope === 'ONLINE');
    const imageUrl = dto.imageUrl ?? null;
    assertImageAssignable(this.storage, merchantId, imageUrl);
    const dates = resolveDealDates(dto.startsOn, dto.endsOn, now);
    const scope = await this.resolveStoreScope(merchantId, dto.scope, dto.allStores ?? true, dto.storeIds);

    const deal = await this.prisma.$transaction(async (tx) => {
      // Serialises the creations of one merchant so two parallel requests cannot both pass the limits.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`deal:${merchantId}`}))`;
      await this.assertCanPublish(tx, merchantId, title, now);
      return tx.deal.create({
        data: {
          merchantId,
          scope: dto.scope,
          ...offer,
          title,
          description,
          conditions,
          imageUrl,
          linkUrl,
          allStores: scope.allStores,
          cityKeys: scope.cityKeys,
          startsAt: dates.startsAt,
          endsAt: dates.endsAt,
          stores: scope.allStores ? undefined : { create: scope.storeIds.map((storeId) => ({ storeId })) },
        },
        include: MERCHANT_DEAL_INCLUDE,
      });
    });

    this.auditLog.log({
      ctx: { actorType: 'MERCHANT', merchantId },
      action: AuditAction.CREATE_DEAL,
      targetType: AuditTargetType.MERCHANT,
      targetId: merchantId,
      targetLabel: title,
      metadata: { dealId: deal.id, scope: deal.scope, type: deal.type },
    });
    return toMerchantDealDto(deal, now);
  }

  /** Edit or extend a deal that is still live or scheduled. */
  async update(merchantId: string, id: string, dto: UpdateDealDto) {
    const now = new Date();
    const existing = await this.findOwned(merchantId, id);
    if (existing.status !== 'ACTIVE' || existing.endsAt <= now) {
      throw new BadRequestException('Ce bon plan est terminé : dupliquez-le pour le relancer');
    }

    const title = dto.title !== undefined ? dto.title.trim() : existing.title;
    const description = dto.description !== undefined ? dto.description : existing.description;
    const conditions = dto.conditions !== undefined ? dto.conditions : existing.conditions;
    this.moderate(title, description, conditions);

    const offerFieldsSent = ['type', 'originalPrice', 'dealPrice', 'percentOff', 'buyQty', 'freeQty'].some(
      (k) => (dto as Record<string, unknown>)[k] !== undefined,
    );
    const offer = offerFieldsSent
      ? normalizeOffer({
          type: dto.type ?? existing.type,
          originalPrice: dto.originalPrice !== undefined ? dto.originalPrice : existing.originalPrice?.toNumber(),
          dealPrice: dto.dealPrice !== undefined ? dto.dealPrice : existing.dealPrice?.toNumber(),
          percentOff: dto.percentOff !== undefined ? dto.percentOff : existing.percentOff,
          buyQty: dto.buyQty !== undefined ? dto.buyQty : existing.buyQty,
          freeQty: dto.freeQty !== undefined ? dto.freeQty : existing.freeQty,
        })
      : null;

    const linkUrl =
      dto.linkUrl !== undefined ? normalizeDealLink(dto.linkUrl, existing.scope === 'ONLINE') : existing.linkUrl;
    const imageUrl = dto.imageUrl !== undefined ? dto.imageUrl : existing.imageUrl;
    assertImageAssignable(this.storage, merchantId, imageUrl, [existing.imageUrl]);

    let dates: { startsAt: Date; endsAt: Date } | null = null;
    if (dto.startsOn !== undefined || dto.endsOn !== undefined) {
      const endsOn = dto.endsOn ?? moroccoYmd(existing.endsAt);
      dates =
        existing.startsAt > now
          ? resolveDealDates(dto.startsOn ?? moroccoYmd(existing.startsAt), endsOn, now)
          : { startsAt: existing.startsAt, endsAt: resolveExtendedEnd(endsOn, now) };
    }

    const scope =
      dto.allStores !== undefined || dto.storeIds !== undefined
        ? await this.resolveStoreScope(
            merchantId,
            existing.scope,
            dto.allStores ?? existing.allStores,
            dto.storeIds ?? existing.stores.map((s) => s.storeId),
          )
        : null;

    if (normalizeTitleKey(title) !== normalizeTitleKey(existing.title)) {
      await this.assertNoDuplicateTitle(this.prisma, merchantId, title, now, id);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (scope) {
        await tx.dealStore.deleteMany({ where: { dealId: id } });
        if (!scope.allStores) {
          await tx.dealStore.createMany({ data: scope.storeIds.map((storeId) => ({ dealId: id, storeId })) });
        }
      }
      return tx.deal.update({
        where: { id },
        data: {
          title,
          description,
          conditions,
          linkUrl,
          imageUrl,
          ...(offer ?? {}),
          ...(dates ?? {}),
          ...(scope && { allStores: scope.allStores, cityKeys: scope.cityKeys }),
        },
        include: MERCHANT_DEAL_INCLUDE,
      });
    });

    if (existing.imageUrl && existing.imageUrl !== imageUrl) await this.deleteImageIfUnused(merchantId, existing.imageUrl);
    return toMerchantDealDto(updated, now);
  }

  async stop(merchantId: string, id: string) {
    const now = new Date();
    const existing = await this.findOwned(merchantId, id);
    if (existing.status !== 'ACTIVE' || existing.endsAt <= now) {
      throw new BadRequestException('Ce bon plan est déjà terminé');
    }
    const deal = await this.prisma.deal.update({
      where: { id },
      data: { status: 'ENDED', endedReason: 'STOPPED', endsAt: now },
      include: MERCHANT_DEAL_INCLUDE,
    });
    return toMerchantDealDto(deal, now);
  }

  /** Relaunch: same content, new dates (by default from today, same length capped to the maximum). */
  async duplicate(merchantId: string, id: string, dto: DuplicateDealDto) {
    const source = await this.findOwned(merchantId, id);
    if (source.status === 'REMOVED') throw new BadRequestException('Un bon plan retiré par la modération ne peut pas être relancé');
    const startsOn = dto.startsOn ?? moroccoYmd();
    const length = Math.min(
      DEAL_LIMITS.MAX_DURATION_DAYS,
      Math.max(0, diffDaysYmd(moroccoYmd(source.startsAt), moroccoYmd(source.endsAt))),
    );
    const activeStoreIds = source.allStores
      ? []
      : (
          await this.prisma.store.findMany({
            where: { merchantId, isActive: true, id: { in: source.stores.map((s) => s.storeId) } },
            select: { id: true },
          })
        ).map((s) => s.id);

    return this.create(merchantId, {
      scope: source.scope,
      type: source.type,
      title: source.title,
      description: source.description,
      conditions: source.conditions,
      imageUrl: source.imageUrl,
      linkUrl: source.linkUrl,
      originalPrice: source.originalPrice?.toNumber() ?? null,
      dealPrice: source.dealPrice?.toNumber() ?? null,
      percentOff: source.type === 'PERCENT_OFF' ? source.percentOff : null,
      buyQty: source.buyQty,
      freeQty: source.freeQty,
      // A deal whose selected stores were all closed falls back to every store.
      allStores: source.allStores || activeStoreIds.length === 0,
      storeIds: activeStoreIds,
      startsOn,
      endsOn: dto.endsOn ?? addDaysYmd(startsOn, length),
    });
  }

  /** Soft delete: hidden at once, purged with the other old deals (moderation history). */
  async remove(merchantId: string, id: string) {
    await this.findOwned(merchantId, id);
    await this.prisma.deal.update({ where: { id }, data: { status: 'DELETED' } });
    return { success: true };
  }

  // ── Helpers ─────────────────────────────────────────────────

  private async findOwned(merchantId: string, id: string): Promise<MerchantDealRow> {
    const deal = await this.prisma.deal.findFirst({
      where: { id, merchantId, status: { not: 'DELETED' } },
      include: MERCHANT_DEAL_INCLUDE,
    });
    if (!deal) throw new NotFoundException('Bon plan introuvable');
    return deal;
  }

  private startOfToday(now: Date): Date {
    return moroccoWallTimeToUtc(moroccoYmd(now), 0, 0);
  }

  private moderate(title: string, description: string | null, conditions: string | null) {
    assertClean({ titre: title, description, conditions });
    const violation = detectProhibitedContent(title, description ?? '', conditions ?? '');
    if (violation) throw new BadRequestException(violation.message);
  }

  private async resolveStoreScope(
    merchantId: string,
    dealScope: 'LOCAL' | 'ONLINE',
    allStores: boolean,
    storeIds: string[] | undefined,
  ): Promise<StoreScope> {
    if (dealScope === 'ONLINE') return { allStores: true, storeIds: [], cityKeys: [] };

    const stores = await this.prisma.store.findMany({
      where: { merchantId, isActive: true },
      select: { id: true, ville: true, latitude: true, longitude: true },
    });
    let concerned = stores;
    let ids: string[] = [];
    if (!allStores) {
      ids = [...new Set(storeIds ?? [])];
      if (ids.length === 0) throw new BadRequestException('Choisissez au moins un magasin');
      concerned = stores.filter((s) => ids.includes(s.id));
      if (concerned.length !== ids.length) throw new BadRequestException('Magasin invalide');
    }
    if (!concerned.some((s) => s.latitude != null && s.longitude != null)) {
      throw new BadRequestException({
        message: 'Ajoutez la position de votre magasin pour publier un bon plan en magasin',
        code: 'DEAL_NEEDS_LOCATION',
      });
    }
    return { allStores, storeIds: ids, cityKeys: cityKeysOf(concerned) };
  }

  private async assertCanPublish(tx: Prisma.TransactionClient, merchantId: string, title: string, now: Date) {
    const [activeCount, createdToday] = await Promise.all([
      tx.deal.count({ where: { merchantId, status: 'ACTIVE', endsAt: { gt: now } } }),
      tx.deal.count({ where: { merchantId, createdAt: { gte: this.startOfToday(now) } } }),
    ]);
    if (activeCount >= DEAL_LIMITS.MAX_ACTIVE) {
      throw new BadRequestException({
        message: `Vous avez déjà ${DEAL_LIMITS.MAX_ACTIVE} bons plans en cours ou programmés. Arrêtez-en un pour en publier un nouveau.`,
        code: 'DEAL_LIMIT_ACTIVE',
      });
    }
    if (createdToday >= DEAL_LIMITS.MAX_CREATED_PER_DAY) {
      throw new BadRequestException({
        message: `Vous pouvez créer ${DEAL_LIMITS.MAX_CREATED_PER_DAY} bons plans par jour. Réessayez demain.`,
        code: 'DEAL_LIMIT_DAILY',
      });
    }
    await this.assertNoDuplicateTitle(tx, merchantId, title, now);
  }

  private async assertNoDuplicateTitle(
    db: Prisma.TransactionClient,
    merchantId: string,
    title: string,
    now: Date,
    exceptId?: string,
  ) {
    const running = await db.deal.findMany({
      where: { merchantId, status: 'ACTIVE', endsAt: { gt: now }, ...(exceptId && { id: { not: exceptId } }) },
      select: { id: true, title: true },
    });
    const key = normalizeTitleKey(title);
    const same = running.find((d) => normalizeTitleKey(d.title) === key);
    if (same) {
      throw new ConflictException({
        message: 'Un bon plan avec ce titre est déjà en cours. Prolongez-le plutôt que d’en créer un nouveau.',
        code: 'DEAL_DUPLICATE',
        meta: { dealId: same.id },
      });
    }
  }

  /**
   * A duplicated deal shares its image with the original: delete the file only
   * once nothing uses it. Images picked from elsewhere (cover…) are never deleted.
   */
  private async deleteImageIfUnused(merchantId: string, url: string) {
    if (!isDealImage(url, merchantId)) return;
    const stillUsed = await this.prisma.deal.count({ where: { merchantId, imageUrl: url } });
    if (stillUsed === 0) deleteOwnedFiles(this.storage, merchantId, [url]);
  }
}
