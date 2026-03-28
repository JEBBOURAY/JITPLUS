import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, UseGuards, Req, Headers } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../common/constants';
import { AuthService } from './auth.service';
import { MerchantReferralService } from '../merchant/services/merchant-referral.service';
import { ClientReferralService } from '../client-auth/client-referral.service';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginMerchantDto } from './dto/google-login-merchant.dto';
import { GoogleRegisterMerchantDto } from './dto/google-register-merchant.dto';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { RefreshMerchantTokenDto } from './dto/refresh-merchant-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SendVerificationEmailDto } from './dto/send-verification-email.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { Request } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private referralService: MerchantReferralService,
    private clientReferralService: ClientReferralService,
    private jwtService: JwtService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const ipAddress = req.ip || 'unknown';
    return this.authService.login(loginDto, ipAddress);
  }

  @Post('register')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 3 } })
  async register(@Body() registerDto: RegisterMerchantDto) {
    return this.authService.register(registerDto);
  }

  @Post('google-login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async googleLogin(@Body() dto: GoogleLoginMerchantDto, @Req() req: Request) {
    const ipAddress = req.ip || 'unknown';
    return this.authService.googleLoginMerchant(dto, ipAddress);
  }

  @Post('google-register')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 3 } })
  async googleRegister(@Body() dto: GoogleRegisterMerchantDto) {
    return this.authService.googleRegisterMerchant(dto);
  }

  @Post('refresh-token')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  async refreshWithToken(@Body() dto: RefreshMerchantTokenDto) {
    return this.authService.refreshWithToken(dto.refresh_token, dto.session_id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Headers('authorization') authHeader?: string) {
    let sessionId: string | undefined;
    try {
      const token = authHeader?.replace('Bearer ', '');
      if (token) {
        const payload = this.jwtService.verify<JwtPayload>(token);
        sessionId = payload?.sessionId;
      }
    } catch { /* token invalide ou expiré — on continue quand même */ }
    return this.authService.logout(sessionId);
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async refresh(@CurrentUser() user: JwtPayload) {
    return this.authService.refreshToken(user);
  }

  // ── Mot de passe oublié ──
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 3 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
  }

  // ── Email Verification ──
  @Post('send-verification-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 3 } })
  async sendVerificationEmail(@Body() dto: SendVerificationEmailDto) {
    return this.authService.sendVerificationEmail(dto.email);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.email, dto.code);
  }

  // ── Parrainage (public — consulté avant inscription) ──
  @Get('referral/check/:code')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  async checkReferralCode(@Param('code') code: string) {
    try {
      return await this.referralService.validateCode(code);
    } catch {
      return this.clientReferralService.validateCode(code);
    }
  }
}
