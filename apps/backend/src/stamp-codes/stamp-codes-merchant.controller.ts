import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MerchantTypeGuard } from '../auth/guards/merchant-type.guard';
import { MerchantOwnerGuard } from '../auth/guards/merchant-owner.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { StampCodesService } from './stamp-codes.service';
import { CreateStampCodeBatchDto } from './dto';

/**
 * E-commerce QR codes (parcels / deliveries). Every plan: FREE has a monthly
 * allowance enforced by the service. Creating and revoking is owner-only;
 * team members can read and print the batches.
 */
@ApiTags('Stamp codes – Merchant')
@ApiBearerAuth()
@Controller('stamp-codes/merchant')
@UseGuards(JwtAuthGuard, MerchantTypeGuard)
export class StampCodesMerchantController {
  constructor(private readonly stampCodes: StampCodesService) {}

  @Get('quota')
  quota(@CurrentUser() user: JwtPayload) {
    return this.stampCodes.getQuota(user.userId);
  }

  @Get('batches')
  list(@CurrentUser() user: JwtPayload, @Query() { page, limit }: PaginationQueryDto) {
    return this.stampCodes.listBatches(user.userId, page, limit);
  }

  @Get('batches/:batchId')
  get(@CurrentUser() user: JwtPayload, @Param('batchId', ParseUUIDPipe) batchId: string) {
    return this.stampCodes.getBatch(user.userId, batchId);
  }

  @Post('batches')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateStampCodeBatchDto) {
    return this.stampCodes.createBatch(user.userId, dto);
  }

  @Post('batches/:batchId/revoke')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 20 } })
  revokeBatch(@CurrentUser() user: JwtPayload, @Param('batchId', ParseUUIDPipe) batchId: string) {
    return this.stampCodes.revokeBatch(user.userId, batchId);
  }

  @Post('codes/:id/revoke')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  revokeCode(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.stampCodes.revokeCode(user.userId, id);
  }
}
