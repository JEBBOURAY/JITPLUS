import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../common/constants';
import { Request } from 'express';
import { AuditAction, PayoutStatus } from '@prisma/client';
import { AuditLogService, AuditLogContext } from './audit-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminAuthService } from './admin.service';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AdminLoginDto } from './dto/admin-login.dto';
import { PaginationQueryDto, MerchantListQueryDto, ClientListQueryDto, NotificationListQueryDto } from '../common/dto/pagination-query.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { BanMerchantDto } from './dto/ban-merchant.dto';
import { SetPlanDatesDto } from './dto/set-plan-dates.dto';

// ── Helper: extract real client IP (respects X-Forwarded-For) ────────────────
function extractIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first.trim();
  }
  return req.ip ?? 'unknown';
}

// ── Helper: build audit context from JWT + HTTP request ──────────────────────
function buildCtx(user: JwtPayload, req: Request): AuditLogContext {
  return {
    adminId: user.sub,
    adminEmail: user.email ?? 'unknown',
    ipAddress: extractIp(req),
    userAgent: (req.headers['user-agent'] as string | undefined) ?? undefined,
  };
}

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminAuthService,
    private readonly planService: MerchantPlanService,
    private readonly auditLog: AuditLogService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── Public: Admin login ───────────────────────────────────────────────────

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: THROTTLE_TTL } })
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin login — returns a JWT token' })
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    const result = await this.adminService.login(dto.email, dto.password);

    // Log login using the freshly-returned admin identity (no JWT available yet)
    await this.auditLog.log({
      ctx: {
        adminId: result.admin.id,
        adminEmail: result.admin.email,
        ipAddress: extractIp(req),
        userAgent: (req.headers['user-agent'] as string | undefined) ?? undefined,
      },
      action: AuditAction.ADMIN_LOGIN,
      targetType: 'ADMIN',
      targetId: result.admin.id,
      targetLabel: `${result.admin.nom} <${result.admin.email}>`,
    });

    return result;
  }

  // ── Admin logout ──────────────────────────────────────────────────────────

  @Post('logout')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin logout — revokes the current session token' })
  async logout(@CurrentUser() user: JwtPayload) {
    if (user.sessionId) {
      await this.adminService.logout(user.sessionId);
    }
    return { message: 'Déconnecté' };
  }

  // ── Protected: all routes below require admin JWT ────────────────────────

  @Get('stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Global platform statistics' })
  async getGlobalStats() {
    return this.adminService.getGlobalStats();
  }

  @Get('merchants')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Paginated list of all merchants' })
  async listMerchants(@Query() query: MerchantListQueryDto) {
    return this.adminService.listMerchants(query.page, query.limit, query.search, query.plan, query.status, query.categorie);
  }

  @Get('merchants/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Detailed profile of a single merchant' })
  async getMerchantDetail(@Param('id') merchantId: string) {
    return this.adminService.getMerchantDetail(merchantId);
  }

  @Get('merchants/:id/subscription-history')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Subscription history timeline for a merchant' })
  async getMerchantSubscriptionHistory(@Param('id') merchantId: string) {
    return this.adminService.getMerchantSubscriptionHistory(merchantId);
  }

  @Get('merchants/:id/plan')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: "Resolve a merchant's effective plan + limits" })
  async getMerchantPlan(@Param('id') merchantId: string) {
    return this.planService.getPlanLimits(merchantId);
  }

  // ── Plan management ───────────────────────────────────────────────────────

  @Post('merchants/:id/activate-premium')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Permanently activate PREMIUM for a merchant' })
  async activatePremium(
    @Param('id') merchantId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    // Fetch merchant label before mutation for a meaningful audit entry
    const detail = await this.adminService.getMerchantDetail(merchantId);

    await this.planService.adminActivatePremium(merchantId);

    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.ACTIVATE_PREMIUM,
      targetType: 'MERCHANT',
      targetId: merchantId,
      targetLabel: `${detail.nom} <${detail.email}>`,
      metadata: { previousPlan: detail.plan },
    });

    return { success: true, message: 'Plan Premium activé avec succès.' };
  }

  @Post('merchants/:id/revoke-premium')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke PREMIUM — merchant returns to FREE' })
  async revokePremium(
    @Param('id') merchantId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const detail = await this.adminService.getMerchantDetail(merchantId);

    await this.planService.adminRevokePremium(merchantId);

    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.REVOKE_PREMIUM,
      targetType: 'MERCHANT',
      targetId: merchantId,
      targetLabel: `${detail.nom} <${detail.email}>`,
      metadata: { previousPlan: detail.plan },
    });

    return { success: true, message: 'Plan Premium révoqué. Le commerçant est maintenant en plan Gratuit.' };
  }

  @Patch('merchants/:id/plan-dates')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Manually set subscription start / end dates for a merchant' })
  async setPlanDates(
    @Param('id') merchantId: string,
    @Body() dto: SetPlanDatesDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const detail = await this.adminService.getMerchantDetail(merchantId);
    await this.planService.adminSetPlanDates(merchantId, dto);
    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.UPDATE_PLAN_DURATION,
      targetType: 'MERCHANT',
      targetId: merchantId,
      targetLabel: `${detail.nom} <${detail.email}>`,
      metadata: { startDate: dto.startDate ?? null, endDate: dto.endDate ?? null },
    });
    return { success: true };
  }

  // ── Merchant lifecycle ────────────────────────────────────────────────────

  @Post('merchants/:id/ban')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Ban a merchant (sets isActive = false)' })
  async banMerchant(
    @Param('id') merchantId: string,
    @Body() dto: BanMerchantDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const { nom, email } = await this.adminService.banMerchant(merchantId);

    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.BAN_MERCHANT,
      targetType: 'MERCHANT',
      targetId: merchantId,
      targetLabel: `${nom} <${email}>`,
      metadata: { reason: dto.reason ?? null },
    });

    return { success: true, message: `Commerçant ${nom} banni.` };
  }

  @Post('merchants/:id/unban')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Unban a merchant (sets isActive = true)' })
  async unbanMerchant(
    @Param('id') merchantId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const { nom, email } = await this.adminService.unbanMerchant(merchantId);

    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.UNBAN_MERCHANT,
      targetType: 'MERCHANT',
      targetId: merchantId,
      targetLabel: `${nom} <${email}>`,
    });

    return { success: true, message: `Commerçant ${nom} débanni.` };
  }

  @Delete('merchants/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Permanently delete a merchant and all their data' })
  async deleteMerchant(
    @Param('id') merchantId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    // Capture label BEFORE deletion (cascade will wipe everything)
    const { nom, email } = await this.adminService.deleteMerchant(merchantId);

    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.DELETE_MERCHANT,
      targetType: 'MERCHANT',
      targetId: merchantId,
      targetLabel: `${nom} <${email}>`,
    });

    return { success: true, message: `Commerçant ${nom} supprimé définitivement.` };
  }

  // ── Audit logs ────────────────────────────────────────────────────────────

  @Get('audit-logs')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Paginated audit logs with optional filters' })
  async getAuditLogs(@Query() query: AuditLogQueryDto): Promise<unknown> {
    return this.auditLog.findAll({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      action: query.action as any,
      adminId: query.adminId,
      targetType: query.targetType as any,
      targetId: query.targetId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }

  // ── Upgrade Requests ────────────────────────────────────────

  @Get('clients')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Paginated list of all registered clients with contact info' })
  async listClients(@Query() query: ClientListQueryDto) {
    return this.adminService.listClients(query.page, query.limit, query.search, query.status);
  }

  @Get('notifications')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Paginated list of all notifications across merchants' })
  async listNotifications(@Query() query: NotificationListQueryDto) {
    return this.adminService.listNotifications(query.page, query.limit, query.channel, query.search);
  }

  // ── Client management ───────────────────────────────────────────────────

  @Get('clients/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Detailed profile of a single client' })
  async getClientDetail(@Param('id') clientId: string) {
    return this.adminService.getClientDetail(clientId);
  }

  @Post('clients/:id/deactivate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Deactivate a client account (soft-delete)' })
  async deactivateClient(
    @Param('id') clientId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const { nom, email } = await this.adminService.deactivateClient(clientId);

    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.DEACTIVATE_CLIENT,
      targetType: 'CLIENT',
      targetId: clientId,
      targetLabel: `${nom ?? 'N/A'} <${email ?? 'N/A'}>`,
    });

    return { success: true, message: `Client ${nom ?? clientId} désactivé.` };
  }

  @Post('clients/:id/activate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Reactivate a client account' })
  async activateClient(
    @Param('id') clientId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const { nom, email } = await this.adminService.activateClient(clientId);

    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.ACTIVATE_CLIENT,
      targetType: 'CLIENT',
      targetId: clientId,
      targetLabel: `${nom ?? 'N/A'} <${email ?? 'N/A'}>`,
    });

    return { success: true, message: `Client ${nom ?? clientId} réactivé.` };
  }

  @Delete('clients/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Permanently delete a client and anonymise data' })
  async deleteClient(
    @Param('id') clientId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const { nom, email } = await this.adminService.deleteClient(clientId);

    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.DELETE_CLIENT,
      targetType: 'CLIENT',
      targetId: clientId,
      targetLabel: `${nom ?? 'N/A'} <${email ?? 'N/A'}>`,
    });

    return { success: true, message: `Client supprimé définitivement.` };
  }

  // ── Admin broadcast notifications ─────────────────────────────────────

  @Post('send-notification')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a notification — supports audience targeting (merchant clients, all clients, all merchants)' })
  async sendNotification(
    @Body() body: {
      merchantId?: string;
      channel: 'PUSH' | 'EMAIL' | 'WHATSAPP';
      title: string;
      body: string;
      audience: 'MERCHANT_CLIENTS' | 'ALL_CLIENTS' | 'ALL_MERCHANTS';
    },
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    let result: { recipientCount?: number; successCount?: number; failureCount?: number } = {};
    const audience = body.audience ?? 'MERCHANT_CLIENTS';

    if (audience === 'MERCHANT_CLIENTS') {
      // Existing behavior — requires merchantId
      if (!body.merchantId) {
        return { success: false, error: 'merchantId requis pour cette audience' };
      }
      if (body.channel === 'PUSH') {
        result = await this.notificationsService.sendToAll(body.merchantId, {
          title: body.title,
          body: body.body,
        });
      } else if (body.channel === 'EMAIL') {
        result = await this.notificationsService.sendEmailToAll(body.merchantId, {
          subject: body.title,
          body: body.body,
        });
      } else if (body.channel === 'WHATSAPP') {
        result = await this.notificationsService.sendWhatsAppToAll(body.merchantId, body.body);
      }
    } else if (audience === 'ALL_CLIENTS') {
      if (body.channel === 'PUSH') {
        result = await this.notificationsService.sendPushToAllClients(body.title, body.body);
      } else if (body.channel === 'EMAIL') {
        result = await this.notificationsService.sendEmailToAllClients(body.title, body.body);
      } else {
        return { success: false, error: 'WhatsApp non disponible pour cette audience' };
      }
    } else if (audience === 'ALL_MERCHANTS') {
      if (body.channel === 'PUSH') {
        result = await this.notificationsService.sendPushToAllMerchants(body.title, body.body);
      } else if (body.channel === 'EMAIL') {
        result = await this.notificationsService.sendEmailToAllMerchants(body.title, body.body);
      } else {
        return { success: false, error: 'WhatsApp non disponible pour cette audience' };
      }
    }

    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.ADMIN_SEND_NOTIFICATION,
      targetType: 'MERCHANT',
      targetId: body.merchantId ?? undefined,
      targetLabel: `Audience: ${audience} | Channel: ${body.channel}`,
      metadata: { audience, channel: body.channel, title: body.title, recipientCount: result?.recipientCount },
    });

    return { success: true, ...result };
  }

  // ── Referral management ──────────────────────────────────────────────────

  @Get('referrals/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Referral program statistics' })
  async getReferralStats() {
    return this.adminService.getReferralStats();
  }

  @Get('referrals/merchant-to-merchant')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'List merchant-to-merchant referrals' })
  async listMerchantReferrals(
    @Query() query: PaginationQueryDto,
    @Query('search') search?: string,
  ) {
    return this.adminService.listMerchantReferrals(query.page, query.limit, search);
  }

  @Get('referrals/client-to-merchant')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'List client-to-merchant referrals' })
  async listClientReferrals(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: 'PENDING' | 'VALIDATED',
    @Query('search') search?: string,
  ) {
    return this.adminService.listClientReferrals(query.page, query.limit, status, search);
  }

  @Get('referrals/top-referrers')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'List top merchant referrers' })
  async listTopReferrers(@Query('limit') limit?: string) {
    return this.adminService.listTopReferrers(limit ? parseInt(limit, 10) : 20);
  }

  @Get('referrals/payout-requests')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'List client payout requests' })
  async listPayoutRequests(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listPayoutRequests(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      status as PayoutStatus,
      search,
    );
  }

  @Patch('referrals/payout-requests/:id/status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Approve or reject a payout request' })
  async updatePayoutRequestStatus(
    @Param('id') id: string,
    @Body('status') status: PayoutStatus,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.adminService.updatePayoutRequestStatus(id, status, admin.sub);
  }
}

