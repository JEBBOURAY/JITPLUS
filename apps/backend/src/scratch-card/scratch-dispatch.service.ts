import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { EventsGateway } from '../events';
import { errMsg } from '../common/utils';
import { isCronEnabled, isQuietHours } from '../common/tasks/cron-utils';
import { buildAudienceWhere } from './scratch-audience';
import { ScratchPushService } from './scratch-push.service';
import { getScratchTexts } from './scratch-notif-i18n';
import { SCRATCH_SENDING_LOCK_MS, scratchDispatchForced, scratchQuietHoursIgnored } from './scratch-limits';
import type { ScratchAudienceTypeValue } from './dto';

const BATCH_SIZE = 500;

/**
 * Sends scheduled scratch-card campaigns. Runs every minute on every instance:
 * a conditional updateMany (SCHEDULED → SENDING) makes sure only one instance
 * handles a campaign; a SENDING lock older than SCRATCH_SENDING_LOCK_MS is
 * considered dead and retaken (cards use skipDuplicates, pushes are claimed
 * per card through pushSentAt, so resuming is safe). "Send now" campaigns
 * are claimed by ScratchCampaignService.schedule and dispatched immediately.
 */
@Injectable()
export class ScratchDispatchService {
  private readonly logger = new Logger(ScratchDispatchService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planService: MerchantPlanService,
    private readonly push: ScratchPushService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Cron('* * * * *')
  async tick(): Promise<void> {
    if (this.running) return;
    if (!scratchDispatchForced() && !isCronEnabled(this.logger, 'ScratchDispatch.tick')) return;
    this.running = true;
    try {
      const now = new Date();
      // Planned sends are already outside quiet hours; this only holds back
      // overdue ones (backend down at the planned time). An interrupted
      // send (SENDING) was started on purpose and is always resumed.
      const holdScheduled = !scratchQuietHoursIgnored() && isQuietHours(now);
      const due = await this.prisma.scratchCampaign.findMany({
        where: {
          OR: [
            ...(holdScheduled ? [] : [{ status: 'SCHEDULED' as const, sendAt: { lte: now } }]),
            { status: 'SENDING', sendingLockedAt: { lt: new Date(now.getTime() - SCRATCH_SENDING_LOCK_MS) } },
          ],
        },
        select: { id: true, status: true, sendingLockedAt: true },
        take: 5,
        orderBy: { sendAt: 'asc' },
      });
      for (const c of due) {
        const claimed = await this.prisma.scratchCampaign.updateMany({
          where:
            c.status === 'SCHEDULED'
              ? { id: c.id, status: 'SCHEDULED', sendAt: { lte: now } }
              : { id: c.id, status: 'SENDING', sendingLockedAt: c.sendingLockedAt },
          data: { status: 'SENDING', sendingLockedAt: new Date() },
        });
        if (claimed.count !== 1) continue;
        await this.dispatch(c.id).catch((err) => this.logger.error(`Dispatch of ${c.id} failed: ${errMsg(err)}`));
      }
    } finally {
      this.running = false;
    }
  }

  async dispatch(campaignId: string): Promise<void> {
    const campaign = await this.prisma.scratchCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        merchantId: true,
        name: true,
        status: true,
        message: true,
        audienceType: true,
        audienceValue: true,
        sentAt: true,
        merchant: { select: { id: true, nom: true, logoUrl: true, isActive: true, deletedAt: true, pushToken: true, language: true } },
      },
    });
    if (!campaign || campaign.status !== 'SENDING') return;
    const merchant = campaign.merchant;

    const merchantActive = merchant.isActive && !merchant.deletedAt;
    const premium = merchantActive && (await this.planService.isPremium(merchant.id));
    if (!premium) {
      if (campaign.sentAt) {
        // Cards (and maybe coupons) already exist: going back to DRAFT would
        // make them editable / deletable, so close the send with what exists.
        await this.finish(campaignId, 0);
        this.logger.warn(`Scratch campaign ${campaignId} stopped mid-send: merchant not eligible (plan / status)`);
        return;
      }
      const reverted = await this.prisma.scratchCampaign.updateMany({
        where: { id: campaignId, status: 'SENDING' },
        data: { status: 'DRAFT', sendAt: null, sendingLockedAt: null },
      });
      this.logger.warn(`Scratch campaign ${campaignId} reverted to DRAFT: merchant not eligible (plan / status)`);
      if (reverted.count === 1 && merchantActive) {
        const t = getScratchTexts(merchant.language);
        await this.push.sendToMerchant(
          merchant,
          { title: t.campaignNotSentTitle, body: t.campaignNotSentBody(campaign.name) },
          { event: 'scratch_campaign_not_sent', action: 'open_plan', campaignId },
        );
      }
      return;
    }

    const startedAt = campaign.sentAt ?? new Date();
    if (!campaign.sentAt) {
      await this.prisma.scratchCampaign.update({ where: { id: campaignId }, data: { sentAt: startedAt } });
    }

    const where = buildAudienceWhere(
      merchant.id,
      campaign.audienceType as ScratchAudienceTypeValue,
      campaign.audienceValue,
      startedAt,
    );

    const inAppRows = new Map<string, string>();
    let cursor: string | undefined;
    let pushSuccess = 0;
    for (;;) {
      const batch = await this.prisma.loyaltyCard.findMany({
        where,
        select: { id: true, clientId: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;

      // Stop between batches when the merchant cancelled the campaign meanwhile.
      const locked = await this.prisma.scratchCampaign.updateMany({
        where: { id: campaignId, status: 'SENDING' },
        data: { sendingLockedAt: new Date() },
      });
      if (locked.count !== 1) {
        this.logger.log(`Scratch campaign ${campaignId} stopped during dispatch`);
        return;
      }
      // Re-read every batch: the dates can be extended while sending.
      const { cardExpiresAt } = await this.prisma.scratchCampaign.findUniqueOrThrow({
        where: { id: campaignId },
        select: { cardExpiresAt: true },
      });

      const clientIds = batch.map((b) => b.clientId);
      await this.prisma.scratchCard.createMany({
        data: clientIds.map((clientId) => ({ campaignId, clientId, merchantId: merchant.id, expiresAt: cardExpiresAt })),
        skipDuplicates: true,
      });

      // A cancellation committed between the lock refresh and createMany
      // would leave these new cards PENDING on a cancelled campaign.
      const current = await this.prisma.scratchCampaign.findUnique({
        where: { id: campaignId },
        select: { status: true, cardExpiresAt: true },
      });
      if (current && current.cardExpiresAt.getTime() !== cardExpiresAt.getTime()) {
        await this.prisma.scratchCard.updateMany({
          where: { campaignId, clientId: { in: clientIds }, status: 'PENDING' },
          data: { expiresAt: current.cardExpiresAt },
        });
      }
      if (current?.status !== 'SENDING') {
        if (current?.status === 'CANCELLED') {
          await this.prisma.scratchCard.updateMany({
            where: { campaignId, status: 'PENDING' },
            data: { status: 'CANCELLED' },
          });
        }
        this.logger.log(`Scratch campaign ${campaignId} stopped during dispatch (status ${current?.status})`);
        return;
      }

      pushSuccess += await this.pushBatch(campaign, clientIds, inAppRows);
      if (batch.length < BATCH_SIZE) break;
    }

    // Cards created by an instance that died before claiming their push
    // (they may no longer match the audience filter, so the loop above can miss them).
    pushSuccess += await this.pushBatch(campaign, null, inAppRows);
    await this.finish(campaignId, pushSuccess);
  }

  private async finish(campaignId: string, pushSuccess: number): Promise<void> {
    const recipientCount = await this.prisma.scratchCard.count({ where: { campaignId } });
    const totals = await this.prisma.scratchCampaign.updateMany({
      where: { id: campaignId, status: 'SENDING' },
      data: {
        status: 'SENT',
        sendingLockedAt: null,
        recipientCount,
        pushSuccessCount: { increment: pushSuccess },
      },
    });
    if (totals.count === 1) {
      this.logger.log(`Scratch campaign ${campaignId} sent to ${recipientCount} client(s), ${pushSuccess} push(es)`);
    }
  }

  /**
   * Claims the cards of `clientIds` (or every card of the campaign when null)
   * that have not been pushed yet, then sends the push and records it.
   * Delivery is at most once: the claim (pushSentAt) is written before the
   * push, so a card whose instance dies in between never gets its push.
   */
  private async pushBatch(
    campaign: { id: string; message: string | null; merchant: { id: string; nom: string; logoUrl: string | null } },
    clientIds: string[] | null,
    inAppRows: Map<string, string>,
  ): Promise<number> {
    let total = 0;
    for (;;) {
      const cards = await this.prisma.scratchCard.findMany({
        where: { campaignId: campaign.id, pushSentAt: null, status: 'PENDING', ...(clientIds ? { clientId: { in: clientIds } } : {}) },
        select: { id: true },
        take: BATCH_SIZE,
      });
      if (cards.length === 0) return total;
      const ids = cards.map((c) => c.id);
      const now = new Date();
      await this.prisma.scratchCard.updateMany({ where: { id: { in: ids }, pushSentAt: null }, data: { pushSentAt: now } });
      const claimed = await this.prisma.scratchCard.findMany({
        where: { id: { in: ids }, pushSentAt: now },
        select: {
          client: { select: { id: true, language: true, pushToken: true, notifPush: true, isAnonymous: true } },
        },
      });
      const recipients = claimed.map((c) => ({
        clientId: c.client.id,
        language: c.client.language,
        pushToken: c.client.isAnonymous ? null : c.client.pushToken,
        notifPush: c.client.notifPush,
      }));
      total += await this.push.send(
        campaign.merchant,
        recipients,
        (r) => {
          const t = getScratchTexts(r.language);
          return { title: t.cardReceivedTitle(campaign.merchant.nom), body: t.cardReceivedBody(campaign.message) };
        },
        { event: 'scratch_card_received', action: 'open_scratch', campaignId: campaign.id, merchantId: campaign.merchant.id },
        { inAppRows },
      );
      this.eventsGateway.emitScratchCardsChanged(recipients.map((r) => r.clientId), {
        merchantId: campaign.merchant.id,
        reason: 'received',
      });
      if (clientIds || cards.length < BATCH_SIZE) return total;
    }
  }
}
