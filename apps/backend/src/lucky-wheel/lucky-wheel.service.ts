import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { randomBytes, randomInt } from 'crypto';
import {
  LUCKY_WHEEL_CAMPAIGN_REPOSITORY,
  LUCKY_WHEEL_PRIZE_REPOSITORY,
  LUCKY_WHEEL_TICKET_REPOSITORY,
  LUCKY_WHEEL_DRAW_REPOSITORY,
} from '../common/repositories/repository.tokens';
import type {
  ILuckyWheelCampaignRepository,
  ILuckyWheelPrizeRepository,
  ILuckyWheelTicketRepository,
  ILuckyWheelDrawRepository,
} from '../common/repositories/repository.types';
import { withRetry } from '../common/utils/retry-transaction.helper';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LuckyWheelService {
  private readonly logger = new Logger(LuckyWheelService.name);

  constructor(
    @Inject(LUCKY_WHEEL_CAMPAIGN_REPOSITORY) private campaignRepo: ILuckyWheelCampaignRepository,
    @Inject(LUCKY_WHEEL_PRIZE_REPOSITORY) private prizeRepo: ILuckyWheelPrizeRepository,
    @Inject(LUCKY_WHEEL_TICKET_REPOSITORY) private ticketRepo: ILuckyWheelTicketRepository,
    @Inject(LUCKY_WHEEL_DRAW_REPOSITORY) private drawRepo: ILuckyWheelDrawRepository,
    private prisma: PrismaService,
  ) {}

  // ── Merchant: CRUD Campaigns ───────────────────────────────

  async createCampaign(merchantId: string, data: {
    name: string;
    description?: string;
    globalWinRate: number;
    startsAt: Date;
    endsAt: Date;
    // STORE COMPLIANCE: ticketCostPoints is in loyalty points earned through
    // visits / scans only. Points MUST NEVER become purchasable with real
    // money (no IAP, no card). Introducing paid points would turn the wheel
    // into real-money gambling and violate Apple 5.3 / Google Play Real-Money
    // Gambling policies.
    ticketCostPoints?: number;
    ticketEveryNVisits?: number;
    minSpendAmount?: number;
    prizes: { label: string; description?: string; weight: number; totalStock: number; claimWindowHours?: number }[];
  }) {
    if (data.globalWinRate <= 0 || data.globalWinRate > 1) {
      throw new BadRequestException('Le taux de gain doit être entre 0.01 et 1');
    }
    if (data.startsAt >= data.endsAt) {
      throw new BadRequestException('La date de fin doit être après la date de début');
    }
    const now = new Date();
    // Compare at date level: allow today but not past days
    const startDay = new Date(data.startsAt.getFullYear(), data.startsAt.getMonth(), data.startsAt.getDate());
    const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (startDay < todayDay) {
      throw new BadRequestException('La date de début ne peut pas être dans le passé');
    }
    if (!data.prizes || data.prizes.length === 0) {
      throw new BadRequestException('Au moins un lot est requis');
    }

    return this.campaignRepo.create({
      data: {
        merchantId,
        name: data.name,
        description: data.description,
        globalWinRate: data.globalWinRate,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        ticketCostPoints: data.ticketCostPoints ?? 0,
        ticketEveryNVisits: data.ticketEveryNVisits,
        minSpendAmount: data.minSpendAmount ?? 0,
        prizes: {
          create: data.prizes.map((p) => ({
            label: p.label,
            description: p.description,
            weight: p.weight,
            totalStock: p.totalStock,
            remaining: p.totalStock,
            claimWindowHours: p.claimWindowHours,
          })),
        },
      },
      include: { prizes: true },
    });
  }

  async getActiveLuckyWheelInfo(merchantId: string) {
    const now = new Date();
    const campaigns = await this.campaignRepo.findMany({
      where: {
        merchantId,
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      select: { id: true, name: true, minSpendAmount: true },
    });
    // Return the highest minSpendAmount among active campaigns (0 if none configured)
    const maxMinSpend = campaigns.reduce((max: number, c: any) => Math.max(max, c.minSpendAmount), 0);
    return {
      hasActiveLuckyWheel: campaigns.length > 0,
      minSpendAmount: maxMinSpend,
      campaignName: maxMinSpend > 0 ? campaigns.find((c: any) => c.minSpendAmount === maxMinSpend)?.name : null,
    };
  }

  async updateCampaign(merchantId: string, campaignId: string, data: {
    name?: string;
    description?: string;
    globalWinRate?: number;
    startsAt?: Date;
    endsAt?: Date;
    minSpendAmount?: number;
    prizes?: { id?: string; label: string; description?: string; weight: number; totalStock: number; claimWindowHours?: number }[];
  }) {
    const campaign = await this.campaignRepo.findUnique({ where: { id: campaignId }, include: { prizes: true } });
    if (!campaign) throw new NotFoundException('Campagne introuvable');
    if (campaign.merchantId !== merchantId) throw new ForbiddenException('Accès refusé');
    if (campaign.status === 'ENDED') {
      throw new BadRequestException('Impossible de modifier une campagne terminée');
    }
    if (data.globalWinRate != null && (data.globalWinRate <= 0 || data.globalWinRate > 1)) {
      throw new BadRequestException('Le taux de gain doit être entre 0.01 et 1');
    }
    const startsAt = data.startsAt ?? campaign.startsAt;
    const endsAt = data.endsAt ?? campaign.endsAt;
    if (startsAt >= endsAt) {
      throw new BadRequestException('La date de fin doit être après la date de début');
    }
    // Block changing startsAt to a past date (only if it's actually being changed)
    if (data.startsAt) {
      const existingStartDay = new Date(campaign.startsAt.getFullYear(), campaign.startsAt.getMonth(), campaign.startsAt.getDate());
      const newStartDay = new Date(data.startsAt.getFullYear(), data.startsAt.getMonth(), data.startsAt.getDate());
      const now = new Date();
      const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      // Only reject if the date was actually changed to a new past date
      if (newStartDay.getTime() !== existingStartDay.getTime() && newStartDay < todayDay) {
        throw new BadRequestException('La date de début ne peut pas être dans le passé');
      }
    }

    // If prizes are provided, sync them in a transaction
    if (data.prizes && data.prizes.length > 0) {
      return this.prisma.$transaction(async (tx: any) => {
        // Update campaign metadata
        await tx.luckyWheelCampaign.update({
          where: { id: campaignId },
          data: {
            ...(data.name != null && { name: data.name }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.globalWinRate != null && { globalWinRate: data.globalWinRate }),
            ...(data.startsAt != null && { startsAt: data.startsAt }),
            ...(data.endsAt != null && { endsAt: data.endsAt }),
            ...(data.minSpendAmount != null && { minSpendAmount: data.minSpendAmount }),
          },
        });

        const existingPrizes = (campaign as any).prizes as any[];
        const incomingIds = data.prizes!.filter((p) => p.id).map((p) => p.id!);

        // Delete prizes that are no longer in the list (only if no draws reference them)
        const toDelete = existingPrizes.filter((ep: any) => !incomingIds.includes(ep.id));
        for (const prize of toDelete) {
          const drawCount = await tx.luckyWheelDraw.count({ where: { prizeId: prize.id } });
          if (drawCount === 0) {
            await tx.luckyWheelPrize.delete({ where: { id: prize.id } });
          }
          // If draws exist, keep the prize but it won't appear (stock managed separately)
        }

        // Upsert prizes
        for (const p of data.prizes!) {
          if (p.id && existingPrizes.some((ep: any) => ep.id === p.id)) {
            // Update existing prize
            const existing = existingPrizes.find((ep: any) => ep.id === p.id);
            const stockDiff = p.totalStock - existing.totalStock;
            await tx.luckyWheelPrize.update({
              where: { id: p.id },
              data: {
                label: p.label,
                description: p.description ?? null,
                weight: p.weight,
                totalStock: p.totalStock,
                remaining: Math.max(0, existing.remaining + stockDiff),
                ...(p.claimWindowHours !== undefined && { claimWindowHours: p.claimWindowHours ?? null }),
              },
            });
          } else {
            // Create new prize
            await tx.luckyWheelPrize.create({
              data: {
                campaignId,
                label: p.label,
                description: p.description ?? null,
                weight: p.weight,
                totalStock: p.totalStock,
                remaining: p.totalStock,
                claimWindowHours: p.claimWindowHours ?? null,
              },
            });
          }
        }

        return tx.luckyWheelCampaign.findUnique({
          where: { id: campaignId },
          include: { prizes: true },
        });
      });
    }

    // No prizes update — simple metadata update
    return this.campaignRepo.update({
      where: { id: campaignId },
      data: {
        ...(data.name != null && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.globalWinRate != null && { globalWinRate: data.globalWinRate }),
        ...(data.startsAt != null && { startsAt: data.startsAt }),
        ...(data.endsAt != null && { endsAt: data.endsAt }),
        ...(data.minSpendAmount != null && { minSpendAmount: data.minSpendAmount }),
      },
      include: { prizes: true },
    });
  }

  async deleteCampaign(merchantId: string, campaignId: string) {
    const campaign = await this.campaignRepo.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Campagne introuvable');
    if (campaign.merchantId !== merchantId) throw new ForbiddenException('Accès refusé');
    if (campaign.status === 'ACTIVE') {
      throw new BadRequestException('Impossible de supprimer une campagne active. Terminez-la d\'abord.');
    }
    // Block deletion if there are unclaimed (PENDING) prizes
    const pendingCount = await this.drawRepo.count({
      where: {
        ticket: { campaignId },
        result: 'WON',
        fulfilment: 'PENDING',
      },
    });
    if (pendingCount > 0) {
      throw new BadRequestException(
        `Impossible de supprimer : ${pendingCount} lot(s) en attente de réclamation.`,
      );
    }
    // Cascade: prizes, tickets, draws are all deleted via onDelete: Cascade
    await this.campaignRepo.delete({ where: { id: campaignId } });
    return { deleted: true };
  }

  async updateCampaignStatus(merchantId: string, campaignId: string, status: 'ACTIVE' | 'PAUSED' | 'ENDED') {
    const campaign = await this.campaignRepo.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Campagne introuvable');
    if (campaign.merchantId !== merchantId) throw new ForbiddenException('Accès refusé');

    // Enforce legal state transitions: DRAFT→ACTIVE, ACTIVE↔PAUSED, ACTIVE→ENDED, PAUSED→ENDED
    const allowed: Record<string, string[]> = {
      DRAFT: ['ACTIVE'],
      ACTIVE: ['PAUSED', 'ENDED'],
      PAUSED: ['ACTIVE', 'ENDED'],
      ENDED: [],
    };
    if (!(allowed[campaign.status] ?? []).includes(status)) {
      throw new BadRequestException(
        `Transition ${campaign.status} → ${status} non autorisée`,
      );
    }

    // Validate campaign readiness before activating
    if (status === 'ACTIVE' && campaign.status === 'DRAFT') {
      const now = new Date();
      const endDay = new Date(campaign.endsAt.getFullYear(), campaign.endsAt.getMonth(), campaign.endsAt.getDate());
      const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (endDay < todayDay) {
        throw new BadRequestException('Impossible d\'activer : la date de fin est déjà passée');
      }
      const prizeStock = await this.prizeRepo.aggregate({
        where: { campaignId },
        _sum: { remaining: true },
      });
      if (!prizeStock._sum.remaining || prizeStock._sum.remaining <= 0) {
        throw new BadRequestException('Impossible d\'activer : aucun lot disponible (stock à 0)');
      }
    }

    return this.campaignRepo.update({
      where: { id: campaignId },
      data: { status },
    });
  }

  async getMerchantCampaigns(merchantId: string) {
    return this.campaignRepo.findMany({
      where: { merchantId },
      include: {
        prizes: { orderBy: { weight: 'desc' } },
        _count: { select: { tickets: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCampaignStats(merchantId: string, campaignId: string) {
    const campaign = await this.campaignRepo.findUnique({
      where: { id: campaignId },
      include: {
        prizes: true,
        _count: { select: { tickets: true } },
      },
    });
    if (!campaign) throw new NotFoundException('Campagne introuvable');
    if (campaign.merchantId !== merchantId) throw new ForbiddenException('Accès refusé');

    const draws = await this.drawRepo.findMany({
      where: { ticket: { campaignId } },
      select: { result: true, fulfilment: true, prizeId: true },
    });

    const totalDraws = draws.length;
    const wins = draws.filter((d: any) => d.result === 'WON').length;
    const pendingClaims = draws.filter((d: any) => d.fulfilment === 'PENDING').length;
    const fulfilled = draws.filter((d: any) => d.fulfilment === 'CLAIMED').length;

    return {
      campaign,
      stats: { totalDraws, wins, losses: totalDraws - wins, pendingClaims, fulfilled },
    };
  }

  // ── Client: Available Draws ────────────────────────────────

  async getClientAvailableDraws(clientId: string) {
    const now = new Date();
    const tickets = await this.ticketRepo.findMany({
      where: {
        clientId,
        used: false,
        campaign: {
          status: 'ACTIVE',
          startsAt: { lte: now },
          endsAt: { gte: now },
          // Only surface campaigns that still have at least one prize in stock
          prizes: { some: { remaining: { gt: 0 } } },
        },
      },
      include: {
        campaign: {
          include: {
            merchant: { select: { nom: true, logoUrl: true } },
            prizes: { where: { remaining: { gt: 0 } }, select: { id: true, label: true, description: true, weight: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return tickets;
  }

  async getClientDrawHistory(clientId: string) {
    return this.drawRepo.findMany({
      where: { ticket: { clientId } },
      include: {
        prize: { select: { label: true, description: true } },
        ticket: {
          select: {
            campaign: {
              select: {
                name: true,
                merchantId: true,
                merchant: { select: { nom: true, logoUrl: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Client: Trigger Draw (core algorithm) ──────────────────

  async triggerDraw(clientId: string, ticketId: string) {
    return withRetry(async () => {
      return this.prisma.$transaction(async (prisma) => {
        const tx = prisma as any;
        // 1. Lock the ticket — verify ownership + unused
        const ticket = await tx.luckyWheelTicket.findUnique({
          where: { id: ticketId },
          include: { campaign: true, draw: true },
        });

        if (!ticket) throw new NotFoundException('Ticket introuvable');
        if (ticket.clientId !== clientId) throw new ForbiddenException('Ce ticket ne vous appartient pas');
        if (ticket.used) throw new BadRequestException('Ce ticket a déjà été utilisé');
        if (ticket.draw) throw new BadRequestException('Un tirage a déjà été effectué pour ce ticket');

        const { campaign } = ticket;
        const now = new Date();
        if (campaign.status !== 'ACTIVE') throw new BadRequestException('Cette campagne n\'est pas active');
        if (now < campaign.startsAt || now > campaign.endsAt) throw new BadRequestException('Cette campagne n\'est pas dans sa période active');

        // 2. Mark ticket as used (prevents double-draw even on retry)
        await tx.luckyWheelTicket.update({ where: { id: ticketId }, data: { used: true } });

        // 3. Generate server seed for fairness proof
        const serverSeed = randomBytes(32).toString('hex');

        // 4. Determine win/lose using globalWinRate
        const roll = randomInt(0, 10000) / 10000; // 4 decimal precision
        const isWin = roll < campaign.globalWinRate;

        if (!isWin) {
          // LOST — create draw record
          const draw = await tx.luckyWheelDraw.create({
            data: {
              ticketId,
              result: 'LOST',
              serverSeed,
            },
          });
          return { result: 'LOST' as const, draw, prize: null };
        }

        // 5. WIN — weighted random selection among prizes with remaining stock
        const prizes = await tx.luckyWheelPrize.findMany({
          where: { campaignId: campaign.id, remaining: { gt: 0 } },
        });

        if (prizes.length === 0) {
          // All prizes exhausted — treat as LOST
          const draw = await tx.luckyWheelDraw.create({
            data: { ticketId, result: 'LOST', serverSeed },
          });
          return { result: 'LOST' as const, draw, prize: null };
        }

        // Weighted random pick
        const selectedPrize = this.weightedRandomPick(prizes);

        // 6. Atomically decrement stock (optimistic — will fail if another TX grabbed last one)
        const updated = await tx.luckyWheelPrize.updateMany({
          where: { id: selectedPrize.id, remaining: { gt: 0 } },
          data: { remaining: { decrement: 1 } },
        });

        if (updated.count === 0) {
          // Race condition: stock depleted — re-pick from remaining prizes
          const remainingPrizes = await tx.luckyWheelPrize.findMany({
            where: { campaignId: campaign.id, remaining: { gt: 0 }, id: { not: selectedPrize.id } },
          });
          if (remainingPrizes.length === 0) {
            // All prizes truly exhausted — treat as LOST
            const draw = await tx.luckyWheelDraw.create({
              data: { ticketId, result: 'LOST', serverSeed },
            });
            return { result: 'LOST' as const, draw, prize: null };
          }
          // Pick from remaining and decrement
          const fallbackPrize = this.weightedRandomPick(remainingPrizes);
          const retryUpdate = await tx.luckyWheelPrize.updateMany({
            where: { id: fallbackPrize.id, remaining: { gt: 0 } },
            data: { remaining: { decrement: 1 } },
          });
          if (retryUpdate.count === 0) {
            const draw = await tx.luckyWheelDraw.create({
              data: { ticketId, result: 'LOST', serverSeed },
            });
            return { result: 'LOST' as const, draw, prize: null };
          }
          const claimBeforeFb = fallbackPrize.claimWindowHours
            ? new Date(now.getTime() + fallbackPrize.claimWindowHours * 3600_000)
            : null;
          const drawFb = await tx.luckyWheelDraw.create({
            data: {
              ticketId,
              prizeId: fallbackPrize.id,
              result: 'WON',
              fulfilment: 'PENDING',
              claimBefore: claimBeforeFb,
              serverSeed,
            },
          });
          // Track luckyWheel win in activity feed
          await tx.transaction.create({
            data: {
              clientId,
              merchantId: campaign.merchantId,
              type: 'LUCKY_WHEEL_WIN',
              points: 0,
              amount: 0,
              status: 'ACTIVE',
              note: `🎁 ${fallbackPrize.label}`,
            },
          });
          // Auto-end campaign if all prizes are now exhausted
          await this.autoEndIfExhausted(tx, campaign.id);
          return {
            result: 'WON' as const,
            draw: drawFb,
            prize: { id: fallbackPrize.id, label: fallbackPrize.label, description: fallbackPrize.description },
          };
        }

        // 7. Compute claim deadline
        const claimBefore = selectedPrize.claimWindowHours
          ? new Date(now.getTime() + selectedPrize.claimWindowHours * 3600_000)
          : null;

        // 8. Create draw record
        const draw = await tx.luckyWheelDraw.create({
          data: {
            ticketId,
            prizeId: selectedPrize.id,
            result: 'WON',
            fulfilment: 'PENDING',
            claimBefore,
            serverSeed,
          },
        });

        // 9. Track luckyWheel win in activity feed
        await tx.transaction.create({
          data: {
            clientId,
            merchantId: campaign.merchantId,
            type: 'LUCKY_WHEEL_WIN',
            points: 0,
            amount: 0,
            status: 'ACTIVE',
            note: `🎁 ${selectedPrize.label}`,
          },
        });

        // 10. Auto-end campaign if all prizes are now exhausted
        await this.autoEndIfExhausted(tx, campaign.id);

        return {
          result: 'WON' as const,
          draw,
          prize: { id: selectedPrize.id, label: selectedPrize.label, description: selectedPrize.description },
        };
      }, { isolationLevel: 'Serializable' });
    });
  }

  /**
   * Auto-transition a campaign to ENDED when every prize reaches remaining = 0.
   * Called inside the draw transaction so we never leave an ACTIVE-but-empty campaign
   * visible to clients (which would just produce guaranteed losses).
   */
  private async autoEndIfExhausted(tx: any, campaignId: string) {
    const stillAvailable = await tx.luckyWheelPrize.count({
      where: { campaignId, remaining: { gt: 0 } },
    });
    if (stillAvailable === 0) {
      await tx.luckyWheelCampaign.updateMany({
        where: { id: campaignId, status: 'ACTIVE' },
        data: { status: 'ENDED' },
      });
    }
  }

  // ── Merchant: Validate Prize Fulfilment ────────────────────

  async fulfilPrize(merchantId: string, drawId: string, fulfilledBy: string) {
    const draw = await this.drawRepo.findUnique({
      where: { id: drawId },
      include: { ticket: { include: { campaign: true } } },
    });

    if (!draw) throw new NotFoundException('Tirage introuvable');
    if (draw.ticket.campaign.merchantId !== merchantId) throw new ForbiddenException('Accès refusé');
    if (draw.result !== 'WON') throw new BadRequestException('Ce tirage n\'est pas gagnant');
    if (draw.fulfilment === 'CLAIMED') throw new BadRequestException('Ce lot a déjà été remis');
    if (draw.fulfilment === 'EXPIRED') throw new BadRequestException('Ce lot a expiré');

    // Check expiry
    if (draw.claimBefore && new Date() > draw.claimBefore) {
      await this.drawRepo.update({ where: { id: drawId }, data: { fulfilment: 'EXPIRED' } });
      throw new BadRequestException('Le délai de réclamation est expiré');
    }

    return this.drawRepo.update({
      where: { id: drawId },
      data: {
        fulfilment: 'CLAIMED',
        fulfilledAt: new Date(),
        fulfilledBy,
      },
      include: {
        prize: { select: { label: true } },
        ticket: { select: { clientId: true } },
      },
    });
  }

  async getPendingPrizes(merchantId: string) {
    // Auto-expire overdue draws before returning
    await this.drawRepo.updateMany({
      where: {
        result: 'WON',
        fulfilment: 'PENDING',
        claimBefore: { lt: new Date() },
        ticket: { campaign: { merchantId } },
      },
      data: { fulfilment: 'EXPIRED' },
    });

    return this.drawRepo.findMany({
      where: {
        result: 'WON',
        fulfilment: 'PENDING',
        ticket: { campaign: { merchantId } },
      },
      include: {
        prize: { select: { label: true, description: true } },
        ticket: {
          select: {
            clientId: true,
            client: { select: { prenom: true, nom: true, telephone: true } },
            campaign: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFulfilledPrizes(merchantId: string) {
    const draws = await this.drawRepo.findMany({
      where: {
        result: 'WON',
        fulfilment: 'CLAIMED',
        ticket: { campaign: { merchantId } },
      },
      select: {
        id: true,
        fulfilledAt: true,
        fulfilledBy: true,
        prize: { select: { label: true } },
        ticket: {
          select: {
            client: { select: { prenom: true, nom: true } },
            campaign: { select: { name: true } },
          },
        },
      },
      orderBy: { fulfilledAt: 'desc' },
      take: 50,
    });

    // Resolve fulfilledBy IDs to names
    const fulfillerIds = [...new Set(draws.map((d: any) => d.fulfilledBy).filter(Boolean))];
    if (fulfillerIds.length === 0) return draws;

    const teamMembers = await this.prisma.teamMember.findMany({
      where: { id: { in: fulfillerIds } },
      select: { id: true, nom: true },
    });
    const tmMap = new Map(teamMembers.map((tm: any) => [tm.id, tm.nom]));

    return draws.map((d: any) => ({
      ...d,
      fulfilledByName: tmMap.get(d.fulfilledBy) ?? null,
    }));
  }

  // ── Weighted Random Algorithm ──────────────────────────────

  private weightedRandomPick<T extends Record<string, any> & { weight: number }>(items: T[]): T {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) return items[0];
    // Cryptographically secure random number
    const roll = randomInt(0, totalWeight);

    let cumulative = 0;
    for (const item of items) {
      cumulative += item.weight;
      if (roll < cumulative) return item;
    }

    // Fallback (should never reach here)
    return items[items.length - 1];
  }
}
