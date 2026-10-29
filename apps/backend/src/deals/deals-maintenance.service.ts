import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { IStorageProvider, STORAGE_PROVIDER } from '../common/interfaces';
import { deleteOwnedFiles } from '../storage/image-ownership';
import { isCronEnabled } from '../common/tasks/cron-utils';
import { MOROCCO_TZ } from '../common/utils/morocco-time';
import { errMsg } from '../common/utils';
import { MerchantInboxService } from '../merchant-inbox/merchant-inbox.service';
import {
  DEAL_DIGEST_AUDIENCE,
  DEAL_DIGEST_RETENTION_DAYS,
  DEAL_POPULAR_MIN_VIEWS,
  DEAL_POPULAR_TOP_SHARE,
  DEAL_PURGE_AFTER_DAYS,
} from './deal-limits';
import { dealEndedTexts } from './deal-notif-i18n';
import { cityKeysOf, isDealImage } from './deals-merchant.service';

const BATCH = 200;
const MAX_ROUNDS = 20;
const CITY_KEYS_BATCH = 1000;

/**
 * Deals disappear from the apps at endsAt through the query filters; this job
 * only does the bookkeeping: ENDED status + merchant summary, the "popular"
 * flag, and the purge of old rows and images.
 */
@Injectable()
export class DealsMaintenanceService {
  private readonly logger = new Logger(DealsMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: MerchantInboxService,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  @Cron('*/15 * * * *', { name: 'deals-maintenance' })
  async everyQuarter() {
    if (!isCronEnabled(this.logger, 'DealsMaintenance.everyQuarter')) return;
    await this.run('expire', () => this.expire());
    await this.run('popular', () => this.refreshPopular());
  }

  @Cron('30 3 * * *', { name: 'deals-purge', timeZone: MOROCCO_TZ })
  async nightly() {
    if (!isCronEnabled(this.logger, 'DealsMaintenance.nightly')) return;
    await this.run('purge', () => this.purge());
    await this.run('city-keys', () => this.refreshCityKeys());
    await this.run('digest-entries', () => this.purgeDigestEntries());
  }

  private async run(name: string, job: () => Promise<number>) {
    try {
      const count = await job();
      if (count > 0) this.logger.log(`[deals:${name}] ${count} row(s)`);
    } catch (err) {
      this.logger.error(`[deals:${name}] failed: ${errMsg(err)}`);
    }
  }

  async expire(now: Date = new Date()): Promise<number> {
    let ended = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const due = await this.prisma.deal.findMany({
        where: { status: 'ACTIVE', endsAt: { lte: now } },
        select: {
          id: true,
          merchantId: true,
          title: true,
          viewCount: true,
          linkClickCount: true,
          directionsCount: true,
          merchant: { select: { language: true } },
        },
        orderBy: { endsAt: 'asc' },
        take: BATCH,
      });
      for (const d of due) {
        // The status condition makes the transition (and its inbox entry) happen once across instances.
        const { count } = await this.prisma.deal.updateMany({
          where: { id: d.id, status: 'ACTIVE' },
          data: { status: 'ENDED', endedReason: 'EXPIRED' },
        });
        if (count !== 1) continue;
        ended++;
        const msg = dealEndedTexts(d.merchant.language, d.title, d.viewCount, d.linkClickCount + d.directionsCount);
        await this.inbox.record(d.merchantId, { category: 'ACTIVITY', title: msg.title, body: msg.body, action: 'open_deals' });
      }
      if (due.length < BATCH) break;
    }
    return ended;
  }

