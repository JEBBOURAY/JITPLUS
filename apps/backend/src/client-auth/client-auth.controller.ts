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
  NotFoundException,
  BadRequestException,
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
import { ClientOnlyGuard } from '../common/guards/client-only.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { SendOtpDto, VerifyOtpDto, CompleteProfileDto, ClientUpdateProfileDto, UpdatePushTokenDto, DevLoginDto, SendOtpEmailDto, VerifyOtpEmailDto, GoogleLoginDto, LoginEmailDto, LoginPhoneDto, SetPasswordDto, RefreshTokenDto, ClientDeleteAccountDto } from './dto';

@ApiTags('Client Auth')
@Controller('client-auth')
export class ClientAuthController {
  constructor(
    private readonly clientAuthService: ClientAuthService,
    private readonly clientService: ClientService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('refresh')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
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

  @Post('send-otp')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 3 } })  // 3 OTP/minute max per IP
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.clientAuthService.sendOtp(dto.telephone, dto.isRegister ?? false);
  }

  @Post('verify-otp')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })  // 5 attempts/minute
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.clientAuthService.verifyOtp(dto.telephone, dto.code);
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

  @Post('dev-login')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  async devLogin(@Body() dto: DevLoginDto) {
    // SECURITY: reject unless NODE_ENV is explicitly set to 'development'
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'development') {
      throw new NotFoundException();
    }
    return this.clientAuthService.devLogin(dto.telephone);
  }

  @Post('login-email')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  async loginWithEmail(@Body() dto: LoginEmailDto) {
    return this.clientAuthService.loginWithEmailPassword(dto.email, dto.password);
  }

  @Post('login-phone')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
  async loginWithPhone(@Body() dto: LoginPhoneDto) {
    return this.clientAuthService.loginWithPhonePassword(dto.telephone, dto.password);
  }

  @Post('set-password')
  @UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
  async setPassword(@CurrentUser() user: JwtPayload, @Body() dto: SetPasswordDto) {
    return this.clientAuthService.setPassword(user.userId, dto.password);
  }

  @Post('complete-profile')
  @UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
  async completeProfile(@CurrentUser() user: JwtPayload, @Body() dto: CompleteProfileDto) {
    return this.clientAuthService.completeProfile(user.userId, dto.prenom, dto.nom, dto.termsAccepted, dto.telephone, dto.dateNaissance);
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
  constructor(private readonly clientService: ClientService) {}

  @Get('points')
  async getPointsOverview(
    @CurrentUser() user: JwtPayload,
    @Query() { page, limit }: PaginationQueryDto,
  ) {
    return this.clientService.getPointsOverview(user.userId, page, limit);
  }

  @Get('cards')
  async getLoyaltyCards(
    @CurrentUser() user: JwtPayload,
    @Query() { page, limit }: PaginationQueryDto,
  ) {
    const overview = await this.clientService.getPointsOverview(user.userId, page, limit);
    return overview.cards;
  }

  @Get('transactions')
  async getTransactions(
    @CurrentUser() user: JwtPayload,
    @Query() { page, limit }: PaginationQueryDto,
  ) {
    return this.clientService.getTransactions(user.userId, page, limit);
  }

  @Get('merchants')
  async getMerchants(
    @Query() { page, limit }: PaginationQueryDto,
  ) {
    return this.clientService.getMerchants(page, limit);
  }

  /** Returns merchants within `radius` km of the given GPS coordinates,
   *  each enriched with the calling client's loyalty-card balance (userPoints).
   *  Must be declared before @Get('merchants/:id') to avoid route shadowing. */
  @Get('merchants/nearby')
  async getNearbyMerchants(
    @CurrentUser() user: JwtPayload,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
  ) {
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN) || latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
      throw new BadRequestException('Coordonnées invalides.');
    }
    const radiusN = radius ? Math.min(Math.abs(parseFloat(radius)), 50) : 5;
    return this.clientService.getNearbyMerchants(user.userId, latN, lngN, radiusN);
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
}

