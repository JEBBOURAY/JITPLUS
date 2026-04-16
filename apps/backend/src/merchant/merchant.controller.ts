import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, Inject,
  UseGuards, UseInterceptors, UploadedFile, BadRequestException, Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MerchantTypeGuard } from '../auth/guards/merchant-type.guard';
import { MerchantOwnerGuard } from '../auth/guards/merchant-owner.guard';
import { PremiumGuard } from '../auth/guards/premium.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PaginationQueryDto, SearchPaginationQueryDto } from '../common/dto/pagination-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateLoyaltySettingsDto, PreviewAccumulationLimitDto } from './dto/update-loyalty-settings.dto';
import { UploadQueryDto, UploadType } from './dto/upload-logo.dto';
import { VerifyQrDto } from './dto/verify-qr.dto';
import { VerifyClientDto } from './dto/verify-client.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { RecordWhatsappUsageDto } from './dto';
import { IStorageProvider, STORAGE_PROVIDER } from '../common/interfaces';
import { ImageOptimizerService } from '../storage/image-optimizer.service';
import { MerchantProfileData } from '../common/prisma-selects';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

/** Detect MIME from magic bytes — supports JPEG, PNG, WebP only. */
function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp';
  return null;
}

import {
  MerchantProfileService,
  MerchantClientService,
  WhatsappQuotaService,
  MerchantPlanService,
  MerchantReferralService,
} from './services';
import { NotificationsService } from '../notifications/notifications.service';

@ApiTags('Merchant')
@ApiBearerAuth()
@Controller('merchant')
@UseGuards(JwtAuthGuard, MerchantTypeGuard)
export class MerchantController {
  private readonly logger = new Logger(MerchantController.name);

  constructor(
    private profileService: MerchantProfileService,
    private clientService: MerchantClientService,
    private quotaService: WhatsappQuotaService,
    private planService: MerchantPlanService,
    private referralService: MerchantReferralService,
    private notificationsService: NotificationsService,
    private configService: ConfigService,
    @Inject(STORAGE_PROVIDER) private storageProvider: IStorageProvider,
    private imageOptimizer: ImageOptimizerService,
  ) {}

  // ── Verify QR token (scanned from client app) ─────────────
  @Post('verify-qr')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async verifyQrToken(@Body() dto: VerifyQrDto, @CurrentUser() user: JwtPayload) {
    // Strip invisible control chars / BOM that QR scanners may inject
    const token = dto.token.replace(/[\x00-\x1f\x7f-\x9f\uFEFF]/g, '').trim();

    // Determine version: "v1.{idB64}.{sig}" (versioned) vs "{idB64}.{sig}" (legacy)
    let version: string;
    let idB64: string;
    let sig: string;

    if (token.startsWith('v1.')) {
      version = 'v1';
      const rest = token.substring(3);
      const dotIdx = rest.indexOf('.');
      if (dotIdx < 1) throw new BadRequestException('QR code invalide.');
      idB64 = rest.substring(0, dotIdx);
      sig = rest.substring(dotIdx + 1);
    } else {
      // Legacy unversioned format — backward compatible
      version = 'v0';
      const dotIdx = token.indexOf('.');
      if (dotIdx < 1) throw new BadRequestException('QR code invalide.');
      idB64 = token.substring(0, dotIdx);
      sig = token.substring(dotIdx + 1);
    }

    let clientId: string;
    try {
      clientId = Buffer.from(idB64, 'base64url').toString();
    } catch {
      throw new BadRequestException('QR code invalide.');
    }

    const secret = this.configService.getOrThrow<string>('QR_HMAC_SECRET');
    // v1 includes the version prefix in the HMAC input, v0 does not
    const hmacInput = version === 'v1' ? `v1:${clientId}` : clientId;
    const expected = createHmac('sha256', secret).update(hmacInput).digest('base64url');

    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      this.logger.warn(`QR verify failed – HMAC mismatch [version=${version}, len=${token.length}]`);
      throw new BadRequestException('QR code invalide.');
    }

