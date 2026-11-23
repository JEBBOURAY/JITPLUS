import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { parseIdempotencyKey } from '../common/utils/idempotency-key';
import { CollectionsService } from './collections.service';
import { CollectionProgressService } from './collection-progress.service';
import { CheckCollectionItemsDto, CreateCollectionDto } from './dto';

@ApiTags('Collections – Merchant')
@ApiBearerAuth()
@Controller('collections/merchant')
@UseGuards(AuthGuard('jwt'), MerchantTypeGuard)
export class CollectionsMerchantController {
  constructor(
    private readonly collections: CollectionsService,
    private readonly progress: CollectionProgressService,
  ) {}

  // ── Collections (owner + Premium, reads stay open after the plan expires) ──

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.collections.list(user.userId);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.collections.get(user.userId, id);
  }

  @Post()
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCollectionDto) {
    return this.collections.create(user.userId, dto);
  }

  @Put(':id')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 20 } })
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCollectionDto) {
    return this.collections.update(user.userId, id, dto);
  }

  @Post(':id/activate')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  activate(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.collections.activate(user.userId, id);
  }

  /** Not Premium-gated: an expired plan must still be able to stop a collection. */
  @Post(':id/end')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  end(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.collections.end(user.userId, id);
  }

  @Delete(':id')
  @UseGuards(MerchantOwnerGuard)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.collections.remove(user.userId, id);
  }

  // ── At the till (owner + team members) ──

  @Get('clients/:clientId')
  forClient(@CurrentUser() user: JwtPayload, @Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.progress.forClientAtTill(user.userId, clientId);
  }

  @Post('checks')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  check(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CheckCollectionItemsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    // Required here: it is what tells a retry from a new visit on a repeatable collection.
    const key = parseIdempotencyKey(idempotencyKey);
    if (!key) throw new BadRequestException('Idempotency-Key requise.');
    return this.progress.check(
      user.userId,
      dto.clientId,
      dto.itemIds,
      { teamMemberId: user.teamMemberId ?? undefined, performedByName: user.teamMemberName ?? undefined },
      key,
    );
  }
}
