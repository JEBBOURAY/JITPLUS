import {
  Controller, Get, Post, Body, Query, Headers,
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
import { parseIdempotencyKey } from '../../common/utils/idempotency-key';
import { MerchantTransactionsQueryDto } from '../dto/transactions-query.dto';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { AdjustStampsDto } from '../dto/adjust-stamps.dto';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { MerchantTransactionService, MerchantDashboardService, ScanTicketService, SCAN_TICKET_HEADER, type ScanTicketKind } from '../services';

@ApiTags('Merchant – Transactions')
@ApiBearerAuth()
@Controller('merchant')
@UseGuards(JwtAuthGuard, MerchantTypeGuard)
export class MerchantTransactionController {
  constructor(
    private transactionService: MerchantTransactionService,
    private dashboardService: MerchantDashboardService,
    private scanTickets: ScanTicketService,
  ) {}

  @Post('transactions')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  async createTransaction(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers(SCAN_TICKET_HEADER) scanTicket?: string,
  ) {
    const { clientId, type, amount, stamps, rewardId, bookingId, completeBooking } = dto;
    return this.transactionService.createTransaction(
      clientId,
      user.userId,
      type,
      amount,
      stamps,
      rewardId,
      user.teamMemberId ?? undefined,
      user.teamMemberName ?? undefined,
      parseIdempotencyKey(idempotencyKey),
      {
        ...this.enrollOptions(this.scanTickets.verifyKind(scanTicket, clientId, user.userId)),
        booking: bookingId ? { id: bookingId, complete: !!completeBooking } : undefined,
      },
    );
  }

  /**
   * A QR ticket proves consent and presence (enroll, revive a left card, unlock the welcome gift).
   * A phone ticket only enrolls, and the new card keeps the client's details masked until they confirm.
   */
  private enrollOptions(kind: ScanTicketKind | null) {
    return {
      allowEnroll: kind !== null,
      allowReactivate: kind === 'qr',
      welcomeProof: kind === 'qr',
      consentPending: kind === 'phone',
    };
  }

  @Get('transactions')
  async getTransactions(
    @Query() { page, limit, kind, search, from, staff }: MerchantTransactionsQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transactionService.getTransactions(user.userId, page, limit, { kind, search, from, staff });
  }

  @Post('transactions/adjust')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 20 } })
  async adjustStamps(
    @Body() dto: AdjustStampsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transactionService.adjustStamps(
      dto.clientId,
      user.userId,
      dto.stamps,
      dto.note,
      user.teamMemberId ?? undefined,
      user.teamMemberName ?? undefined,
    );
  }

  // ── Accueil KPI (all plans, team-accessible) ──
  @Get('home-stats')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  async getHomeStats(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getHomeStats(user.userId);
  }

  @Get('dashboard-kpis')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 15 } })
  async getDashboardKpis(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getKpis(user.userId);
  }

  @Get('dashboard-trends')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 15 } })
  async getDashboardTrends(@Query() { period }: DashboardQueryDto, @CurrentUser() user: JwtPayload) {
    return this.dashboardService.getDashboardTrends(user.userId, period!);
  }

  @Get('dashboard-distribution')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 15 } })
  async getDashboardDistribution(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getRewardsDistribution(user.userId);
  }

  @Get('dashboard-games')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 15 } })
  async getDashboardGames(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getGamesStats(user.userId);
  }
}
