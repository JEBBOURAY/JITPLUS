import { Injectable, ConflictException, NotFoundException, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { MerchantCategory, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { invalidateMerchantListCache } from '../common/utils/merchant-list-cache';
import { MERCHANT_REPOSITORY, type IMerchantRepository } from '../common/repositories';
import { IMailProvider, MAIL_PROVIDER } from '../common/interfaces';
import { pickEmailLang } from '../mail/transactional-i18n';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { MerchantSignupFieldsDto } from './dto/merchant-signup-fields.dto';
import { BCRYPT_SALT_ROUNDS, USER_TYPE_MERCHANT } from '../common/constants';
import { errMsg } from '../common/utils';
import { MERCHANT_PROFILE_SELECT } from '../common/prisma-selects';
import { assertClean } from '../common/utils/content-moderation';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { MerchantReferralService } from '../merchant/services/merchant-referral.service';
import { ClientReferralService } from '../client-auth/client-referral.service';
import { MerchantSessionService } from './merchant-session.service';
import type { AuthResult, PendingRegistrationResult } from './auth-shared';

/** Business fields shared by the email, Google and Apple signup DTOs. */
export type SignupFields = Pick<
  MerchantSignupFieldsDto,
  | 'nomCommerce' | 'phoneNumber' | 'categorie' | 'ville' | 'quartier' | 'adresse'
  | 'latitude' | 'longitude' | 'description' | 'storePhone' | 'instagram' | 'tiktok'
  | 'website' | 'referralCode' | 'termsAccepted' | 'language'
>;

/** Social links typed at signup, or undefined when none was given. */
function signupSocialLinks(dto: Pick<SignupFields, 'instagram' | 'tiktok' | 'website'>) {
  const instagram = dto.instagram?.trim();
  const tiktok = dto.tiktok?.trim();
  const website = dto.website?.trim();
  if (!instagram && !tiktok && !website) return undefined;
  return {
    ...(instagram && { instagram }),
    ...(tiktok && { tiktok }),
    ...(website && { website }),
  };
}

/** Conflict message matching the unique column that rejected the signup. */
function signupConflictMessage(target: unknown): string {
  const fields = Array.isArray(target) ? target.join(',') : String(target ?? '');
  if (/google/i.test(fields)) return 'Un compte commerçant est déjà associé à ce compte Google';
  if (/apple/i.test(fields)) return 'Un compte commerçant est déjà associé à ce compte Apple';
  return 'Un compte commerçant avec cet email existe déjà';
}

/**
 * Merchant account creation shared by the email, Google and Apple signups,
 * plus the public uniqueness checks used by the registration form.
 */
@Injectable()
export class MerchantSignupService {
  private readonly logger = new Logger(MerchantSignupService.name);

  /**
   * Bcrypt hash of a random secret never exposed — used as password placeholder
   * for OAuth-only accounts (Google/Apple). bcrypt.compare against it always
   * returns false (no plaintext can produce it), preventing password login on
   * social accounts while keeping the password column non-null.
   * Computed lazily and asynchronously on the first OAuth signup, then memoized
   * per process (no blocking hashSync at module load, no per-signup hash).
   */
  private static oauthPlaceholderHashPromise: Promise<string> | null = null;

  static oauthPlaceholderHash(): Promise<string> {
    if (!MerchantSignupService.oauthPlaceholderHashPromise) {
      const pending = bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_SALT_ROUNDS);
      MerchantSignupService.oauthPlaceholderHashPromise = pending;
      // Do not memoize a failure: the next signup retries.
      pending.catch(() => {
        if (MerchantSignupService.oauthPlaceholderHashPromise === pending) MerchantSignupService.oauthPlaceholderHashPromise = null;
      });
    }
    return MerchantSignupService.oauthPlaceholderHashPromise;
  }

  constructor(
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(MAIL_PROVIDER) private mailProvider: IMailProvider,
    private planService: MerchantPlanService,
    private referralService: MerchantReferralService,
    private clientReferralService: ClientReferralService,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private sessions: MerchantSessionService,
  ) {}

  /**
   * Check if an email is already registered. This answer is an enumeration
   * oracle by design (registration UX); it is only slowed down by the route
   * throttle (per IP and per email).
   */
  async checkEmailExists(email: string): Promise<{ exists: boolean }> {
    const merchant = await this.merchantRepo.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true },
    });
    return { exists: !!merchant };
  }

  /** Check if a phone number is already registered (same enumeration caveat as checkEmailExists). */
  async checkPhoneExists(phoneNumber: string): Promise<{ exists: boolean }> {
    const merchant = await this.merchantRepo.findFirst({
      where: { phoneNumber: phoneNumber.trim() },
      select: { id: true },
    });
    return { exists: !!merchant };
  }

  async register(registerDto: RegisterMerchantDto): Promise<PendingRegistrationResult & Partial<AuthResult>> {
    // Email uniqueness is enforced by the DB UNIQUE constraint (P2002 in
    // createMerchantAccount): a pre-check would add a round-trip and a TOCTOU window.
    const merchant = await this.createMerchantAccount(registerDto, {
      email: registerDto.email,
      ownerName: this.signupOwnerName(registerDto.prenom, registerDto.nom, registerDto.email),
      passwordHash: () => bcrypt.hash(registerDto.password, BCRYPT_SALT_ROUNDS),
    });

    const pending = {
      merchant,
      userType: USER_TYPE_MERCHANT,
      requiresEmailVerification: false,
      verificationSent: false,
    };
    // Apps that send their device are signed in right away, which saves them a
    // second request and a bcrypt.compare. Older apps call /auth/login next.
    if (!registerDto.deviceName) return pending;
    return { ...pending, ...(await this.sessions.issueOwnerSession(merchant, registerDto, 'email-register')) };
  }

  /** Display name fallback: owner first + last name, else the email prefix. */
  signupOwnerName(first: string | undefined, last: string | undefined, email: string): string {
    const parts = [first?.trim(), last?.trim()].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : email.split('@')[0];
  }

  /** Merchant or client referral code given at signup. */
  private async resolveSignupReferral(code: string | undefined): Promise<{ referredById?: string; referredByClientId?: string }> {
    const referralCode = code?.trim().toLowerCase();
    if (!referralCode) return {};
    try {
      const referrer = await this.referralService.validateCode(referralCode);
      return { referredById: referrer.id };
    } catch (err) {
      // Only "unknown code" falls through to the client referral codes; a DB
      // failure must surface as such, not as "invalid code".
      if (!(err instanceof NotFoundException)) throw err;
    }
    try {
      const clientReferrer = await this.clientReferralService.validateCode(referralCode);
      return { referredByClientId: clientReferrer.id };
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
      throw new ConflictException('Code de parrainage invalide ou inexistant');
    }
  }

  /**
   * Shared by the email, Google and Apple signups: validates the business data,
   * creates the merchant with its first store, then runs the side effects
   * (map cache, welcome email, client referral).
   */
  async createMerchantAccount(
    dto: SignupFields,
    account: {
      email: string;
      ownerName: string;
      /** Lazy so the bcrypt cost is only paid once the signup data is valid. */
      passwordHash: () => Promise<string>;
      identity?: { googleId: string } | { appleId: string };
    },
  ) {
    const nom = dto.nomCommerce?.trim() || account.ownerName;
    const description = dto.description?.trim() || undefined;
    const socialLinks = signupSocialLinks(dto);
    // Shown to clients in jitplus: same UGC policy as a profile update.
    assertClean({
      nom,
      description,
      'socialLinks.instagram': socialLinks?.instagram,
      'socialLinks.tiktok': socialLinks?.tiktok,
      'socialLinks.website': socialLinks?.website,
    });

    const [referral, phone] = await Promise.all([
      this.resolveSignupReferral(dto.referralCode),
      this.checkPhoneExists(dto.phoneNumber),
    ]);
    if (phone.exists) {
      throw new ConflictException('Un compte commerçant avec ce numéro de téléphone existe déjà');
    }

    const categorie = dto.categorie ?? MerchantCategory.AUTRE;
    const location = {
      ville: dto.ville,
      quartier: dto.quartier,
      adresse: dto.adresse,
      latitude: dto.latitude,
      longitude: dto.longitude,
    };
    const storePhone = dto.storePhone?.trim();

    let merchant;
    try {
      merchant = await this.merchantRepo.create({
        data: {
          nom,
          email: account.email,
          password: await account.passwordHash(),
          ...account.identity,
          // Email verification is disabled (email signup) or done by Google/Apple.
          emailVerified: true,
          phoneNumber: dto.phoneNumber,
          categorie,
          ...location,
          ...(description && { description }),
          ...(socialLinks && { socialLinks }),
          termsAccepted: dto.termsAccepted ?? false,
          ...(dto.language && { language: dto.language }),
          // Plan: 30-day free PREMIUM trial
          ...this.planService.getTrialData(),
          ...(referral.referredById && { referredById: referral.referredById }),
          ...(referral.referredByClientId && { referredByClientId: referral.referredByClientId }),
          // Auto-create the first store with the same info as the merchant
          stores: {
            create: {
              nom,
              categorie,
              ...location,
              ...(description && { description }),
              ...(storePhone && { telephone: storePhone }),
              ...(socialLinks && { socialLinks }),
            },
          },
        },
        select: {
          ...MERCHANT_PROFILE_SELECT,
          stores: true,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(signupConflictMessage(error.meta?.target));
      }
      throw error;
    }
    // The new merchant and its first store go on the client map at once.
    await invalidateMerchantListCache(this.cache);

    // Off the request critical path. Capture fields so the closure does not keep the merchant.
    const { id: newMerchantId, email: welcomeEmail, nom: welcomeNom, language: welcomeLang } = merchant;
    setImmediate(() => {
      this.mailProvider.sendWelcomeMerchant(welcomeEmail, welcomeNom ?? '', pickEmailLang(welcomeLang))
        .catch((err) => this.logger.warn('Welcome email failed', errMsg(err)));
    });

    // Merchant-to-merchant referral bonus is deferred until the referred merchant
    // subscribes to paid PREMIUM (handled automatically in adminActivatePremium,
    // upgrade-request approval, adminSetPlanDates, and applyEarnedReferralMonths).
    const clientReferrerId = referral.referredByClientId;
    if (clientReferrerId) {
      setImmediate(() => {
        this.clientReferralService.createReferral(clientReferrerId, newMerchantId)
          .catch((err) => this.logger.warn('Client referral creation failed', errMsg(err)));
      });
    }

    return merchant;
  }
}
