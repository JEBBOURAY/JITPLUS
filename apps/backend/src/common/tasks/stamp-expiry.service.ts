import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../repositories';
import { NotificationsService } from '../../notifications/notifications.service';
import { STAMP_EXPIRY_REMINDER_DAYS } from '../constants';
import { getNotifTranslations } from '../utils/notification-i18n';
import { computeStampsExpiry } from '../../merchant/utils/loyalty.utils';
import { isCronAllowed } from './cron-utils';

const DAY_MS = 86_400_000;

const DATE_LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' };

interface ValidityMerchant {
  id: string;
  nom: string;
  stampValidityDays: number;
  stampValiditySince: Date | null;
}

interface ExpiryCard {
  id: string;
  clientId: string;
  stamps: number;
  lastVisitAt: Date;
  client: { language: string | null } | null;
}

/**
 * Optional stamp validity (merchant.stampValidityDays): a card whose last visit
 * is older than the validity is reset to 0, and the client gets a push
 * STAMP_EXPIRY_REMINDER_DAYS before that.
 *
 * Every Cloud Run instance runs this cron: each card is claimed with a
 * conditional updateMany (count === 1) so a reminder or an expiry is applied once.
 */
@Injectable()
export class StampExpiryService {
  private readonly logger = new Logger(StampExpiryService.name);
  private static readonly BATCH_SIZE = 500;

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private readonly loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_RUNNER) private readonly txRunner: ITransactionRunner,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 10 * * *') // 10:00 UTC = 11:00 Maroc
  async run(): Promise<void> {
    if (!isCronAllowed(this.logger, 'StampExpiry.run')) return;
    await this.process(new Date());
  }

  async process(now: Date): Promise<{ reminded: number; expired: number }> {
    let reminded = 0;
    let expired = 0;
    const merchants = (await this.merchantRepo.findMany({
      where: { stampValidityDays: { not: null }, deletedAt: null, isActive: true },
      select: { id: true, nom: true, stampValidityDays: true, stampValiditySince: true },
    })) as ValidityMerchant[];

    for (const merchant of merchants) {
      try {
        reminded += await this.remindMerchant(merchant, now);
        expired += await this.expireMerchant(merchant, now);
      } catch (err) {
        this.logger.error(`Stamp expiry failed for merchant ${merchant.id}: ${err}`);
      }
    }
    if (reminded || expired) {
      this.logger.log(`Stamp expiry: ${reminded} reminder(s), ${expired} card(s) reset`);
    }
    return { reminded, expired };
  }

  private async *cards(merchantId: string, lastVisitBefore: Date, extraWhere: Record<string, unknown> = {}) {
    let cursor: string | undefined;
    while (true) {
      const batch = (await this.loyaltyCardRepo.findMany({
        where: {
          merchantId,
          deactivatedAt: null,
          stamps: { gt: 0 },
          lastVisitAt: { lte: lastVisitBefore },
          client: { deletedAt: null },
          ...extraWhere,
        },
        select: { id: true, clientId: true, stamps: true, lastVisitAt: true, client: { select: { language: true } } },
        take: StampExpiryService.BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      })) as ExpiryCard[];
      if (batch.length === 0) return;
      yield* batch;
      if (batch.length < StampExpiryService.BATCH_SIZE) return;
      cursor = batch[batch.length - 1].id;
    }
  }

  private async remindMerchant(merchant: ValidityMerchant, now: Date): Promise<number> {
    const horizon = new Date(now.getTime() + STAMP_EXPIRY_REMINDER_DAYS * DAY_MS);
    const lastVisitBefore = new Date(horizon.getTime() - merchant.stampValidityDays * DAY_MS);
    let count = 0;
    for await (const card of this.cards(merchant.id, lastVisitBefore, { expiryReminderSentAt: null })) {
      const expiresAt = computeStampsExpiry(card.lastVisitAt, merchant.stampValidityDays, merchant.stampValiditySince);
      if (!expiresAt || expiresAt <= now || expiresAt > horizon) continue;

      const claimed = await this.loyaltyCardRepo.updateMany({
        where: { id: card.id, expiryReminderSentAt: null, lastVisitAt: card.lastVisitAt },
        data: { expiryReminderSentAt: now },
      });
      if (claimed.count !== 1) continue;

      const lang = card.client?.language ?? 'fr';
      const t = getNotifTranslations(lang);
      const date = expiresAt.toLocaleDateString(DATE_LOCALES[lang] ?? 'fr-FR', {
        day: 'numeric',
        month: 'long',
        timeZone: 'Africa/Casablanca',
      });
      await this.notifications.sendToClient(
        merchant.id,
        card.clientId,
        t.expiringTitle,
        t.expiringBody(card.stamps, t.unitStamps(card.stamps), merchant.nom, date),
        { event: 'stamps_expiring', action: 'open_card', merchantId: merchant.id },
      );
      count++;
    }
    return count;
  }

  private async expireMerchant(merchant: ValidityMerchant, now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - merchant.stampValidityDays * DAY_MS);
    if (merchant.stampValiditySince && merchant.stampValiditySince > cutoff) return 0;
    let count = 0;
    for await (const card of this.cards(merchant.id, cutoff)) {
      const t = getNotifTranslations(card.client?.language);
      const reset = await this.txRunner.run(async (tx) => {
        // A visit or an adjustment since the read changes stamps/lastVisitAt: skip.
        const updated = await tx.loyaltyCard.updateMany({
          where: { id: card.id, stamps: card.stamps, lastVisitAt: card.lastVisitAt },
          data: { stamps: 0, expiryReminderSentAt: null },
        });
        if (updated.count !== 1) return false;
        await tx.transaction.create({
          data: {
            clientId: card.clientId,
            merchantId: merchant.id,
            type: 'ADJUST_STAMPS',
            amount: 0,
            stamps: -card.stamps,
            note: t.expiredNote(merchant.stampValidityDays),
          },
        });
        return true;
      });
      if (reset) count++;
    }
    return count;
  }
}
