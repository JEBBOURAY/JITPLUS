import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildPagination } from '../common/utils';
import { AuditAction, AuditLogService, AuditTargetType, type AdminAuditContext } from '../admin/audit-log.service';
import { MerchantInboxService } from '../merchant-inbox/merchant-inbox.service';
import type { AdminDealsQueryDto } from './dto';
import { dealDisplayStatus } from './deal-rules';
import { dealRemovedTexts } from './deal-notif-i18n';

@Injectable()
export class DealsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly inbox: MerchantInboxService,
  ) {}

  async list(q: AdminDealsQueryDto) {
    const now = new Date();
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const where: Prisma.DealWhereInput = { status: { not: 'DELETED' } };
    if (q.filter === 'live') Object.assign(where, { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } });
    if (q.filter === 'reported') where.reportCount = { gt: 0 };
    if (q.filter === 'removed') where.status = 'REMOVED';
    const search = q.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { merchant: { nom: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const orderBy: Prisma.DealOrderByWithRelationInput[] =
      q.filter === 'reported' ? [{ reportCount: 'desc' }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }];

    const [rows, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          scope: true,
          type: true,
          title: true,
          description: true,
          conditions: true,
          imageUrl: true,
          linkUrl: true,
          cityKeys: true,
          startsAt: true,
          endsAt: true,
          status: true,
          endedReason: true,
          reportCount: true,
          viewCount: true,
          linkClickCount: true,
          createdAt: true,
          merchant: { select: { id: true, nom: true, email: true } },
        },
      }),
      this.prisma.deal.count({ where }),
    ]);
    return {
      deals: rows.map((d) => ({ ...d, displayStatus: dealDisplayStatus(d, now) })),
      pagination: buildPagination(total, page, limit),
    };
  }

  async reports(id: string) {
    const rows = await this.prisma.dealReport.findMany({
      where: { dealId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        reason: true,
        comment: true,
        createdAt: true,
        client: { select: { id: true, prenom: true, nom: true } },
      },
    });
    return { reports: rows };
  }

  async remove(ctx: AdminAuditContext, id: string, reason: string) {
    const deal = await this.find(id);
    if (deal.status === 'REMOVED' && deal.endedReason !== 'AUTO_REPORTS') {
      throw new BadRequestException('Ce bon plan est déjà retiré');
    }
    const motive = reason.trim();
    await this.prisma.deal.update({ where: { id }, data: { status: 'REMOVED', endedReason: motive } });
    await this.auditLog.log({
      ctx,
      action: AuditAction.REMOVE_DEAL,
      targetType: AuditTargetType.MERCHANT,
      targetId: deal.merchantId,
      targetLabel: `${deal.merchant.nom} — ${deal.title}`,
      metadata: { dealId: id, reason: motive, reportCount: deal.reportCount },
    });
    const msg = dealRemovedTexts(deal.merchant.language, deal.title, motive);
    await this.inbox.record(deal.merchantId, { category: 'ACTIVITY', title: msg.title, body: msg.body, action: 'open_deals' });
    return { success: true };
  }

  async restore(ctx: AdminAuditContext, id: string) {
    const deal = await this.find(id);
    if (deal.status !== 'REMOVED') throw new BadRequestException('Seul un bon plan retiré peut être rétabli');
    const ended = deal.endsAt <= new Date();
    await this.prisma.deal.update({
      where: { id },
      data: { status: ended ? 'ENDED' : 'ACTIVE', endedReason: ended ? 'EXPIRED' : null, reportCount: 0 },
    });
    // Past reports were reviewed: they must not count towards a new automatic removal.
    await this.prisma.dealReport.deleteMany({ where: { dealId: id } });
    await this.auditLog.log({
      ctx,
      action: AuditAction.RESTORE_DEAL,
      targetType: AuditTargetType.MERCHANT,
      targetId: deal.merchantId,
      targetLabel: `${deal.merchant.nom} — ${deal.title}`,
      metadata: { dealId: id, previousReason: deal.endedReason },
    });
    return { success: true };
  }

  private async find(id: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      select: {
        id: true,
        merchantId: true,
        title: true,
        status: true,
        endedReason: true,
        reportCount: true,
        endsAt: true,
        merchant: { select: { nom: true, language: true } },
      },
    });
    if (!deal || deal.status === 'DELETED') throw new NotFoundException('Bon plan introuvable');
    return deal;
  }
}
