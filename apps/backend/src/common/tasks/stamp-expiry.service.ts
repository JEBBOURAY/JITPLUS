import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../repositories';
import { NotificationsService } from '../../notifications/notifications.service';
import { STAMP_EXPIRY_REMINDER_DAYS, MS_PER_DAY } from '../constants';
import { getNotifTranslations } from '../utils/notification-i18n';
import { computeStampsExpiry } from '../../merchant/utils/loyalty.utils';
import { cronAllowedOnce } from './cron-utils';


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

/** One reset chunk (UPDATE … RETURNING + createMany of ≤500 rows) per transaction. */
const RESET_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

/**
 * Optional stamp validity (merchant.stampValidityDays): a card whose last visit
 * is older than the validity is reset to 0, and the client gets a push
 * STAMP_EXPIRY_REMINDER_DAYS before that.
 *
 * Cards are handled 500 at a time. Each card is still claimed conditionally
 * (unchanged stamps / lastVisitAt / reminder flag, as read) so a visit made
 * meanwhile wins and a reminder or an expiry is applied once — but one
 * UPDATE … FROM unnest(…) RETURNING claims the whole chunk, and an expired
 * chunk's resets + ADJUST_STAMPS ledger rows commit in one transaction.
 */
@Injectable()
export class StampExpiryService {
  private readonly logger = new Logger(StampExpiryService.name);
  private static readonly BATCH_SIZE = 500;

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private readonly loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_RUNNER) private readonly txRunner: ITransactionRunner,
    @Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 10 * * *') // 10:00 UTC = 11:00 Maroc
  async run(): Promise<void> {
    if (!(await cronAllowedOnce(this.logger, 'StampExpiry.run'))) return;
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

  /** Candidate cards of a merchant, in id order, one page at a time. */
  private async *cardBatches(merchantId: string, lastVisitBefore: Date, extraWhere: Record<string, unknown> = {}) {
    let last: string | undefined;
    while (true) {
      const batch = (await this.loyaltyCardRepo.findMany({
        where: {
          merchantId,
          deactivatedAt: null,
          stamps: { gt: 0 },
          lastVisitAt: { lte: lastVisitBefore },
          client: { deletedAt: null },
          ...extraWhere,
          ...(last ? { id: { gt: last } } : {}),
        },
        select: { id: true, clientId: true, stamps: true, lastVisitAt: true, client: { select: { language: true } } },
        take: StampExpiryService.BATCH_SIZE,
        orderBy: { id: 'asc' },
      })) as ExpiryCard[];
      if (batch.length === 0) return;
      yield batch;
      if (batch.length < StampExpiryService.BATCH_SIZE) return;
      last = batch[batch.length - 1].id;
    }
  }

  private async remindMerchant(merchant: ValidityMerchant, now: Date): Promise<number> {
    const horizon = new Date(now.getTime() + STAMP_EXPIRY_REMINDER_DAYS * MS_PER_DAY);
    const lastVisitBefore = new Date(horizon.getTime() - merchant.stampValidityDays * MS_PER_DAY);
    let count = 0;
    for await (const batch of this.cardBatches(merchant.id, lastVisitBefore, { expiryReminderSentAt: null })) {
      const due: Array<{ card: ExpiryCard; expiresAt: Date }> = [];
      for (const card of batch) {
        const expiresAt = computeStampsExpiry(card.lastVisitAt, merchant.stampValidityDays, merchant.stampValiditySince);
        if (expiresAt && expiresAt > now && expiresAt <= horizon) due.push({ card, expiresAt });
      }
      if (due.length === 0) continue;

      // Claim: only cards still un-reminded with the lastVisitAt we read.
      const claimedRows = await this.rawQuery.queryRaw<{ id: string }>`
        UPDATE loyalty_cards AS lc
        SET expiry_reminder_sent_at = ${now.toISOString()}::timestamp(3),
            updated_at = ${new Date().toISOString()}::timestamp(3)
        FROM unnest(${due.map((d) => d.card.id)}::text[], ${due.map((d) => d.card.lastVisitAt.toISOString())}::text[])
          AS t(id, last_visit_at)
        WHERE lc.id = t.id
          AND lc.expiry_reminder_sent_at IS NULL
          AND lc.last_visit_at = t.last_visit_at::timestamp(3)
        RETURNING lc.id`;
      const claimed = new Set(claimedRows.map((r) => r.id));

      // One batched send per page (bulk inserts, one preferences read).
      await this.notifications.sendToClients(
        merchant.id,
        due.filter((d) => claimed.has(d.card.id)).map(({ card, expiresAt }) => {
          const lang = card.client?.language ?? 'fr';
          const t = getNotifTranslations(lang);
          const date = expiresAt.toLocaleDateString(DATE_LOCALES[lang] ?? 'fr-FR', {
            day: 'numeric',
            month: 'long',
            timeZone: 'Africa/Casablanca',
          });
          return {
            clientId: card.clientId,
            title: t.expiringTitle,
            body: t.expiringBody(card.stamps, t.unitStamps(card.stamps), merchant.nom, date),
            data: { event: 'stamps_expiring', action: 'open_card', merchantId: merchant.id },
          };
        }),
      );
      count += claimed.size;
    }
    return count;
  }

  private async expireMerchant(merchant: ValidityMerchant, now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - merchant.stampValidityDays * MS_PER_DAY);
    if (merchant.stampValiditySince && merchant.stampValiditySince > cutoff) return 0;
    let count = 0;
    for await (const batch of this.cardBatches(merchant.id, cutoff)) {
      const byId = new Map(batch.map((c) => [c.id, c]));
      count += await this.txRunner.run(async (tx) => {
        // A visit or an adjustment since the read changes stamps/lastVisitAt: that card is skipped.
        const reset = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE loyalty_cards AS lc
          SET stamps = 0,
              expiry_reminder_sent_at = NULL,
              updated_at = ${new Date().toISOString()}::timestamp(3)
          FROM unnest(
            ${batch.map((c) => c.id)}::text[],
            ${batch.map((c) => c.stamps)}::int[],
            ${batch.map((c) => c.lastVisitAt.toISOString())}::text[]
          ) AS t(id, stamps, last_visit_at)
          WHERE lc.id = t.id
            AND lc.stamps = t.stamps
            AND lc.last_visit_at = t.last_visit_at::timestamp(3)
          RETURNING lc.id`;
        if (reset.length === 0) return 0;
        await tx.transaction.createMany({
          data: reset.map(({ id }) => {
            const card = byId.get(id)!;
            return {
              clientId: card.clientId,
              merchantId: merchant.id,
              type: 'ADJUST_STAMPS' as const,
              amount: 0,
              stamps: -card.stamps,
              note: getNotifTranslations(card.client?.language).expiredNote(merchant.stampValidityDays),
            };
          }),
        });
        return reset.length;
      }, RESET_TX_OPTIONS);
    }
    return count;
  }
}
