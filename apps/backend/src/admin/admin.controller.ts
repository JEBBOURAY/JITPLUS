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
import { AuditAction, UpgradeRequestStatus } from '@prisma/client';
import { AuditLogService, AuditLogContext } from './audit-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminAuthService } from './admin.service';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { UpgradeRequestService } from '../merchant/services/upgrade-request.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AdminLoginDto } from './dto/admin-login.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
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
    private readonly upgradeRequestService: UpgradeRequestService,
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
  async listMerchants(@Query() { page, limit }: PaginationQueryDto) {
    return this.adminService.listMerchants(page, limit);
  }

  @Get('merchants/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Detailed profile of a single merchant' })
  async getMerchantDetail(@Param('id') merchantId: string) {
    return this.adminService.getMerchantDetail(merchantId);
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
  async listClients(
    @Query() { page, limit }: PaginationQueryDto,
    @Query('search') search?: string,
  ) {
    return this.adminService.listClients(page, limit, search);
  }

  @Get('notifications')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Paginated list of all notifications across merchants' })
  async listNotifications(
    @Query() { page, limit }: PaginationQueryDto,
    @Query('channel') channel?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listNotifications(page, limit, channel, search);
  }

  // ── Upgrade Requests ────────────────────────────────────────

  @Get('upgrade-requests')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'List upgrade requests (filter by status, paginated)' })
  async listUpgradeRequests(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.upgradeRequestService.listAll({
      status: status as UpgradeRequestStatus | undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Post('upgrade-requests/:id/approve')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve an upgrade request → activates Premium' })
  async approveUpgradeRequest(
    @Param('id') id: string,
    @Body() body: { adminNote?: string },
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const result = await this.upgradeRequestService.approve(id, user.sub, body?.adminNote);
    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.APPROVE_UPGRADE_REQUEST,
      targetType: 'MERCHANT',
      targetId: result.merchantId,
      targetLabel: `${result.merchantNom} <${result.merchantEmail}>`,
      metadata: { requestId: id, adminNote: body?.adminNote },
    });
    return { success: true, merchantId: result.merchantId };
  }

  @Post('upgrade-requests/:id/reject')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject an upgrade request' })
  async rejectUpgradeRequest(
    @Param('id') id: string,
    @Body() body: { adminNote?: string },
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const result = await this.upgradeRequestService.reject(id, user.sub, body?.adminNote);
    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.REJECT_UPGRADE_REQUEST,
      targetType: 'MERCHANT',
      targetId: result.merchantId,
      targetLabel: result.merchantId,
      metadata: { requestId: id, adminNote: body?.adminNote },
    });
    return { success: true };
  }
}
