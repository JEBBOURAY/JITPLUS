import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { MerchantPlan, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  DEVICE_SESSION_REPOSITORY, type IDeviceSessionRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../../common/repositories';
import { NotificationsService } from '../../notifications/notifications.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { UpdateLoyaltySettingsDto } from '../dto/update-loyalty-settings.dto';
import { AuditLogService, AuditAction, AuditTargetType } from '../../admin/audit-log.service';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { createPublicKey, randomUUID } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { BCRYPT_SALT_ROUNDS, DEFAULT_STAMPS_FOR_REWARD } from '../../common/constants';
import { MERCHANT_PROFILE_SELECT, MerchantProfileData } from '../../common/prisma-selects';
import { MERCHANT_PROFILE_CACHE_TTL } from '../../common/constants';
import { stripUndefined } from '../../common/utils';
import { assertClean } from '../../common/utils/content-moderation';
import { getNotifTranslations } from '../../common/utils/notification-i18n';
import { MailService } from '../../mail/mail.service';
import { pickEmailLang } from '../../mail/transactional-i18n';

@Injectable()
export class MerchantProfileService {
  private readonly logger = new Logger(MerchantProfileService.name);
  private readonly googleClient: OAuth2Client;
  private appleJwksCache: { keys: any[]; fetchedAt: number } | null = null;

  constructor(
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(DEVICE_SESSION_REPOSITORY) private deviceSessionRepo: IDeviceSessionRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private transactionRepoDelegate: ITransactionRepository,
    @Inject(TRANSACTION_RUNNER) private txRunner: ITransactionRunner,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private notifications: NotificationsService,
    private configService: ConfigService,
    private auditLogService: AuditLogService,
    private mailService: MailService,
  ) {
    this.googleClient = new OAuth2Client(this.configService.get<string>('GOOGLE_CLIENT_ID'));
  }

  // ── Profile ──────────────────────────────────────────────

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
    // These fields are shown to end users in jitplus (UGC policy).
    assertClean({
      nom: dto.nom,
      tagline: dto.tagline,
      description: dto.description,
      'socialLinks.instagram': dto.socialLinks?.instagram,
      'socialLinks.tiktok': dto.socialLinks?.tiktok,
      'socialLinks.facebook': dto.socialLinks?.facebook,
      'socialLinks.snapchat': dto.socialLinks?.snapchat,
      'socialLinks.youtube': dto.socialLinks?.youtube,
      'socialLinks.website': dto.socialLinks?.website,
    });

    // Re-authentication fields are checked below and never written to the merchant row.
    const { socialLinks, currentPassword, idToken, appleIdentityToken, ...rest } = stripUndefined(dto);
    const data: Record<string, unknown> = { ...rest };
    if (socialLinks !== undefined) {
      // The object replaces the stored links entirely: a missing or blank key removes that link.
      data.socialLinks = Object.fromEntries(
        Object.entries(socialLinks).filter(([, v]) => typeof v === 'string' && v.trim() !== ''),
      ) as Prisma.InputJsonObject;
    }

    // The email is a login identifier and the password-reset channel: changing
    // it with a stolen access token alone would hand over the account, so the
    // owner must prove their identity (password, or Google/Apple re-auth).
    if (data.email) {
      const current = await this.merchantRepo.findUnique({
        where: { id: merchantId },
        select: { email: true, password: true, googleId: true, appleId: true },
      });
      if (!current) throw new NotFoundException('Commerçant non trouvé');
      if (current.email !== data.email) {
        await this.assertReauthenticated(current, { password: currentPassword, idToken, appleIdentityToken }, {
          missing: 'Confirmez votre identité (mot de passe actuel ou Google/Apple) pour changer d\'adresse email',
          wrongPassword: 'Mot de passe actuel incorrect',
        });
        // Flag only: the new address is shown as unverified, login is not blocked.
        data.emailVerified = false;
      }
    }

    const result = await this.merchantRepo.update({
      where: { id: merchantId },
      data: data as Prisma.MerchantUpdateInput,
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
      select: { id: true, password: true, googleId: true, appleId: true },
    });
    if (!merchant) throw new NotFoundException('Commerçant non trouvé');

    // Google/Apple accounts have no password they know: they re-authenticate
    // with their provider instead. A bare access token is never enough.
    await this.assertReauthenticated(
      merchant,
      { password: dto.currentPassword, idToken: dto.idToken, appleIdentityToken: dto.appleIdentityToken },
      {
        missing: merchant.googleId || merchant.appleId
          ? 'Le mot de passe actuel ou la réauthentification Google/Apple est requis'
          : 'Le mot de passe actuel est requis',
        wrongPassword: 'Mot de passe actuel incorrect',
      },
    );

    // Prevent reusing the same password
    if (merchant.password) {
      const isSame = await bcrypt.compare(dto.newPassword, merchant.password);
      if (isSame) throw new BadRequestException('Le nouveau mot de passe doit être différent de l\'ancien');
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

  async updatePushToken(merchantId: string, pushToken: string, language?: string): Promise<{ message: string }> {
    const tokenValue = pushToken || null; // Empty string → null (clears token on logout)
    await this.merchantRepo.update({
      where: { id: merchantId },
      data: { pushToken: tokenValue, ...(language ? { language } : {}) },
    });
    return { message: 'Push token mis à jour' };
  }

  async markAdminNotificationsRead(merchantId: string): Promise<void> {
    await this.merchantRepo.update({
      where: { id: merchantId },
      data: { lastAdminNotifReadAt: new Date() },
    });
  }

  // ── Device Sessions ──────────────────────────────────────

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
    // Read outside transaction to minimise lock duration
    const existing = await this.deviceSessionRepo.findFirst({
      where: { merchantId, deviceName: deviceInfo.deviceName },
      select: { id: true },
    });

    return this.txRunner.run(async (tx) => {
      // Clear all current-device flags (lightweight bulk UPDATE)
      await tx.deviceSession.updateMany({
        where: { merchantId },
        data: { isCurrentDevice: false },
      });

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

  // ── Settings ─────────────────────────────────────────────

  async previewAccumulationLimit(merchantId: string, limit: number): Promise<{ affectedClients: number }> {
    const count = await this.loyaltyCardRepo.count({
      where: { merchantId, stamps: { gt: limit } },
    });
    return { affectedClients: count };
  }

  /** Clients whose balance would be rescaled by a stampsForReward change. */
  async previewCardSlots(merchantId: string): Promise<{ clientsWithStamps: number }> {
    const count = await this.loyaltyCardRepo.count({
      where: { merchantId, stamps: { gt: 0 }, deactivatedAt: null },
    });
    return { clientsWithStamps: count };
  }

  async updateLoyaltySettings(merchantId: string, dto: UpdateLoyaltySettingsDto): Promise<MerchantProfileData> {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        nom: true,
        stampsForReward: true,
        accumulationLimit: true,
        stampValidityDays: true,
      },
    });
    if (!merchant) throw new NotFoundException('Commerce non trouvé');

    if (dto.stampsForReward !== undefined && dto.stampsForReward < 1) {
      throw new BadRequestException('Le nombre de tampons pour un cadeau doit être au moins 1');
    }
    if (dto.amountPerStamp !== undefined && dto.amountPerStamp <= 0) {
      throw new BadRequestException('Le montant par tampon doit être supérieur à zéro');
    }
    if (dto.accumulationLimit !== undefined && dto.accumulationLimit !== null && dto.accumulationLimit < 1) {
      throw new BadRequestException("La limite d'accumulation doit être au moins 1");
    }

    // Strip forceCapClients from the data sent to Prisma (not a DB field)
    const forceCapClients = dto.forceCapClients;
    const { forceCapClients: _strip, ...dtoWithoutForce } = dto;
    const data: Record<string, unknown> = stripUndefined(dtoWithoutForce);
    // Restart the expiry countdown whenever the rule changes, so enabling or
    // shortening the validity never wipes a card without a reminder first.
    if (dto.stampValidityDays !== undefined && dto.stampValidityDays !== merchant.stampValidityDays) {
      data.stampValiditySince = dto.stampValidityDays === null ? null : new Date();
    }

    // A stampsForReward change rescales existing reward costs proportionally so
    // that the merchant's pricing tiers (e.g. small/medium/large) are preserved.
    const stampsForRewardChanged =
      dto.stampsForReward !== undefined &&
      dto.stampsForReward !== merchant.stampsForReward;

    // Atomic: rescale reward costs + balances and apply merchant settings in a single DB transaction.
    const updated = await this.txRunner.run(
      async (tx) => {
        if (stampsForRewardChanged) {
          await this.scaleRewardCostsTx(
            tx,
            merchantId,
            merchant.stampsForReward || DEFAULT_STAMPS_FOR_REWARD,
            dto.stampsForReward!,
            merchant.accumulationLimit ?? null,
          );
        }
        return tx.merchant.update({
          where: { id: merchantId },
          data: data as any,
          select: MERCHANT_PROFILE_SELECT,
        }) as unknown as MerchantProfileData;
      },
    );

    // Cap existing clients' balances and notify them if the merchant confirmed
    if (forceCapClients && dto.accumulationLimit != null) {
      this.capAndNotifyClients(merchantId, merchant.nom, dto.accumulationLimit)
        .catch((err) => this.logger.error(`capAndNotifyClients failed: ${err}`));
    }

    await Promise.all([
      this.cache.del(`merchant:detail:${merchantId}`),
      this.cache.del(`merchant:profile:${merchantId}`),
    ]);

    this.auditLogService.log({
      ctx: { actorType: 'MERCHANT', merchantId },
      action: AuditAction.UPDATE_LOYALTY_SETTINGS,
      targetType: AuditTargetType.MERCHANT,
      targetId: merchantId,
      metadata: {
        stampEarningMode: dto.stampEarningMode,
        amountPerStamp: dto.amountPerStamp,
        stampsForReward: dto.stampsForReward,
        accumulationLimit: dto.accumulationLimit,
        stampValidityDays: dto.stampValidityDays,
      },
    });

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
  ): Promise<void> {
    // 1. Fetch ALL affected cards in one query (with stamps > limit)
    const BATCH_SIZE = 500;
    let totalCapped = 0;

    while (true) {
      // Fetch a batch — no skip needed since we update matching rows each iteration
      const cards = await this.loyaltyCardRepo.findMany({
        where: { merchantId, stamps: { gt: limit } },
        select: { id: true, clientId: true, stamps: true, client: { select: { language: true } } },
        take: BATCH_SIZE,
      });

      if (cards.length === 0) break;

      // 2. Bulk cap all balances in one UPDATE (instead of N individual updates)
      const cardIds = cards.map((c: any) => c.id);
      await this.loyaltyCardRepo.updateMany({
        where: { id: { in: cardIds } },
        data: { stamps: limit },
      });

      // 3. Bulk insert all ADJUST_STAMPS transactions (instead of N individual creates)
      await this.transactionRepoDelegate.createMany({
        data: cards.map((card: any) => {
          const t = getNotifTranslations(card.client?.language);
          return {
            clientId: card.clientId,
            merchantId,
            type: 'ADJUST_STAMPS' as const,
            stamps: limit - card.stamps,
            amount: 0,
            note: t.capNote(card.stamps, limit, t.unitStamps(limit)),
          };
        }),
      });

      // 4. Send push notifications in parallel (fire-and-forget per batch)
      const NOTIF_CONCURRENCY = 20;
      for (let i = 0; i < cards.length; i += NOTIF_CONCURRENCY) {
        const chunk = cards.slice(i, i + NOTIF_CONCURRENCY);
        await Promise.allSettled(
          chunk.map((card: any) => {
            const t = getNotifTranslations(card.client?.language);
            return this.notifications.sendToClient(
              merchantId,
              card.clientId,
              t.capTitle(merchantName),
              t.capBody(card.stamps, limit, t.unitStamps(limit), merchantName),
              { event: 'stamps_updated', merchantId, newBalance: String(limit) },
            );
          }),
        );
      }

      totalCapped += cards.length;
      if (cards.length < BATCH_SIZE) break;
    }

    this.logger.log(
      `Capped ${totalCapped} loyalty card(s) to ${limit} for merchant ${merchantId}`,
    );
  }

  /**
   * Rescale every reward `cout` AND every client `loyalty_cards.stamps`
   * proportionally when the merchant changes `stampsForReward`.
   *
   * new_value = ROUND(value * newRef / oldRef).
   *  - rewards: floor 1 (a free reward at 0 stamps would be exploitable).
   *  - cards:   floor 0, capped by accumulationLimit when set.
   *
   * Why client balances must scale too:
   *   if a client had 5/10 stamps (50 % progress) and the merchant raises
   *   stampsForReward to 15, leaving the balance at 5/15 silently demotes the
   *   client's progress to 33 %. Symmetrically, lowering 10 → 5 with the
   *   balance left untouched would over-credit them. Scaling preserves the
   *   ratio "current / threshold" across the change.
   *
   * Concurrency: SELECT … FOR UPDATE locks the merchant row so concurrent
   * EARN_STAMPS / REDEEM_REWARD wait until the rescale commits.
   *
   * Cast to ::numeric to avoid Postgres integer division.
   */
  private async scaleRewardCostsTx(
    tx: import('../../common/repositories').TransactionClient,
    merchantId: string,
    oldRef: number,
    newRef: number,
    accumulationLimit: number | null,
  ): Promise<void> {
    if (!Number.isFinite(oldRef) || oldRef <= 0 || !Number.isFinite(newRef) || newRef <= 0) {
      throw new BadRequestException('Référence de tampons invalide pour le re-calcul des cadeaux');
    }
    if (oldRef === newRef) return;

    await tx.$executeRaw`SELECT id FROM merchants WHERE id = ${merchantId} FOR UPDATE`;

    // 1. Rescale reward costs (preserve tiers; floor 1).
    await tx.$executeRaw`
      UPDATE rewards
      SET cout = GREATEST(ROUND(cout::numeric * ${newRef} / ${oldRef})::int, 1),
          updated_at = NOW()
      WHERE merchant_id = ${merchantId}`;

    // 2. Rescale client balances (preserve % progress; cap when configured).
    if (accumulationLimit && accumulationLimit > 0) {
      await tx.$executeRaw`
        UPDATE loyalty_cards
        SET stamps = LEAST(GREATEST(ROUND(stamps::numeric * ${newRef} / ${oldRef})::int, 0), ${accumulationLimit}),
            updated_at = NOW()
        WHERE merchant_id = ${merchantId}`;
    } else {
      await tx.$executeRaw`
        UPDATE loyalty_cards
        SET stamps = GREATEST(ROUND(stamps::numeric * ${newRef} / ${oldRef})::int, 0),
            updated_at = NOW()
        WHERE merchant_id = ${merchantId}`;
    }

    this.logger.log(
      `Scaled rewards + client balances by ${newRef}/${oldRef} for merchant ${merchantId}`,
    );
  }

  // ── Re-authentication (sensitive account changes) ────────────
  /**
   * Proves the caller is the account owner, not just a holder of its access
   * token: a Google/Apple identity token for the linked account, or the
   * current password.
   */
  private async assertReauthenticated(
    merchant: { password: string; googleId: string | null; appleId: string | null },
    credentials: { password?: string; idToken?: string; appleIdentityToken?: string },
    messages: { missing: string; wrongPassword: string },
  ): Promise<void> {
    const { password, idToken, appleIdentityToken } = credentials;
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
    } else if (merchant.appleId && appleIdentityToken) {
      try {
        const applePayload = await this.verifyAppleTokenForDeletion(appleIdentityToken);
        if (applePayload.sub !== merchant.appleId) {
          throw new UnauthorizedException('Le compte Apple ne correspond pas');
        }
      } catch (error) {
        if (error instanceof UnauthorizedException) throw error;
        throw new UnauthorizedException('Token Apple invalide');
      }
    } else if (password) {
      const isValid = await bcrypt.compare(password, merchant.password);
      if (!isValid) throw new UnauthorizedException(messages.wrongPassword);
    } else {
      throw new BadRequestException(messages.missing);
    }
  }

  // ── Delete Account (soft delete) ─────────────────────────────

  async deleteAccount(merchantId: string, password?: string, idToken?: string, appleIdentityToken?: string): Promise<{ message: string }> {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { id: true, password: true, nom: true, email: true, googleId: true, appleId: true, language: true },
    });
    if (!merchant) throw new NotFoundException('Commerçant non trouvé');

    // ── Identity verification ──────────────────────────────────
    await this.assertReauthenticated(merchant, { password, idToken, appleIdentityToken }, {
      missing: 'Le mot de passe ou la réauthentification Google/Apple est requis',
      wrongPassword: 'Mot de passe incorrect',
    });

    // ── Atomic soft-delete inside a transaction ────────────────
    const now = new Date();
    // Capture original identity BEFORE anonymisation — needed to send confirmation email.
    const originalEmail = merchant.email;
    const originalNom = merchant.nom;
    const originalLanguage = merchant.language;
    const isEmailReal = !!originalEmail && !originalEmail.startsWith('deleted_') && originalEmail.includes('@');

    // Hash a random password for deactivated team members (avoids empty-string hash rows)
    const teamMemberPlaceholder = await bcrypt.hash(randomUUID(), BCRYPT_SALT_ROUNDS);
    await this.txRunner.run(async (tx) => {
      // 1. Soft-delete merchant: anonymise ALL PII so email/phone/social IDs can be reused
      await tx.merchant.update({
        where: { id: merchantId },
        data: {
          deletedAt: now,
          nom: `Compte supprimé`,
          email: `deleted_${merchantId}`,
          password: '',
          googleId: null,
          appleId: null,
          pushToken: null,
          phoneNumber: null,
          description: null,
          ville: null,
          quartier: null,
          adresse: null,
          latitude: null,
          longitude: null,
          logoUrl: null,
          coverUrl: null,
          socialLinks: Prisma.DbNull,
          referralCode: null,
          isActive: false,
        },
      });

      // 2. Deactivate all team members + clear credentials
      await tx.teamMember.updateMany({
        where: { merchantId },
        data: { isActive: false, password: teamMemberPlaceholder },
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

      // 6. Clean up notification data so recreated accounts start fresh
      await tx.merchantNotificationRead.deleteMany({
        where: { merchantId },
      });
      await tx.merchantInboxNotification.deleteMany({
        where: { merchantId },
      });
      await tx.notification.deleteMany({
        where: { merchantId },
      });

      // 7. Delete orphan-prone related data
      await tx.reward.deleteMany({ where: { merchantId } });
      await tx.profileView.deleteMany({ where: { merchantId } });
      await tx.clientReferral.deleteMany({ where: { merchantId } });
    });
    await Promise.allSettled([
      this.cache.del(`merchant:profile:${merchantId}`),
      this.cache.del(`merchant:detail:${merchantId}`),
    ]);

    this.logger.log(
      `Account deleted: merchantId=${merchantId} name="${merchant.nom}" email="${merchant.email}" at=${now.toISOString()}`,
    );

    this.auditLogService.log({
      ctx: { actorType: 'MERCHANT', merchantId },
      action: AuditAction.DELETE_MERCHANT,
      targetType: AuditTargetType.MERCHANT,
      targetId: merchantId,
      targetLabel: `${merchant.nom} (${merchant.email})`,
      metadata: { selfDelete: true },
    });

    // Send confirmation email (best-effort, non-blocking) — GDPR Art. 17 + App Store 5.1.1(v)
    if (isEmailReal) {
      this.mailService
        .sendAccountDeleted(originalEmail, originalNom || 'votre commerce', pickEmailLang(originalLanguage))
        .catch((err) => this.logger.warn(`Failed to send account-deleted email to ${originalEmail}: ${err?.message || err}`));
    }

    return { message: `Le compte "${merchant.nom}" a été supprimé.` };
  }

  /** Verify Apple identity token for account deletion re-auth */
  private async verifyAppleTokenForDeletion(identityToken: string): Promise<{ sub: string }> {
    const decoded = jwt.decode(identityToken, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
      throw new UnauthorizedException('Token Apple invalide');
    }
    if (decoded.header.alg !== 'RS256') {
      throw new UnauthorizedException('Algorithme de signature Apple non supporté');
    }

    const keys = await this.getApplePublicKeys();
    let matchingKey = keys.find((k: any) => k.kid === decoded.header.kid);
    if (!matchingKey) {
      this.appleJwksCache = null;
      const freshKeys = await this.getApplePublicKeys();
      matchingKey = freshKeys.find((k: any) => k.kid === decoded.header.kid);
      if (!matchingKey) throw new UnauthorizedException('Clé Apple introuvable');
    }

    const publicKey = createPublicKey({ key: matchingKey, format: 'jwk' });
    const appleBundleIds = (this.configService.get<string>('APPLE_BUNDLE_IDS') || '').split(',').map(s => s.trim()).filter(Boolean);
    // Without an audience check, a token minted for any other Apple app would be accepted.
    if (appleBundleIds.length === 0) {
      this.logger.error('Apple Sign-In misconfigured: APPLE_BUNDLE_IDS is empty');
      throw new UnauthorizedException('Connexion Apple non configurée');
    }

    const payload = jwt.verify(identityToken, publicKey, {
      algorithms: ['RS256'],
      issuer: 'https://appleid.apple.com',
      audience: appleBundleIds as [string, ...string[]],
    }) as jwt.JwtPayload & { sub: string };

    return payload;
  }

  private async getApplePublicKeys(): Promise<any[]> {
    const now = Date.now();
    if (this.appleJwksCache && now - this.appleJwksCache.fetchedAt < 86_400_000) {
      return this.appleJwksCache.keys;
    }
    const res = await fetch('https://appleid.apple.com/auth/keys');
    if (!res.ok) throw new Error('Failed to fetch Apple JWKS');
    const { keys } = await res.json();
    this.appleJwksCache = { keys, fetchedAt: now };
    return keys;
  }
}
