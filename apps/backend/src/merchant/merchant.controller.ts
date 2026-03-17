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
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { AdjustPointsDto } from './dto/adjust-points.dto';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateLoyaltySettingsDto, PreviewAccumulationLimitDto } from './dto/update-loyalty-settings.dto';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
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

import {
  MerchantProfileService,
  MerchantClientService,
  MerchantTransactionService,
  MerchantDashboardService,
  MerchantTeamService,
  MerchantStoreService,
  WhatsappQuotaService,
  MerchantPlanService,
  MerchantReferralService,
  UpgradeRequestService,
} from './services';

@ApiTags('Merchant')
@ApiBearerAuth()
@Controller('merchant')
@UseGuards(JwtAuthGuard, MerchantTypeGuard)
export class MerchantController {
  private readonly logger = new Logger(MerchantController.name);

  constructor(
    private profileService: MerchantProfileService,
    private clientService: MerchantClientService,
    private transactionService: MerchantTransactionService,
    private dashboardService: MerchantDashboardService,
    private teamService: MerchantTeamService,
    private storeService: MerchantStoreService,
    private quotaService: WhatsappQuotaService,
    private planService: MerchantPlanService,
    private referralService: MerchantReferralService,
    private upgradeRequestService: UpgradeRequestService,
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

    const dotIdx = token.indexOf('.');
    if (dotIdx < 1) {
      throw new BadRequestException('QR code invalide.');
    }

    const idB64 = token.substring(0, dotIdx);
    const sig = token.substring(dotIdx + 1);

    let clientId: string;
    try {
      clientId = Buffer.from(idB64, 'base64url').toString();
    } catch {
      throw new BadRequestException('QR code invalide.');
    }

    const secret = this.configService.getOrThrow<string>('QR_HMAC_SECRET');
    const expected = createHmac('sha256', secret).update(clientId).digest('base64url');

    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      this.logger.warn(`QR verify failed – HMAC mismatch [len=${token.length}]`);
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
    const { fileTypeFromBuffer } = await (Function('return import("file-type")')() as Promise<typeof import('file-type')>);
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !ALLOWED_MIMES.includes(detected.mime)) {
      throw new BadRequestException('Le contenu du fichier ne correspond pas à un format image autorisé (JPG, PNG, WebP).');
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
  async updatePushToken(@Body() dto: UpdatePushTokenDto, @CurrentUser() user: JwtPayload) {
    return this.profileService.updatePushToken(user.userId, dto.pushToken);
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

  // ── Delete Account (permanent, requires password or Google re-auth) ──────────
  @Post('delete-account')
  @UseGuards(MerchantOwnerGuard)
  async deleteAccount(@Body() dto: DeleteAccountDto, @CurrentUser() user: JwtPayload) {
    return this.profileService.deleteAccount(user.userId, dto.password, dto.idToken);
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
  async getClients(
    @Query('search') search: string,
    @Query() { page, limit }: PaginationQueryDto,
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

  @Post('transactions')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  async createTransaction(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const { clientId, type, amount, points, rewardId } = dto;
    return this.transactionService.createTransaction(clientId, user.userId, type, amount, points, rewardId, user.teamMemberId ?? undefined, user.teamMemberName ?? undefined);
  }

  @Get('dashboard-stats')
  @UseGuards(PremiumGuard)
  async getDashboardStats(@Query() { period }: DashboardQueryDto, @CurrentUser() user: JwtPayload) {
    return this.dashboardService.getDashboardStats(user.userId, period!);
  }

  @Get('dashboard-trends')
  @UseGuards(PremiumGuard)
  async getDashboardTrends(@Query() { period }: DashboardQueryDto, @CurrentUser() user: JwtPayload) {
    return this.dashboardService.getDashboardTrends(user.userId, period!);
  }

  @Get('transactions')
  async getTransactions(@Query() { page, limit }: PaginationQueryDto, @CurrentUser() user: JwtPayload) {
    return this.transactionService.getTransactions(user.userId, page, limit);
  }

  @Patch('transactions/:id/cancel')
  async cancelTransaction(@Param('id') transactionId: string, @CurrentUser() user: JwtPayload) {
    return this.transactionService.cancelTransaction(transactionId, user.userId);
  }

  @Post('transactions/adjust')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 20 } })
  async adjustPoints(
    @Body() dto: AdjustPointsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transactionService.adjustPoints(
      dto.clientId,
      user.userId,
      dto.points,
      dto.note,
      user.teamMemberId ?? undefined,
      user.teamMemberName ?? undefined,
    );
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
  @UseGuards(MerchantOwnerGuard)
  async updateLoyaltySettings(
    @Body() dto: UpdateLoyaltySettingsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MerchantProfileData> {
    return this.profileService.updateLoyaltySettings(user.userId, dto);
  }

  @Get('team')
  @UseGuards(MerchantOwnerGuard)
  async getTeamMembers(@CurrentUser() user: JwtPayload) {
    return this.teamService.getTeamMembers(user.userId);
  }

  @Post('team')
  @UseGuards(MerchantOwnerGuard)
  async createTeamMember(@Body() dto: CreateTeamMemberDto, @CurrentUser() user: JwtPayload) {
    return this.teamService.createTeamMember(user.userId, dto);
  }

  @Patch('team/:id')
  @UseGuards(MerchantOwnerGuard)
  async updateTeamMember(@Param('id') memberId: string, @Body() dto: UpdateTeamMemberDto, @CurrentUser() user: JwtPayload) {
    return this.teamService.updateTeamMember(user.userId, memberId, dto);
  }

  @Delete('team/:id')
  @UseGuards(MerchantOwnerGuard)
  async deleteTeamMember(@Param('id') memberId: string, @CurrentUser() user: JwtPayload) {
    return this.teamService.deleteTeamMember(user.userId, memberId);
  }

  // ── Stores (multi-magasin) ──

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
  async deleteStore(@Param('id') storeId: string, @CurrentUser() user: JwtPayload) {
    return this.storeService.deleteStore(user.userId, storeId);
  }

  @Get('whatsapp/quota')
  async getWhatsappQuota(@CurrentUser() user: JwtPayload) {
    const merchant = await this.quotaService.getQuota(user.userId);
    return {
      whatsappQuotaUsed: merchant.whatsappQuotaUsed,
      whatsappQuotaMax: merchant.whatsappQuotaMax,
      remaining: merchant.whatsappQuotaMax - merchant.whatsappQuotaUsed,
    };
  }

  @Post('whatsapp/record-usage')
  @UseGuards(PremiumGuard)
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

  // ── Submit Premium upgrade request ───────────────────
  @Post('plan/request-upgrade')
  @UseGuards(MerchantOwnerGuard)
  async submitUpgradeRequest(
    @CurrentUser() user: JwtPayload,
    @Body() body: { message?: string },
  ) {
    return this.upgradeRequestService.submit(user.userId, body?.message);
  }

  // ── Get current upgrade request status ───────────────
  @Get('plan/upgrade-request')
  @UseGuards(MerchantOwnerGuard)
  async getUpgradeRequest(@CurrentUser() user: JwtPayload) {
    return this.upgradeRequestService.getForMerchant(user.userId);
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
}