    // Verify the client actually exists
    return this.clientService.verifyClient(clientId, user.userId);
  }

  // ── Verify a legacy client UUID (prevents IDOR from unsigned QR codes) ──
  @Post('verify-client')
  async verifyClient(@Body() dto: VerifyClientDto, @CurrentUser() user: JwtPayload) {
    return this.clientService.verifyClient(dto.clientId, user.userId);
  }

  @Get('profile')
  async getProfile(@CurrentUser() user: JwtPayload): Promise<MerchantProfileData> {
    return this.profileService.getProfile(user.userId);
  }

  @Patch('complete-onboarding')
  @UseGuards(MerchantOwnerGuard)
  async completeOnboarding(@CurrentUser() user: JwtPayload) {
    return this.profileService.completeOnboarding(user.userId);
  }

  @Patch('profile')
  @UseGuards(MerchantOwnerGuard)
  async updateProfile(@Body() dto: UpdateProfileDto, @CurrentUser() user: JwtPayload): Promise<MerchantProfileData> {
    return this.profileService.updateProfile(user.userId, dto);
  }

  // ── Upload logo / cover ───────────────────────────────────
  @Post('upload-image')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  @UseInterceptors(
    FileInterceptor('file', {
      // storage: memoryStorage() // Default behavior
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIMES.includes(file.mimetype)) {
          return cb(new BadRequestException('Format non supporté. Utilisez JPG, PNG ou WebP.'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Query() query: UploadQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('Aucun fichier envoyé');

    // Validate magic bytes — MIME from Content-Type header is client-controlled
    const detectedMime = detectMimeFromBuffer(file.buffer);
    if (!detectedMime || !ALLOWED_MIMES.includes(detectedMime)) {
      throw new BadRequestException('Le contenu du fichier ne correspond pas à un format image autorisé (JPG, PNG, WebP).');
    }

    // Logo upload is a Premium feature; covers are allowed on all plans.
    if (query.type !== UploadType.COVER) {
      const isPremium = await this.planService.isPremium(user.userId);
      if (!isPremium) {
        throw new BadRequestException(
          'La personnalisation du logo est réservée au plan Pro. Contactez notre équipe sur WhatsApp pour activer votre abonnement.',
        );
      }
    }

    const profile = query.type === UploadType.COVER ? 'cover' : 'logo';
    const optimized = await this.imageOptimizer.optimize(file, profile);
    const imageUrl = await this.storageProvider.uploadFile(optimized, 'logos');
    const field = query.type === UploadType.COVER ? 'coverUrl' : 'logoUrl';

    await this.profileService.updateProfile(user.userId, { [field]: imageUrl } as Partial<Record<string, string>>);
    return { url: imageUrl, field };
  }

  @Patch('password')
  @UseGuards(MerchantOwnerGuard)
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: JwtPayload) {
    return this.profileService.changePassword(user.userId, dto, user.sessionId);
  }

  @Patch('push-token')
  @UseGuards(MerchantOwnerGuard)
  async updatePushToken(@Body() dto: UpdatePushTokenDto, @CurrentUser() user: JwtPayload) {
    return this.profileService.updatePushToken(user.userId, dto.pushToken, dto.language);
  }

  @Get('devices')
  @UseGuards(MerchantOwnerGuard)
  async getDevices(@CurrentUser() user: JwtPayload) {
    return this.profileService.getDeviceSessions(user.userId, user.sessionId);
  }

  @Post('devices')
  @UseGuards(MerchantOwnerGuard)
  async registerDevice(@Body() dto: RegisterDeviceDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.profileService.upsertDeviceSession(user.userId, { ...dto, ipAddress: req.ip });
  }

  @Delete('devices/:id')
  @UseGuards(MerchantOwnerGuard)
  async removeDevice(@Param('id') sessionId: string, @CurrentUser() user: JwtPayload) {
    return this.profileService.removeDeviceSession(sessionId, user.userId, user.sessionId);
  }

  // ── Delete Account (permanent, requires password or Google/Apple re-auth) ──────────
  @Post('delete-account')
  @UseGuards(MerchantOwnerGuard)  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 3 } })  async deleteAccount(@Body() dto: DeleteAccountDto, @CurrentUser() user: JwtPayload) {
    return this.profileService.deleteAccount(user.userId, dto.password, dto.idToken, dto.appleIdentityToken);
  }

  @Get('me')
  async getMe(@CurrentUser() user: JwtPayload) {
    return {
      userId: user.userId,
      email: user.email,
      type: user.type,
      role: user.role,
      teamMemberId: user.teamMemberId || null,
      teamMemberName: user.teamMemberName || null,
    };
  }

  @Get('clients')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 20 } })
  async getClients(
    @Query() { search, page, limit }: SearchPaginationQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clientService.getClients(user.userId, search, page, limit);
  }

  @Get('clients/scan')
  async getClientsForScan(@Query('search') search: string, @CurrentUser() user: JwtPayload) {
    return this.clientService.getClientsForScan(user.userId, search);
  }

  @Get('client/:id/status')
  async getClientStatus(@Param('id') clientId: string, @CurrentUser() user: JwtPayload) {
    return this.clientService.getClientStatus(clientId, user.userId);
  }

  @Get('client/:id/detail')
  async getClientDetail(@Param('id') clientId: string, @CurrentUser() user: JwtPayload) {
    return this.clientService.getClientDetail(clientId, user.userId);
  }

  @Patch('settings')
  @UseGuards(MerchantOwnerGuard)
  async updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUser() user: JwtPayload): Promise<MerchantProfileData> {
    return this.profileService.updateSettings(user.userId, dto);
  }

  @Post('loyalty-settings/preview-limit')
  @UseGuards(MerchantOwnerGuard)
  async previewAccumulationLimit(
    @Body() dto: PreviewAccumulationLimitDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ affectedClients: number }> {
    return this.profileService.previewAccumulationLimit(user.userId, dto.limit);
  }

  @Patch('loyalty-settings')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async updateLoyaltySettings(
    @Body() dto: UpdateLoyaltySettingsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MerchantProfileData> {
    return this.profileService.updateLoyaltySettings(user.userId, dto);
  }

  @Get('whatsapp/quota')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  async getWhatsappQuota(@CurrentUser() user: JwtPayload) {
    const merchant = await this.quotaService.getQuota(user.userId);
    return {
      whatsappQuotaUsed: merchant.whatsappQuotaUsed,
      whatsappQuotaMax: merchant.whatsappQuotaMax,
      remaining: merchant.whatsappQuotaMax - merchant.whatsappQuotaUsed,
    };
  }

  @Post('whatsapp/record-usage')
  @UseGuards(MerchantOwnerGuard, PremiumGuard)
  async recordWhatsappUsage(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecordWhatsappUsageDto,
  ) {
    const merchant = await this.quotaService.checkAndIncrementQuota(
      user.userId,
      dto.messagesSent,
    );
    return {
      whatsappQuotaUsed: merchant.whatsappQuotaUsed,
      whatsappQuotaMax: merchant.whatsappQuotaMax,
      remaining: merchant.whatsappQuotaMax - merchant.whatsappQuotaUsed,
    };
  }

  // ── Plan info ─────────────────────────────────────────
  @Get('plan')
  async getPlan(@CurrentUser() user: JwtPayload) {
    return this.planService.getPlanLimits(user.userId);
  }


  // ── Parrainage ────────────────────────────────────────
  @Get('referral')
  @UseGuards(MerchantOwnerGuard)
  async getReferral(@CurrentUser() user: JwtPayload) {
    return this.referralService.getReferralStats(user.userId);
  }

  /**
   * Apply earned referral months as a time-limited PREMIUM plan.
   * Only available for FREE merchants with referralMonthsEarned > 0.
   */
  @Post('referral/apply-months')
  @UseGuards(MerchantOwnerGuard)
  async applyReferralMonths(@CurrentUser() user: JwtPayload) {
    return this.planService.applyEarnedReferralMonths(user.userId);
  }

  // ── Admin notifications inbox (received from admin dashboard) ─────────────
  @Get('admin-notifications')
  async getAdminNotifications(
    @CurrentUser() user: JwtPayload,
    @Query() { page, limit }: PaginationQueryDto,
  ) {
    return this.notificationsService.getAdminNotificationsForMerchants(user.userId, page, limit);
  }

  @Get('admin-notifications/unread-count')
  async getAdminNotificationsUnreadCount(@CurrentUser() user: JwtPayload) {
    return { count: await this.notificationsService.countUnreadAdminNotifications(user.userId) };
  }

  @Patch('admin-notifications/mark-read')
  async markAdminNotificationsRead(@CurrentUser() user: JwtPayload) {
    await this.notificationsService.markAllAdminNotifsRead(user.userId);
    return { success: true };
  }

  @Patch('admin-notifications/:id/read')
  async markSingleAdminNotificationRead(
    @CurrentUser() user: JwtPayload,
    @Param('id') notificationId: string,
  ) {
    await this.notificationsService.markSingleAdminNotifRead(user.userId, notificationId);
    return { success: true };
  }
}
