import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, Req, Headers } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../common/constants';
import { AuthService } from './auth.service';
import { MerchantSessionService } from './merchant-session.service';
import { MerchantSignupService } from './merchant-signup.service';
import { MerchantOAuthService } from './merchant-oauth.service';
import { MerchantOtpService } from './merchant-otp.service';
import { MerchantReferralService } from '../merchant/services/merchant-referral.service';
import { ClientReferralService } from '../client-auth/client-referral.service';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginMerchantDto } from './dto/google-login-merchant.dto';
import { GoogleRegisterMerchantDto } from './dto/google-register-merchant.dto';
import { AppleLoginMerchantDto } from './dto/apple-login-merchant.dto';
import { AppleRegisterMerchantDto } from './dto/apple-register-merchant.dto';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { RefreshMerchantTokenDto } from './dto/refresh-merchant-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SendVerificationEmailDto } from './dto/send-verification-email.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CheckEmailDto } from './dto/check-email.dto';
import { CheckPhoneDto } from './dto/check-phone.dto';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenPayload } from '../common/interfaces/jwt-payload.interface';
import { Request } from 'express';

const JWT_VERIFICATION_ERRORS = new Set(['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError']);

function isJwtVerificationError(err: unknown): boolean {
  return err instanceof Error && JWT_VERIFICATION_ERRORS.has(err.name);
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private signupService: MerchantSignupService,
    private oauthService: MerchantOAuthService,
    private sessionService: MerchantSessionService,
    private otpService: MerchantOtpService,
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
    return this.signupService.register(registerDto);
  }

  @Post('google-login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async googleLogin(@Body() dto: GoogleLoginMerchantDto, @Req() req: Request) {
    const ipAddress = req.ip || 'unknown';
    return this.oauthService.googleLoginMerchant(dto, ipAddress);
  }

  @Post('google-register')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 3 } })
  async googleRegister(@Body() dto: GoogleRegisterMerchantDto) {
    return this.oauthService.googleRegisterMerchant(dto);
  }

  @Post('apple-login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async appleLogin(@Body() dto: AppleLoginMerchantDto, @Req() req: Request) {
    const ipAddress = req.ip || 'unknown';
    return this.oauthService.appleLoginMerchant(dto, ipAddress);
  }

  @Post('apple-register')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 3 } })
  async appleRegister(@Body() dto: AppleRegisterMerchantDto) {
    return this.oauthService.appleRegisterMerchant(dto);
  }

  @Post('refresh-token')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  async refreshWithToken(@Body() dto: RefreshMerchantTokenDto) {
    return this.sessionService.refreshWithToken(dto.refresh_token, dto.session_id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Headers('authorization') authHeader?: string) {
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : undefined;
    let sessionId: string | undefined;
    if (token) {
      try {
        // The signature is still checked; an expired access token must not keep
        // its device session (and refresh token) alive after logout.
        sessionId = this.jwtService.verify<JwtTokenPayload>(token, { ignoreExpiration: true }).jti;
      } catch (err) {
        // Forged or malformed token: nothing to revoke, logout still succeeds.
        if (!isJwtVerificationError(err)) throw err;
      }
    }
    return this.sessionService.logout(sessionId);
  }

  // ── Mot de passe oublié ──
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 3 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.otpService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.otpService.resetPassword(dto.email, dto.code, dto.newPassword);
  }

  // ── Email Verification ──
  @Post('send-verification-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 3 } })
  async sendVerificationEmail(@Body() dto: SendVerificationEmailDto) {
    return this.otpService.sendVerificationEmail(dto.email);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.otpService.verifyEmail(dto.email, dto.code);
  }

  // ── Uniqueness checks (public — used during registration) ──
  @Post('check-email')
  @HttpCode(HttpStatus.OK)
  // Called on field blur: a merchant fixing a typo blurs several times.
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async checkEmail(@Body() dto: CheckEmailDto) {
    return this.signupService.checkEmailExists(dto.email);
  }

  @Post('check-phone')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async checkPhone(@Body() dto: CheckPhoneDto) {
    return this.signupService.checkPhoneExists(dto.phoneNumber);
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
