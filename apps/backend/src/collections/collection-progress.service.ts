import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { withRetry } from '../common/utils/retry-transaction.helper';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { errMsg } from '../common/utils';
import { formatMoroccoDayMonth, moroccoYmd } from '../common/utils/morocco-time';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../events';
import { COUPON_MERCHANT_SELECT, COUPON_PUBLIC_SELECT, CouponService } from '../scratch-card/coupon.service';
import { giftCouponDates, planChecks } from './collection-rules';
import { getCollectionTexts } from './collection-notif-i18n';

type Db = Prisma.TransactionClient;

const OPEN_COLLECTION_SELECT = {
  id: true,
  name: true,
  giftLabel: true,
  giftImageUrl: true,
  onePerVisit: true,
  repeatable: true,
  couponValidityDays: true,
  giftDelayHours: true,
  endsAt: true,
  items: { select: { id: true, label: true, imageUrl: true }, orderBy: { position: 'asc' } },
} satisfies Prisma.CollectionSelect;

const CHECK_SELECT = { itemId: true, createdAt: true } satisfies Prisma.CollectionCheckSelect;
const LIST_MERCHANT_SELECT = { id: true, nom: true, logoUrl: true } satisfies Prisma.MerchantSelect;
/** Caps of the client overview: a client follows a handful of shops, the history is the latest gifts. */
const MAX_LISTED_COLLECTIONS = 50;
const MAX_LISTED_GIFTS = 30;
const GIFT_SELECT = { ...COUPON_PUBLIC_SELECT, merchant: { select: COUPON_MERCHANT_SELECT } } satisfies Prisma.CouponSelect;

type OpenCollection = Prisma.CollectionGetPayload<{ select: typeof OPEN_COLLECTION_SELECT }>;
type Check = Prisma.CollectionCheckGetPayload<{ select: typeof CHECK_SELECT }>;
type GiftCoupon = Prisma.CouponGetPayload<{ select: typeof GIFT_SELECT }>;

export interface CollectionActor {
  teamMemberId?: string;
  performedByName?: string;
}

interface CheckOutcome {
  collection: OpenCollection;
  checks: Check[];
  completed: boolean;
  added: number;
  coupon: GiftCoupon | null;
  merchantName: string;
  language: string | null;
}

/**
 * Progress of clients on the open collection of a merchant: what is left to
 * collect (till and client app) and ticking.
 *
 * A Premium feature: a collection left ACTIVE after the plan ended is hidden
 * and stops progressing. Gift coupons already won stay usable.
 */
