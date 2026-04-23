import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../common/constants';
import { ClientAuthService } from './client-auth.service';
import { ClientService } from './client.service';
import { ClientReferralService } from './client-referral.service';
import { ClientOnlyGuard } from '../common/guards/client-only.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { SendOtpEmailDto, VerifyOtpEmailDto, CompleteProfileDto, ClientUpdateProfileDto, UpdatePushTokenDto, GoogleLoginDto, AppleLoginDto, LoginEmailDto, SetPasswordDto, RefreshTokenDto, ClientDeleteAccountDto, ClientChangePasswordDto, SendChangeContactOtpDto, VerifyChangeContactOtpDto, RequestPayoutDto } from './dto';

@ApiTags('Client Auth')
@Controller('client-auth')
export class ClientAuthController {
  constructor(
    private readonly clientAuthService: ClientAuthService,
    private readonly clientService: ClientService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('refresh')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.clientAuthService.refreshAccessToken(dto.refresh_token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Headers('authorization') authHeader?: string) {
    let userId: string | undefined;
    try {
      const token = authHeader?.replace('Bearer ', '');
      if (token) {
        const payload = this.jwtService.decode(token) as JwtPayload | null;
        userId = payload?.userId;
      }
    } catch { /* token invalide — on continue quand même */ }
    if (userId) return this.clientAuthService.logout(userId);
    return { success: true, message: 'Déconnecté' };
  }

  @Post('send-otp-email')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 3 } })
  async sendOtpEmail(@Body() dto: SendOtpEmailDto) {
    return this.clientAuthService.sendOtpEmail(dto.email, dto.isRegister ?? false);
  }

  @Post('verify-otp-email')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  async verifyOtpEmail(@Body() dto: VerifyOtpEmailDto) {
    return this.clientAuthService.verifyOtpEmail(dto.email, dto.code, dto.isRegister ?? false);
  }

  @Post('google-login')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async googleLogin(@Body() dto: GoogleLoginDto) {
    return this.clientAuthService.googleLogin(dto.idToken);
  }

  @Post('apple-login')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async appleLogin(@Body() dto: AppleLoginDto) {
    return this.clientAuthService.appleLogin(dto.identityToken, dto.givenName, dto.familyName);
  }

  @Post('login-email')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  async loginWithEmail(@Body() dto: LoginEmailDto) {
    return this.clientAuthService.loginWithEmailPassword(dto.email, dto.password);
  }

  @Post('set-password')
  @UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
  async setPassword(@CurrentUser() user: JwtPayload, @Body() dto: SetPasswordDto) {
    return this.clientAuthService.setPassword(user.userId, dto.password);
  }

  @Post('reset-password-otp')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
  async resetPasswordOtp(@CurrentUser() user: JwtPayload, @Body() dto: SetPasswordDto) {
    return this.clientAuthService.resetPasswordOtp(user.userId, dto.password);
  }

  @Patch('change-password')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
  async changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ClientChangePasswordDto) {
    return this.clientAuthService.changePassword(user.userId, dto.currentPassword, dto.newPassword);
  }

  @Post('complete-profile')
  @UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
  async completeProfile(@CurrentUser() user: JwtPayload, @Body() dto: CompleteProfileDto) {
    return this.clientAuthService.completeProfile(user.userId, dto.prenom, dto.nom, dto.termsAccepted, dto.telephone, dto.dateNaissance, dto.password);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.clientService.getProfile(user.userId);
  }

  @Patch('profile')
  @UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
  async updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: ClientUpdateProfileDto) {
    return this.clientService.updateProfile(user.userId, dto);
  }

  @Patch('push-token')
  @UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
  async updatePushToken(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePushTokenDto) {
    return this.clientService.updatePushToken(user.userId, dto.pushToken);
  }

  @Post('delete-account')
  @UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
  async deleteAccount(@CurrentUser() user: JwtPayload, @Body() dto: ClientDeleteAccountDto) {
    return this.clientService.deleteAccount(user.userId, dto.password);
  }

  @Post('send-change-contact-otp')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 3 } })
  @UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
  async sendChangeContactOtp(@CurrentUser() user: JwtPayload, @Body() dto: SendChangeContactOtpDto) {
    return this.clientAuthService.sendChangeContactOtp(user.userId, dto.type, dto.value);
  }

  @Post('verify-change-contact-otp')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  @UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
  async verifyChangeContactOtp(@CurrentUser() user: JwtPayload, @Body() dto: VerifyChangeContactOtpDto) {
    return this.clientAuthService.verifyChangeContactOtp(user.userId, dto.type, dto.value, dto.code);
  }

  @Post('qr-token')
  @UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
  async generateQrToken(@CurrentUser() user: JwtPayload) {
    return this.clientAuthService.generateQrToken(user.userId);
  }

  /**
   * Loi n°09-08 (Maroc, CNDP) — Droit d'accès aux données personnelles.
   * Rate-limited to 3 exports per hour to prevent abuse.
   */
  @Get('data-export')
  @UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  async exportMyData(@CurrentUser() user: JwtPayload) {
    return this.clientAuthService.exportClientData(user.userId);
  }

  /** Public merchants listing — no auth required (guest mode) */
  @Get('merchants')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  async getPublicMerchants(
    @Query() { page, limit }: PaginationQueryDto,
  ) {
    return this.clientService.getMerchants(page, limit);
  }
}

