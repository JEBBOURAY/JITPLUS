import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { THROTTLE_TTL } from '../common/constants';
import { MerchantTypeGuard } from '../auth/guards/merchant-type.guard';
import { MerchantOwnerGuard } from '../auth/guards/merchant-owner.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ClientOnlyGuard } from '../common/guards/client-only.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import type { AdminAuditContext } from '../admin/audit-log.service';
import {
  AdminDealsQueryDto,
  CreateDealDto,
  DealCategoryCountsQueryDto,
  DealAlertsDto,
  DealEventDto,
  DealFeedQueryDto,
  DealPositionQueryDto,
  DuplicateDealDto,
  RemoveDealDto,
  ReportDealDto,
  UpdateDealDto,
} from './dto';
import { DealsMerchantService } from './deals-merchant.service';
import { DealsClientService } from './deals-client.service';
import { DealsAdminService } from './deals-admin.service';
import { DealsAlertsService } from './deals-alerts.service';

// No PremiumGuard anywhere: deals are free for every merchant, the anti-spam
// limits of DEAL_LIMITS are the only restriction.
@ApiTags('Deals – Merchant')
@ApiBearerAuth()
@Controller('merchant/deals')
@UseGuards(AuthGuard('jwt'), MerchantTypeGuard)
export class DealsMerchantController {
  constructor(private readonly deals: DealsMerchantService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.deals.list(user.userId);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.deals.get(user.userId, id);
  }

  @Post()
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDealDto) {
    return this.deals.create(user.userId, dto);
  }

  @Patch(':id')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 20 } })
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDealDto) {
    return this.deals.update(user.userId, id, dto);
  }

  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  stop(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.deals.stop(user.userId, id);
  }

  @Post(':id/duplicate')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  duplicate(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DuplicateDealDto) {
    return this.deals.duplicate(user.userId, id, dto);
  }

  @Delete(':id')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.deals.remove(user.userId, id);
  }
}

@ApiTags('Deals – Client')
@ApiBearerAuth()
@Controller('client')
@UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
export class DealsClientController {
  constructor(
    private readonly deals: DealsClientService,
    private readonly alerts: DealsAlertsService,
  ) {}

  @Get('deals')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 60 } })
  feed(@CurrentUser() user: JwtPayload, @Query() query: DealFeedQueryDto) {
    return this.deals.feed(user.userId, query);
  }

  /** Declared before deals/:id so "categories" is not taken for an id. */
  @Get('deals/categories')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 60 } })
  categoryCounts(@CurrentUser() user: JwtPayload, @Query() query: DealCategoryCountsQueryDto) {
    return this.deals.categoryCounts(user.userId, query);
  }

  @Get('deals/:id')
  detail(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Query() query: DealPositionQueryDto) {
    return this.deals.detail(user.userId, id, query);
  }

  @Post('deals/:id/events')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  event(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DealEventDto) {
    return this.deals.recordEvent(user.userId, id, dto.type);
  }

  @Post('deals/:id/report')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  report(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReportDealDto) {
    return this.deals.report(user.userId, id, dto);
  }

  @Get('merchants/:id/deals')
  merchantDeals(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DealPositionQueryDto,
  ) {
    return this.deals.merchantDeals(user.userId, id, query);
  }

  @Get('cities')
  cities(@Query() query: DealPositionQueryDto) {
    return this.deals.cities(query);
  }

  @Get('deal-alerts')
  alertPreferences(@CurrentUser() user: JwtPayload) {
    return this.alerts.getPreferences(user.userId);
  }

  @Patch('deal-alerts')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 20 } })
  updateAlertPreferences(@CurrentUser() user: JwtPayload, @Body() dto: DealAlertsDto) {
    return this.alerts.updatePreferences(user.userId, dto);
  }
}

/** Guests: counters and blurred pictures only, never the content of a deal. */
@ApiTags('Deals – Guest')
@Controller('client-auth/deals')
export class DealsGuestController {
  constructor(private readonly deals: DealsClientService) {}

  @Get('teaser')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  teaser(@Query() query: DealPositionQueryDto) {
    return this.deals.teaser(query);
  }
}

function adminCtx(user: JwtPayload, req: Request): AdminAuditContext {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]).trim() : req.ip;
  return {
    actorType: 'ADMIN',
    adminId: user.sub,
    adminEmail: user.email ?? 'unknown',
    ipAddress: ip ?? undefined,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? undefined,
  };
}

@ApiTags('Deals – Admin')
@ApiBearerAuth()
@Controller('admin/deals')
@UseGuards(JwtAuthGuard, AdminGuard)
export class DealsAdminController {
  constructor(private readonly deals: DealsAdminService) {}

  @Get()
  list(@Query() query: AdminDealsQueryDto) {
    return this.deals.list(query);
  }

  @Get(':id/reports')
  reports(@Param('id', ParseUUIDPipe) id: string) {
    return this.deals.reports(id);
  }

  @Post(':id/remove')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveDealDto,
  ) {
    return this.deals.remove(adminCtx(user, req), id, dto.reason);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@CurrentUser() user: JwtPayload, @Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.deals.restore(adminCtx(user, req), id);
  }
}
