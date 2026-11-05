import { Controller, Post, Get, Query, Body, UseGuards, HttpCode, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { AuditAction } from '@prisma/client';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminDetailsService } from './admin-details.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MerchantNewsService } from '../merchant-inbox/merchant-news.service';
import { MerchantInboxService } from '../merchant-inbox/merchant-inbox.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { NotificationListQueryDto } from '../common/dto/pagination-query.dto';
import { InsightsQueryDto } from './dto/insights-query.dto';
import { MerchantNewsAudienceDto, SendMerchantNewsDto } from './dto/merchant-news.dto';
import { SendAdminNotificationDto } from './dto/admin-notification.dto';
import { buildCtx } from './admin-request.util';

/** Notification history and stats, admin broadcasts and JitPlus Pro news. */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminNotificationsController {
  constructor(
    private readonly dashboardService: AdminDashboardService,
    private readonly detailsService: AdminDetailsService,
    private readonly notificationsService: NotificationsService,
    private readonly merchantNews: MerchantNewsService,
    private readonly merchantInbox: MerchantInboxService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get('notifications')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Paginated list of all notifications across merchants' })
  async listNotifications(@Query() query: NotificationListQueryDto) {
    return this.dashboardService.listNotifications(query.page, query.limit, query.channel, query.search, {
      sender: query.sender,
      merchantId: query.merchantId,
    });
  }

  @Get('notifications/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Notification performance by channel, sender and day' })
  async getNotificationStats(@Query() query: InsightsQueryDto) {
    return this.detailsService.getNotificationStats(query.days ?? 30);
  }

  // ── Admin broadcast notifications ─────────────────────────────────────

  @Post('send-notification')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a notification — supports audience targeting (merchant clients, all clients, all merchants)' })
  async sendNotification(
    @Body() dto: SendAdminNotificationDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const result = await this.notificationsService.sendAdminNotification(dto);

    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.ADMIN_SEND_NOTIFICATION,
      targetType: 'MERCHANT',
      targetId: dto.merchantId ?? undefined,
      targetLabel: `Audience: ${dto.audience} | Channel: ${dto.channel}`,
      metadata: { audience: dto.audience, channel: dto.channel, title: dto.title, recipientCount: result.recipientCount },
    });

    return { success: true, ...result };
  }

  // ── JitPlus Pro news (targeted, per-merchant inbox + push) ─────────────

  @Get('merchant-news/audience')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Count merchants matching a news audience' })
  async merchantNewsAudience(@Query() query: MerchantNewsAudienceDto) {
    return { count: await this.merchantNews.countAudience(query) };
  }

  @Post('merchant-news')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a targeted "nouveauté" push to JitPlus Pro merchants' })
  async sendMerchantNews(
    @Body() dto: SendMerchantNewsDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const result = await this.merchantNews.send(dto);
    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.ADMIN_SEND_NOTIFICATION,
      targetType: 'MERCHANT',
      targetLabel: `Audience: MERCHANT_NEWS | plan=${dto.plan ?? '*'} ville=${dto.ville ?? '*'} cat=${dto.categorie ?? '*'}`,
      metadata: { audience: 'MERCHANT_NEWS', title: dto.title, action: dto.action, recipientCount: result.recipientCount, results: result.results },
    });
    return { success: true, ...result };
  }

  @Get('merchant-notifications/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'JitPlus Pro pushes sent / opened / read per category' })
  async merchantNotificationStats(@Query('days') days?: string) {
    const d = Math.min(Math.max(parseInt(days ?? '30', 10) || 30, 1), 365);
    return { days: d, categories: await this.merchantInbox.openStats(d) };
  }
}
