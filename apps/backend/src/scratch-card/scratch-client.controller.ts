import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../common/constants';
import { ClientOnlyGuard } from '../common/guards/client-only.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ScratchPlayService } from './scratch-play.service';
import { CouponService } from './coupon.service';
import { ListCardsQueryDto, ListCouponsQueryDto } from './dto';

@ApiTags('Scratch cards – Client')
@ApiBearerAuth()
@Controller('scratch/client')
@UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
export class ScratchClientController {
  constructor(
    private readonly play: ScratchPlayService,
    private readonly coupons: CouponService,
  ) {}

  @Get('cards')
  listCards(@CurrentUser() user: JwtPayload, @Query() query: ListCardsQueryDto) {
    return this.play.listCards(user.userId, query.status);
  }

  @Get('cards/by-campaign/:campaignId')
  getByCampaign(@CurrentUser() user: JwtPayload, @Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.play.getCardByCampaign(user.userId, campaignId);
  }

  @Get('cards/:id')
  getCard(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.play.getCard(user.userId, id);
  }

  @Post('cards/:id/open')
  open(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.play.markOpened(user.userId, id);
  }

  @Post('cards/:id/scratch')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  scratch(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.play.scratch(user.userId, id);
  }

  @Get('coupons')
  listCoupons(@CurrentUser() user: JwtPayload, @Query() query: ListCouponsQueryDto) {
    return this.coupons.listClientCoupons(user.userId, query.status, query.merchantId);
  }

  @Get('coupons/:id')
  getCoupon(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.coupons.getClientCoupon(user.userId, id);
  }
}
