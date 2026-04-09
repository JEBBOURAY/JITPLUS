import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { MerchantPlan } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  DEVICE_SESSION_REPOSITORY, type IDeviceSessionRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
  REWARD_REPOSITORY, type IRewardRepository,
  TEAM_MEMBER_REPOSITORY, type ITeamMemberRepository,
  STORE_REPOSITORY, type IStoreRepository,
} from '../../common/repositories';
import { NotificationsService } from '../../notifications/notifications.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { UpdateLoyaltySettingsDto } from '../dto/update-loyalty-settings.dto';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { BCRYPT_SALT_ROUNDS } from '../../common/constants';
import { MERCHANT_PROFILE_SELECT, MerchantProfileData } from '../../common/prisma-selects';
import { MERCHANT_PROFILE_CACHE_TTL } from '../../common/constants';
import { stripUndefined } from '../../common/utils';

@Injectable()
export class MerchantProfileService {
  private readonly logger = new Logger(MerchantProfileService.name);
  private readonly googleClient: OAuth2Client;

  constructor(
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(DEVICE_SESSION_REPOSITORY) private deviceSessionRepo: IDeviceSessionRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private transactionRepoDelegate: ITransactionRepository,
    @Inject(TRANSACTION_RUNNER) private txRunner: ITransactionRunner,
    @Inject(RAW_QUERY_RUNNER) private rawQuery: IRawQueryRunner,
    @Inject(REWARD_REPOSITORY) private rewardRepo: IRewardRepository,
    @Inject(TEAM_MEMBER_REPOSITORY) private teamMemberRepo: ITeamMemberRepository,
    @Inject(STORE_REPOSITORY) private storeRepo: IStoreRepository,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private notifications: NotificationsService,
    private configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(this.configService.get<string>('GOOGLE_CLIENT_ID'));
  }

  // â”€â”€ Profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getProfile(merchantId: string): Promise<MerchantProfileData> {
    const cacheKey = `merchant:profile:${merchantId}`;
    let merchant = await this.cache.get<MerchantProfileData>(cacheKey);

    if (!merchant) {
      merchant = await this.merchantRepo.findUnique({
        where: { id: merchantId },
        select: MERCHANT_PROFILE_SELECT,
      });
      if (!merchant) throw new NotFoundException('Commerçant non trouvé');
      await this.cache.set(cacheKey, merchant, MERCHANT_PROFILE_CACHE_TTL);
    }

    // If the plan (trial or admin-set with expiry) has expired, return FREE immediately.
    // The DB is lazily updated to FREE the next time PremiumGuard runs resolveEffectivePlan.
    if (merchant.plan !== 'FREE' && merchant.planExpiresAt && merchant.planExpiresAt < new Date()) {
      return { ...merchant, plan: 'FREE' as MerchantPlan };
    }

