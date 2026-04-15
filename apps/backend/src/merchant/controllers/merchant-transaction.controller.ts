import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../../common/constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MerchantTypeGuard } from '../../auth/guards/merchant-type.guard';
import { MerchantOwnerGuard } from '../../auth/guards/merchant-owner.guard';
import { PremiumGuard } from '../../auth/guards/premium.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { AdjustPointsDto } from '../dto/adjust-points.dto';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { MerchantTransactionService, MerchantDashboardService } from '../services';

@ApiTags('Merchant – Transactions')
@ApiBearerAuth()
@Controller('merchant')
@UseGuards(JwtAuthGuard, MerchantTypeGuard)
export class MerchantTransactionController {
  constructor(
    private transactionService: MerchantTransactionService,
    private dashboardService: MerchantDashboardService,
  ) {}

  @Post('transactions')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  async createTransaction(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const { clientId, type, amount, points, rewardId } = dto;
    return this.transactionService.createTransaction(clientId, user.userId, type, amount, points, rewardId, user.teamMemberId ?? undefined, user.teamMemberName ?? undefined);
  }

  @Get('transactions')
  async getTransactions(@Query() { page, limit }: PaginationQueryDto, @CurrentUser() user: JwtPayload) {
    return this.transactionService.getTransactions(user.userId, page, limit);
  }

  @Patch('transactions/:id/cancel')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async cancelTransaction(@Param('id') transactionId: string, @CurrentUser() user: JwtPayload) {
    return this.transactionService.cancelTransaction(transactionId, user.userId);
  }

  @Patch('transactions/:id/fulfill')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async fulfillGift(@Param('id') transactionId: string, @CurrentUser() user: JwtPayload) {
    return this.transactionService.fulfillGift(transactionId, user.userId);
  }

  @Get('pending-gifts')
  async getPendingGifts(@CurrentUser() user: JwtPayload) {
    return this.transactionService.getPendingGifts(user.userId);
  }

  @Post('transactions/adjust')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 20 } })
  async adjustPoints(
    @Body() dto: AdjustPointsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transactionService.adjustPoints(
      dto.clientId,
      user.userId,
      dto.points,
      dto.note,
      user.teamMemberId ?? undefined,
      user.teamMemberName ?? undefined,
    );
  }

  @Get('dashboard-stats')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 15 } })
  async getDashboardStats(@Query() { period }: DashboardQueryDto, @CurrentUser() user: JwtPayload) {
    return this.dashboardService.getDashboardStats(user.userId, period!);
  }

  @Get('dashboard-trends')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 15 } })
  async getDashboardTrends(@Query() { period }: DashboardQueryDto, @CurrentUser() user: JwtPayload) {
    return this.dashboardService.getDashboardTrends(user.userId, period!);
  }
}
