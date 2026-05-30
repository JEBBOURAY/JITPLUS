import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MerchantTypeGuard } from '../../auth/guards/merchant-type.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { THROTTLE_TTL } from '../../common/constants';
import { QuickAddTransactionDto } from '../dto/quick-add.dto';
import { ClientClaimService } from '../services/client-claim.service';

/**
 * Quick-Add — friction-zero onboarding endpoint used by JitPlus Pro.
 * The merchant taps "Ajouter via téléphone", enters a phone + amount, and
 * receives a WhatsApp-ready claim URL the customer can use to retrieve
 * their loyalty history after installing the app.
 *
 * Security:
 *  • Same guards as `/merchant/transactions` (JWT + MerchantTypeGuard)
 *  • Stricter throttle (15/min) — phone enumeration mitigation
 *  • Idempotency-Key header forwarded into the transaction layer
 */
@ApiTags('Merchant – Quick-Add (WhatsApp)')
@ApiBearerAuth()
@Controller('merchant')
@UseGuards(JwtAuthGuard, MerchantTypeGuard)
export class MerchantQuickAddController {
  constructor(private readonly claimService: ClientClaimService) {}

  @Post('clients/quick-add')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 15 } })
  async quickAdd(
    @Body() dto: QuickAddTransactionDto,
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    let normalizedKey: string | undefined;
    if (idempotencyKey && idempotencyKey.trim()) {
      const trimmed = idempotencyKey.trim();
      if (trimmed.length > 64 || !/^[A-Za-z0-9_\-]+$/.test(trimmed)) {
        throw new BadRequestException('Idempotency-Key invalide (max 64 chars, [A-Za-z0-9_-]).');
      }
      normalizedKey = trimmed;
    }
    return this.claimService.quickAddAndClaim({
      merchantId: user.userId,
      telephone: dto.telephone,
      countryCode: dto.countryCode,
      prenom: dto.prenom,
      type: dto.type,
      amount: dto.amount,
      points: dto.points,
      rewardId: dto.rewardId,
      teamMemberId: user.teamMemberId ?? undefined,
      performedByName: user.teamMemberName ?? undefined,
      idempotencyKey: normalizedKey,
    });
  }

  /**
   * Re-issue a WhatsApp claim link for an anonymous client without
   * crediting a new transaction. Stricter throttle to limit abuse.
   */
  @Post('clients/:clientId/reshare-claim')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async reshareClaim(
    @Param('clientId') clientId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(clientId)) {
      throw new BadRequestException('Identifiant client invalide');
    }
    return this.claimService.reshareClaim(user.userId, clientId);
  }
}