    return merchant;
  }

  async completeOnboarding(merchantId: string): Promise<{ ok: true }> {
    await this.merchantRepo.update({
      where: { id: merchantId },
      data: { onboardingCompleted: true },
    });
    return { ok: true };
  }

  async updateProfile(merchantId: string, dto: UpdateProfileDto): Promise<MerchantProfileData> {
    const data = stripUndefined(dto);
    const result = await this.merchantRepo.update({
      where: { id: merchantId },
      data,
      select: MERCHANT_PROFILE_SELECT,
    });
    await Promise.all([
      this.cache.del(`merchant:detail:${merchantId}`),
      this.cache.del(`merchant:profile:${merchantId}`),
    ]);
    return result;
  }

  async changePassword(merchantId: string, dto: ChangePasswordDto, currentTokenId?: string): Promise<{ message: string; devicesDisconnected: number }> {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { id: true, password: true, googleId: true },
    });
    if (!merchant) throw new NotFoundException('Commerçant non trouvé');

    // Google-only accounts can set a password without providing the current one
    if (merchant.googleId && !dto.currentPassword) {
      // Allow setting initial password for Google accounts
    } else {
      if (!dto.currentPassword) throw new BadRequestException('Le mot de passe actuel est requis');
      const isValid = await bcrypt.compare(dto.currentPassword, merchant.password);
      if (!isValid) throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.merchantRepo.update({
      where: { id: merchantId },
      data: { password: hashedPassword },
    });

    let devicesDisconnected = 0;
    // Default to disconnecting other sessions on password change for security
    const shouldLogoutOthers = dto.logoutOthers !== false;
    if (shouldLogoutOthers && currentTokenId) {
      const result = await this.deviceSessionRepo.deleteMany({
        where: { merchantId, tokenId: { not: currentTokenId } },
      });
      devicesDisconnected = result.count;
    }

    return { message: 'Mot de passe modifié avec succès', devicesDisconnected };
  }

  async updatePushToken(merchantId: string, pushToken: string): Promise<{ message: string }> {
    await this.merchantRepo.update({
      where: { id: merchantId },
      data: { pushToken },
    });
    return { message: 'Push token mis à jour' };
  }

  async markAdminNotificationsRead(merchantId: string): Promise<void> {
    await this.merchantRepo.update({
      where: { id: merchantId },
      data: { lastAdminNotifReadAt: new Date() },
    });
  }

  // â”€â”€ Device Sessions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getDeviceSessions(merchantId: string, currentTokenId?: string) {
    const sessions = await this.deviceSessionRepo.findMany({
      where: { merchantId },
      orderBy: { lastActiveAt: 'desc' },
      select: {
        id: true, tokenId: true, deviceName: true, deviceOS: true,
        userType: true, userEmail: true, userName: true,
        lastActiveAt: true, ipAddress: true, isCurrentDevice: true, createdAt: true,
      },
    });

    return sessions.map(({ tokenId, ...session }: any) => ({
      ...session,
      isCurrentDevice: currentTokenId ? tokenId === currentTokenId : session.isCurrentDevice,
    }));
  }

  async upsertDeviceSession(
    merchantId: string,
    deviceInfo: { deviceName: string; deviceOS?: string; ipAddress?: string },
  ) {
    return this.txRunner.run(async (tx) => {
      // 1. Find existing session first
      const existing = await tx.deviceSession.findFirst({
        where: { merchantId, deviceName: deviceInfo.deviceName },
        select: { id: true },
      });

      // 2. Clear all current-device flags AFTER finding
      await tx.deviceSession.updateMany({
        where: { merchantId },
        data: { isCurrentDevice: false },
      });

      // 3. Upsert
      if (existing) {
        return tx.deviceSession.update({
          where: { id: existing.id },
          data: {
            lastActiveAt: new Date(),
            isCurrentDevice: true,
            ipAddress: deviceInfo.ipAddress,
            deviceOS: deviceInfo.deviceOS,
          },
        });
      }

      return tx.deviceSession.create({
        data: {
          merchantId,
          deviceName: deviceInfo.deviceName,
          deviceOS: deviceInfo.deviceOS,
          ipAddress: deviceInfo.ipAddress,
          isCurrentDevice: true,
        },
      });
    });
  }

  async removeDeviceSession(sessionId: string, merchantId: string, currentTokenId?: string): Promise<{ message: string }> {
    const session = await this.deviceSessionRepo.findUnique({
      where: { id: sessionId },
      select: { merchantId: true, tokenId: true },
    });
    if (!session || session.merchantId !== merchantId) {
      throw new NotFoundException('Session non trouvée');
    }
    if (currentTokenId && session.tokenId === currentTokenId) {
      throw new BadRequestException('Vous ne pouvez pas déconnecter votre propre appareil');
    }
    await this.deviceSessionRepo.delete({ where: { id: sessionId } });
    return { message: 'Appareil déconnecté' };
  }

  // â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async updateSettings(merchantId: string, settings: { pointsRate?: number }): Promise<MerchantProfileData> {
    if (settings.pointsRate !== undefined && settings.pointsRate <= 0) {
      throw new BadRequestException('Le taux de conversion doit être supérieur à zéro');
    }
    const result = await this.merchantRepo.update({
      where: { id: merchantId },
      data: { pointsRate: settings.pointsRate },
      select: MERCHANT_PROFILE_SELECT,
    });
    await this.cache.del(`merchant:profile:${merchantId}`);
    return result;
  }

  async previewAccumulationLimit(merchantId: string, limit: number): Promise<{ affectedClients: number }> {
    const count = await this.loyaltyCardRepo.count({
      where: { merchantId, points: { gt: limit } },
    });
    return { affectedClients: count };
  }

  async updateLoyaltySettings(merchantId: string, dto: UpdateLoyaltySettingsDto): Promise<MerchantProfileData> {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { id: true, nom: true, loyaltyType: true, conversionRate: true },
    });
    if (!merchant) throw new NotFoundException('Commerce non trouvé');

    if (dto.conversionRate !== undefined && dto.conversionRate <= 0) {
      throw new BadRequestException('Le taux de conversion doit être supérieur à zéro');
    }
    if (dto.stampsForReward !== undefined && dto.stampsForReward < 1) {
      throw new BadRequestException('Le nombre de tampons pour un cadeau doit être au moins 1');
    }
    if (dto.pointsRate !== undefined && dto.pointsRate <= 0) {
      throw new BadRequestException('Le taux de points doit être supérieur à zéro');
    }
    if (dto.accumulationLimit !== undefined && dto.accumulationLimit !== null && dto.accumulationLimit < 1) {
      throw new BadRequestException("La limite d'accumulation doit être au moins 1");
    }

    const oldType = merchant.loyaltyType;
    const newType = dto.loyaltyType ?? oldType;
    const conversionRate = dto.conversionRate ?? merchant.conversionRate;
    const loyaltyTypeChanged = !!dto.loyaltyType && dto.loyaltyType !== oldType;

    if (loyaltyTypeChanged) {
      // Await so that reward costs & client balances are converted
      // before the response triggers a frontend reload of rewards.
      await this.recalculateBalances(merchantId, oldType, newType, conversionRate);
    }

    // Auto-sync conversionRate with pointsRate when conversionRate is not explicitly provided.
    // This ensures the client app displays the correct earning rate (e.g. after onboarding).
    if (dto.pointsRate !== undefined && dto.conversionRate === undefined) {
      dto.conversionRate = dto.pointsRate;
    }

    // Strip forceCapClients from the data sent to Prisma (not a DB field)
    const forceCapClients = dto.forceCapClients;
    const { forceCapClients: _strip, ...dtoWithoutForce } = dto;
    const data: Record<string, unknown> = stripUndefined(dtoWithoutForce);

    const updated = await this.merchantRepo.update({
      where: { id: merchantId },
      data,
      select: MERCHANT_PROFILE_SELECT,
    });

    if (loyaltyTypeChanged) {
      // Fire-and-forget: do not block the HTTP response
      this.notifyLoyaltyTypeChange(
        merchantId,
        updated.nom,
        oldType as string,
        newType as string,
      ).catch((err) =>
        this.logger.error(`notifyLoyaltyTypeChange failed: ${err}`),
      );
    }

    // Cap existing clients' balances and notify them if the merchant confirmed
    if (forceCapClients && dto.accumulationLimit != null) {
      this.capAndNotifyClients(merchantId, merchant.nom, dto.accumulationLimit, newType)
        .catch((err) => this.logger.error(`capAndNotifyClients failed: ${err}`));
    }

    // When stampsForReward changes (without a simultaneous type switch), sync all
    // reward costs so the redemption threshold stays consistent.
    // Type-switch cases are already handled by recalculateBalances().
    if (dto.stampsForReward !== undefined && !loyaltyTypeChanged && newType === 'STAMPS') {
      this.syncRewardCosts(merchantId, dto.stampsForReward)
        .catch((err) => this.logger.error(`syncRewardCosts failed: ${err}`));
    }

    await Promise.all([
      this.cache.del(`merchant:detail:${merchantId}`),
      this.cache.del(`merchant:profile:${merchantId}`),
    ]);
    return updated;
  }

  /**
   * Cap all loyalty card balances that exceed the new limit
   * and send a push notification to each affected client.
   *
   * Optimized: uses bulk updateMany + createMany instead of per-card queries (N+1 fix).
   */
  private async capAndNotifyClients(
    merchantId: string,
    merchantName: string,
    limit: number,
    loyaltyType: string,
  ): Promise<void> {
    const unitLabel = loyaltyType === 'STAMPS' ? 'tampons' : 'points';

    // 1. Fetch ALL affected cards in one query (with points > limit)
    const BATCH_SIZE = 500;
    let totalCapped = 0;

    while (true) {
      // Fetch a batch — no skip needed since we update matching rows each iteration
      const cards = await this.loyaltyCardRepo.findMany({
        where: { merchantId, points: { gt: limit } },
        select: { id: true, clientId: true, points: true },
        take: BATCH_SIZE,
      });

      if (cards.length === 0) break;

      // 2. Bulk cap all balances in one UPDATE (instead of N individual updates)
      const cardIds = cards.map((c: any) => c.id);
      await this.loyaltyCardRepo.updateMany({
        where: { id: { in: cardIds } },
        data: { points: limit },
      });

      // 3. Bulk insert all ADJUST_POINTS transactions (instead of N individual creates)
      await this.transactionRepoDelegate.createMany({
        data: cards.map((card: any) => ({
          clientId: card.clientId,
          merchantId,
          type: 'ADJUST_POINTS' as const,
          loyaltyType: loyaltyType as any,
          points: limit - card.points,
          amount: 0,
          note: `Limite d'accumulation appliquée: ${card.points} → ${limit} ${unitLabel}`,
        })),
      });

      // 4. Send push notifications in parallel (fire-and-forget per batch)
      const NOTIF_CONCURRENCY = 20;
      for (let i = 0; i < cards.length; i += NOTIF_CONCURRENCY) {
        const chunk = cards.slice(i, i + NOTIF_CONCURRENCY);
        await Promise.allSettled(
          chunk.map((card: any) =>
            this.notifications.sendToClient(
              merchantId,
              card.clientId,
              `📊 ${merchantName} — Solde ajusté`,
              `Votre solde est passé de ${card.points} à ${limit} ${unitLabel} chez ${merchantName}.`,
              { event: 'points_updated', merchantId, newBalance: String(limit), loyaltyType },
            ),
          ),
        );
      }

      totalCapped += cards.length;
      if (cards.length < BATCH_SIZE) break;
    }

    this.logger.log(
      `Capped ${totalCapped} loyalty card(s) to ${limit} ${unitLabel} for merchant ${merchantId}`,
    );
  }

  /**
   * Create a LOYALTY_PROGRAM_CHANGE transaction for every client that holds a
   * loyalty card with this merchant, and push a notification to all of them.
   */
  private async notifyLoyaltyTypeChange(
    merchantId: string,
    merchantName: string,
    oldType: string,
    newType: string,
  ): Promise<void> {
    const typeLabel = (t: string) =>
      t === 'STAMPS' ? 'Tampons 🎫' : 'Points 🏅';

    const note = `Programme de fidélité modifié : ${typeLabel(oldType)} → ${typeLabel(newType)}`;
    const notifTitle = `🔄 Programme fidélité mis à jour`;
    const notifBody =
      `${merchantName} est passé au système ${typeLabel(newType)}. ` +
      `Vos ${oldType === 'STAMPS' ? 'tampons' : 'points'} ont été convertis automatiquement.`;

    // 1. Fetch and process clients in batches to avoid OOM on large merchants
    const BATCH_SIZE = 500;
    let skip = 0;
    let totalProcessed = 0;

    while (true) {
      const cards = await this.loyaltyCardRepo.findMany({
        where: { merchantId },
        select: { clientId: true },
        take: BATCH_SIZE,
        skip,
      });

      if (cards.length === 0) break;

      const clientIds = cards.map((c: any) => c.clientId);

      // 2. Bulk insert transactions for this batch
      await this.transactionRepoDelegate.createMany({
        data: clientIds.map((clientId: string) => ({
          clientId,
          merchantId,
          type: 'LOYALTY_PROGRAM_CHANGE' as const,
          loyaltyType: newType as any,
          points: 0,
          amount: 0,
          note,
        })),
        skipDuplicates: false,
      });

      totalProcessed += cards.length;
      skip += BATCH_SIZE;

      if (cards.length < BATCH_SIZE) break;
    }

    this.logger.log(
      `Created ${totalProcessed} LOYALTY_PROGRAM_CHANGE transactions for merchant ${merchantId}`,
    );

    // 3. Send in-app + push notification to all clients
    await this.notifications.sendToAll(merchantId, {
      title: notifTitle,
      body: notifBody,
    });
  }

  /**
   * Update all rewards' cout to the new stampsForReward value.
   * Called when the merchant changes stampsForReward without switching loyalty type.
   */
  private async syncRewardCosts(merchantId: string, newCout: number): Promise<void> {
    await this.rawQuery.executeRaw`
      UPDATE rewards
      SET cout = ${newCout},
          updated_at = NOW()
      WHERE merchant_id = ${merchantId}`;
    this.logger.log(`Synced reward costs to ${newCout} for merchant ${merchantId}`);
  }

  private async recalculateBalances(
    merchantId: string,
    oldType: string,
    newType: string,
    conversionRate: number,
  ) {
    if (oldType === 'POINTS' && newType === 'STAMPS') {
      // Convert client balances: points → stamps
      await this.rawQuery.executeRaw`
        UPDATE loyalty_cards
        SET points = GREATEST(FLOOR(points / ${conversionRate}), 0),
            updated_at = NOW()
        WHERE merchant_id = ${merchantId}`;

      // Convert reward costs: points → stamps (minimum 1)
      await this.rawQuery.executeRaw`
        UPDATE rewards
        SET cout = GREATEST(FLOOR(cout / ${conversionRate}), 1),
            updated_at = NOW()
        WHERE merchant_id = ${merchantId}`;

    } else if (oldType === 'STAMPS' && newType === 'POINTS') {
      // Convert client balances: stamps → points
      await this.rawQuery.executeRaw`
        UPDATE loyalty_cards
        SET points = ROUND(points * ${conversionRate}),
            updated_at = NOW()
        WHERE merchant_id = ${merchantId}`;

      // Convert reward costs: stamps → points (minimum 1)
      await this.rawQuery.executeRaw`
        UPDATE rewards
        SET cout = GREATEST(ROUND(cout * ${conversionRate}), 1),
            updated_at = NOW()
        WHERE merchant_id = ${merchantId}`;
    }
  }

  // ── Delete Account (soft delete) ─────────────────────────────

  async deleteAccount(merchantId: string, password?: string, idToken?: string): Promise<{ message: string }> {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { id: true, password: true, nom: true, email: true, googleId: true },
    });
    if (!merchant) throw new NotFoundException('Commerçant non trouvé');

    // ── Identity verification ──────────────────────────────────
    if (merchant.googleId && idToken) {
      try {
        const webClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
        const androidClientIds = (this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID') || '').split(',').map(s => s.trim()).filter(Boolean);
        const allowedAudiences = [webClientId, ...androidClientIds].filter(Boolean) as string[];

        const ticket = await this.googleClient.verifyIdToken({
          idToken,
          audience: allowedAudiences,
        });
        const payload = ticket.getPayload();
        if (!payload || payload.sub !== merchant.googleId) {
          throw new UnauthorizedException('Le compte Google ne correspond pas');
        }
      } catch (error) {
        if (error instanceof UnauthorizedException) throw error;
        throw new UnauthorizedException('Token Google invalide');
      }
    } else if (password) {
      const isValid = await bcrypt.compare(password, merchant.password);
      if (!isValid) throw new UnauthorizedException('Mot de passe incorrect');
    } else {
      throw new BadRequestException('Le mot de passe ou la réauthentification Google est requis');
    }

    // ── Atomic soft-delete inside a transaction ────────────────
    const now = new Date();

    await this.txRunner.run(async (tx) => {
      // 1. Soft-delete merchant: anonymise PII so email/phone can be reused
      await tx.merchant.update({
        where: { id: merchantId },
        data: {
          deletedAt: now,
          email: `deleted_${merchantId}`,
          password: '',
          googleId: null,
          pushToken: null,
          phoneNumber: null,
          isActive: false,
        },
      });

      // 2. Deactivate all team members + clear credentials
      await tx.teamMember.updateMany({
        where: { merchantId },
        data: { isActive: false, password: '' },
      });

      // 3. Deactivate all stores so they disappear from search/discovery
      await tx.store.updateMany({
        where: { merchantId },
        data: { isActive: false },
      });

      // 4. Deactivate all loyalty cards so clients see them as expired
      await tx.loyaltyCard.updateMany({
        where: { merchantId, deactivatedAt: null },
        data: { deactivatedAt: now },
      });

      // 5. Revoke all active sessions (access + refresh tokens invalidated)
      await tx.deviceSession.deleteMany({
        where: { merchantId },
      });
    });

    // ── Post-transaction cleanup (non-critical) ────────────────
    await Promise.allSettled([
      this.cache.del(`merchant:profile:${merchantId}`),
      this.cache.del(`merchant:detail:${merchantId}`),
    ]);

    this.logger.log(
      `Account deleted: merchantId=${merchantId} name="${merchant.nom}" email="${merchant.email}" at=${now.toISOString()}`,
    );

    return { message: `Le compte "${merchant.nom}" a été supprimé.` };
  }
}
