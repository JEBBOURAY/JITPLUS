import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  DEVICE_SESSION_REPOSITORY, type IDeviceSessionRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../../common/repositories';
import { NotificationsService } from '../../notifications/notifications.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { UpdateLoyaltySettingsDto } from '../dto/update-loyalty-settings.dto';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_SALT_ROUNDS } from '../../common/constants';
import { MERCHANT_PROFILE_SELECT, MerchantProfileData } from '../../common/prisma-selects';
import { MERCHANT_PROFILE_CACHE_TTL } from '../../common/constants';
import { stripUndefined } from '../../common/utils';

@Injectable()
export class MerchantProfileService {
  private readonly logger = new Logger(MerchantProfileService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(DEVICE_SESSION_REPOSITORY) private deviceSessionRepo: IDeviceSessionRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private transactionRepoDelegate: ITransactionRepository,
    @Inject(TRANSACTION_RUNNER) private txRunner: ITransactionRunner,
    @Inject(RAW_QUERY_RUNNER) private rawQuery: IRawQueryRunner,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private notifications: NotificationsService,
  ) {}

  // â”€â”€ Profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getProfile(merchantId: string): Promise<MerchantProfileData> {
    const cacheKey = `merchant:profile:${merchantId}`;
    const cached = await this.cache.get<MerchantProfileData>(cacheKey);
    if (cached) return cached;

    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: MERCHANT_PROFILE_SELECT,
    });
    if (!merchant) throw new NotFoundException('Commerçant non trouvé');

    await this.cache.set(cacheKey, merchant, MERCHANT_PROFILE_CACHE_TTL);
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
    const { socialLinks, ...rest } = stripUndefined(dto);
    const data: Record<string, unknown> = { ...rest };
    if (socialLinks !== undefined) {
      data.socialLinks = socialLinks as Record<string, unknown>;
    }
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
      select: { id: true, password: true },
    });
    if (!merchant) throw new NotFoundException('Commerçant non trouvé');

    const isValid = await bcrypt.compare(dto.currentPassword, merchant.password);
    if (!isValid) throw new UnauthorizedException('Mot de passe actuel incorrect');

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

    return sessions.map(({ tokenId, ...session }) => ({
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
      // Fire-and-forget: large UPDATE should not block the HTTP response
      this.recalculateBalances(merchantId, oldType, newType, conversionRate)
        .catch((err) => this.logger.error(`recalculateBalances failed: ${err}`));
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
      const cardIds = cards.map((c) => c.id);
      await this.loyaltyCardRepo.updateMany({
        where: { id: { in: cardIds } },
        data: { points: limit },
      });

      // 3. Bulk insert all ADJUST_POINTS transactions (instead of N individual creates)
      await this.transactionRepoDelegate.createMany({
        data: cards.map((card) => ({
          clientId: card.clientId,
          merchantId,
          type: 'ADJUST_POINTS' as const,
          loyaltyType,
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
          chunk.map((card) =>
            this.notifications.sendToClient(
              merchantId,
              card.clientId,
              `${merchantName} — Solde ajusté`,
              `Votre solde a été ajusté de ${card.points} à ${limit} ${unitLabel} suite à la mise en place d'un plafond d'accumulation.`,
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
    const notifTitle = `${merchantName} a mis à jour son programme de fidélité`;
    const notifBody =
      `Le commerce ${merchantName} est passé au système ${typeLabel(newType)}. ` +
      `Votre solde a été automatiquement converti.`;

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

      const clientIds = cards.map((c) => c.clientId);

      // 2. Bulk insert transactions for this batch
      await this.transactionRepoDelegate.createMany({
        data: clientIds.map((clientId) => ({
          clientId,
          merchantId,
          type: 'LOYALTY_PROGRAM_CHANGE' as const,
          loyaltyType: newType,
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

  private async recalculateBalances(
    merchantId: string,
    oldType: string,
    newType: string,
    conversionRate: number,
  ) {
    if (oldType === 'POINTS' && newType === 'STAMPS') {
      await this.rawQuery.executeRaw`
        UPDATE loyalty_cards
        SET points = FLOOR(points / ${conversionRate}),
            updated_at = NOW()
        WHERE merchant_id = ${merchantId}`;
    } else if (oldType === 'STAMPS' && newType === 'POINTS') {
      await this.rawQuery.executeRaw`
        UPDATE loyalty_cards
        SET points = ROUND(points * ${conversionRate}),
            updated_at = NOW()
        WHERE merchant_id = ${merchantId}`;
    }
  }

  // ── Delete Account (soft delete) ─────────────────────────────

  async deleteAccount(merchantId: string, password: string): Promise<{ message: string }> {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { id: true, password: true, nom: true },
    });
    if (!merchant) throw new NotFoundException('Commerçant non trouvé');

    const isValid = await bcrypt.compare(password, merchant.password);
    if (!isValid) throw new UnauthorizedException('Mot de passe incorrect');

    // Soft delete: mark as deleted + anonymise sensitive fields so the
    // email/phone can be reused for a new account.  Related data (stores,
    // cards, transactions…) stays intact for analytics.
    await this.merchantRepo.update({
      where: { id: merchantId },
      data: {
        deletedAt: new Date(),
        email: `deleted_${merchantId}`,
        password: '',
        googleId: null,
        pushToken: null,
        phoneNumber: null,
        isActive: false,
      },
    });

    return { message: `Le compte "${merchant.nom}" a été supprimé.` };
  }
}
