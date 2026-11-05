import { Controller, Post, Get, Patch, Delete, Param, Query, Body, UseGuards, HttpCode, Req, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { AuditAction } from '@prisma/client';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminMerchantService } from './admin-merchants.service';
import { AdminDetailsService } from './admin-details.service';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { MerchantListQueryDto } from '../common/dto/pagination-query.dto';
import { BanMerchantDto } from './dto/ban-merchant.dto';
import { SetPlanDatesDto } from './dto/set-plan-dates.dto';
import { buildCtx } from './admin-request.util';

/**
 * Merchant list, drill-down, plan management and lifecycle.
 * Route order matters: the static `merchants/facets` must stay declared
 * before `merchants/:id`.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminMerchantsController {
  constructor(
    private readonly merchantService: AdminMerchantService,
    private readonly detailsService: AdminDetailsService,
    private readonly planService: MerchantPlanService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get('merchants')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Paginated list of all merchants' })
  async listMerchants(@Query() query: MerchantListQueryDto) {
    return this.merchantService.listMerchants(query.page, query.limit, query.search, query.plan, query.status, query.categorie, {
      activity: query.activity,
      ville: query.ville,
      sort: query.sort,
    });
  }

  @Get('merchants/facets')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Cities and categories with merchant counts, for list filters' })
  async getMerchantFacets() {
    return this.detailsService.merchantFacets();
  }

  @Get('merchants/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Detailed profile of a single merchant' })
  async getMerchantDetail(@Param('id', ParseUUIDPipe) merchantId: string) {
    return this.merchantService.getMerchantDetail(merchantId);
  }

  @Get('merchants/:id/activity')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Usage analytics of a single merchant (transactions, clients, features, team)' })
  async getMerchantActivity(@Param('id', ParseUUIDPipe) merchantId: string) {
    return this.detailsService.getMerchantActivity(merchantId);
  }

  @Get('merchants/:id/subscription-history')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Subscription history timeline for a merchant' })
  async getMerchantSubscriptionHistory(@Param('id', ParseUUIDPipe) merchantId: string) {
    return this.merchantService.getMerchantSubscriptionHistory(merchantId);
  }

  // ── Plan management ───────────────────────────────────────────────────────

  @Post('merchants/:id/activate-premium')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Permanently activate PREMIUM for a merchant' })
  async activatePremium(
    @Param('id', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    // Fetch merchant label before mutation for a meaningful audit entry
    const detail = await this.merchantService.getMerchantDetail(merchantId);

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
    @Param('id', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const detail = await this.merchantService.getMerchantDetail(merchantId);

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
    @Param('id', ParseUUIDPipe) merchantId: string,
    @Body() dto: SetPlanDatesDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const detail = await this.merchantService.getMerchantDetail(merchantId);
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
    @Param('id', ParseUUIDPipe) merchantId: string,
    @Body() dto: BanMerchantDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const { nom, email } = await this.merchantService.banMerchant(merchantId);

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
    @Param('id', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const { nom, email } = await this.merchantService.unbanMerchant(merchantId);

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
    @Param('id', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    // Capture label BEFORE deletion (cascade will wipe everything)
    const { nom, email } = await this.merchantService.deleteMerchant(merchantId);

    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.DELETE_MERCHANT,
      targetType: 'MERCHANT',
      targetId: merchantId,
      targetLabel: `${nom} <${email}>`,
    });

    return { success: true, message: `Commerçant ${nom} supprimé définitivement.` };
  }
}
