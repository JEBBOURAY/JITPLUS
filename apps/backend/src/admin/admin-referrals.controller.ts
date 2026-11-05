import { Controller, Get, Patch, Param, Query, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminReferralService } from './admin-referral.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import {
  ClientReferralListQueryDto, PayoutRequestListQueryDto, ReferralListQueryDto,
  TopReferrersQueryDto, UpdatePayoutStatusDto,
} from './dto/referral-query.dto';

/** Referral program: stats, referral lists and client payout requests. */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminReferralsController {
  constructor(
    private readonly referralService: AdminReferralService,
  ) {}

  // ── Referral management ──────────────────────────────────────────────────

  @Get('referrals/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Referral program statistics' })
  async getReferralStats() {
    return this.referralService.getReferralStats();
  }

  @Get('referrals/merchant-to-merchant')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'List merchant-to-merchant referrals' })
  async listMerchantReferrals(
    @Query() query: ReferralListQueryDto,
  ) {
    return this.referralService.listMerchantReferrals(query.page, query.limit, query.search);
  }

  @Get('referrals/client-to-merchant')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'List client-to-merchant referrals' })
  async listClientReferrals(
    @Query() query: ClientReferralListQueryDto,
  ) {
    return this.referralService.listClientReferrals(query.page, query.limit, query.status, query.search);
  }

  @Get('referrals/top-referrers')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'List top merchant referrers' })
  async listTopReferrers(@Query() query: TopReferrersQueryDto) {
    return this.referralService.listTopReferrers(query.limit);
  }

  @Get('referrals/payout-requests')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'List client payout requests' })
  async listPayoutRequests(@Query() query: PayoutRequestListQueryDto) {
    return this.referralService.listPayoutRequests(query.page, query.limit, query.status, query.search);
  }

  @Patch('referrals/payout-requests/:id/status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Approve or reject a payout request' })
  async updatePayoutRequestStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayoutStatusDto,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.referralService.updatePayoutRequestStatus(id, dto.status, admin.sub);
  }
}
