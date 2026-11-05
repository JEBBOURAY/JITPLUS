import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  Headers,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadConcurrencyGuard } from '../common/guards/upload-concurrency.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../common/constants';
import { QrTokenService } from './services/qr-token.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MerchantTypeGuard } from '../auth/guards/merchant-type.guard';
import { MerchantOwnerGuard } from '../auth/guards/merchant-owner.guard';
import { PremiumGuard } from '../auth/guards/premium.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PaginationQueryDto, MerchantClientsQueryDto } from '../common/dto/pagination-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';
import { UpdateLoyaltySettingsDto, PreviewAccumulationLimitDto, UpdateCurrencyDto } from './dto/update-loyalty-settings.dto';
import { UploadQueryDto, UploadType } from './dto/upload-logo.dto';
import { VerifyQrDto } from './dto/verify-qr.dto';
import { VerifyClientDto } from './dto/verify-client.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateNotificationPrefsDto } from './dto/update-notification-prefs.dto';
import { IStorageProvider, STORAGE_PROVIDER } from '../common/interfaces';
import { ImageOptimizerService } from '../storage/image-optimizer.service';
import { deleteOwnedFiles, planProfileImageChanges } from '../storage/image-ownership';
import { MerchantProfileData } from '../common/prisma-selects';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB (sharp optimizes down to a small WebP)
const MAX_GALLERY_PHOTOS = 5;

/** Detect MIME from magic bytes — supports JPEG, PNG, WebP only. */
function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp';
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  }
  return null;
}

import {
  MerchantProfileService,
  MerchantClientService,
  MerchantPlanService,
  MerchantReferralService,
  ScanTicketService,
  SCAN_TICKET_HEADER,
} from './services';
import { MerchantInboxService } from '../merchant-inbox/merchant-inbox.service';

@ApiTags('Merchant')
@ApiBearerAuth()
@Controller('merchant')
@UseGuards(JwtAuthGuard, MerchantTypeGuard)
export class MerchantController {
  constructor(
    private profileService: MerchantProfileService,
    private clientService: MerchantClientService,
    private planService: MerchantPlanService,
    private referralService: MerchantReferralService,
    private inboxService: MerchantInboxService,
    @Inject(STORAGE_PROVIDER) private storageProvider: IStorageProvider,
    private imageOptimizer: ImageOptimizerService,
    private qrTokens: QrTokenService,
    private scanTickets: ScanTicketService,
  ) {}

  // ── Verify QR token (scanned from client app) ─────────────
  @Post('verify-qr')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async verifyQrToken(@Body() dto: VerifyQrDto, @CurrentUser() user: JwtPayload) {
    const clientId = await this.qrTokens.resolveClientId(dto.token);
    // allowFirstScan=true: the HMAC signature already proved the client's consent.
    return this.withScanTicket(await this.clientService.verifyClient(clientId, user.userId, true), user.userId);
  }

  /** The ticket lets the follow-up status / transaction calls enroll this client. */
  private withScanTicket(result: { clientId: string }, merchantId: string) {
    return { ...result, scanTicket: this.scanTickets.issue(result.clientId, merchantId) };
  }