@Injectable()
export class CollectionProgressService {
  private readonly logger = new Logger(CollectionProgressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planService: MerchantPlanService,
    private readonly coupons: CouponService,
    private readonly notifications: NotificationsService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  // ── Reads ───────────────────────────────────────────────────

  private openCollection(db: Db, merchantId: string, now: Date) {
    return db.collection.findFirst({
      where: { merchantId, ...openWhere(now) },
      select: OPEN_COLLECTION_SELECT,
    });
  }

  /** Latest cycle of the client; a finished cycle of a repeatable collection counts as none. */
  private async currentCycle(db: Db, collection: OpenCollection, clientId: string) {
    const latest = await db.collectionProgress.findFirst({
      where: { collectionId: collection.id, clientId },
      orderBy: { cycle: 'desc' },
      select: { id: true, cycle: true, completedAt: true, checks: { select: CHECK_SELECT } },
    });
    return { latest, current: currentOf(latest, collection.repeatable) };
  }

  /** Open collection + current cycle of one client, or null when there is nothing to show. */
  private async load(merchantId: string, clientId: string, now: Date) {
    const collection = await this.openCollection(this.prisma, merchantId, now);
    if (!collection) return null;
    const [premium, { current }] = await Promise.all([
      this.planService.isPremium(merchantId),
      this.currentCycle(this.prisma, collection, clientId),
    ]);
    return premium ? { collection, checks: current?.checks ?? [], completed: !!current?.completedAt } : null;
  }

  private tillView(collection: OpenCollection, checks: Check[], completed: boolean, now: Date) {
    const done = new Set(checks.map((c) => c.itemId));
    const today = moroccoYmd(now);
    const blockedToday = collection.onePerVisit && checks.some((c) => moroccoYmd(c.createdAt) === today);
    return {
      id: collection.id,
      name: collection.name,
      giftLabel: collection.giftLabel,
      onePerVisit: collection.onePerVisit,
      items: collection.items.map((i) => ({ id: i.id, label: i.label, imageUrl: i.imageUrl, checked: done.has(i.id) })),
      checked: checks.length,
      total: collection.items.length,
      completed,
      canCheck: !completed && !blockedToday,
    };
  }

  /** What the cashier sees for one client. `collection: null` = nothing to show. */
  async forClientAtTill(merchantId: string, clientId: string) {
    const now = new Date();
    const state = await this.load(merchantId, clientId, now);
    return { collection: state ? this.tillView(state.collection, state.checks, state.completed, now) : null };
  }

  /** What a client sees on the merchant page: the open collection and their own progress. */
  async forClient(clientId: string, merchantId: string) {
    const now = new Date();
    const [state, gift] = await Promise.all([
      this.load(merchantId, clientId, now),
      // A gift won here and not used yet, so the app can point at the coupon.
      this.prisma.coupon.findFirst({
        where: { clientId, merchantId, source: 'COLLECTION', status: 'ACTIVE', expiresAt: { gt: now } },
        orderBy: { expiresAt: 'asc' },
        select: { id: true },
      }),
    ]);
    if (!state) return { collection: null };
    return { collection: clientView(state.collection, state.checks, state.completed, gift?.id ?? null) };
  }

  /**
   * Home tile and collections screen of the client app: the open collections of
   * the shops where the client has a card, and the gifts already won.
   */
  async listForClient(clientId: string) {
    const now = new Date();
    const [open, won] = await Promise.all([
      this.prisma.collection.findMany({
        where: {
          ...openWhere(now),
          merchant: { isActive: true, deletedAt: null, loyaltyCards: { some: { clientId, deactivatedAt: null } } },
        },
        select: { ...OPEN_COLLECTION_SELECT, merchant: { select: LIST_MERCHANT_SELECT } },
        orderBy: { startedAt: 'desc' },
        take: MAX_LISTED_COLLECTIONS,
      }),
      this.prisma.collectionProgress.findMany({
        where: { clientId, completedAt: { not: null }, collection: { merchant: { deletedAt: null } } },
        orderBy: { completedAt: 'desc' },
        take: MAX_LISTED_GIFTS,
        select: {
          id: true,
          completedAt: true,
          collection: { select: { name: true, giftLabel: true, merchant: { select: LIST_MERCHANT_SELECT } } },
          coupon: { select: { id: true, status: true, validFrom: true, expiresAt: true, redeemedAt: true } },
        },
      }),
    ]);

    // Same Premium rule as the merchant page (the plan is cached per merchant).
    const premium = await Promise.all(open.map((c) => this.planService.isPremium(c.merchant.id)));
    const shown = open.filter((_, i) => premium[i]);

    const [cycles, gifts] = shown.length === 0 ? [[], []] : await Promise.all([
      // Latest cycle per collection.
      this.prisma.collectionProgress.findMany({
        where: { clientId, collectionId: { in: shown.map((c) => c.id) } },
        orderBy: [{ collectionId: 'asc' }, { cycle: 'desc' }],
        distinct: ['collectionId'],
        select: { collectionId: true, completedAt: true, checks: { select: CHECK_SELECT } },
      }),
      this.prisma.coupon.findMany({
        where: {
          clientId, source: 'COLLECTION', status: 'ACTIVE', expiresAt: { gt: now },
          collectionProgress: { collectionId: { in: shown.map((c) => c.id) } },
        },
        orderBy: { expiresAt: 'asc' },
        select: { id: true, collectionProgress: { select: { collectionId: true } } },
      }),
    ]);
    const latestBy = new Map(cycles.map((p) => [p.collectionId, p]));
    // Gift won with this very collection (any cycle), soonest expiry first.
    const giftBy = new Map<string, string>();
    for (const g of gifts) {
      const collectionId = g.collectionProgress?.collectionId;
      if (collectionId && !giftBy.has(collectionId)) giftBy.set(collectionId, g.id);
    }

    // A finished one-shot collection has nothing left to do: its gift lives in the history.
    const collections = shown.flatMap(({ merchant, ...collection }) => {
      const current = currentOf(latestBy.get(collection.id) ?? null, collection.repeatable);
      if (current?.completedAt) return [];
      return [{ ...clientView(collection, current?.checks ?? [], false, giftBy.get(collection.id) ?? null), merchant }];
    });

    const history = won.map((p) => ({
      id: p.id,
      collectionName: p.collection.name,
      giftLabel: p.collection.giftLabel,
      completedAt: p.completedAt!.toISOString(),
      merchant: p.collection.merchant,
      coupon: p.coupon && {
        id: p.coupon.id,
        status: p.coupon.status,
        validFrom: p.coupon.validFrom.toISOString(),
        expiresAt: p.coupon.expiresAt.toISOString(),
        redeemedAt: p.coupon.redeemedAt?.toISOString() ?? null,
      },
    }));

    return { collections, history };
  }

  // ── Ticking ─────────────────────────────────────────────────

  /**
   * Ticks the products bought during this visit. Items already ticked are
   * ignored, and a request replayed with the same `requestKey` changes nothing
   * (without the key, a retry of the completing request would start the next
   * cycle of a repeatable collection). The tick that completes the set creates
   * the gift coupon in the same transaction.
   */
  async check(merchantId: string, clientId: string, itemIds: string[], actor: CollectionActor, requestKey: string) {
    if (!(await this.planService.isPremium(merchantId))) throw new ForbiddenException('error.collection.unavailable');

    const run = () =>
      withRetry(() =>
        this.prisma.$transaction((tx) => this.checkInTx(tx, merchantId, clientId, itemIds, actor, requestKey), {
          isolationLevel: 'Serializable',
        }),
      );

    let outcome: CheckOutcome;
    try {
      outcome = await run();
    } catch (err) {
      // Two tills ticking the same client at once: the loser replays and finds the work done.
      if (!isUniqueViolation(err)) throw err;
      outcome = await run();
    }

    if (outcome.added > 0) this.afterCheck(merchantId, clientId, outcome);

    return {
      collection: this.tillView(outcome.collection, outcome.checks, outcome.completed, new Date()),
      added: outcome.added,
      gift: outcome.coupon ? this.coupons.toDto(outcome.coupon) : null,
    };
  }

  private async checkInTx(
    tx: Db,
    merchantId: string,
    clientId: string,
    requested: string[],
    actor: CollectionActor,
    requestKey: string,
  ): Promise<CheckOutcome> {
    const now = new Date();
    const collection = await this.openCollection(tx, merchantId, now);
    if (!collection) throw new NotFoundException('error.collection.noneActive');

    // Only a client of this merchant (active loyalty card) collects.
    const card = await tx.loyaltyCard.findUnique({
      where: { clientId_merchantId: { clientId, merchantId } },
      select: {
        deactivatedAt: true,
        client: { select: { deletedAt: true, language: true } },
        merchant: { select: { nom: true } },
      },
    });
    if (!card || card.deactivatedAt || card.client.deletedAt) throw new NotFoundException('error.collection.clientNotFound');
    const outcome = { collection, merchantName: card.merchant.nom, language: card.client.language };

    // Replay of a request already applied: answer with the cycle it ticked, gift included.
    const replayed = await tx.collectionCheck.findFirst({
      where: { requestKey, progress: { merchantId, clientId, collectionId: collection.id } },
      select: {
        progress: { select: { completedAt: true, checks: { select: CHECK_SELECT }, coupon: { select: GIFT_SELECT } } },
      },
    });
    if (replayed) {
      const { checks, completedAt, coupon } = replayed.progress;
      return { ...outcome, checks, completed: !!completedAt, added: 0, coupon };
    }

    const { latest, current } = await this.currentCycle(tx, collection, clientId);
    if (current?.completedAt) throw new ConflictException('error.collection.alreadyCompleted');

    const checks = current?.checks ?? [];
    const plan = planChecks({
      itemIds: collection.items.map((i) => i.id),
      checked: checks,
      requested,
      onePerVisit: collection.onePerVisit,
      now,
    });
    if (plan.newItemIds.length === 0) return { ...outcome, checks, completed: false, added: 0, coupon: null };

    const progressId =
      current?.id ??
      (
        await tx.collectionProgress.create({
          data: { collectionId: collection.id, clientId, merchantId, cycle: (latest?.cycle ?? 0) + 1 },
          select: { id: true },
        })
      ).id;

    const created = await tx.collectionCheck.createManyAndReturn({
      data: plan.newItemIds.map((itemId) => ({
        progressId,
        itemId,
        teamMemberId: actor.teamMemberId ?? null,
        performedByName: actor.performedByName ?? null,
        requestKey,
      })),
      select: CHECK_SELECT,
    });

    let coupon: GiftCoupon | null = null;
    if (plan.completes) {
      coupon = await this.coupons.createCollectionGift(tx, {
        clientId,
        merchantId,
        label: collection.giftLabel,
        ...giftCouponDates(collection, now),
      });
      await tx.collectionProgress.update({ where: { id: progressId }, data: { completedAt: now, couponId: coupon.id } });
    }

    return { ...outcome, checks: [...checks, ...created], completed: plan.completes, added: created.length, coupon };
  }

  /** Real-time event and push to the client, after the transaction committed. */
  private afterCheck(merchantId: string, clientId: string, o: CheckOutcome) {
    const checked = o.checks.length;
    const total = o.collection.items.length;
    const gift = o.collection.giftLabel;
    try {
      this.eventsGateway.emitCollectionUpdated(clientId, {
        merchantId,
        collectionId: o.collection.id,
        checked,
        total,
        ...(o.coupon ? { couponId: o.coupon.id } : {}),
      });
    } catch (err) {
      this.logger.warn(`Collection WS emit failed: ${errMsg(err)}`);
    }

    const t = getCollectionTexts(o.language);
    const remaining = total - checked;
    let title: string;
    let body: string;
    let data: Record<string, string>;
    if (o.coupon) {
      const delayed = o.coupon.validFrom.getTime() > Date.now();
      title = t.completedTitle(o.merchantName);
      body = t.completedBody(gift, delayed ? formatMoroccoDayMonth(o.coupon.validFrom) : null);
      data = { event: 'collection_completed', action: 'open_coupon', couponId: o.coupon.id, merchantId };
    } else if (remaining === 1) {
      title = t.lastOneTitle(o.merchantName);
      body = t.lastOneBody(gift);
      data = { event: 'collection_progress', action: 'open_card', merchantId };
    } else {
      title = t.progressTitle(o.merchantName, checked, total);
      body = t.progressBody(remaining, gift);
      data = { event: 'collection_progress', action: 'open_card', merchantId };
    }
    this.notifications
      .sendToClient(merchantId, clientId, title, body, data)
      .catch((err) => this.logger.warn(`Collection push failed: ${errMsg(err)}`));
  }
}

function openWhere(now: Date) {
  return { status: 'ACTIVE', OR: [{ endsAt: null }, { endsAt: { gt: now } }] } satisfies Prisma.CollectionWhereInput;
}

/** A finished cycle of a repeatable collection counts as none: the next visit starts a new one. */
function currentOf<T extends { completedAt: Date | null }>(latest: T | null, repeatable: boolean): T | null {
  return latest?.completedAt && repeatable ? null : latest;
}

function clientView(collection: OpenCollection, checks: Check[], completed: boolean, giftCouponId: string | null) {
  const done = new Set(checks.map((c) => c.itemId));
  return {
    id: collection.id,
    name: collection.name,
    giftLabel: collection.giftLabel,
    giftImageUrl: collection.giftImageUrl,
    endsAt: collection.endsAt?.toISOString() ?? null,
    items: collection.items.map((i) => ({ id: i.id, label: i.label, imageUrl: i.imageUrl, checked: done.has(i.id) })),
    checked: checks.length,
    total: collection.items.length,
    completed,
    giftCouponId,
  };
}
