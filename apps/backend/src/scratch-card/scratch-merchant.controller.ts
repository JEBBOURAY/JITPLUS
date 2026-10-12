import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../common/constants';
import { MerchantTypeGuard } from '../auth/guards/merchant-type.guard';
import { MerchantOwnerGuard } from '../auth/guards/merchant-owner.guard';
import { PremiumGuard } from '../auth/guards/premium.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ScratchCampaignService } from './scratch-campaign.service';
import { CouponService } from './coupon.service';
import {
  AudienceEstimateDto,
  CheckCouponDto,
  CreateScratchCampaignDto,
  ExtendScratchDatesDto,
  MerchantCouponsQueryDto,
  RedeemCouponDto,
  ScheduleScratchCampaignDto,
  UpdateScratchStatusDto,
} from './dto';

@ApiTags('Scratch cards – Merchant')
@ApiBearerAuth()
@Controller('scratch/merchant')
@UseGuards(AuthGuard('jwt'), MerchantTypeGuard)
export class ScratchMerchantController {
  constructor(
    private readonly campaigns: ScratchCampaignService,
    private readonly coupons: CouponService,
  ) {}

  // ── Campaigns (owner + Premium, reads stay open after the plan expires) ──

  @Get('campaigns')
  list(@CurrentUser() user: JwtPayload) {
    return this.campaigns.list(user.userId);
  }

  @Get('campaigns/:id')
  get(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.get(user.userId, id);
  }

  @Get('campaigns/:id/stats')
  stats(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.stats(user.userId, id);
  }

  @Post('campaigns')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateScratchCampaignDto) {
    return this.campaigns.create(user.userId, dto);
  }

  @Put('campaigns/:id')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 20 } })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateScratchCampaignDto,
  ) {
    return this.campaigns.update(user.userId, id, dto);
  }

  @Post('campaigns/:id/schedule')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  schedule(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleScratchCampaignDto,
  ) {
    return this.campaigns.schedule(user.userId, id, dto.sendAt);
  }

  /** Cancellation is not Premium-gated: an expired plan must still be able to stop a campaign. */
  @Patch('campaigns/:id/status')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  setStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScratchStatusDto,
  ) {
    return dto.status === 'CANCELLED'
      ? this.campaigns.cancel(user.userId, id)
      : this.campaigns.unschedule(user.userId, id);
  }

  @Get('campaigns/:id/cancel-preview')
  @UseGuards(MerchantOwnerGuard)
  cancelPreview(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.cancelPreview(user.userId, id);
  }

  @Patch('campaigns/:id/dates')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  extendDates(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtendScratchDatesDto,
  ) {
    return this.campaigns.extendDates(user.userId, id, dto);
  }

  @Post('campaigns/:id/duplicate')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  duplicate(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.duplicate(user.userId, id);
  }

  @Delete('campaigns/:id')
  @UseGuards(MerchantOwnerGuard)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.remove(user.userId, id);
  }

  @Get('campaigns/:id/clients-without-app')
  @UseGuards(MerchantOwnerGuard)
  clientsWithoutApp(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.clientsWithoutApp(user.userId, id);
  }

  @Post('audience/estimate')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 60 } })
  estimate(@CurrentUser() user: JwtPayload, @Body() dto: AudienceEstimateDto) {
    return this.campaigns.estimateAudience(user.userId, dto);
  }

  // ── Coupons at the till (owner + team members, never Premium-gated) ──

  @Post('coupons/check')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  check(@CurrentUser() user: JwtPayload, @Body() dto: CheckCouponDto) {
    return this.coupons.check(user.userId, dto);
  }

  @Get('clients/:clientId/coupons')
  clientCoupons(@CurrentUser() user: JwtPayload, @Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.coupons.listForClientAtTill(user.userId, clientId);
  }

  @Post('coupons/:id/redeem')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  redeem(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RedeemCouponDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    let key: string | undefined;
    if (idempotencyKey && idempotencyKey.trim()) {
      key = idempotencyKey.trim();
      if (key.length > 64 || !/^[A-Za-z0-9_-]+$/.test(key)) {
        throw new BadRequestException('Idempotency-Key invalide (max 64 chars, [A-Za-z0-9_-]).');
      }
    }
    return this.coupons.redeem(
      user.userId,
      id,
      dto.purchaseAmount,
      {
        teamMemberId: user.teamMemberId ?? undefined,
        performedByName: user.teamMemberName ?? undefined,
        redeemedBy: user.type === 'team_member' ? user.teamMemberId ?? user.userId : user.userId,
      },
      key,
    );
  }

  @Get('coupons')
  listCoupons(@CurrentUser() user: JwtPayload, @Query() query: MerchantCouponsQueryDto) {
    return this.coupons.listMerchantCoupons(user.userId, query);
  }
}
