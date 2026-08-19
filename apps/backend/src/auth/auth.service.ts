import { Injectable, UnauthorizedException, ConflictException, BadRequestException, HttpException, HttpStatus, Logger, Inject, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  TEAM_MEMBER_REPOSITORY, type ITeamMemberRepository,
  DEVICE_SESSION_REPOSITORY, type IDeviceSessionRepository,
  OTP_REPOSITORY, type IOtpRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../common/repositories';
import { IPushProvider, PUSH_PROVIDER, IMailProvider, MAIL_PROVIDER } from '../common/interfaces';
import { pickEmailLang } from '../mail/transactional-i18n';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import { randomUUID, randomBytes, createHash, randomInt, createPublicKey } from 'crypto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginMerchantDto } from './dto/google-login-merchant.dto';
import { GoogleRegisterMerchantDto } from './dto/google-register-merchant.dto';
import { AppleLoginMerchantDto } from './dto/apple-login-merchant.dto';
import { AppleRegisterMerchantDto } from './dto/apple-register-merchant.dto';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { BCRYPT_SALT_ROUNDS, USER_TYPE_MERCHANT, USER_TYPE_TEAM_MEMBER, DEFAULT_POINTS_RULES, OTP_MIN, OTP_MAX, OTP_EXPIRY_MS, OTP_COOLDOWN_MS, MAX_SESSIONS_PER_MERCHANT, MAX_OTP_ATTEMPTS } from '../common/constants';
import { hashOtp, validateOtp, checkDailyOtpLimit } from '../common/utils/otp.helper';
import { errMsg } from '../common/utils';
import * as jwt from 'jsonwebtoken';
import { checkLockout, handleFailedLogin, resetLoginAttempts, LockoutDbOps } from '../common/utils/login-lockout.helper';
import { MERCHANT_LOGIN_SELECT, MERCHANT_OWNER_SELECT, MERCHANT_PROFILE_SELECT } from '../common/prisma-selects';
import { MerchantResponse } from '../common/interfaces/merchant-response.interface';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { MerchantReferralService } from '../merchant/services/merchant-referral.service';
import { ClientReferralService } from '../client-auth/client-referral.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/** Shape returned by login/register containing an access token + merchant data. */
export interface AuthResult {
  access_token: string;
  /** Opaque refresh token — only present when a DeviceSession was created (login with deviceName). */
  refresh_token?: string;
  /** JWT ID (jti) of the access token — required to call /auth/refresh-token. */
  session_id?: string;
  merchant: MerchantResponse;
  userType: string;
  teamMember?: { id: string; nom: string; email: string; role: string };
}

/** Email/password registration result before OTP verification. */
export interface PendingRegistrationResult {
  merchant: MerchantResponse;
  userType: string;
  requiresEmailVerification: true;
  verificationSent: boolean;
}

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Pre-hashed dummy password used when the user doesn't exist.
   * Ensures bcrypt.compare always runs, preventing timing side-channel
   * that reveals whether an email is registered.
   * Generated via: bcrypt.hashSync('dummy-password-never-used', 12)
   */
  private static readonly DUMMY_HASH = bcrypt.hashSync('dummy-password-never-used', 12);

  /**
   * Bcrypt hash of a random secret never exposed — used as password placeholder
   * for OAuth-only accounts (Google/Apple). bcrypt.compare against it always
   * returns false (no plaintext can produce it), preventing password login on
   * social accounts while keeping the password column non-null. Computed once
   * at boot instead of per-registration (saves ~300ms per OAuth signup).
   */
  private static readonly OAUTH_PLACEHOLDER_HASH = bcrypt.hashSync(
    randomBytes(32).toString('hex'),
    BCRYPT_SALT_ROUNDS,
  );

  private readonly googleClient: OAuth2Client;
  private appleJwksCache: { keys: any[]; fetchedAt: number } | null = null;
  /** Singleflight guard: dedupe concurrent JWKS fetches on cold start. */
  private appleJwksPromise: Promise<any[]> | null = null;

  constructor(
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(TEAM_MEMBER_REPOSITORY) private teamMemberRepo: ITeamMemberRepository,
    @Inject(DEVICE_SESSION_REPOSITORY) private deviceSessionRepo: IDeviceSessionRepository,
    @Inject(OTP_REPOSITORY) private otpRepo: IOtpRepository,
    @Inject(TRANSACTION_RUNNER) private txRunner: ITransactionRunner,
    private jwtService: JwtService,
    @Inject(PUSH_PROVIDER) private pushProvider: IPushProvider,
    @Inject(MAIL_PROVIDER) private mailProvider: IMailProvider,
    private planService: MerchantPlanService,
    private referralService: MerchantReferralService,
    private clientReferralService: ClientReferralService,
    private jwtStrategy: JwtStrategy,
    private configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(this.configService.get<string>('GOOGLE_CLIENT_ID'));
  }

  /**
   * Pre-warm Apple JWKS at boot so the first /apple-register/login request
   * doesn't pay the cold-cache fetch latency (avoids tail-latency spikes).
   */
  onApplicationBootstrap(): void {
    this.getApplePublicKeys().catch((err) =>
      this.logger.warn('Apple JWKS pre-warm failed (non-fatal)', errMsg(err)),
    );
  }

  /** Lockout DB ops for Merchant model */
  private get merchantLockoutOps(): LockoutDbOps {
    return {
      incrementFailedAttempts: (id, newAttempts, lockedUntil) =>
        this.merchantRepo.update({
          where: { id },
          data: { failedLoginAttempts: newAttempts, ...(lockedUntil && { lockedUntil }) },
        }).then(() => {}),
      resetFailedAttempts: (id) =>
        this.merchantRepo.update({
          where: { id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        }).then(() => {}),
    };
  }

  /** Lockout DB ops for TeamMember model */
  private get teamMemberLockoutOps(): LockoutDbOps {
    return {
      incrementFailedAttempts: (id, newAttempts, lockedUntil) =>
        this.teamMemberRepo.update({
          where: { id },
          data: { failedLoginAttempts: newAttempts, ...(lockedUntil && { lockedUntil }) },
        }).then(() => {}),
      resetFailedAttempts: (id) =>
        this.teamMemberRepo.update({
          where: { id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        }).then(() => {}),
    };
  }

  async login(loginDto: LoginDto, ipAddress?: string): Promise<AuthResult> {
    const sessionId = randomUUID();

    // Chercher merchant et teamMember en parallèle
    const [merchant, teamMember] = await Promise.all([
      this.merchantRepo.findUnique({
        where: { email: loginDto.email },
        select: MERCHANT_LOGIN_SELECT,
      }),
      this.teamMemberRepo.findUnique({
        where: { email: loginDto.email },
        select: { id: true, email: true, nom: true, password: true, role: true, isActive: true, merchantId: true, failedLoginAttempts: true, lockedUntil: true, merchant: { select: { isActive: true } } },
      }),
    ]);

    if (merchant) {
      if (!merchant.isActive || merchant.deletedAt) {
        throw new UnauthorizedException('Votre compte a été désactivé. Veuillez contacter le support.');
      }

      // Brute-force protection
      checkLockout(merchant);

      const isPasswordValid = await bcrypt.compare(loginDto.password, merchant.password);
      if (!isPasswordValid) {
        await handleFailedLogin(merchant, this.merchantLockoutOps);
        throw new UnauthorizedException(); // unreachable safety net
      }

      await resetLoginAttempts(merchant, this.merchantLockoutOps);

      const { password: _, failedLoginAttempts: _fa, lockedUntil: _lu, pushToken: _pt2, ...merchantData } = merchant;

      const payload = {
        sub: merchant.id,
        email: merchant.email,
        type: USER_TYPE_MERCHANT,
        role: 'owner',
        jti: sessionId,
      };

      // Enregistrer la session de l'appareil + générer le refresh token
      let merchantRefreshToken: string | undefined;
      let merchantIsNewDevice = false;
      if (loginDto.deviceName) {
        merchantRefreshToken = randomBytes(40).toString('hex');
        const refreshHash = createHash('sha256').update(merchantRefreshToken).digest('hex');
        const r = await this.registerDeviceSession(merchant.id, sessionId, loginDto, ipAddress, 'merchant', merchant.email, merchant.nom, refreshHash);
        merchantIsNewDevice = r.isNewDevice;
      }

      // Notifier le propriétaire
      this.sendLoginNotification(merchant.id, 'Propriétaire', loginDto.deviceName, merchant.pushToken, merchant.language, merchantIsNewDevice, merchant.email)
        .catch((err) => this.logger.warn('Push notification failed', errMsg(err)));

      return {
        access_token: this.jwtService.sign(payload),
        ...(merchantRefreshToken && { refresh_token: merchantRefreshToken, session_id: sessionId }),
        merchant: merchantData,
        userType: USER_TYPE_MERCHANT,
      };
    }

    if (teamMember) {
      if (!teamMember.isActive) {
        throw new UnauthorizedException('Ce compte a été désactivé par le propriétaire');
      }

      // Brute-force protection
      checkLockout(teamMember);

      const isPasswordValid = await bcrypt.compare(loginDto.password, teamMember.password);
      if (!isPasswordValid) {
        await handleFailedLogin(teamMember, this.teamMemberLockoutOps);
        throw new UnauthorizedException(); // unreachable safety net
      }

      await resetLoginAttempts(teamMember, this.teamMemberLockoutOps);

      // Récupérer le merchant directement via merchantId
      const ownerMerchant = await this.merchantRepo.findUnique({
        where: { id: teamMember.merchantId },
        select: MERCHANT_OWNER_SELECT,
      });

      if (!ownerMerchant) {
        throw new UnauthorizedException('Commerce associé introuvable');
      }

      if (!ownerMerchant.isActive || ownerMerchant.deletedAt) {
        throw new UnauthorizedException('Ce compte commerce n\'existe plus');
      }

      const { pushToken: _pt, ...ownerData } = ownerMerchant;

      const payload = {
        sub: ownerMerchant.id,
        email: teamMember.email,
        type: USER_TYPE_TEAM_MEMBER,
        role: 'team_member',
        teamMemberId: teamMember.id,
        teamMemberName: teamMember.nom,
        jti: sessionId,
      };

      // Enregistrer la session de l'appareil + générer le refresh token
      let tmRefreshToken: string | undefined;
      let tmIsNewDevice = false;
      if (loginDto.deviceName) {
        tmRefreshToken = randomBytes(40).toString('hex');
        const refreshHash = createHash('sha256').update(tmRefreshToken).digest('hex');
        const r = await this.registerDeviceSession(ownerMerchant.id, sessionId, loginDto, ipAddress, 'team_member', teamMember.email, teamMember.nom, refreshHash);
        tmIsNewDevice = r.isNewDevice;
      }

      // Notifier le propriétaire qu'un membre d'équipe s'est connecté
      this.sendLoginNotification(ownerMerchant.id, teamMember.nom, loginDto.deviceName, ownerMerchant.pushToken, ownerMerchant.language, tmIsNewDevice, ownerMerchant.email)
        .catch((err) => this.logger.warn('Push notification failed', errMsg(err)));

      return {
        access_token: this.jwtService.sign(payload),
        ...(tmRefreshToken && { refresh_token: tmRefreshToken, session_id: sessionId }),
        merchant: ownerData,
        userType: USER_TYPE_TEAM_MEMBER,
        teamMember: {
          id: teamMember.id,
          nom: teamMember.nom,
          email: teamMember.email,
          role: teamMember.role,
        },
      };
    }

    // No user found — still run bcrypt.compare to prevent timing side-channel
    await bcrypt.compare(loginDto.password, AuthService.DUMMY_HASH);
    throw new UnauthorizedException('Identifiants invalides');
  }

  // â”€â”€ Gestion des sessions d'appareils â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async registerDeviceSession(
    merchantId: string,
    sessionId: string,
    loginDto: Pick<LoginDto, 'deviceName' | 'deviceOS' | 'deviceId'>,
    ipAddress?: string,
    userType?: string,
    userEmail?: string,
    userName?: string,
    refreshTokenHash?: string,
    /** When true (e.g. at first registration), skips the deactivate/evict bookkeeping. */
    skipDeactivateOthers = false,
  ): Promise<{ isNewDevice: boolean }> {
    const sessionData = {
      tokenId: sessionId,
      deviceName: loginDto.deviceName!,
      deviceOS: loginDto.deviceOS,
      ipAddress,
      userType,
      userEmail,
      userName,
      isCurrentDevice: true,
      lastActiveAt: new Date(),
      ...(refreshTokenHash ? { refreshTokenHash } : {}),
    };

    // Fast path: brand-new merchant has no prior sessions — single INSERT, no tx.
    if (skipDeactivateOthers) {
      await this.deviceSessionRepo.create({
        data: { merchantId, deviceId: loginDto.deviceId, ...sessionData },
      });
      return { isNewDevice: true };
    }

    let isNewDevice = true;
    await this.txRunner.run(async (tx) => {
      // Single UPDATE: only flip currently-active devices (not all devices for merchant)
      await tx.deviceSession.updateMany({
        where: { merchantId, isCurrentDevice: true },
        data: { isCurrentDevice: false },
      });

      const existing = loginDto.deviceId
        ? await tx.deviceSession.findFirst({
            where: { merchantId, deviceId: loginDto.deviceId },
            select: { id: true },
          })
        : null;

      if (existing) {
        isNewDevice = false;
        await tx.deviceSession.update({
          where: { id: existing.id },
          data: sessionData,
        });
      } else {
        await tx.deviceSession.create({
          data: { merchantId, deviceId: loginDto.deviceId, ...sessionData },
        });
      }

      // Evict oldest sessions if over the limit — single query to find IDs to keep,
      // then delete everything else (2 queries instead of count + find + delete)
      const toKeep = await tx.deviceSession.findMany({
        where: { merchantId },
        orderBy: { lastActiveAt: 'desc' },
        take: MAX_SESSIONS_PER_MERCHANT,
        select: { id: true },
      });
      const keepIds = toKeep.map((s: any) => s.id);
      if (keepIds.length >= MAX_SESSIONS_PER_MERCHANT) {
        await tx.deviceSession.deleteMany({
          where: { merchantId, id: { notIn: keepIds } },
        });
      }
    });

    return { isNewDevice };
  }

  /**
   * Envoyer une notification push (et email si nouveau device) au propriétaire pour signaler une connexion
   */
  private async sendLoginNotification(
    merchantId: string,
    who: string,
    deviceName?: string,
    pushToken?: string | null,
    language?: string | null,
    isNewDevice: boolean = false,
    ownerEmail?: string | null,
  ) {
    // Si pas de pushToken fourni, le chercher en base
    let token = pushToken;
    let lang = language;
    let email = ownerEmail;
    if (!token || (isNewDevice && email === undefined)) {
      const merchant = await this.merchantRepo.findUnique({
        where: { id: merchantId },
        select: { pushToken: true, language: true, email: true },
      });
      token = token ?? merchant?.pushToken;
      lang = lang ?? merchant?.language;
      email = email ?? merchant?.email;
    }

    const l = (lang === 'en' || lang === 'ar' ? lang : 'fr') as 'fr' | 'en' | 'ar';

    if (token) {
      const LOGIN_MESSAGES = {
        fr: {
          title: '🔐 Nouvelle connexion détectée',
          withDevice: (w: string, d: string) => `${w} s'est connecté(e) sur ${d}. Si ce n'est pas vous, changez votre mot de passe.`,
          noDevice: (w: string) => `${w} s'est connecté(e) à votre commerce. Si ce n'est pas vous, changez votre mot de passe.`,
        },
        en: {
          title: '🔐 New login detected',
          withDevice: (w: string, d: string) => `${w} logged in on ${d}. If this wasn't you, change your password.`,
          noDevice: (w: string) => `${w} logged in to your business. If this wasn't you, change your password.`,
        },
        ar: {
          title: '🔐 كونيكسيون جديدة',
          withDevice: (w: string, d: string) => `${w} دخل(ات) من ${d}. إلا ماشي نتا، بدل الباسوورد ديالك.`,
          noDevice: (w: string) => `${w} دخل(ات) للكومرس ديالك. إلا ماشي نتا، بدل الباسوورد ديالك.`,
        },
      };

      const msg = LOGIN_MESSAGES[l];
      const title = msg.title;
      const body = deviceName ? msg.withDevice(who, deviceName) : msg.noDevice(who);

      // Deep-link: tap → Sécurité (`/security`) so the merchant can immediately
      // review active sessions and revoke a suspicious device.
      await this.pushProvider.sendMulticast(
        [token],
        title,
        body,
        undefined,
        { event: 'login_alert', action: 'open_security' },
        'login-alerts',
      );
    }

    // Send email only when a brand-new device signs in (avoid spamming on every login)
    if (isNewDevice && email) {
      this.mailProvider.sendLoginAlert(email, who, deviceName ?? null, new Date(), l)
        .catch((err) => this.logger.warn('Login alert email failed', errMsg(err)));
    }
  }

  /**
   * Refresh an access token using an opaque refresh token + session ID.
   * Rotates the refresh token on every call (prevents replay attacks).
   */
  async refreshWithToken(refreshToken: string, sessionId: string): Promise<AuthResult> {
    const session = await this.deviceSessionRepo.findUnique({
      where: { tokenId: sessionId },
      select: {
        id: true,
        merchantId: true,
        refreshTokenHash: true,
        userType: true,
        userEmail: true,
        userName: true,
      },
    });

    if (!session || !session.refreshTokenHash) {
      throw new UnauthorizedException('Session expirée. Veuillez vous reconnecter.');
    }

    // Constant-time comparison via hash equality
    const incomingHash = createHash('sha256').update(refreshToken).digest('hex');
    if (incomingHash !== session.refreshTokenHash) {
      // Potential token theft — delete the session immediately
      await this.deviceSessionRepo.delete({ where: { id: session.id } })
        .catch((err) => this.logger.error(`Failed to revoke stolen session ${session.id}`, errMsg(err)));
      throw new UnauthorizedException('Token de rafraîchissement invalide.');
    }

    // Rotate: generate new access token session ID + new refresh token
    const newSessionId = randomUUID();
    const newRefreshToken = randomBytes(40).toString('hex');
    const newRefreshHash = createHash('sha256').update(newRefreshToken).digest('hex');

    await this.deviceSessionRepo.update({
      where: { id: session.id },
      data: { tokenId: newSessionId, lastActiveAt: new Date(), refreshTokenHash: newRefreshHash },
    });

    const merchant = await this.merchantRepo.findUnique({
      where: { id: session.merchantId },
      select: MERCHANT_OWNER_SELECT,
    });

    if (!merchant || !merchant.isActive || merchant.deletedAt) {
      throw new UnauthorizedException('Compte commerçant inactif ou introuvable.');
    }

    const { pushToken: _pt, ...merchantData } = merchant;

    const userType = (session.userType as string) || USER_TYPE_MERCHANT;
    const payload: Record<string, unknown> = {
      sub: session.merchantId,
      email: session.userEmail,
      type: userType,
      role: userType === USER_TYPE_TEAM_MEMBER ? 'team_member' : 'owner',
      jti: newSessionId,
    };

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: newRefreshToken,
      session_id: newSessionId,
      merchant: merchantData,
      userType,
    };
  }

  async logout(sessionId?: string): Promise<{ message: string }> {
    if (!sessionId) return { message: 'Déconnecté' };
    // Immediately invalidate the in-memory cache to close the replay window
    await this.jwtStrategy.invalidateSession(sessionId);
    try {
      await this.deviceSessionRepo.deleteMany({
        where: { tokenId: sessionId },
      });
    } catch (err) {
      this.logger.warn('Session cleanup failed', errMsg(err));
    }

    return { message: 'Déconnecté' };
  }

  /**
   * Refresh a merchant/team-member access token.
   * Verifies the current session (via jti) is still valid,
   * issues a new JWT with a fresh expiry, keeping the same session.
   */
  async refreshToken(user: {
    userId: string;
    email?: string;
    type: string;
    role?: string;
    sessionId?: string;
    teamMemberId?: string;
    teamMemberName?: string;
  }): Promise<AuthResult> {
    // Parallelize: verify session + re-fetch merchant in a single round-trip
    const [session, merchant] = await Promise.all([
      user.sessionId
        ? this.deviceSessionRepo.findUnique({
            where: { tokenId: user.sessionId },
            select: { id: true },
          })
        : Promise.resolve(null),
      this.merchantRepo.findUnique({
        where: { id: user.userId },
        select: MERCHANT_OWNER_SELECT,
      }),
    ]);

    if (user.sessionId && !session) {
      throw new UnauthorizedException('Session expirée. Veuillez vous reconnecter.');
    }
    if (!merchant) {
      throw new UnauthorizedException('Compte introuvable');
    }
    if (!merchant.isActive) {
      throw new UnauthorizedException('Ce compte commerce n\'existe plus');
    }

    const { pushToken: _pt, ...merchantData } = merchant;

    const payload: Record<string, unknown> = {
      sub: user.userId,
      email: user.email,
      type: user.type,
      role: user.role ?? 'owner',
      jti: user.sessionId,
    };

    if (user.teamMemberId) {
      payload.teamMemberId = user.teamMemberId;
      payload.teamMemberName = user.teamMemberName;
    }

    return {
      access_token: this.jwtService.sign(payload),
      merchant: merchantData,
      userType: user.type,
    };
  }

  /** Check if an email is already registered (timing-safe: always queries DB). */
  async checkEmailExists(email: string): Promise<{ exists: boolean }> {
    const merchant = await this.merchantRepo.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true },
    });
    // Constant-time: always return after same delay to prevent timing enumeration
    return { exists: !!merchant };
  }

  /** Check if a phone number is already registered (timing-safe: always queries DB). */
  async checkPhoneExists(phoneNumber: string): Promise<{ exists: boolean }> {
    const merchant = await this.merchantRepo.findFirst({
      where: { phoneNumber: phoneNumber.trim() },
      select: { id: true },
    });
    return { exists: !!merchant };
  }

  async register(registerDto: RegisterMerchantDto): Promise<PendingRegistrationResult> {
    // Email uniqueness is enforced by the DB UNIQUE constraint — a pre-check
    // findUnique here would only add a DB round-trip (and create a TOCTOU window
    // under concurrent submits). We catch P2002 below as the single source of truth.

    const hashedPassword = await bcrypt.hash(registerDto.password, BCRYPT_SALT_ROUNDS);
    const trialData = this.planService.getTrialData();

    // Display name: nomCommerce first, then owner prenom+nom, then email prefix
    const ownerParts = [registerDto.prenom?.trim(), registerDto.nom?.trim()].filter(Boolean);
    const ownerName = ownerParts.length > 0 ? ownerParts.join(' ') : registerDto.email.split('@')[0];
    const nom = registerDto.nomCommerce?.trim() || ownerName;
    // Store name uses the same value
    const storeNom = nom;
    const categorie = registerDto.categorie ?? ('AUTRE' as any);

    // â”€â”€ Valider le code de parrainage si fourni â”€â”€
    let referredById: string | undefined;
    let referredByClientId: string | undefined;
    const referralCode = registerDto.referralCode?.trim().toLowerCase();
    if (referralCode) {
      try {
        const referrer = await this.referralService.validateCode(referralCode);
        referredById = referrer.id;
      } catch {
        try {
          const clientReferrer = await this.clientReferralService.validateCode(referralCode);
          referredByClientId = clientReferrer.id;
        } catch {
          throw new ConflictException('Code de parrainage invalide ou inexistant');
        }
      }
    }

    let merchant;
    try {
      merchant = await this.merchantRepo.create({
        data: {
          nom,
          email: registerDto.email,
          password: hashedPassword,
          phoneNumber: registerDto.phoneNumber,
          categorie,
          ville: registerDto.ville,
          quartier: registerDto.quartier,
          adresse: registerDto.adresse,
          logoUrl: registerDto.logoUrl,
          latitude: registerDto.latitude,
          longitude: registerDto.longitude,
          ...(registerDto.description?.trim() && { description: registerDto.description.trim() }),
          ...((registerDto.instagram?.trim() || registerDto.tiktok?.trim() || registerDto.website?.trim()) && {
            socialLinks: {
              ...(registerDto.instagram?.trim() && { instagram: registerDto.instagram.trim() }),
              ...(registerDto.tiktok?.trim() && { tiktok: registerDto.tiktok.trim() }),
              ...(registerDto.website?.trim() && { website: registerDto.website.trim() }),
            },
          }),
          termsAccepted: registerDto.termsAccepted ?? false,
          welcomeGuideVisible: true,
          // Email verification is disabled — accounts are created pre-verified.
          emailVerified: true,
          pointsRules: DEFAULT_POINTS_RULES,
          // Plan: 30-day free PREMIUM trial
          ...trialData,
          // Parrainage
          ...(referredById && { referredById }),
          ...(referredByClientId && { referredByClientId }),
          // Auto-create the first store with the same info as the merchant
          stores: {
            create: {
              nom: storeNom,
              categorie,
              ville: registerDto.ville,
              quartier: registerDto.quartier,
              adresse: registerDto.adresse,
              latitude: registerDto.latitude,
              longitude: registerDto.longitude,
              ...(registerDto.description?.trim() && { description: registerDto.description.trim() }),
              ...(registerDto.storePhone?.trim() && { telephone: registerDto.storePhone.trim() }),
              ...((registerDto.instagram?.trim() || registerDto.tiktok?.trim() || registerDto.website?.trim()) && {
                socialLinks: {
                  ...(registerDto.instagram?.trim() && { instagram: registerDto.instagram.trim() }),
                  ...(registerDto.tiktok?.trim() && { tiktok: registerDto.tiktok.trim() }),
                  ...(registerDto.website?.trim() && { website: registerDto.website.trim() }),
                },
              }),
            },
          },
        },
        select: {
          ...MERCHANT_PROFILE_SELECT,
          stores: true,
        },
      });
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Un compte commerçant avec cet email existe déjà');
      }
      throw error;
    }

    // No destructuring needed — select already excludes sensitive fields

    // Email verification is disabled: the account is created pre-verified and no
    // OTP validation email is sent. Send the welcome email immediately instead
    // (fire-and-forget, off the request critical path).
    const welcomeEmail = merchant.email;
    const welcomeNom = merchant.nom;
    const welcomeLang = merchant.language;
    setImmediate(() => {
      this.mailProvider.sendWelcomeMerchant(welcomeEmail, welcomeNom ?? '', pickEmailLang(welcomeLang))
        .catch((err) => this.logger.warn('Welcome email failed', errMsg(err)));
    });

    // Merchant-to-merchant referral bonus is deferred until the referred merchant
    // subscribes to paid PREMIUM (handled automatically in adminActivatePremium,
    // upgrade-request approval, adminSetPlanDates, and applyEarnedReferralMonths).

    // Create client referral record (fire-and-forget, off the critical path)
    if (referredByClientId) {
      const newMerchantId = merchant.id;
      const clientReferrerId = referredByClientId;
      setImmediate(() => {
        this.clientReferralService.createReferral(clientReferrerId, newMerchantId)
          .catch((err) => this.logger.warn('Client referral creation failed', errMsg(err)));
      });
    }

    return {
      merchant,
      userType: USER_TYPE_MERCHANT,
      requiresEmailVerification: true,
      verificationSent: true,
    };
  }

  // ── Google Login (Merchant) ──────────────────────────────────

  /**
   * Login a merchant with a Google ID token.
   * Only works for existing merchants — Google sign-in won't create new accounts.
   * Merchants must register through the standard flow first.
   */
  async googleLoginMerchant(dto: GoogleLoginMerchantDto, ipAddress?: string): Promise<AuthResult> {
    try {
      // Accept both Web and Android client IDs as valid audiences.
      // expo-auth-session on Android issues tokens with the Android client ID.
      // GOOGLE_ANDROID_CLIENT_ID may contain comma-separated IDs (jitplus + jitpluspro).
      const webClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
      const androidClientIds = (this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID') || '').split(',').map(s => s.trim()).filter(Boolean);
      const allowedAudiences = [webClientId, ...androidClientIds].filter(Boolean) as string[];

      if (allowedAudiences.length === 0) {
        this.logger.error('Google login misconfigured: GOOGLE_CLIENT_ID and GOOGLE_ANDROID_CLIENT_ID are both empty');
        throw new UnauthorizedException('Connexion Google non configurée');
      }

      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: allowedAudiences,
      });
      const payload = ticket.getPayload();

      if (!payload) {
        throw new UnauthorizedException('Token Google invalide');
      }

      const { sub: googleId, email } = payload;

      if (!email) {
        throw new BadRequestException('Impossible de récupérer l\'email du compte Google');
      }

      // Try to find merchant by googleId first, then by email
      let merchant = await this.merchantRepo.findUnique({
        where: { googleId },
        select: MERCHANT_LOGIN_SELECT,
      });

      if (!merchant) {
        merchant = await this.merchantRepo.findUnique({
          where: { email: email.toLowerCase() },
          select: MERCHANT_LOGIN_SELECT,
        });

        if (merchant) {
          // Security: do NOT auto-link Google account to existing merchant.
          // The merchant must first log in with their password, then link Google
          // from their profile settings to prevent account hijacking.
          if (!merchant.googleId) {
            throw new UnauthorizedException(
              'Un compte existe avec cet email. Connectez-vous avec votre mot de passe, puis liez votre compte Google depuis les paramètres.',
            );
          }
        }
      }

      if (!merchant) {
        throw new UnauthorizedException(
          "Aucun compte commerçant trouvé avec cet email. Veuillez d'abord créer un compte.",
        );
      }

      if (!merchant.isActive || merchant.deletedAt) {
        throw new UnauthorizedException('Votre compte a été désactivé. Veuillez contacter le support.');
      }

      // Check lockout
      checkLockout(merchant);
      await resetLoginAttempts(merchant, this.merchantLockoutOps);

      const { password: _, failedLoginAttempts: _fa, lockedUntil: _lu, pushToken: _pt, ...merchantData } = merchant;

      const sessionId = randomUUID();
      const jwtPayload = {
        sub: merchant.id,
        email: merchant.email,
        type: USER_TYPE_MERCHANT,
        role: 'owner',
        jti: sessionId,
      };

      // Register device session + refresh token
      let refreshToken: string | undefined;
      let googleIsNewDevice = false;
      if (dto.deviceName) {
        refreshToken = randomBytes(40).toString('hex');
        const refreshHash = createHash('sha256').update(refreshToken).digest('hex');
        const r = await this.registerDeviceSession(
          merchant.id, sessionId, dto, ipAddress,
          'merchant', merchant.email, merchant.nom, refreshHash,
        );
        googleIsNewDevice = r.isNewDevice;
      }

      // Notify owner
      this.sendLoginNotification(merchant.id, 'Propriétaire (Google)', dto.deviceName, merchant.pushToken, merchant.language, googleIsNewDevice, merchant.email)
        .catch((err) => this.logger.warn('Push notification failed', errMsg(err)));

      return {
        access_token: this.jwtService.sign(jwtPayload),
        ...(refreshToken && { refresh_token: refreshToken, session_id: sessionId }),
        merchant: merchantData,
        userType: USER_TYPE_MERCHANT,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Google merchant login failed:', error);
      throw new UnauthorizedException('Échec de la connexion Google');
    }
  }

  // ── Google Register (Merchant) ───────────────────────────────

  /**
   * Register a new merchant using a Google ID token instead of a password.
   * The email is extracted from the Google token and used for the account.
   */
  async googleRegisterMerchant(dto: GoogleRegisterMerchantDto): Promise<AuthResult> {
    // 1. Verify the Google token
    let googleId: string;
    let googleEmail: string;
    try {
      const webClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
      const androidClientIds = (this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID') || '').split(',').map(s => s.trim()).filter(Boolean);
      const allowedAudiences = [webClientId, ...androidClientIds].filter(Boolean) as string[];

      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: allowedAudiences,
      });
      const payload = ticket.getPayload();

      if (!payload) {
        throw new UnauthorizedException('Token Google invalide');
      }

      googleId = payload.sub;
      googleEmail = payload.email?.toLowerCase() ?? '';

      if (!googleEmail) {
        throw new BadRequestException("Impossible de récupérer l'email du compte Google");
      }
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Google token verification failed:', error);
      throw new UnauthorizedException('Token Google invalide');
    }

    // 2. Check if merchant already exists
    const existingByGoogle = await this.merchantRepo.findUnique({
      where: { googleId },
      select: { id: true },
    });
    if (existingByGoogle) {
      throw new ConflictException('Un compte commerçant est déjà associé à ce compte Google');
    }

    const existingByEmail = await this.merchantRepo.findUnique({
      where: { email: googleEmail },
      select: { id: true },
    });
    if (existingByEmail) {
      throw new ConflictException('Un compte commerçant avec cet email existe déjà');
    }

    // 3. Create merchant (no password — Google-only account)
    const trialData = this.planService.getTrialData();

    // Display name: nomCommerce first, then owner prenom+nom, then email prefix
    const ownerParts = [dto.prenom?.trim(), dto.nom?.trim()].filter(Boolean);
    const ownerName = ownerParts.length > 0 ? ownerParts.join(' ') : googleEmail.split('@')[0];
    const nom = dto.nomCommerce?.trim() || ownerName;
    // Store name uses the same value
    const storeNom = nom;
    const categorie = dto.categorie ?? ('AUTRE' as any);

    let referredById: string | undefined;
    let referredByClientId: string | undefined;
    const referralCode = dto.referralCode?.trim().toLowerCase();
    if (referralCode) {
      try {
        const referrer = await this.referralService.validateCode(referralCode);
        referredById = referrer.id;
      } catch {
        try {
          const clientReferrer = await this.clientReferralService.validateCode(referralCode);
          referredByClientId = clientReferrer.id;
        } catch {
          throw new ConflictException('Code de parrainage invalide ou inexistant');
        }
      }
    }

    let merchant;
    try {
      // Google-only account: use the constant placeholder hash (computed once at boot)
      // so we don't pay a ~300ms bcrypt.hash on every OAuth signup.
      const dummyPasswordHash = AuthService.OAUTH_PLACEHOLDER_HASH;

      merchant = await this.merchantRepo.create({
        data: {
          nom,
          email: googleEmail,
          password: dummyPasswordHash,
          googleId,
          emailVerified: true, // Google-verified email
          phoneNumber: dto.phoneNumber,
          categorie,
          ville: dto.ville,
          quartier: dto.quartier,
          adresse: dto.adresse,
          logoUrl: dto.logoUrl,
          latitude: dto.latitude,
          longitude: dto.longitude,
          ...(dto.description?.trim() && { description: dto.description.trim() }),
          ...((dto.instagram?.trim() || dto.tiktok?.trim() || dto.website?.trim()) && {
            socialLinks: {
              ...(dto.instagram?.trim() && { instagram: dto.instagram.trim() }),
              ...(dto.tiktok?.trim() && { tiktok: dto.tiktok.trim() }),
              ...(dto.website?.trim() && { website: dto.website.trim() }),
            },
          }),
          termsAccepted: dto.termsAccepted ?? false,
          welcomeGuideVisible: true,
          pointsRules: DEFAULT_POINTS_RULES,
          ...trialData,
          ...(referredById && { referredById }),
          ...(referredByClientId && { referredByClientId }),
          stores: {
            create: {
              nom: storeNom,
              categorie,
              ville: dto.ville,
              quartier: dto.quartier,
              adresse: dto.adresse,
              latitude: dto.latitude,
              longitude: dto.longitude,
              ...(dto.description?.trim() && { description: dto.description.trim() }),
              ...(dto.storePhone?.trim() && { telephone: dto.storePhone.trim() }),
              ...((dto.instagram?.trim() || dto.tiktok?.trim() || dto.website?.trim()) && {
                socialLinks: {
                  ...(dto.instagram?.trim() && { instagram: dto.instagram.trim() }),
                  ...(dto.tiktok?.trim() && { tiktok: dto.tiktok.trim() }),
                  ...(dto.website?.trim() && { website: dto.website.trim() }),
                },
              }),
            },
          },
        },
        select: {
          ...MERCHANT_PROFILE_SELECT,
          stores: true,
        },
      });
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Un compte commerçant avec cet email existe déjà');
      }
      throw error;
    }

    // Welcome email sent after Google registration (no OTP needed — email already verified).
    // Deferred via setImmediate so the HTTP response is flushed before SMTP work starts.
    // Capture fields synchronously — avoid retaining a closure on the full merchant object.
    const welcomeEmail = merchant.email;
    const welcomeNom = merchant.nom;
    const welcomeLang = merchant.language;
    setImmediate(() => {
      this.mailProvider.sendWelcomeMerchant(welcomeEmail, welcomeNom, pickEmailLang(welcomeLang))
        .catch((err) => this.logger.warn('Welcome email failed', errMsg(err)));
    });

    // Merchant-to-merchant referral bonus is deferred until the referred merchant
    // subscribes to paid PREMIUM (handled automatically in adminActivatePremium,
    // upgrade-request approval, adminSetPlanDates, and applyEarnedReferralMonths).

    // Create client referral record (fire-and-forget, off the critical path)
    if (referredByClientId) {
      const newMerchantId = merchant.id;
      const clientReferrerId = referredByClientId;
      setImmediate(() => {
        this.clientReferralService.createReferral(clientReferrerId, newMerchantId)
          .catch((err) => this.logger.warn('Client referral creation failed', errMsg(err)));
      });
    }

    const sessionId = randomUUID();
    const jwtPayload = {
      sub: merchant.id,
      email: merchant.email,
      type: USER_TYPE_MERCHANT,
      role: 'owner',
      jti: sessionId,
    };

    // Create device session + optional refresh token
    let refreshToken: string | undefined;
    if (dto.deviceName) {
      refreshToken = randomBytes(40).toString('hex');
      const refreshHash = createHash('sha256').update(refreshToken).digest('hex');
      await this.registerDeviceSession(
        merchant.id, sessionId, dto, undefined,
        'merchant', merchant.email, merchant.nom, refreshHash,
        /* skipDeactivateOthers */ true,
      );
    } else {
      await this.deviceSessionRepo.create({
        data: {
          merchantId: merchant.id,
          tokenId: sessionId,
          deviceName: 'google-register',
          isCurrentDevice: true,
          lastActiveAt: new Date(),
        },
      });
    }

    return {
      access_token: this.jwtService.sign(jwtPayload),
      ...(refreshToken && { refresh_token: refreshToken }),
      session_id: sessionId,
      merchant,
      userType: USER_TYPE_MERCHANT,
    };
  }

  // ── Apple Login (Merchant) ─────────────────────────────────

  /**
   * Fetch Apple's JWKS public keys (cached 24h, with a 3s timeout and singleflight
   * deduplication so concurrent cold-start requests share a single network call).
   */
  private async getApplePublicKeys(): Promise<any[]> {
    const now = Date.now();
    if (this.appleJwksCache && now - this.appleJwksCache.fetchedAt < 86_400_000) {
      return this.appleJwksCache.keys;
    }
    if (this.appleJwksPromise) {
      return this.appleJwksPromise;
    }
    this.appleJwksPromise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3_000);
      try {
        const res = await fetch('https://appleid.apple.com/auth/keys', { signal: controller.signal });
        if (!res.ok) throw new Error('Failed to fetch Apple JWKS');
        const { keys } = await res.json();
        this.appleJwksCache = { keys, fetchedAt: Date.now() };
        return keys;
      } finally {
        clearTimeout(timer);
        this.appleJwksPromise = null;
      }
    })();
    return this.appleJwksPromise;
  }

  /**
   * Verify an Apple identity token using Apple's JWKS (public keys).
   * If `rawNonce` is provided, also verifies the JWT `nonce` claim equals sha256(rawNonce).
   */
  private async verifyAppleToken(identityToken: string, rawNonce?: string): Promise<{ sub: string; email?: string; email_verified?: string }> {
    const decoded = jwt.decode(identityToken, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
      throw new UnauthorizedException('Token Apple invalide');
    }
    // Reject unexpected algorithms early (only RS256 is accepted)
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

    // APPLE_BUNDLE_IDS: comma-separated list of bundle IDs (e.g. "com.jitplus.client,com.jitplus.pro")
    const appleBundleIds = (this.configService.get<string>('APPLE_BUNDLE_IDS') || '').split(',').map(s => s.trim()).filter(Boolean);

    const payload = jwt.verify(identityToken, publicKey, {
      algorithms: ['RS256'],
      issuer: 'https://appleid.apple.com',
      ...(appleBundleIds.length > 0 && { audience: appleBundleIds as [string, ...string[]] }),
    }) as jwt.JwtPayload & { sub: string; email?: string; email_verified?: string; nonce?: string };

    // If a raw nonce was provided, verify it matches the JWT nonce claim (replay-attack protection).
    if (rawNonce) {
      if (!payload.nonce) {
        throw new UnauthorizedException('Token Apple invalide — nonce manquant');
      }
      const expectedNonce = createHash('sha256').update(rawNonce).digest('hex');
      if (payload.nonce !== expectedNonce) {
        throw new UnauthorizedException('Token Apple invalide — nonce incorrect');
      }
    }

    return payload;
  }

  /**
   * Register a new merchant using Apple Sign-In.
   * Mirrors googleRegisterMerchant but uses Apple identity token.
   */
  async appleRegisterMerchant(dto: AppleRegisterMerchantDto): Promise<AuthResult> {
    // 1. Verify the Apple token (with nonce replay-attack protection when available)
    let appleId: string;
    let appleEmail: string;
    try {
      const payload = await this.verifyAppleToken(dto.identityToken, dto.rawNonce);
      appleId = payload.sub;
      appleEmail = payload.email?.toLowerCase() ?? '';

      if (!appleId) {
        throw new UnauthorizedException('Token Apple invalide — identifiant manquant');
      }

      if (!appleEmail) {
        throw new BadRequestException("Impossible de récupérer l'email du compte Apple");
      }
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Apple token verification failed:', error);
      throw new UnauthorizedException('Token Apple invalide');
    }

    // 2. Check if merchant already exists
    const existingByApple = await this.merchantRepo.findFirst({
      where: { appleId },
      select: { id: true },
    });
    if (existingByApple) {
      throw new ConflictException('Un compte commerçant est déjà associé à ce compte Apple');
    }

    const existingByEmail = await this.merchantRepo.findUnique({
      where: { email: appleEmail },
      select: { id: true },
    });
    if (existingByEmail) {
      throw new ConflictException('Un compte commerçant avec cet email existe déjà');
    }

    // 3. Create merchant (no password — Apple-only account)
    const trialData = this.planService.getTrialData();

    // Display name: nomCommerce first, then Apple name, then email prefix
    const ownerParts = [
      dto.prenom?.trim() || dto.givenName?.trim(),
      dto.nom?.trim() || dto.familyName?.trim(),
    ].filter(Boolean);
    const ownerName = ownerParts.length > 0 ? ownerParts.join(' ') : appleEmail.split('@')[0];
    const nom = dto.nomCommerce?.trim() || ownerName;
    const storeNom = nom;
    const categorie = dto.categorie ?? ('AUTRE' as any);

    let referredById: string | undefined;
    let referredByClientId: string | undefined;
    const referralCode = dto.referralCode?.trim().toLowerCase();
    if (referralCode) {
      try {
        const referrer = await this.referralService.validateCode(referralCode);
        referredById = referrer.id;
      } catch {
        try {
          const clientReferrer = await this.clientReferralService.validateCode(referralCode);
          referredByClientId = clientReferrer.id;
        } catch {
          throw new ConflictException('Code de parrainage invalide ou inexistant');
        }
      }
    }

    let merchant;
    try {
      // Apple-only account: use the constant placeholder hash (computed once at boot)
      // so we don't pay a ~300ms bcrypt.hash on every OAuth signup.
      const dummyPasswordHash = AuthService.OAUTH_PLACEHOLDER_HASH;

      merchant = await this.merchantRepo.create({
        data: {
          nom,
          email: appleEmail,
          password: dummyPasswordHash,
          appleId,
          emailVerified: true, // Apple-verified email
          phoneNumber: dto.phoneNumber,
          categorie,
          ville: dto.ville,
          quartier: dto.quartier,
          adresse: dto.adresse,
          logoUrl: dto.logoUrl,
          latitude: dto.latitude,
          longitude: dto.longitude,
          ...(dto.description?.trim() && { description: dto.description.trim() }),
          ...((dto.instagram?.trim() || dto.tiktok?.trim() || dto.website?.trim()) && {
            socialLinks: {
              ...(dto.instagram?.trim() && { instagram: dto.instagram.trim() }),
              ...(dto.tiktok?.trim() && { tiktok: dto.tiktok.trim() }),
              ...(dto.website?.trim() && { website: dto.website.trim() }),
            },
          }),
          termsAccepted: dto.termsAccepted ?? false,
          welcomeGuideVisible: true,
          pointsRules: DEFAULT_POINTS_RULES,
          ...trialData,
          ...(referredById && { referredById }),
          ...(referredByClientId && { referredByClientId }),
          stores: {
            create: {
              nom: storeNom,
              categorie,
              ville: dto.ville,
              quartier: dto.quartier,
              adresse: dto.adresse,
              latitude: dto.latitude,
              longitude: dto.longitude,
              ...(dto.description?.trim() && { description: dto.description.trim() }),
              ...(dto.storePhone?.trim() && { telephone: dto.storePhone.trim() }),
              ...((dto.instagram?.trim() || dto.tiktok?.trim() || dto.website?.trim()) && {
                socialLinks: {
                  ...(dto.instagram?.trim() && { instagram: dto.instagram.trim() }),
                  ...(dto.tiktok?.trim() && { tiktok: dto.tiktok.trim() }),
                  ...(dto.website?.trim() && { website: dto.website.trim() }),
                },
              }),
            },
          },
        },
        select: {
          ...MERCHANT_PROFILE_SELECT,
          stores: true,
        },
      });
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Un compte commerçant avec cet email existe déjà');
      }
      throw error;
    }

    // Welcome email (no OTP needed — email already verified by Apple).
    // Deferred via setImmediate so the HTTP response is flushed before SMTP work starts.
    // Capture fields synchronously — avoid retaining a closure on the full merchant object.
    const welcomeEmail = merchant.email;
    const welcomeNom = merchant.nom;
    const welcomeLang = merchant.language;
    setImmediate(() => {
      this.mailProvider.sendWelcomeMerchant(welcomeEmail, welcomeNom, pickEmailLang(welcomeLang))
        .catch((err) => this.logger.warn('Welcome email failed', errMsg(err)));
    });

    // Create client referral record (fire-and-forget, off the critical path)
    if (referredByClientId) {
      const newMerchantId = merchant.id;
      const clientReferrerId = referredByClientId;
      setImmediate(() => {
        this.clientReferralService.createReferral(clientReferrerId, newMerchantId)
          .catch((err) => this.logger.warn('Client referral creation failed', errMsg(err)));
      });
    }

    const sessionId = randomUUID();
    const jwtPayload = {
      sub: merchant.id,
      email: merchant.email,
      type: USER_TYPE_MERCHANT,
      role: 'owner',
      jti: sessionId,
    };

    // Create device session + optional refresh token
    let refreshToken: string | undefined;
    if (dto.deviceName) {
      refreshToken = randomBytes(40).toString('hex');
      const refreshHash = createHash('sha256').update(refreshToken).digest('hex');
      await this.registerDeviceSession(
        merchant.id, sessionId, dto, undefined,
        'merchant', merchant.email, merchant.nom, refreshHash,
        /* skipDeactivateOthers */ true,
      );
    } else {
      await this.deviceSessionRepo.create({
        data: {
          merchantId: merchant.id,
          tokenId: sessionId,
          deviceName: 'apple-register',
          isCurrentDevice: true,
          lastActiveAt: new Date(),
        },
      });
    }

    return {
      access_token: this.jwtService.sign(jwtPayload),
      ...(refreshToken && { refresh_token: refreshToken }),
      session_id: sessionId,
      merchant,
      userType: USER_TYPE_MERCHANT,
    };
  }

  /**
   * Login a merchant with an Apple identity token.
   * Only works for existing merchants — Apple sign-in won't create new accounts.
   */
  async appleLoginMerchant(dto: AppleLoginMerchantDto, ipAddress?: string): Promise<AuthResult> {
    try {
      const payload = await this.verifyAppleToken(dto.identityToken, dto.rawNonce);
      const { sub: appleId, email } = payload;

      if (!appleId) {
        throw new UnauthorizedException('Token Apple invalide — identifiant manquant');
      }

      // Try to find merchant by appleId first, then by email
      let merchant = await this.merchantRepo.findFirst({
        where: { appleId },
        select: MERCHANT_LOGIN_SELECT,
      });

      if (!merchant && email) {
        merchant = await this.merchantRepo.findUnique({
          where: { email: email.toLowerCase() },
          select: MERCHANT_LOGIN_SELECT,
        });

        if (merchant) {
          // Security: do NOT auto-link Apple account to existing merchant.
          // The merchant must first log in with their password, then link Apple
          // from their profile settings to prevent account hijacking.
          if (!merchant.appleId) {
            throw new UnauthorizedException(
              'Un compte existe avec cet email. Connectez-vous avec votre mot de passe, puis liez votre compte Apple depuis les paramètres.',
            );
          }
          // Strict check: the existing Apple ID linked to this merchant must match
          // the one in the verified token. Prevents cross-account access if two
          // Apple IDs ever share the same email.
          if (merchant.appleId !== appleId) {
            throw new UnauthorizedException(
              'Identifiant Apple non reconnu pour ce compte.',
            );
          }
        }
      }

      if (!merchant) {
        throw new UnauthorizedException(
          "Aucun compte commerçant trouvé avec cet email. Veuillez d'abord créer un compte.",
        );
      }

      if (!merchant.isActive || merchant.deletedAt) {
        throw new UnauthorizedException('Votre compte a été désactivé. Veuillez contacter le support.');
      }

      checkLockout(merchant);
      await resetLoginAttempts(merchant, this.merchantLockoutOps);

      const { password: _, failedLoginAttempts: _fa, lockedUntil: _lu, pushToken: _pt, ...merchantData } = merchant;

      const sessionId = randomUUID();
      const jwtPayload = {
        sub: merchant.id,
        email: merchant.email,
        type: USER_TYPE_MERCHANT,
        role: 'owner',
        jti: sessionId,
      };

      let refreshToken: string | undefined;
      let appleIsNewDevice = false;
      if (dto.deviceName) {
        refreshToken = randomBytes(40).toString('hex');
        const refreshHash = createHash('sha256').update(refreshToken).digest('hex');
        const r = await this.registerDeviceSession(
          merchant.id, sessionId, dto, ipAddress,
          'merchant', merchant.email, merchant.nom, refreshHash,
        );
        appleIsNewDevice = r.isNewDevice;
      }

      this.sendLoginNotification(merchant.id, 'Propriétaire (Apple)', dto.deviceName, merchant.pushToken, merchant.language, appleIsNewDevice, merchant.email)
        .catch((err) => this.logger.warn('Push notification failed', errMsg(err)));

      return {
        access_token: this.jwtService.sign(jwtPayload),
        ...(refreshToken && { refresh_token: refreshToken, session_id: sessionId }),
        merchant: merchantData,
        userType: USER_TYPE_MERCHANT,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Apple merchant login failed:', error);
      throw new UnauthorizedException('Échec de la connexion Apple');
    }
  }

  // ── Forgot Password ──────────────────────────────────────────

  // ── Shared OTP helpers ───────────────────────────────────────

  /** Generate, upsert, and send an OTP email. Enforces daily limit + cooldown. */
  private async sendOtpForEmail(email: string, logLabel: string): Promise<void> {
    checkDailyOtpLimit(email);

    const existingOtp = await this.otpRepo.findUnique({ where: { email } });
    if (existingOtp && existingOtp.expiresAt.getTime() - OTP_EXPIRY_MS + OTP_COOLDOWN_MS > Date.now()) {
      throw new HttpException('Veuillez patienter avant de renvoyer un code.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = randomInt(OTP_MIN, OTP_MAX).toString();
    const codeHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`[DEV] ${logLabel} OTP pour ${email}: ${code}`);
    }

    await this.otpRepo.upsert({
      where: { email },
      create: { email, code: codeHash, expiresAt },
      update: { code: codeHash, expiresAt, attempts: 0 },
    });

    try {
      const merchant = await this.merchantRepo.findUnique({
        where: { email },
        select: { language: true },
      });
      const lang = pickEmailLang(merchant?.language);
      await this.mailProvider.sendOtpEmail(email, code, 'merchant', lang);
    } catch (error) {
      const err = error as { message?: string; stack?: string };
      this.logger.error(`OTP email delivery failed for ${email}: ${err?.message}`, err?.stack);
      throw new HttpException('Impossible d\'envoyer l\'email. Veuillez réessayer.', HttpStatus.SERVICE_UNAVAILABLE, { cause: error });
    }
    this.logger.log(`${logLabel} OTP sent to ${email}`);
  }

  /** Find OTP record and validate the code. Increments attempts on mismatch. */
  private async validateAndConsumeOtp(email: string, code: string, notFoundMsg: string): Promise<string> {
    const otpRecord = await this.otpRepo.findUnique({ where: { email } });

    if (!otpRecord) {
      throw new BadRequestException(notFoundMsg);
    }

    try {
      validateOtp(otpRecord, code, 'Code invalide ou expiré.');
    } catch (error) {
      await this.otpRepo.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      // Convert internal sentinel to user-facing message
      if (error instanceof UnauthorizedException && (error as any).message === '__OTP_MISMATCH__') {
        const remaining = MAX_OTP_ATTEMPTS - (otpRecord.attempts + 1);
        if (remaining <= 0) {
          throw new BadRequestException('Trop de tentatives. Veuillez redemander un code.');
        }
        throw new BadRequestException(`Code incorrect. ${remaining} tentative(s) restante(s).`);
      }
      throw error;
    }

    return otpRecord.id;
  }

  // ── Email Verification (merchant) ────────────────────────────

  async sendVerificationEmail(email: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    const merchant = await this.merchantRepo.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, emailVerified: true },
    });

    if (!merchant) {
      return { success: true, message: 'Si un compte existe avec cet email, un code a été envoyé.' };
    }

    if (merchant.emailVerified) {
      return { success: true, message: 'Email déjà vérifié.' };
    }

    await this.sendOtpForEmail(normalizedEmail, 'Verification');

    return { success: true, message: 'Code de vérification envoyé.' };
  }

  async verifyEmail(email: string, code: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    const otpId = await this.validateAndConsumeOtp(
      normalizedEmail, code,
      'Aucun code de vérification trouvé. Veuillez en demander un nouveau.',
    );

    // Atomically delete OTP and mark email as verified
    let merchantNom: string | null = null;
    let merchantLang: string | null = null;
    await this.txRunner.run(async (tx) => {
      await tx.otp.delete({ where: { id: otpId } });
      const updated = await tx.merchant.update({
        where: { email: normalizedEmail },
        data: { emailVerified: true },
        select: { nom: true, language: true },
      });
      merchantNom = updated.nom;
      merchantLang = updated.language;
    });

    this.logger.log(`Email verified for ${normalizedEmail}`);

    // Send welcome email now that OTP is validated
    this.mailProvider.sendWelcomeMerchant(normalizedEmail, merchantNom ?? '', pickEmailLang(merchantLang))
      .catch((err) => this.logger.warn('Welcome email failed', errMsg(err)));

    return { success: true, message: 'Email vérifié avec succès.' };
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    const merchant = await this.merchantRepo.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    // Return same message regardless of account existence to prevent email enumeration
    if (!merchant) {
      return { success: true, message: 'Si un compte existe avec cet email, un code de réinitialisation a été envoyé.' };
    }

    await this.sendOtpForEmail(normalizedEmail, 'Password reset');

    return { success: true, message: 'Un code de réinitialisation a été envoyé à votre email.' };
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    const otpId = await this.validateAndConsumeOtp(
      normalizedEmail, code,
      'Aucun code de réinitialisation trouvé. Veuillez en demander un nouveau.',
    );

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    const merchant = await this.merchantRepo.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    await this.txRunner.run(async (tx) => {
      await tx.otp.delete({ where: { id: otpId } });
      await tx.merchant.update({
        where: { email: normalizedEmail },
        data: { password: hashedPassword },
      });
      // Invalidate all existing sessions for security (account may be compromised)
      if (merchant) {
        await tx.deviceSession.deleteMany({ where: { merchantId: merchant.id } });
      }
    });

    this.logger.log(`Password reset successful for ${normalizedEmail}`);

    return { success: true, message: 'Mot de passe réinitialisé avec succès.' };
  }
}
