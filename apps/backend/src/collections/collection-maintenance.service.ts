import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { IStorageProvider, STORAGE_PROVIDER } from '../common/interfaces';
import { deleteOwnedFiles } from '../storage/image-ownership';
import { cronEnabledOnce } from '../common/tasks/cron-utils';
import { errMsg } from '../common/utils';

const BATCH = 200;
const MAX_ROUNDS = 20;

/**
 * End of a collection: the ENDED status once the end date has passed, and the
 * removal of the product photos, which are only kept while the collection can
 * still be shown. Ending by hand goes through the same purge.
 */
@Injectable()
export class CollectionMaintenanceService {
  private readonly logger = new Logger(CollectionMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  @Cron('*/15 * * * *', { name: 'collections-maintenance' })
  async everyQuarter() {
    if (!(await cronEnabledOnce(this.logger, 'CollectionMaintenance.everyQuarter'))) return;
    try {
      const ended = await this.expire();
      const photos = await this.purgePhotos();
      if (ended || photos) this.logger.log(`[collections] ${ended} ended, ${photos} photo(s) removed`);
    } catch (err) {
      this.logger.error(`[collections] maintenance failed: ${errMsg(err)}`);
    }
  }

  /** ACTIVE collections past their end date become ENDED. */
  async expire(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.collection.updateMany({
      where: { status: 'ACTIVE', endsAt: { lte: now } },
      data: { status: 'ENDED', endedAt: now },
    });
    return count;
  }

  /**
   * Deletes the photos of ended collections, products and gift (all merchants,
   * or one). The column is cleared first: a failed file deletion leaves an
   * orphan file, never a link to a missing image.
   */
  async purgePhotos(merchantId?: string): Promise<number> {
    let removed = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const items = await this.prisma.collectionItem.findMany({
        where: { imageUrl: { not: null }, collection: { status: 'ENDED', ...(merchantId ? { merchantId } : {}) } },
        select: { id: true, imageUrl: true, collection: { select: { merchantId: true } } },
        take: BATCH,
      });
      if (items.length === 0) break;
      await this.prisma.collectionItem.updateMany({
        where: { id: { in: items.map((i) => i.id) } },
        data: { imageUrl: null },
      });
      for (const item of items) deleteOwnedFiles(this.storage, item.collection.merchantId, [item.imageUrl]);
      removed += items.length;
      if (items.length < BATCH) break;
    }
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const gifts = await this.prisma.collection.findMany({
        where: { status: 'ENDED', giftImageUrl: { not: null }, ...(merchantId ? { merchantId } : {}) },
        select: { id: true, merchantId: true, giftImageUrl: true },
        take: BATCH,
      });
      if (gifts.length === 0) break;
      await this.prisma.collection.updateMany({
        where: { id: { in: gifts.map((g) => g.id) } },
        data: { giftImageUrl: null },
      });
      for (const gift of gifts) deleteOwnedFiles(this.storage, gift.merchantId, [gift.giftImageUrl]);
      removed += gifts.length;
      if (gifts.length < BATCH) break;
    }
    return removed;
  }
}
