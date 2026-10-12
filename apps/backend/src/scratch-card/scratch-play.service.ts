import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { withRetry } from '../common/utils/retry-transaction.helper';
import { weightedRandomPick } from '../common/utils/weighted-draw';
import { COUPON_PUBLIC_SELECT, CouponService, withCodeRetry } from './coupon.service';

const CARD_SELECT = {
  id: true,
  status: true,
  expiresAt: true,
  scratchedAt: true,
  openedAt: true,
  clientId: true,
  merchantId: true,
  campaign: { select: { id: true, name: true, message: true, designId: true, status: true } },
  coupon: { select: COUPON_PUBLIC_SELECT },
} satisfies Prisma.ScratchCardSelect;

type CardRow = Prisma.ScratchCardGetPayload<{ select: typeof CARD_SELECT }>;

/** Client side of the scratch cards: listing, opening and the draw itself. */
@Injectable()
export class ScratchPlayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly couponService: CouponService,
  ) {}

  private async merchantsById(ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map<string, { id: string; nom: string; logoUrl: string | null }>();
    const rows = await this.prisma.merchant.findMany({
      where: { id: { in: unique } },
      select: { id: true, nom: true, logoUrl: true },
    });
    return new Map(rows.map((m) => [m.id, m]));
  }

  private toDto(card: CardRow, merchant: { id: string; nom: string; logoUrl: string | null } | undefined, now: Date) {
    const cancelled = card.status === 'CANCELLED' || card.campaign.status === 'CANCELLED';
    const status =
      card.status === 'PENDING' && cancelled
        ? 'CANCELLED'
        : card.status === 'PENDING' && card.expiresAt.getTime() <= now.getTime()
          ? 'EXPIRED'
          : card.status;
    return {
      id: card.id,
      status,
      expiresAt: card.expiresAt.toISOString(),
      scratchedAt: card.scratchedAt?.toISOString() ?? null,
      campaign: {
        id: card.campaign.id,
        name: card.campaign.name,
        message: card.campaign.message,
        designId: card.campaign.designId,
      },
      merchant: merchant ?? { id: card.merchantId, nom: '', logoUrl: null },
      coupon: card.coupon ? this.couponService.toDto(card.coupon, {}, now) : null,
    };
  }

  async listCards(clientId: string, status?: 'PENDING' | 'SCRATCHED') {
    const now = new Date();
    const where: Prisma.ScratchCardWhereInput =
      status === 'SCRATCHED'
        ? { clientId, status: 'SCRATCHED' }
        : status === 'PENDING'
          ? { clientId, status: 'PENDING', expiresAt: { gt: now }, campaign: { status: { not: 'CANCELLED' } } }
          : { clientId };
    const cards = await this.prisma.scratchCard.findMany({
      where,
      select: CARD_SELECT,
      orderBy: status === 'PENDING' ? { expiresAt: 'asc' } : { createdAt: 'desc' },
      take: 50,
    });
    const merchants = await this.merchantsById(cards.map((c) => c.merchantId));
    return cards.map((c) => this.toDto(c, merchants.get(c.merchantId), now));
  }

  async getCard(clientId: string, cardId: string) {
    const card = await this.prisma.scratchCard.findFirst({ where: { id: cardId, clientId }, select: CARD_SELECT });
    if (!card) throw new NotFoundException('Carte introuvable');
    const merchants = await this.merchantsById([card.merchantId]);
    return this.toDto(card, merchants.get(card.merchantId), new Date());
  }

  async getCardByCampaign(clientId: string, campaignId: string) {
    const card = await this.prisma.scratchCard.findUnique({
      where: { campaignId_clientId: { campaignId, clientId } },
      select: CARD_SELECT,
    });
    if (!card) throw new NotFoundException('Carte introuvable');
    const merchants = await this.merchantsById([card.merchantId]);
    return this.toDto(card, merchants.get(card.merchantId), new Date());
  }

  async markOpened(clientId: string, cardId: string) {
    await this.prisma.scratchCard.updateMany({
      where: { id: cardId, clientId, openedAt: null },
      data: { openedAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Draws the reward of a card. Idempotent: scratching an already scratched
   * card returns the same coupon (double tap, network retry, app killed).
   */
  async scratch(clientId: string, cardId: string) {
    const couponId = await withCodeRetry(() =>
      withRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            const now = new Date();
            const card = await tx.scratchCard.findFirst({
              where: { id: cardId, clientId },
              select: {
                id: true,
                clientId: true,
                merchantId: true,
                status: true,
                expiresAt: true,
                campaign: { select: { id: true, status: true, couponExpiresAt: true } },
                coupon: { select: { id: true } },
              },
            });
            if (!card) throw new NotFoundException('Carte introuvable');
            if (card.status === 'SCRATCHED' && card.coupon) return card.coupon.id;
            if (card.status === 'CANCELLED' || card.campaign.status === 'CANCELLED') {
              throw new GoneException('Cette campagne a été annulée par le commerçant');
            }
            if (card.status === 'EXPIRED' || card.expiresAt.getTime() <= now.getTime()) {
              throw new GoneException('Cette carte a expiré');
            }

            const claimed = await tx.scratchCard.updateMany({
              where: { id: card.id, clientId, status: 'PENDING', expiresAt: { gt: now } },
              data: { status: 'SCRATCHED', scratchedAt: now },
            });
            if (claimed.count !== 1) throw new GoneException('Cette carte n\'est plus disponible');
            await tx.scratchCard.updateMany({ where: { id: card.id, openedAt: null }, data: { openedAt: now } });

            let candidates = await tx.scratchReward.findMany({
              where: { campaignId: card.campaign.id, OR: [{ remaining: null }, { remaining: { gt: 0 } }] },
            });
            let picked: (typeof candidates)[number] | null = null;
            while (!picked) {
              const pick = weightedRandomPick(candidates);
              if (!pick) break;
              if (pick.remaining == null) {
                picked = pick;
                break;
              }
              const dec = await tx.scratchReward.updateMany({
                where: { id: pick.id, remaining: { gt: 0 } },
                data: { remaining: { decrement: 1 } },
              });
              if (dec.count === 1) picked = pick;
              else candidates = candidates.filter((r) => r.id !== pick.id);
            }
            // Campaigns cannot be scheduled without an unlimited reward, so this
            // only happens on data edited by hand.
            if (!picked) throw new GoneException('Plus aucune récompense disponible pour cette campagne');

            await tx.scratchCard.update({ where: { id: card.id }, data: { rewardId: picked.id } });
            const coupon = await this.couponService.createFromReward(tx, {
              card,
              reward: picked,
              expiresAt: card.campaign.couponExpiresAt,
              now,
            });
            return coupon.id;
          },
          { isolationLevel: 'Serializable' },
        ),
      ),
    );

    return this.getCardWithCoupon(clientId, cardId, couponId);
  }

  private async getCardWithCoupon(clientId: string, cardId: string, couponId: string) {
    const card = await this.getCard(clientId, cardId);
    const coupon = await this.couponService.getClientCoupon(clientId, couponId);
    return { card, coupon };
  }
}
