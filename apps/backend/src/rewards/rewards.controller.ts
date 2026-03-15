import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RewardsService } from './rewards.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MerchantTypeGuard } from '../auth/guards/merchant-type.guard';
import { MerchantOwnerGuard } from '../auth/guards/merchant-owner.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateRewardDto } from './dto/create-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';

@ApiTags('Rewards')
@ApiBearerAuth()
@Controller('rewards')
@UseGuards(JwtAuthGuard, MerchantTypeGuard)
export class RewardsController {
  constructor(private rewardsService: RewardsService) {}

  @Get()
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.rewardsService.findAll(user.userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.rewardsService.findOne(id, user.userId);
  }

  @Post()
  @UseGuards(MerchantOwnerGuard)
  async create(@Body() dto: CreateRewardDto, @CurrentUser() user: JwtPayload) {
    return this.rewardsService.create(user.userId, dto);
  }

  @Put(':id')
  @UseGuards(MerchantOwnerGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateRewardDto, @CurrentUser() user: JwtPayload) {
    return this.rewardsService.update(id, user.userId, dto);
  }

  @Delete(':id')
  @UseGuards(MerchantOwnerGuard)
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.rewardsService.remove(id, user.userId);
  }
}