  // ── Verify a legacy client UUID (prevents IDOR from unsigned QR codes) ──
  @Post('verify-client')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 20 } })
  async verifyClient(@Body() dto: VerifyClientDto, @CurrentUser() user: JwtPayload) {
    // Strict mode: require an existing loyalty card between this merchant and client
    // to prevent silent enrollment from unsigned UUIDs (anti-fraud).
    return this.clientService.verifyClient(dto.clientId, user.userId, false);
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
    const touchesImages =
      dto.gallery !== undefined || dto.logoUrl !== undefined ||
      dto.coverUrl !== undefined || dto.cardBackgroundUrl !== undefined;
    if (!touchesImages) return this.profileService.updateProfile(user.userId, dto);

    // Rejects URLs the merchant neither uploaded nor already references, and
    // lists the files the update stops using (orphan cleanup).
    const current = await this.profileService.getProfile(user.userId);
    const replaced = planProfileImageChanges(this.storageProvider, user.userId, current, dto);

    const updated = await this.profileService.updateProfile(user.userId, dto);
    // Only after the update succeeded, so the profile never points to a deleted file.
    deleteOwnedFiles(this.storageProvider, user.userId, replaced);
    return updated;
  }

  /** Persist a fresh upload; if persisting fails, remove the upload instead of leaving an orphan. */
  private async persistUpload(merchantId: string, imageUrl: string, persist: () => Promise<unknown>): Promise<void> {
    try {
      await persist();
    } catch (err) {
      deleteOwnedFiles(this.storageProvider, merchantId, [imageUrl]);
      throw err;
    }
  }

  // ── Upload logo / cover ───────────────────────────────────
  @Post('upload-image')
  @UseGuards(MerchantOwnerGuard, UploadConcurrencyGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  @UseInterceptors(
    FileInterceptor('file', {
      // storage: memoryStorage() // Default behavior
      // One file, a handful of fields: a multipart body cannot fan out.
      limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 10, parts: 12 },
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

    // Validate magic bytes — MIME from Content-Type header is client-controlled.
    // HEIC/HEIF are accepted here and transcoded by sharp to WebP later.
    const detectedMime = detectMimeFromBuffer(file.buffer);
    if (!detectedMime || !ALLOWED_MIMES.includes(detectedMime)) {
      throw new BadRequestException('Le contenu du fichier ne correspond pas à un format image autorisé (JPG, PNG, WebP).');
    }

    // Logo upload is a Premium feature; covers, reward and deal images are allowed on all plans.
    if (query.type !== UploadType.COVER && query.type !== UploadType.REWARD && query.type !== UploadType.DEAL) {
      const isPremium = await this.planService.isPremium(user.userId);
      if (!isPremium) {
        throw new BadRequestException(
          'La personnalisation du logo est réservée au plan Pro. Contactez notre équipe sur WhatsApp pour activer votre abonnement.',
        );
      }
    }

    // Gallery: upload photo, append to merchant.gallery array (cap 5), return updated gallery.
    if (query.type === UploadType.GALLERY) {
      // Limit checked before uploading so a rejected request stores nothing.
      const current = await this.profileService.getProfile(user.userId);
      const existing = Array.isArray(current.gallery) ? current.gallery : [];
      if (existing.length >= MAX_GALLERY_PHOTOS) {
        throw new BadRequestException('La galerie est limitée à 5 photos. Supprimez-en une avant d’ajouter.');
      }
      const optimized = await this.imageOptimizer.optimize(file, 'gallery');
      const imageUrl = await this.storageProvider.uploadFile(optimized, 'gallery', user.userId);
      const next = [...existing, imageUrl];
      await this.persistUpload(user.userId, imageUrl, () =>
        this.profileService.updateProfile(user.userId, { gallery: next } as Partial<Record<string, unknown>>),
      );
      return { url: imageUrl, field: 'gallery', gallery: next };
    }

    // Reward: just upload + return URL. The caller persists it via POST/PUT /rewards.
    if (query.type === UploadType.REWARD) {
      const optimized = await this.imageOptimizer.optimize(file, 'reward');
      const imageUrl = await this.storageProvider.uploadFile(optimized, 'rewards', user.userId);
      return { url: imageUrl, field: 'imageUrl' };
    }

    // Deal: upload + return URL, persisted by POST/PATCH /merchant/deals.
    if (query.type === UploadType.DEAL) {
      const optimized = await this.imageOptimizer.optimize(file, 'deal');
      const imageUrl = await this.storageProvider.uploadFile(optimized, 'deals', user.userId);
      return { url: imageUrl, field: 'imageUrl' };
    }

    // Card background: upload, replace any previous, persist on merchant.
    if (query.type === UploadType.CARD_BACKGROUND) {
      const current = await this.profileService.getProfile(user.userId);
      const oldUrl = current.cardBackgroundUrl;
      const optimized = await this.imageOptimizer.optimize(file, 'cardBg');
      const imageUrl = await this.storageProvider.uploadFile(optimized, 'card-backgrounds', user.userId);
      await this.persistUpload(user.userId, imageUrl, () =>
        this.profileService.updateProfile(user.userId, { cardBackgroundUrl: imageUrl } as Partial<Record<string, unknown>>),
      );
      deleteOwnedFiles(this.storageProvider, user.userId, [oldUrl]);
      return { url: imageUrl, field: 'cardBackgroundUrl' };
    }

    const profile = query.type === UploadType.COVER ? 'cover' : 'logo';
    const folder = query.type === UploadType.COVER ? 'covers' : 'logos';

    const current = await this.profileService.getProfile(user.userId);
    const field = query.type === UploadType.COVER ? 'coverUrl' : 'logoUrl';
    const oldUrl = current[field];

    const optimized = await this.imageOptimizer.optimize(file, profile);
    const imageUrl = await this.storageProvider.uploadFile(optimized, folder, user.userId);

    await this.persistUpload(user.userId, imageUrl, () =>
      this.profileService.updateProfile(user.userId, { [field]: imageUrl } as Partial<Record<string, string>>),
    );
    deleteOwnedFiles(this.storageProvider, user.userId, [oldUrl]);

    return { url: imageUrl, field };
  }

  @Delete('card-background')
  @UseGuards(MerchantOwnerGuard)
  async deleteCardBackground(@CurrentUser() user: JwtPayload) {
    const current = await this.profileService.getProfile(user.userId);
    const oldUrl = current.cardBackgroundUrl;
    if (!oldUrl) return { ok: true };
    await this.profileService.updateProfile(user.userId, { cardBackgroundUrl: null } as Partial<Record<string, unknown>>);
    deleteOwnedFiles(this.storageProvider, user.userId, [oldUrl]);
    return { ok: true };
  }

  @Patch('password')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 5 } })
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
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 20 } })
  async getDevices(@CurrentUser() user: JwtPayload) {
    return this.profileService.getDeviceSessions(user.userId, user.sessionId);
  }

  @Delete('devices/:id')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async removeDevice(@Param('id', ParseUUIDPipe) sessionId: string, @CurrentUser() user: JwtPayload) {
    return this.profileService.removeDeviceSession(sessionId, user.userId, user.sessionId);
  }

  // ── Delete Account (permanent, requires password or Google/Apple re-auth) ──────────
  @Post('delete-account')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 3 } })
  async deleteAccount(@Body() dto: DeleteAccountDto, @CurrentUser() user: JwtPayload) {
    return this.profileService.deleteAccount(user.userId, dto.password, dto.idToken, dto.appleIdentityToken);
  }

  @Get('clients')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 20 } })
  async getClients(
    @Query() { search, page, limit, view }: MerchantClientsQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clientService.getClients(user.userId, search, page, limit, view);
  }

  @Get('clients/scan')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  async getClientsForScan(@Query('search') search: string, @CurrentUser() user: JwtPayload) {
    return this.clientService.getClientsForScan(user.userId, search);
  }

  @Get('client/:id/status')
  async getClientStatus(
    @Param('id', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: JwtPayload,
    @Headers(SCAN_TICKET_HEADER) scanTicket?: string,
  ) {
    return this.clientService.getClientStatus(clientId, user.userId, scanTicket);
  }

  @Get('client/:id/detail')
  async getClientDetail(@Param('id', ParseUUIDPipe) clientId: string, @CurrentUser() user: JwtPayload) {
    return this.clientService.getClientDetail(clientId, user.userId);
  }

  @Post('loyalty-settings/preview-limit')
  @UseGuards(MerchantOwnerGuard)
  async previewAccumulationLimit(
    @Body() dto: PreviewAccumulationLimitDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ affectedClients: number }> {
    return this.profileService.previewAccumulationLimit(user.userId, dto.limit);
  }

  @Get('loyalty-settings/preview-slots')
  @UseGuards(MerchantOwnerGuard)
  async previewCardSlots(@CurrentUser() user: JwtPayload): Promise<{ clientsWithStamps: number }> {
    return this.profileService.previewCardSlots(user.userId);
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

  @Patch('currency')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  async updateCurrency(
    @Body() dto: UpdateCurrencyDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MerchantProfileData> {
    return this.profileService.updateCurrency(user.userId, dto);
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

  // ── Notifications inbox: admin broadcasts + automatic pushes ──────────────
  // Route names kept as `admin-notifications` for already-installed app versions.
  @Get('admin-notifications')
  async getAdminNotifications(
    @CurrentUser() user: JwtPayload,
    @Query() { page, limit }: PaginationQueryDto,
  ) {
    return this.inboxService.list(user.userId, page, limit);
  }

  @Get('admin-notifications/unread-count')
  async getAdminNotificationsUnreadCount(@CurrentUser() user: JwtPayload) {
    return { count: await this.inboxService.countUnread(user.userId) };
  }

  @Patch('admin-notifications/mark-read')
  async markAdminNotificationsRead(@CurrentUser() user: JwtPayload) {
    await this.inboxService.markAllRead(user.userId);
    return { success: true };
  }

  @Patch('admin-notifications/:id/read')
  async markSingleAdminNotificationRead(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) notificationId: string,
  ) {
    await this.inboxService.markRead(user.userId, notificationId);
    return { success: true };
  }

  /** The app was opened from this item's push (open-rate tracking). */
  @Post('admin-notifications/:id/opened')
  @HttpCode(200)
  async markAdminNotificationOpened(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) notificationId: string,
  ) {
    await this.inboxService.markOpened(user.userId, notificationId);
    return { success: true };
  }

  // ── Push preferences per category ─────────────────────────────────────────
  @Get('notification-preferences')
  async getNotificationPrefs(@CurrentUser() user: JwtPayload) {
    return this.profileService.getNotificationPrefs(user.userId);
  }

  @Patch('notification-preferences')
  @UseGuards(MerchantOwnerGuard)
  async updateNotificationPrefs(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateNotificationPrefsDto,
  ) {
    return this.profileService.updateNotificationPrefs(user.userId, dto);
  }
}
