import { Injectable, NotFoundException, ConflictException, BadRequestException, UnauthorizedException, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  NOTIFICATION_REPOSITORY, type INotificationRepository,
  CLIENT_NOTIFICATION_STATUS_REPOSITORY, type IClientNotificationStatusRepository,
  PROFILE_VIEW_REPOSITORY, type IProfileViewRepository,
  CLIENT_MERCHANT_BLOCK_REPOSITORY, type IClientMerchantBlockRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../common/repositories';
import * as bcrypt from 'bcryptjs';
import { buildPagination } from '../common/utils';
import { MERCHANTS_LIST_CACHE_TTL, MERCHANT_DETAIL_CACHE_TTL, UNREAD_COUNT_CACHE_TTL, EMAIL_LOGO_JITPLUS } from '../common/constants';
import { MailService } from '../mail/mail.service';
import { pickEmailLang } from '../mail/transactional-i18n';
import { Prisma } from '@prisma/client';
import { ClientClaimService } from '../merchant/services/client-claim.service';
import { withRetry } from '../common/utils/retry-transaction.helper';
import { merchantListCacheKey, merchantListGeneration } from '../common/utils/merchant-list-cache';
import { computeStampsExpiry } from '../merchant/utils/loyalty.utils';
import { DealsClientService, type MerchantDealBadge } from '../deals/deals-client.service';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { DEAL_DIGEST_AUDIENCE } from '../deals/deal-limits';
import { maskEmail } from '../common/utils/pii-mask';

/**
 * The client map (jitplus Discover) is the only reader of the merchants list:
 * it shows names, categories, address, position and logo. Profile and loyalty
 * fields (description, card colours, badges, cover, stamp rules...) belong to
 * the merchant page; selecting them here sent them for every map point and
 * stored them in the client's persisted cache for nothing.
 */
const MERCHANT_MAP_SELECT = {
  id: true,
  nom: true,
  categorie: true,
  secondaryCategories: true,
  ville: true,
  quartier: true,
  adresse: true,
  latitude: true,
  longitude: true,
  logoUrl: true,
  stores: {
    where: { isActive: true },
    select: { id: true, nom: true, ville: true, quartier: true, adresse: true, latitude: true, longitude: true },
  },
} satisfies Prisma.MerchantSelect;

type MerchantMapRow = Prisma.MerchantGetPayload<{ select: typeof MERCHANT_MAP_SELECT }>;

/** One point of the client map: a merchant, or one of its other stores. */
interface MerchantMapPoint {
  id: string;
  nomBoutique: string;
  categorie: MerchantMapRow['categorie'];
  secondaryCategories: MerchantMapRow['secondaryCategories'];
  ville: string | null;
  adresse: string | null;
  latitude: number | null;
  longitude: number | null;
  logoUrl: string | null;
  storeId?: string;
  storeName?: string;
}

@Injectable()
export class ClientService {
  private readonly logger = new Logger(ClientService.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(NOTIFICATION_REPOSITORY) private notificationRepo: INotificationRepository,
    @Inject(CLIENT_NOTIFICATION_STATUS_REPOSITORY) private clientNotifStatusRepo: IClientNotificationStatusRepository,
    @Inject(PROFILE_VIEW_REPOSITORY) private profileViewRepo: IProfileViewRepository,
    @Inject(CLIENT_MERCHANT_BLOCK_REPOSITORY) private blockRepo: IClientMerchantBlockRepository,
    @Inject(TRANSACTION_RUNNER) private txRunner: ITransactionRunner,
    @Inject(RAW_QUERY_RUNNER) private rawQuery: IRawQueryRunner,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private mailService: MailService,
    private clientClaimService: ClientClaimService,
    private deals: DealsClientService,
    private planService: MerchantPlanService,
  ) {}

  /** Live-deal badges; a failure only hides the badges, never the merchants. */
  private async dealBadges(): Promise<Record<string, MerchantDealBadge>> {
    try {
      return await this.deals.merchantBadges();
    } catch (err) {
      this.logger.warn(`Deal badges unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return {};
    }
  }

  async getProfile(clientId: string) {
    const client = await this.clientRepo.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        emailVerified: true,
        telephone: true,
        telephoneVerified: true,
        countryCode: true,
        shareInfoMerchants: true,
        notifPush: true,
        notifEmail: true,
        notifWhatsapp: true,
        language: true,
        dateNaissance: true,
        pushToken: true,
        password: true,
        createdAt: true,
        updatedAt: true,
        loyaltyCards: {
          where: { merchant: { deletedAt: null } },
          select: {
            id: true, merchantId: true, stamps: true, createdAt: true, updatedAt: true,
            merchant: {
              select: {
                id: true,
                nom: true,
                categorie: true,
              },
            },
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client non trouvé');
    }

    const { password, ...safeProfile } = client;
    return { ...safeProfile, hasPassword: !!password };
  }

  async updateProfile(
    clientId: string,
    updates: {
      prenom?: string;
      nom?: string;
      email?: string;
      telephone?: string;
      countryCode?: string;
      shareInfoMerchants?: boolean;
      notifPush?: boolean;
      notifEmail?: boolean;
      notifWhatsapp?: boolean;
      language?: string;
      dateNaissance?: string | null;
    },
  ) {
    // Normalise inputs once outside the transaction.
    if (updates.email) updates.email = updates.email.trim().toLowerCase();
    if (updates.telephone) updates.telephone = updates.telephone.trim();

    const { dateNaissance: dateNaissanceStr, language, ...restUpdates } = updates;
    const baseData: {
      prenom?: string; nom?: string; email?: string; telephone?: string;
      countryCode?: string; shareInfoMerchants?: boolean; notifPush?: boolean; notifEmail?: boolean; notifWhatsapp?: boolean;
      language?: string;
      dateNaissance?: Date | null;
      emailVerified?: boolean; telephoneVerified?: boolean;
    } = { ...restUpdates };
    if (language) baseData.language = language;
    if ('dateNaissance' in updates) {
      baseData.dateNaissance = dateNaissanceStr ? new Date(dateNaissanceStr) : null;
    }

    // Wrap uniqueness checks + update in a single Serializable transaction so
    // two concurrent profile edits cannot both pass the "email is free" check
    // and then collide on the unique constraint (P2002 500 to the second user).
    return withRetry(() =>
      this.txRunner.run(async (tx) => {
        if (updates.email) {
          const existing = await tx.client.findFirst({
            where: { email: updates.email, deletedAt: null },
            select: { id: true },
          });
          if (existing && existing.id !== clientId) {
            throw new ConflictException('Cette adresse email est déjà utilisée par un autre compte.');
          }
        }

        if (updates.telephone) {
          const existing = await tx.client.findFirst({
            where: { telephone: updates.telephone, deletedAt: null },
            select: { id: true, isAnonymous: true },
          });
          if (existing && existing.id !== clientId) {
            if ((existing as any).isAnonymous) {
              throw new ConflictException(
                await this.clientClaimService.buildAnonymousPhoneConflictPayload(existing.id),
              );
            }
            throw new ConflictException('Ce numéro de téléphone est déjà utilisé par un autre compte.');
          }
        }

        // Reset verification flags when contact info actually changes.
        const data = { ...baseData };
        if (updates.email || updates.telephone) {
          const current = await tx.client.findUnique({
            where: { id: clientId },
            select: { email: true, telephone: true },
          });
          if (updates.email && current && current.email !== updates.email) {
            data.emailVerified = false;
          }
          if (updates.telephone && current && current.telephone !== updates.telephone) {
            data.telephoneVerified = false;
          }
        }

        return tx.client.update({
          where: { id: clientId },
          data,
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
            emailVerified: true,
            telephone: true,
            telephoneVerified: true,
            countryCode: true,
            shareInfoMerchants: true,
            notifPush: true,
            notifEmail: true,
            notifWhatsapp: true,
            language: true,
            dateNaissance: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      }, { isolationLevel: 'Serializable' }),
    );
  }

  async deleteAccount(clientId: string, password?: string) {
    const client = await this.clientRepo.findUnique({
      where: { id: clientId },
      select: { id: true, password: true, googleId: true, appleId: true, email: true, prenom: true, language: true },
    });

    if (!client) {
      throw new BadRequestException('Compte introuvable');
    }

    // Identity verification: password required for password-based accounts,
    // social-only accounts (no password) can delete without re-auth since
    // they are already authenticated via JWT.
    if (client.password) {
      if (!password) {
        throw new BadRequestException('Le mot de passe est requis pour supprimer votre compte');
      }
      const isValid = await bcrypt.compare(password, client.password);
      if (!isValid) {
        throw new UnauthorizedException('Mot de passe incorrect');
      }
    }
    // Social-only users (Google/Apple, no password) are already authenticated
    // via their JWT — no additional re-auth needed.

    // Capture original identity BEFORE anonymisation for confirmation email.
    const originalEmail = client.email;
    const originalPrenom = client.prenom;
    const originalLanguage = client.language;
    const isEmailReal = !!originalEmail && originalEmail.includes('@');

    // Atomic soft-delete inside a transaction to ensure all related data
    // is cleaned up. Prevents orphaned records leaking to recreated accounts.
    const now = new Date();

    await this.txRunner.run(async (tx) => {
      // 1. Soft-delete client: anonymise ALL PII so email/phone/social IDs can be reused
      await tx.client.update({
        where: { id: clientId },
        data: {
          deletedAt: now,
          prenom: null,
          nom: null,
          email: null,
          telephone: null,
          password: null,
          dateNaissance: null,
          googleId: null,
          appleId: null,
          pushToken: null,
          refreshTokenHash: null,
          referralCode: null,
          referralBalance: 0,
        },
      });

      await tx.clientSession.deleteMany({ where: { clientId } });

      // 2. Deactivate all loyalty cards (cannot delete — Transaction references with Restrict)
      await tx.loyaltyCard.updateMany({
        where: { clientId, deactivatedAt: null },
        data: { deactivatedAt: now },
      });

      // 3. Clean up notification read statuses
      await tx.clientNotificationStatus.deleteMany({
        where: { clientId },
      });

      // 4. Clean up browsing history (privacy)
      await tx.profileView.deleteMany({
        where: { clientId },
      });

      // 5. Clean up referral records
      await tx.clientReferral.deleteMany({
        where: { clientId },
      });

      // 6. Clean up payout requests
      await tx.payoutRequest.deleteMany({
        where: { clientId },
      });
    });

    // Best-effort confirmation email (GDPR Art. 17 / App Store 5.1.1(v) / Google Play)
    if (isEmailReal) {
      this.mailService
        .sendClientAccountDeleted(originalEmail, originalPrenom || undefined, pickEmailLang(originalLanguage))
        .catch((err) => this.logger.warn(`Failed to send client account-deleted email to ${maskEmail(originalEmail)}: ${err?.message || err}`));
    }

    return { success: true, message: 'Compte supprimé avec succès' };
  }

  async updatePushToken(clientId: string, pushToken: string) {
    // Empty string means "clear the token" (e.g. on logout)
    const tokenValue = pushToken || null;

    if (tokenValue) {
      // Clear the same token from any other client to prevent duplicate notifications.
      // Accepts both ExponentPushToken[…] (routed via exp.host by FirebaseService)
      // and raw FCM tokens (sent through firebase-admin).
      await this.clientRepo.updateMany({
        where: { pushToken: tokenValue, id: { not: clientId } },
        data: { pushToken: null },
      });
    }

    await this.clientRepo.update({
      where: { id: clientId },
      data: { pushToken: tokenValue },
    });
    this.logger.log(`Push token ${tokenValue ? 'updated' : 'cleared'} for client ${clientId}`);
    return { success: true };
  }

  async getStampsOverview(clientId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const safeTake = Math.min(limit, 100);

    const [cards, totalCards] = await Promise.all([
      this.loyaltyCardRepo.findMany({
          where: { clientId, deactivatedAt: null, merchant: { deletedAt: null } },
        select: {
          id: true,
          merchantId: true,
          stamps: true,
          createdAt: true,
          updatedAt: true,
          merchant: {
            select: {
              id: true,
              nom: true,
              categorie: true,
              stampEarningMode: true,
              amountPerStamp: true,
              currency: true,
              stampsForReward: true,
              latitude: true,
              longitude: true,
              logoUrl: true,
              themeColor: true,
              cardBackgroundUrl: true,
              cardBackgroundColor: true,
              cardTextColor: true,
              // Fetch the cheapest reward so the client can show a progress bar
              rewards: {
                select: { cout: true },
                orderBy: { cout: 'asc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: safeTake,
      }),
      this.loyaltyCardRepo.count({ where: { clientId, deactivatedAt: null, merchant: { deletedAt: null } } }),
    ]);
    const totalStamps = cards.reduce((sum: number, card: any) => sum + card.stamps, 0);

    return {
      totalStamps,
      totalCards,
      pagination: buildPagination(totalCards, page, safeTake),
      cards: cards.map((card: any) => ({
        id: card.id,
        merchantId: card.merchantId,
        balance: card.stamps,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
        merchant: card.merchant
          ? {
              id: card.merchant.id,
              nomBoutique: card.merchant.nom,
              categorie: card.merchant.categorie,
              stampEarningMode: card.merchant.stampEarningMode,
              amountPerStamp: card.merchant.amountPerStamp,
              currency: card.merchant.currency,
              stampsForReward: card.merchant.stampsForReward,
              // null if the merchant has no rewards configured yet
              minRewardCost: card.merchant.rewards[0]?.cout ?? null,
              latitude: card.merchant.latitude,
              longitude: card.merchant.longitude,
              logoUrl: card.merchant.logoUrl ?? null,
              themeColor: card.merchant.themeColor ?? null,
              cardBackgroundUrl: card.merchant.cardBackgroundUrl ?? null,
              cardBackgroundColor: card.merchant.cardBackgroundColor ?? null,
              cardTextColor: card.merchant.cardTextColor ?? null,
            }
          : undefined,
      })),
    };
  }

  /** Without `clientId` (guest mode) the profile is returned with empty card fields. */
  async getMerchantById(id: string, clientId?: string) {
    // Apple 1.2 — a blocked merchant must be invisible to the client.
    if (clientId) {
      const blocked = await this.blockRepo.findUnique({
        where: { clientId_merchantId: { clientId, merchantId: id } },
        select: { id: true },
      });
      if (blocked) throw new NotFoundException('Commerce introuvable');
    }

    // Cache the merchant data (shared across all clients)
    const merchantCacheKey = `merchant:detail:${id}`;
    let m = await this.cache.get<any>(merchantCacheKey);

    if (!m) {
      m = await this.merchantRepo.findFirst({
        where: { id, isActive: true, stores: { some: { isActive: true } } },
        select: {
          id: true,
          nom: true,
          email: true,
          categorie: true,
          secondaryCategories: true,
          description: true,
          tagline: true,
          badges: true,
          gallery: true,
          openingHours: true,
          ville: true,
          quartier: true,
          adresse: true,
          latitude: true,
          longitude: true,
          stampEarningMode: true,
          amountPerStamp: true,
          currency: true,
          stampsForReward: true,
          stampValidityDays: true,
          stampValiditySince: true,
          logoUrl: true,
          coverUrl: true,
          themeColor: true,
          themeIcon: true,
          cardBackgroundUrl: true,
          cardBackgroundColor: true,
          cardTextColor: true,
          socialLinks: true,
          profileViews: true,
          stores: {
            where: { isActive: true },
            // Same order as the merchant's store list in JitPlus Pro.
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              nom: true,
              ville: true,
              quartier: true,
              adresse: true,
              latitude: true,
              longitude: true,
              telephone: true,
              email: true,
            },
          },
          rewards: {
            select: { id: true, titre: true, cout: true, description: true, imageUrl: true },
            orderBy: { cout: 'asc' },
          },
          luckyWheelCampaigns: {
            where: {
              status: 'ACTIVE',
              startsAt: { lte: new Date() },
              endsAt: { gte: new Date() },
            },
            select: {
              id: true,
              name: true,
              description: true,
              endsAt: true,
              minSpendAmount: true,
              globalWinRate: true,
              prizes: {
                where: { remaining: { gt: 0 } },
                select: { id: true, label: true, description: true, weight: true },
                orderBy: { weight: 'desc' },
              },
            },
            take: 1,
          },
          _count: { select: { loyaltyCards: true } },
        },
      });
      if (!m) throw new NotFoundException('Merchant not found');
      await this.cache.set(merchantCacheKey, m, MERCHANT_DETAIL_CACHE_TTL);
    }

    if (clientId) {
      // Record unique view: one per client per merchant per day
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      this.profileViewRepo.create({
        data: { merchantId: id, clientId, viewDate: today },
      })
      .then(() =>
        // New view today → increment the denormalized counter
        this.merchantRepo.update({
          where: { id },
          data: { profileViews: { increment: 1 } },
        }),
      )
      .catch((err: any) => {
        // P2002 = unique constraint violation → already viewed today, skip
        if (err?.code !== 'P2002') {
          this.logger.warn('Profile view tracking failed', err);
        }
      });
    }

    // Check if the client already has a loyalty card with this merchant
    const existingCard = clientId
      ? await this.loyaltyCardRepo.findUnique({
          where: { clientId_merchantId: { clientId, merchantId: id } },
          select: { id: true, stamps: true, deactivatedAt: true, lastVisitAt: true },
        })
      : null;
    const activeDealCount = (await this.dealBadges())[id]?.activeDealCount ?? 0;
    const cardStampsExpireAt =
      existingCard && !existingCard.deactivatedAt && existingCard.stamps > 0
        ? computeStampsExpiry(
            existingCard.lastVisitAt,
            m.stampValidityDays,
            m.stampValiditySince ? new Date(m.stampValiditySince) : null,
          )
        : null;

    return {
      id: m.id,
      nomBoutique: m.nom,
      categorie: m.categorie,
      secondaryCategories: m.secondaryCategories ?? [],
      description: m.description,
      tagline: m.tagline ?? null,
      badges: m.badges ?? [],
      gallery: m.gallery ?? [],
      openingHours: (m.openingHours as Record<string, unknown> | null) ?? null,
      ville: m.ville,
      adresse: m.adresse || (m.quartier ? `${m.quartier}, ${m.ville}` : m.ville),
      latitude: m.latitude,
      longitude: m.longitude,
      stampEarningMode: m.stampEarningMode,
      amountPerStamp: m.amountPerStamp,
      currency: m.currency,
      stampsForReward: m.stampsForReward,
      stampValidityDays: m.stampValidityDays ?? null,
      logoUrl: m.logoUrl ?? null,
      coverUrl: m.coverUrl ?? null,
      themeColor: m.themeColor ?? null,
      themeIcon: m.themeIcon ?? null,
      cardBackgroundUrl: m.cardBackgroundUrl ?? null,
      cardBackgroundColor: m.cardBackgroundColor ?? null,
      cardTextColor: m.cardTextColor ?? null,
      socialLinks: (m.socialLinks as Record<string, string> | null) ?? null,
      profileViews: m.profileViews,
      clientCount: m._count.loyaltyCards,
      hasCard: !!existingCard && !existingCard.deactivatedAt,
      cardDeactivated: !!existingCard?.deactivatedAt,
      cardBalance: existingCard?.stamps ?? 0,
      cardStampsExpireAt,
      stores: m.stores ?? [],
      activeDealCount,
      rewards: m.rewards.map((r: any) => ({
        id: r.id,
        titre: r.titre,
        cout: r.cout,
        description: r.description ?? null,
        imageUrl: r.imageUrl ?? null,
      })),
      activeLuckyWheel: m.luckyWheelCampaigns?.[0]
        ? {
            id: m.luckyWheelCampaigns[0].id,
            name: m.luckyWheelCampaigns[0].name,
            description: m.luckyWheelCampaigns[0].description ?? null,
            endsAt: m.luckyWheelCampaigns[0].endsAt,
            minSpendAmount: m.luckyWheelCampaigns[0].minSpendAmount,
            globalWinRate: m.luckyWheelCampaigns[0].globalWinRate,
            prizes: m.luckyWheelCampaigns[0].prizes.map((p: any) => ({
              id: p.id,
              label: p.label,
              description: p.description ?? null,
              weight: p.weight ?? 1,
            })),
          }
        : null,
    };
  }

  /**
   * Self-associate: client joins a merchant and gets a loyalty card with 0 balance.
   * If the card already exists, returns it without error (idempotent).
   */
  async joinMerchant(clientId: string, merchantId: string) {
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId, isActive: true },
      select: { id: true, nom: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const existing = await this.loyaltyCardRepo.findUnique({
      where: { clientId_merchantId: { clientId, merchantId } },
      select: { id: true, stamps: true, createdAt: true, deactivatedAt: true },
    });
    if (existing && !existing.deactivatedAt) {
      return { success: true, card: { id: existing.id, stamps: existing.stamps, createdAt: existing.createdAt } };
    }

    // A self-join counts against the merchant's FREE plan limit like any other
    // enrolment (it used to bypass it — security audit 2026-11-05).
    const { plan } = await this.planService.resolveEffectivePlan(merchantId);
    const card = await this.txRunner.run(async (tx) => {
      await this.planService.assertCanAddClient(merchantId, { tx, plan });
      return tx.loyaltyCard.upsert({
        where: { clientId_merchantId: { clientId, merchantId } },
        create: { clientId, merchantId, stamps: 0 },
        update: { deactivatedAt: null },
        select: { id: true, stamps: true, createdAt: true },
      });
    });

    return { success: true, card };
  }

  /**
   * Soft-deactivate the client's loyalty card with a merchant.
   * The card is not deleted (transactions reference it) but its stamp balance
   * is reset and the client is excluded from all merchant notifications
   * (push, email, WhatsApp).
   */
  async deactivateCard(clientId: string, merchantId: string) {
    const card = await this.loyaltyCardRepo.findUnique({
      where: { clientId_merchantId: { clientId, merchantId } },
      select: { id: true, deactivatedAt: true },
    });
    if (!card) throw new NotFoundException('Card not found');
    if (card.deactivatedAt) return { success: true };

    await this.loyaltyCardRepo.update({
      where: { id: card.id },
      data: { deactivatedAt: new Date(), stamps: 0 },
    });

    return { success: true };
  }

  /**
   * Client-initiated content report. Required by Apple App Review Guideline 1.2
   * and Google Play User-Generated Content Policy. The report is delivered to
   * the moderation inbox so admins can take action within 24 hours (ban merchant
   * via the existing admin flow).
   */
  async reportMerchant(
    clientId: string,
    merchantId: string,
    reason: string,
    details?: string,
  ): Promise<{ success: true; message: string }> {
    const [merchant, reporter] = await Promise.all([
      this.merchantRepo.findFirst({
        where: { id: merchantId },
        select: { id: true, nom: true },
      }),
      this.clientRepo.findUnique({
        where: { id: clientId },
        select: { id: true, email: true },
      }),
    ]);
    if (!merchant) throw new NotFoundException('Commerce introuvable');
    if (!reporter) throw new NotFoundException('Compte client introuvable');

    // Best-effort delivery — never block the user if SMTP is temporarily down.
    try {
      await this.mailService.sendContentReport({
        merchantId: merchant.id,
        merchantName: merchant.nom,
        reporterId: reporter.id,
        reporterEmail: reporter.email ?? 'unknown',
        reason,
        details,
      });
    } catch (err) {
      // Swallowed: the client UI must still acknowledge the report so the
      // user sees the action was recorded. The email failure is logged inside
      // MailService.
      void err;
    }

    return { success: true, message: 'Merci, votre signalement a été transmis.' };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Client-side merchant blocking (Apple Guideline 1.2 UGC policy).
  // Blocked merchants are removed from discovery lists and detail for the
  // blocking client. The merchant-side data is untouched.
  // ──────────────────────────────────────────────────────────────────────────

  async blockMerchant(clientId: string, merchantId: string) {
    const merchant = await this.merchantRepo.findFirst({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) throw new NotFoundException('Commerce introuvable');

    // Upsert-by-unique-constraint; idempotent.
    await this.blockRepo.upsert({
      where: { clientId_merchantId: { clientId, merchantId } },
      update: {},
      create: { clientId, merchantId },
    });

    // Best-effort: also leave the loyalty program so the merchant stops
    // receiving this client in their analytics.
    try {
      const card = await this.loyaltyCardRepo.findUnique({
        where: { clientId_merchantId: { clientId, merchantId } },
        select: { id: true, deactivatedAt: true },
      });
      if (card && !card.deactivatedAt) {
        await this.loyaltyCardRepo.update({
          where: { id: card.id },
          data: { deactivatedAt: new Date(), stamps: 0 },
        });
      }
    } catch {
      /* swallow — block succeeded, loyalty cleanup is best-effort */
    }

    // Invalidate list caches so the blocked merchant disappears immediately.
    await this.cache.del(`merchant:detail:${merchantId}`);

    return { success: true };
  }

  async unblockMerchant(clientId: string, merchantId: string) {
    await this.blockRepo.deleteMany({
      where: { clientId, merchantId },
    });
    return { success: true };
  }

  async getBlockedMerchants(clientId: string) {
    const blocks = await this.blockRepo.findMany({
      where: { clientId },
      select: {
        merchantId: true,
        createdAt: true,
        merchant: {
          select: { id: true, nom: true, logoUrl: true, categorie: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return blocks.map((b) => ({
      merchantId: b.merchantId,
      blockedAt: b.createdAt,
      ...b.merchant,
    }));
  }

  private async getBlockedMerchantIds(clientId: string): Promise<Set<string>> {
    const rows = await this.blockRepo.findMany({
      where: { clientId },
      select: { merchantId: true },
    });
    return new Set(rows.map((r) => r.merchantId));
  }

  async getMerchants(page: number = 1, limit: number = 50, clientId?: string) {
    const cacheKey = merchantListCacheKey(page, limit);
    const cached = cacheKey ? await this.cache.get<ReturnType<typeof this.formatMerchantList>>(cacheKey) : undefined;
    const baseResult = cached ?? await (async () => {
      const generation = merchantListGeneration();
      const skip = (page - 1) * limit;
      const [merchants, total] = await Promise.all([
        this.merchantRepo.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            stores: { some: { isActive: true } },
          },
          select: MERCHANT_MAP_SELECT,
          // id breaks ties between same-name merchants: without it, paging can skip or repeat them.
          orderBy: [{ nom: 'asc' }, { id: 'asc' }],
          skip,
          take: limit,
        }),
        this.merchantRepo.count({
          where: {
            isActive: true,
            deletedAt: null,
            stores: { some: { isActive: true } },
          },
        }),
      ]);

      const result = this.formatMerchantList(merchants, total, page, limit);
      // Not stored when a write invalidated the list during the read.
      if (cacheKey && generation === merchantListGeneration()) {
        await this.cache.set(cacheKey, result, MERCHANTS_LIST_CACHE_TTL);
      }
      return result;
    })();

    // Per-client filter for blocked merchants. Apple 1.2 requires blocked
    // users to be invisible to the blocker. We filter after the shared cache
    // to keep the hot path cheap for anonymous / non-blocking clients.
    const blockedIds = clientId ? await this.getBlockedMerchantIds(clientId) : new Set<string>();
    const visible = blockedIds.size === 0
      ? baseResult.merchants
      : baseResult.merchants.filter((m: any) => !blockedIds.has(m.id));

    // Deal badges change faster than the merchant list: merged after its cache.
    // Guests only get the count (the content of a deal requires an account).
    const badges = await this.dealBadges();
    const merchants = visible.map((m: any) => {
      const badge = badges[m.id];
      return {
        ...m,
        activeDealCount: badge?.activeDealCount ?? 0,
        topDeal: clientId ? badge?.topDeal ?? null : null,
      };
    });
    return { ...baseResult, merchants };
  }

  private formatMerchantList(merchants: MerchantMapRow[], total: number, page: number, limit: number) {
    const entries: MerchantMapPoint[] = [];

    for (const m of merchants) {
      const base: MerchantMapPoint = {
        id: m.id,
        nomBoutique: m.nom,
        categorie: m.categorie,
        secondaryCategories: m.secondaryCategories ?? [],
        ville: m.ville,
        adresse: m.adresse || (m.quartier ? `${m.quartier}, ${m.ville}` : m.ville),
        latitude: m.latitude,
        longitude: m.longitude,
        logoUrl: m.logoUrl ?? null,
      };

      // One map point per active store. The merchant's own coordinates mirror
      // its reference store: they only get a point of their own when they match
      // an active store, or when no store has coordinates. Otherwise they are
      // stale (reference store deactivated) and showed a ghost duplicate pin.
      const locatedStores = (m.stores ?? []).filter((s) => s.latitude != null && s.longitude != null);
      const mainIsAStore = locatedStores.some((s) => s.latitude === m.latitude && s.longitude === m.longitude);
      if (locatedStores.length === 0 || mainIsAStore) entries.push(base);

      if (locatedStores.length) {
        for (const s of locatedStores) {
          // Already shown as the merchant's main point
          if (s.latitude === m.latitude && s.longitude === m.longitude) continue;
          entries.push({
            ...base,
            latitude: s.latitude,
            longitude: s.longitude,
            ville: s.ville ?? base.ville,
            adresse: s.adresse || (s.quartier ? `${s.quartier}, ${s.ville ?? base.ville}` : base.adresse),
            storeId: s.id,
            storeName: s.nom,
          });
        }
      }
    }

    return {
      merchants: entries,
      pagination: buildPagination(total, page, limit),
    };
  }

  /**
   * SQL body (columns `id`, `created_at`) of the notifications a client can see.
   *
   * Visibility rules (unchanged):
   * - merchant notifications, only from merchants the client holds a card of
   *   (active or not) and only those created at/after that card's creation;
   *   among them, broadcasts (visible to every member) and personal rows
   *   addressed to this client through a ClientNotificationStatus row;
   *   only the in-app channel: PUSH, or legacy rows with channel NULL
   *   (EMAIL / WHATSAPP blasts stay out of the feed);
   * - when `includeDigests`, the client's own deal digests (audience
   *   DEALS_DIGEST, no merchant, addressed through a status row), whatever
   *   their channel or date. markAll / dismissAll never targeted digests.
   *
   * Access paths (instead of walking a merchant's whole history with an
   * EXISTS per row):
   * - broadcasts: per card of the client, notifications by
   *   (merchant_id, is_broadcast, created_at >= card.created_at);
   * - personal rows + digests (+ broadcasts already touched): the client's
   *   own status rows (client_id-leading unique index), then PK lookup.
   * UNION removes broadcasts reached by both branches.
   */
  private visibleNotificationsSql(clientId: string, includeDigests: boolean): Prisma.Sql {
    const digests = includeDigests ? Prisma.sql`n.audience = ${DEAL_DIGEST_AUDIENCE} OR ` : Prisma.empty;
    return Prisma.sql`
      SELECT n.id, n.created_at
      FROM loyalty_cards c
      JOIN notifications n
        ON n.merchant_id = c.merchant_id
       AND n.is_broadcast = true
       AND n.created_at >= c.created_at
      WHERE c.client_id = ${clientId}
        AND (n.channel = 'PUSH' OR n.channel IS NULL)
      UNION
      SELECT n.id, n.created_at
      FROM client_notification_statuses s
      JOIN notifications n ON n.id = s.notification_id
      WHERE s.client_id = ${clientId}
        AND (
          ${digests}(
            (n.channel = 'PUSH' OR n.channel IS NULL)
            AND EXISTS (
              SELECT 1 FROM loyalty_cards c2
              WHERE c2.client_id = ${clientId}
                AND c2.merchant_id = n.merchant_id
                AND n.created_at >= c2.created_at
            )
          )
        )`;
  }

  /**
   * Get notifications relevant to the client.
   * Returns notifications from merchants where the client holds a loyalty card
   * (plus the client's deal digests), excluding dismissed ones, newest first,
   * with per-client read status.
   */
  async getNotifications(clientId: string, page: number = 1, limit: number = 30) {
    const skip = (page - 1) * limit;

    // One round-trip: total of the non-dismissed visible set + ids of the
    // requested page. The LEFT JOIN keeps a row (with id NULL) when the page is
    // past the end, so `total` is always returned.
    const rows = await this.rawQuery.queryRaw<{ id: string | null; total: number }>(Prisma.sql`
      WITH visible AS (${this.visibleNotificationsSql(clientId, true)}),
      live AS (
        SELECT v.id, v.created_at FROM visible v
        WHERE NOT EXISTS (
          SELECT 1 FROM client_notification_statuses d
          WHERE d.client_id = ${clientId} AND d.notification_id = v.id AND d.is_dismissed = true
        )
      )
      SELECT p.id, t.total
      FROM (SELECT count(*)::int AS total FROM live) t
      LEFT JOIN LATERAL (
        SELECT l.id, l.created_at FROM live l
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ${limit}::int OFFSET ${skip}::int
      ) p ON true
      ORDER BY p.created_at DESC, p.id DESC`);

    const total = Number(rows[0]?.total ?? 0);
    const pageIds = rows.map((r) => r.id).filter((id): id is string => id !== null);

    const found = pageIds.length
      ? await this.notificationRepo.findMany({
          where: { id: { in: pageIds } },
          select: {
            id: true,
            title: true,
            body: true,
            createdAt: true,
            audience: true,
            merchant: { select: { id: true, nom: true, categorie: true, logoUrl: true } },
            clientStatuses: {
              where: { clientId },
              select: { isRead: true, readAt: true },
              take: 1,
            },
          },
        })
      : [];
    // Keep the page order computed in SQL (newest first).
    const byId = new Map(found.map((n: any) => [n.id, n]));
    const notifications = pageIds.map((id) => byId.get(id)).filter(Boolean);

    return {
      notifications: notifications.map((n: any) => {
        const status = n.clientStatuses?.[0];
        return {
          id: n.id,
          title: n.title,
          body: n.body,
          type: n.audience === DEAL_DIGEST_AUDIENCE ? ('deals_digest' as const) : ('promo' as const),
          merchantName: n.merchant?.nom ?? null,
          merchantCategory: n.merchant?.categorie ?? null,
          merchantLogoUrl: n.merchant?.logoUrl || EMAIL_LOGO_JITPLUS,
          isRead: status?.isRead ?? false,
          readAt: status?.readAt ?? null,
          createdAt: n.createdAt,
        };
      }),
      pagination: buildPagination(total, page, limit),
    };
  }

  /**
   * Count unread notifications for the client: visible ones the client has
   * neither read nor dismissed.
   */
  async getUnreadCount(clientId: string): Promise<{ unreadCount: number }> {
    const cacheKey = `client:unread:${clientId}`;
    const cached = await this.cache.get<{ unreadCount: number }>(cacheKey);
    if (cached) return cached;

    const [row] = await this.rawQuery.queryRaw<{ unread: number }>(Prisma.sql`
      WITH visible AS (${this.visibleNotificationsSql(clientId, true)})
      SELECT count(*)::int AS unread
      FROM visible v
      WHERE NOT EXISTS (
        SELECT 1 FROM client_notification_statuses s
        WHERE s.client_id = ${clientId} AND s.notification_id = v.id
          AND (s.is_read = true OR s.is_dismissed = true)
      )`);

    const result = { unreadCount: Math.max(0, Number(row?.unread ?? 0)) };
    await this.cache.set(cacheKey, result, UNREAD_COUNT_CACHE_TTL);
    return result;
  }

  /**
   * Set-based bulk status write over the client's merchant notifications
   * (digests excluded, as before): updates the existing status rows and
   * inserts the missing ones in ONE statement, without loading any id.
   * Returns how many notifications were targeted (updated + inserted), i.e.
   * the size of the targeted set, as the former id list length was.
   * Both data-modifying CTEs see the same snapshot: the UPDATE never sees the
   * rows the INSERT adds, and the INSERT skips (ON CONFLICT) every row that
   * already existed, so no notification is counted twice.
   */
  private async bulkSetStatus(clientId: string, mode: 'read' | 'dismiss'): Promise<number> {
    // Same UTC wall-clock value Prisma would write into these TIMESTAMP(3) columns.
    const now = Prisma.sql`(${new Date().toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
    const setClause = mode === 'read'
      ? Prisma.sql`is_read = true, read_at = ${now}`
      : Prisma.sql`is_dismissed = true, dismissed_at = ${now}`;
    // A dismissed-without-status row is also created as read (as dismissNotification does).
    const insertValues = mode === 'read'
      ? Prisma.sql`true, ${now}, false, NULL::timestamp`
      : Prisma.sql`true, ${now}, true, ${now}`;

    const [row] = await this.rawQuery.queryRaw<{ count: number }>(Prisma.sql`
      WITH target AS (${this.visibleNotificationsSql(clientId, false)}),
      upd AS (
        UPDATE client_notification_statuses s
        SET ${setClause}
        FROM target t
        WHERE s.client_id = ${clientId} AND s.notification_id = t.id
        RETURNING s.notification_id
      ),
      ins AS (
        INSERT INTO client_notification_statuses
          (id, client_id, notification_id, is_read, read_at, is_dismissed, dismissed_at)
        SELECT gen_random_uuid()::text, ${clientId}, t.id, ${insertValues}
        FROM target t
        ON CONFLICT (client_id, notification_id) DO NOTHING
        RETURNING notification_id
      )
      SELECT ((SELECT count(*) FROM upd) + (SELECT count(*) FROM ins))::int AS count`);
    return Number(row?.count ?? 0);
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(clientId: string, notificationId: string) {
    await this.clientNotifStatusRepo.upsert({
      where: { clientId_notificationId: { clientId, notificationId } },
      create: { clientId, notificationId, isRead: true, readAt: new Date() },
      update: { isRead: true, readAt: new Date() },
    });
    await this.cache.del(`client:unread:${clientId}`);
    return { success: true };
  }

  /**
   * Mark all visible merchant notifications as read for the client
   * (deal digests are not targeted). Set-based: no id list is loaded.
   */
  async markAllAsRead(clientId: string) {
    const count = await this.bulkSetStatus(clientId, 'read');
    if (count === 0) return { success: true, count: 0 };
    await this.cache.del(`client:unread:${clientId}`);
    return { success: true, count };
  }

  /**
   * Navigate to email preferences settings endpoint to unsubscribe from all marketing emails
   */
  async unsubscribeEmail(clientId: string) {
    await this.clientRepo.update({
      where: { id: clientId },
      data: { notifEmail: false },
    });
    return { success: true, message: 'Désinscription des e-mails réussie' };
  }

  /**
   * Dismiss (soft-delete) a single notification for the client.
   */
  async dismissNotification(clientId: string, notificationId: string) {
    await this.clientNotifStatusRepo.upsert({
      where: { clientId_notificationId: { clientId, notificationId } },
      create: { clientId, notificationId, isDismissed: true, dismissedAt: new Date(), isRead: true, readAt: new Date() },
      update: { isDismissed: true, dismissedAt: new Date() },
    });
    await this.cache.del(`client:unread:${clientId}`);
    return { success: true };
  }

  /**
   * Dismiss (soft-delete) all visible merchant notifications for the client
   * (deal digests are not targeted). Set-based: no id list is loaded.
   */
  async dismissAllNotifications(clientId: string) {
    const count = await this.bulkSetStatus(clientId, 'dismiss');
    if (count === 0) return { success: true, count: 0 };
    await this.cache.del(`client:unread:${clientId}`);
    return { success: true, count };
  }
}