  /**
   * "🔥 Populaire": top share of the live deals of each city (ONLINE deals form
   * one group), ranked by engagement per hour since the start, a cheap stand-in
   * for a rolling 48 h window that needs no event table.
   */
  async refreshPopular(): Promise<number> {
    const cleared = await this.prisma.$executeRaw`
      UPDATE deals SET is_popular = false
      WHERE is_popular = true AND (status <> 'ACTIVE' OR ends_at <= NOW())`;
    const updated = await this.prisma.$executeRaw`
      WITH scored AS (
        SELECT id, view_count,
          (view_count + 3 * (link_click_count + directions_count + share_count))::float
            / GREATEST(6, EXTRACT(EPOCH FROM (NOW() - starts_at)) / 3600) AS score,
          CASE WHEN scope = 'ONLINE' THEN '#online' ELSE COALESCE(city_keys[1], '#none') END AS grp
        FROM deals
        WHERE status = 'ACTIVE' AND starts_at <= NOW() AND ends_at > NOW()
      ), ranked AS (
        SELECT id,
          (PERCENT_RANK() OVER (PARTITION BY grp ORDER BY score DESC) < ${DEAL_POPULAR_TOP_SHARE}
            AND view_count >= ${DEAL_POPULAR_MIN_VIEWS}) AS popular
        FROM scored
      )
      UPDATE deals d SET is_popular = r.popular
      FROM ranked r
      WHERE d.id = r.id AND d.is_popular IS DISTINCT FROM r.popular`;
    return cleared + updated;
  }

  async purge(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - DEAL_PURGE_AFTER_DAYS * 86_400_000);
    let purged = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const rows = await this.prisma.deal.findMany({
        where: {
          status: { not: 'ACTIVE' },
          OR: [{ endsAt: { lt: cutoff } }, { status: { in: ['REMOVED', 'DELETED'] }, updatedAt: { lt: cutoff } }],
        },
        select: { id: true, merchantId: true, imageUrl: true },
        take: BATCH,
      });
      if (rows.length === 0) break;
      await this.prisma.deal.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      purged += rows.length;

      const images = rows.filter((r) => r.imageUrl && isDealImage(r.imageUrl, r.merchantId));
      for (const r of images) {
        // A duplicated deal may still use the same file.
        const stillUsed = await this.prisma.deal.count({ where: { merchantId: r.merchantId, imageUrl: r.imageUrl } });
        if (stillUsed === 0) deleteOwnedFiles(this.storage, r.merchantId, [r.imageUrl]);
      }
      if (rows.length < BATCH) break;
    }
    return purged;
  }

  /** In-app digest entries (their client statuses cascade). */
  async purgeDigestEntries(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.notification.deleteMany({
      where: { audience: DEAL_DIGEST_AUDIENCE, createdAt: { lt: new Date(now.getTime() - DEAL_DIGEST_RETENTION_DAYS * 86_400_000) } },
    });
    return count;
  }

  /** Deals on "all stores" follow the stores opened, moved or closed since they were published. */
  async refreshCityKeys(): Promise<number> {
    let changed = 0;
    let cursor: string | undefined;
    for (;;) {
      const deals = await this.prisma.deal.findMany({
        where: { status: 'ACTIVE', scope: 'LOCAL', allStores: true },
        select: { id: true, merchantId: true, cityKeys: true },
        orderBy: { id: 'asc' },
        take: CITY_KEYS_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (deals.length === 0) break;
      cursor = deals[deals.length - 1].id;

      const stores = await this.prisma.store.findMany({
        where: { merchantId: { in: [...new Set(deals.map((d) => d.merchantId))] }, isActive: true },
        select: { id: true, merchantId: true, ville: true, latitude: true, longitude: true },
      });
      const byMerchant = new Map<string, typeof stores>();
      for (const s of stores) {
        const list = byMerchant.get(s.merchantId);
        if (list) list.push(s);
        else byMerchant.set(s.merchantId, [s]);
      }

      for (const d of deals) {
        const keys = cityKeysOf(byMerchant.get(d.merchantId) ?? []);
        const same = keys.length === d.cityKeys.length && keys.every((k) => d.cityKeys.includes(k));
        if (same) continue;
        await this.prisma.deal.update({ where: { id: d.id }, data: { cityKeys: keys } });
        changed++;
      }
      if (deals.length < CITY_KEYS_BATCH) break;
    }
    return changed;
  }
}
