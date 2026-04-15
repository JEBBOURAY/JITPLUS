import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../../common/constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MerchantTypeGuard } from '../../auth/guards/merchant-type.guard';
import { MerchantOwnerGuard } from '../../auth/guards/merchant-owner.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { CreateStoreDto } from '../dto/create-store.dto';
import { UpdateStoreDto } from '../dto/update-store.dto';
import { MerchantStoreService } from '../services';

@ApiTags('Merchant – Stores')
@ApiBearerAuth()
@Controller('merchant')
@UseGuards(JwtAuthGuard, MerchantTypeGuard)
export class MerchantStoreController {
  constructor(private storeService: MerchantStoreService) {}

  @Get('stores')
  @UseGuards(MerchantOwnerGuard)
  async getStores(@CurrentUser() user: JwtPayload) {
    return this.storeService.getStores(user.userId);
  }

  @Get('stores/:id')
  @UseGuards(MerchantOwnerGuard)
  async getStore(@Param('id') storeId: string, @CurrentUser() user: JwtPayload) {
    return this.storeService.getStore(user.userId, storeId);
  }

  @Post('stores')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async createStore(@Body() dto: CreateStoreDto, @CurrentUser() user: JwtPayload) {
    return this.storeService.createStore(user.userId, dto);
  }

  @Patch('stores/:id')
  @UseGuards(MerchantOwnerGuard)
  async updateStore(@Param('id') storeId: string, @Body() dto: UpdateStoreDto, @CurrentUser() user: JwtPayload) {
    return this.storeService.updateStore(user.userId, storeId, dto);
  }

  @Delete('stores/:id')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async deleteStore(@Param('id') storeId: string, @CurrentUser() user: JwtPayload) {
    return this.storeService.deleteStore(user.userId, storeId);
  }
}