@ApiTags('Client')
@Controller('client')
@UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
export class ClientController {
  constructor(
    private readonly clientService: ClientService,
    private readonly clientReferralService: ClientReferralService,
  ) {}

  @Get('stats')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  async getProfileStats(@CurrentUser() user: JwtPayload) {
    return this.clientService.getProfileStats(user.userId);
  }

  @Get('rewards')
  async getRewards(
    @CurrentUser() user: JwtPayload,
    @Query() { page, limit }: PaginationQueryDto,
  ) {
    return this.clientService.getRewardsHistory(user.userId, page, limit);
  }

  @Get('transactions')
  async getTransactions(
    @CurrentUser() user: JwtPayload,
    @Query() { page, limit }: PaginationQueryDto,
  ) {
    return this.clientService.getTransactionsHistory(user.userId, page, limit);
  }

  @Get('points')
  async getPointsOverview(
    @CurrentUser() user: JwtPayload,
    @Query() { page, limit }: PaginationQueryDto,
  ) {
    return this.clientService.getPointsOverview(user.userId, page, limit);
  }

  @Get('merchants')
  async getMerchants(
    @Query() { page, limit }: PaginationQueryDto,
  ) {
    return this.clientService.getMerchants(page, limit);
  }

  @Get('merchants/:id')
  async getMerchantById(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.clientService.getMerchantById(id, user.userId);
  }

  @Post('merchants/:id/join')
  @HttpCode(HttpStatus.OK)
  async joinMerchant(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.clientService.joinMerchant(user.userId, id);
  }

  @Delete('merchants/:id/leave')
  @HttpCode(HttpStatus.OK)
  async leaveMerchant(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.clientService.deactivateCard(user.userId, id);
  }

  @Get('notifications')
  async getNotifications(
    @CurrentUser() user: JwtPayload,
    @Query() { page, limit }: PaginationQueryDto,
  ) {
    return this.clientService.getNotifications(user.userId, page, limit);
  }

  @Get('notifications/unread-count')
  async getUnreadCount(@CurrentUser() user: JwtPayload) {
    return this.clientService.getUnreadCount(user.userId);
  }

  @Patch('notifications/:id/read')
  async markNotificationAsRead(
    @CurrentUser() user: JwtPayload,
    @Param('id') notificationId: string,
  ) {
    return this.clientService.markAsRead(user.userId, notificationId);
  }

  @Patch('notifications/read-all')
  async markAllNotificationsAsRead(@CurrentUser() user: JwtPayload) {
    return this.clientService.markAllAsRead(user.userId);
  }

  @Patch('notifications/unsubscribe-email')
  async unsubscribeEmail(@CurrentUser() user: JwtPayload) {
    return this.clientService.unsubscribeEmail(user.userId);
  }

  @Delete('notifications/all')
  async dismissAllNotifications(@CurrentUser() user: JwtPayload) {
    return this.clientService.dismissAllNotifications(user.userId);
  }

  @Delete('notifications/:id')
  async dismissNotification(
    @CurrentUser() user: JwtPayload,
    @Param('id') notificationId: string,
  ) {
    return this.clientService.dismissNotification(user.userId, notificationId);
  }

  @Get('referral')
  async getReferralStats(@CurrentUser() user: JwtPayload) {
    return this.clientReferralService.getReferralStats(user.userId);
  }

  @Post('referral/payout')
  async requestPayout(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RequestPayoutDto,
  ) {
    return this.clientReferralService.requestPayout(user.userId, dto);
  }

  @Get('referral/payout')
  async getPayoutHistory(@CurrentUser() user: JwtPayload) {
    return this.clientReferralService.getPayoutHistory(user.userId);
  }
}

/**
 * Public controller for RFC 8058 One-Click Unsubscribe.
 * NO JwtAuthGuard here — unsubscribe URLs are signed tokens that users reach
 * from their email client (Gmail/Yahoo/Apple Mail) without being logged in.
 * Required by Gmail & Yahoo bulk sender policy (Feb 2024) to avoid spam flags.
 */
@ApiTags('Public Unsubscribe')
@Controller('public/unsubscribe')
export class PublicUnsubscribeController {
  constructor(
    private readonly clientService: ClientService,
    private readonly jwtService: JwtService,
  ) {}

  /** One-Click unsubscribe (POST for RFC 8058 compliance) */
  @Post('email')
  @HttpCode(HttpStatus.OK)
  async unsubscribeEmailPost(@Query('t') token: string) {
    return this.handle(token);
  }

  /** Fallback GET — so users can also click a plain link */
  @Get('email')
  async unsubscribeEmailGet(@Query('t') token: string) {
    await this.handle(token);
    // Return a tiny HTML page so the user sees confirmation in browser
    return {
      statusCode: 200,
      message: 'Vous êtes désabonné des emails marketing JitPlus.',
    };
  }

  private async handle(token: string): Promise<{ success: boolean }> {
    if (!token) throw new Error('Missing token');
    let payload: { clientId?: string; purpose?: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new Error('Invalid or expired unsubscribe token');
    }
    if (payload?.purpose !== 'unsubscribe_email' || !payload.clientId) {
      throw new Error('Invalid unsubscribe token');
    }
    await this.clientService.unsubscribeEmail(payload.clientId);
    return { success: true };
  }
}


