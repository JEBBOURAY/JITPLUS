import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { errMsg } from '../common/utils';
import { isCronAllowed, isCronEnabled } from '../common/tasks/cron-utils';
import { formatMoroccoDayMonth } from '../common/utils/morocco-time';
import { ScratchPushService } from './scratch-push.service';
import { getScratchTexts } from './scratch-notif-i18n';
import { COUPON_REMINDER_HOURS, SCRATCH_CARD_REMINDER_HOURS } from './scratch-limits';

const HOUR_MS = 3_600_000;
const BATCH = 200;

/**
 * Daily reminders (coupon about to expire, card not scratched yet) and status
 * housekeeping (EXPIRED cards / coupons, ENDED campaigns). Reads never rely on
 * this cron: an `expiresAt` in the past is always treated as expired.
 */
@Injectable()
export class ScratchReminderService {
  private readonly logger = new Logger(ScratchReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: ScratchPushService,
  ) {}

  @Cron('0 10 * * *') // 10:00 UTC = 11:00 Morocco (10:00 during Ramadan)
  async sendReminders(): Promise<void> {
    if (!isCronAllowed(this.logger, 'ScratchReminder.sendReminders')) return;
    try {
      const coupons = await this.remindCoupons();
      const cards = await this.remindCards();
      this.logger.log(`Scratch reminders sent: ${coupons} coupon(s), ${cards} card(s)`);
    } catch (err) {
      this.logger.error(`Scratch reminders failed: ${errMsg(err)}`);
    }
  }

  @Cron('5 * * * *')
  async expire(): Promise<void> {
    if (!isCronEnabled(this.logger, 'ScratchReminder.expire')) return;
    try {
      const now = new Date();
      const cards = await this.prisma.scratchCard.updateMany({
        where: { status: 'PENDING', expiresAt: { lte: now } },
        data: { status: 'EXPIRED' },
      });
      const coupons = await this.prisma.coupon.updateMany({
        where: { status: 'ACTIVE', expiresAt: { lte: now } },
        data: { status: 'EXPIRED' },
      });
      const campaigns = await this.prisma.scratchCampaign.updateMany({
        where: { status: 'SENT', couponExpiresAt: { lte: now } },
        data: { status: 'ENDED' },
      });
      if (cards.count || coupons.count || campaigns.count) {
        this.logger.log(`Scratch expiry: ${cards.count} card(s), ${coupons.count} coupon(s), ${campaigns.count} campaign(s)`);
      }
    } catch (err) {
      this.logger.error(`Scratch expiry failed: ${errMsg(err)}`);
    }
  }

  private async remindCoupons(): Promise<number> {
    let sent = 0;
    for (;;) {
      const now = new Date();
      const due = await this.prisma.coupon.findMany({
        where: {
          status: 'ACTIVE',
          reminderSentAt: null,
          validFrom: { lte: now },
          expiresAt: { gt: now, lte: new Date(now.getTime() + COUPON_REMINDER_HOURS * HOUR_MS) },
          client: { deletedAt: null },
          merchant: { deletedAt: null, isActive: true },
        },
        select: { id: true },
        take: BATCH,
      });
      if (due.length === 0) return sent;
      const ids = due.map((d) => d.id);
      await this.prisma.coupon.updateMany({ where: { id: { in: ids }, reminderSentAt: null }, data: { reminderSentAt: now } });
      const claimed = await this.prisma.coupon.findMany({
        where: { id: { in: ids }, reminderSentAt: now },
        select: {
          id: true,
          label: true,
          expiresAt: true,
          merchant: { select: { id: true, nom: true, logoUrl: true } },
          client: { select: { id: true, language: true, pushToken: true, notifPush: true } },
        },
      });
      const blocked = await this.blockedPairs(claimed.map((c) => ({ clientId: c.client.id, merchantId: c.merchant.id })));
      for (const c of claimed) {
        if (blocked.has(`${c.client.id}:${c.merchant.id}`)) continue;
        const date = formatMoroccoDayMonth(c.expiresAt);
        sent += await this.push.send(
          c.merchant,
          [{ clientId: c.client.id, language: c.client.language, pushToken: c.client.pushToken, notifPush: c.client.notifPush }],
          (r) => {
            const t = getScratchTexts(r.language);
            return { title: t.couponExpiringTitle, body: t.couponExpiringBody(c.label, c.merchant.nom, date) };
          },
          { event: 'coupon_expiring', action: 'open_coupon', couponId: c.id, merchantId: c.merchant.id },
        );
      }
      if (due.length < BATCH) return sent;
    }
  }

  private async remindCards(): Promise<number> {
    let sent = 0;
    for (;;) {
      const now = new Date();
      const due = await this.prisma.scratchCard.findMany({
        where: {
          status: 'PENDING',
          reminderSentAt: null,
          pushSentAt: { not: null },
          campaign: { status: { in: ['SENT', 'SENDING'] }, merchant: { deletedAt: null, isActive: true } },
          client: { isAnonymous: false, deletedAt: null },
          expiresAt: { gt: now, lte: new Date(now.getTime() + SCRATCH_CARD_REMINDER_HOURS * HOUR_MS) },
        },
        select: { id: true },
        take: BATCH,
      });
      if (due.length === 0) return sent;
      const ids = due.map((d) => d.id);
      await this.prisma.scratchCard.updateMany({ where: { id: { in: ids }, reminderSentAt: null }, data: { reminderSentAt: now } });
      const claimed = await this.prisma.scratchCard.findMany({
        where: { id: { in: ids }, reminderSentAt: now },
        select: {
          id: true,
          expiresAt: true,
          campaignId: true,
          campaign: { select: { merchant: { select: { id: true, nom: true, logoUrl: true } } } },
          client: { select: { id: true, language: true, pushToken: true, notifPush: true } },
        },
      });
      const blocked = await this.blockedPairs(
        claimed.map((c) => ({ clientId: c.client.id, merchantId: c.campaign.merchant.id })),
      );
      for (const card of claimed) {
        const merchant = card.campaign.merchant;
        if (blocked.has(`${card.client.id}:${merchant.id}`)) continue;
        const date = formatMoroccoDayMonth(card.expiresAt);
        sent += await this.push.send(
          merchant,
          [{ clientId: card.client.id, language: card.client.language, pushToken: card.client.pushToken, notifPush: card.client.notifPush }],
          (r) => {
            const t = getScratchTexts(r.language);
            return { title: t.cardExpiringTitle, body: t.cardExpiringBody(merchant.nom, date) };
          },
          { event: 'scratch_card_expiring', action: 'open_scratch', cardId: card.id, campaignId: card.campaignId, merchantId: merchant.id },
          { inApp: false },
        );
      }
      if (due.length < BATCH) return sent;
    }
  }

  /**
   * `clientId:merchantId` pairs where the client blocked the merchant. Prisma
   * cannot correlate the two ids inside a relation filter, so this is checked
   * after the claim (a blocked reminder is simply never sent).
   */
  private async blockedPairs(pairs: { clientId: string; merchantId: string }[]): Promise<Set<string>> {
    if (pairs.length === 0) return new Set();
    const blocks = await this.prisma.clientMerchantBlock.findMany({
      where: { OR: pairs },
      select: { clientId: true, merchantId: true },
    });
    return new Set(blocks.map((b) => `${b.clientId}:${b.merchantId}`));
  }
}
