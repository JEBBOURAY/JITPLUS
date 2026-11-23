import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ClientOnlyGuard } from '../common/guards/client-only.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CollectionProgressService } from './collection-progress.service';

@ApiTags('Collections – Client')
@ApiBearerAuth()
@Controller('collections/client')
@UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
export class CollectionsClientController {
  constructor(private readonly progress: CollectionProgressService) {}

  /** Home tile and collections screen: open collections of the caller's shops and the gifts won. */
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.progress.listForClient(user.userId);
  }

  /** The open collection of a merchant with the caller's own progress. */
  @Get('merchants/:merchantId')
  forMerchant(@CurrentUser() user: JwtPayload, @Param('merchantId', ParseUUIDPipe) merchantId: string) {
    return this.progress.forClient(user.userId, merchantId);
  }
}
