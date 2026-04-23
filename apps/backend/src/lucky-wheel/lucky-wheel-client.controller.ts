import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../common/constants';
import { ClientOnlyGuard } from '../common/guards/client-only.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { LuckyWheelService } from './lucky-wheel.service';
import { TriggerDrawDto } from './dto';

@ApiTags('luckyWheel – Client')
@ApiBearerAuth()
@Controller('lucky-wheel/client')
@UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
export class LuckyWheelClientController {
  constructor(private readonly LuckyWheelService: LuckyWheelService) {}

  @Get('available-draws')
  async getAvailableDraws(@CurrentUser() user: JwtPayload) {
    return this.LuckyWheelService.getClientAvailableDraws(user.sub);
  }

  @Post('trigger-draw')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 3 } })
  async triggerDraw(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TriggerDrawDto,
  ) {
    return this.LuckyWheelService.triggerDraw(user.sub, dto.ticketId);
  }

  @Get('history')
  async getDrawHistory(@CurrentUser() user: JwtPayload) {
    return this.LuckyWheelService.getClientDrawHistory(user.sub);
  }
}
