import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MerchantPlanModule } from '../merchant/merchant-plan.module';
import { jwtModuleFactory } from '../common/jwt/jwt-module.factory';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync(jwtModuleFactory('jitplus-merchant')),
    MerchantPlanModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
