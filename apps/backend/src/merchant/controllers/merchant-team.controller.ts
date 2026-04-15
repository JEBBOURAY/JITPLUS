import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
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
import { CreateTeamMemberDto } from '../dto/create-team-member.dto';
import { UpdateTeamMemberDto } from '../dto/update-team-member.dto';
import { MerchantTeamService } from '../services';

@ApiTags('Merchant – Team')
@ApiBearerAuth()
@Controller('merchant')
@UseGuards(JwtAuthGuard, MerchantTypeGuard)
export class MerchantTeamController {
  constructor(private teamService: MerchantTeamService) {}

  @Get('team')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  async getTeamMembers(@CurrentUser() user: JwtPayload) {
    return this.teamService.getTeamMembers(user.userId);
  }

  @Post('team')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async createTeamMember(@Body() dto: CreateTeamMemberDto, @CurrentUser() user: JwtPayload) {
    return this.teamService.createTeamMember(user.userId, dto);
  }

  @Patch('team/:id')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  async updateTeamMember(@Param('id') memberId: string, @Body() dto: UpdateTeamMemberDto, @CurrentUser() user: JwtPayload) {
    return this.teamService.updateTeamMember(user.userId, memberId, dto);
  }

  @Delete('team/:id')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async deleteTeamMember(@Param('id') memberId: string, @CurrentUser() user: JwtPayload) {
    return this.teamService.deleteTeamMember(user.userId, memberId);
  }
}
