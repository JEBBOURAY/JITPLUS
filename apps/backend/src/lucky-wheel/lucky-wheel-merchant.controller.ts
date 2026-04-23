import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../common/constants';
import { MerchantTypeGuard } from '../auth/guards/merchant-type.guard';
import { MerchantOwnerGuard } from '../auth/guards/merchant-owner.guard';
import { PremiumGuard } from '../auth/guards/premium.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { LuckyWheelService } from './lucky-wheel.service';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
  UpdateCampaignStatusDto,
  FulfilPrizeDto,
} from './dto';

@ApiTags('luckyWheel – Merchant')
@ApiBearerAuth()
@Controller('lucky-wheel/merchant')
@UseGuards(AuthGuard('jwt'), MerchantTypeGuard)
export class LuckyWheelMerchantController {
  constructor(private readonly LuckyWheelService: LuckyWheelService) {}

  @Post('campaigns')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  async createCampaign(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.LuckyWheelService.createCampaign(user.sub, {
      ...dto,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
    });
  }

  @Get('campaigns')
  @UseGuards(PremiumGuard)
  async getCampaigns(@CurrentUser() user: JwtPayload) {
    return this.LuckyWheelService.getMerchantCampaigns(user.sub);
  }

  @Get('campaigns/:id/stats')
  @UseGuards(PremiumGuard)
  async getCampaignStats(
    @CurrentUser() user: JwtPayload,
    @Param('id') campaignId: string,
  ) {
    return this.LuckyWheelService.getCampaignStats(user.sub, campaignId);
  }

  @Patch('campaigns/:id/status')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') campaignId: string,
    @Body() dto: UpdateCampaignStatusDto,
  ) {
    return this.LuckyWheelService.updateCampaignStatus(user.sub, campaignId, dto.status);
  }

  @Post('fulfil')
  @UseGuards(PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 20 } })
  async fulfilPrize(
    @CurrentUser() user: JwtPayload,
    @Body() dto: FulfilPrizeDto,
  ) {
    const fulfilledBy = user.type === 'team_member' ? user.teamMemberId ?? user.sub : user.sub;
    return this.LuckyWheelService.fulfilPrize(user.sub, dto.drawId, fulfilledBy);
  }

  @Get('pending-prizes')
  @UseGuards(PremiumGuard)
  async getPendingPrizes(@CurrentUser() user: JwtPayload) {
    return this.LuckyWheelService.getPendingPrizes(user.sub);
  }

  @Get('fulfilled-prizes')
  @UseGuards(PremiumGuard)
  async getFulfilledPrizes(@CurrentUser() user: JwtPayload) {
    return this.LuckyWheelService.getFulfilledPrizes(user.sub);
  }

  @Patch('campaigns/:id')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async updateCampaign(
    @CurrentUser() user: JwtPayload,
    @Param('id') campaignId: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.LuckyWheelService.updateCampaign(user.sub, campaignId, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.globalWinRate !== undefined && { globalWinRate: dto.globalWinRate }),
      ...(dto.minSpendAmount !== undefined && { minSpendAmount: dto.minSpendAmount }),
      ...(dto.startsAt && { startsAt: new Date(dto.startsAt) }),
      ...(dto.endsAt && { endsAt: new Date(dto.endsAt) }),
      ...(dto.prizes && { prizes: dto.prizes }),
    });
  }

  @Delete('campaigns/:id')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  async deleteCampaign(
    @CurrentUser() user: JwtPayload,
    @Param('id') campaignId: string,
  ) {
    return this.LuckyWheelService.deleteCampaign(user.sub, campaignId);
  }

  @Get('active-info')
  async getActiveLuckyWheelInfo(@CurrentUser() user: JwtPayload) {
    return this.LuckyWheelService.getActiveLuckyWheelInfo(user.sub);
  }
}
