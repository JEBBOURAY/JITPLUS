import { Body, Controller, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../common/constants';
import { ClientOnlyGuard } from '../common/guards/client-only.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { MerchantTransactionService } from '../merchant/services/merchant-transaction.service';
import { StampCodeTokenService } from './stamp-code-token.service';
import { RedeemStampCodeDto } from './dto';

@ApiTags('Stamp codes – Client')
@ApiBearerAuth()
@Controller('stamp-codes/client')
@UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
export class StampCodesClientController {
  constructor(
    private readonly tokens: StampCodeTokenService,
    private readonly transactions: MerchantTransactionService,
  ) {}

  /** Client scanned the QR code found in a parcel: credit its stamps (single use). */
  @Post('redeem')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  redeem(@CurrentUser() user: JwtPayload, @Body() dto: RedeemStampCodeDto) {
    const codeId = this.tokens.verify(dto.token);
    if (!codeId) throw new NotFoundException({ code: 'STAMP_CODE_INVALID', message: 'QR code invalide' });
    return this.transactions.redeemStampCode(user.userId, codeId);
  }
}
