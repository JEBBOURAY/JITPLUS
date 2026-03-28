import { Injectable, UnauthorizedException, ConflictException, BadRequestException, HttpException, HttpStatus, Logger, Inject } from '@nestjs/common';
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
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import { randomUUID, randomBytes, createHash, randomInt } from 'crypto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginMerchantDto } from './dto/google-login-merchant.dto';
import { GoogleRegisterMerchantDto } from './dto/google-register-merchant.dto';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { BCRYPT_SALT_ROUNDS, USER_TYPE_MERCHANT, USER_TYPE_TEAM_MEMBER, DEFAULT_POINTS_RULES, OTP_MIN, OTP_MAX, OTP_EXPIRY_MS, OTP_COOLDOWN_MS, MAX_SESSIONS_PER_MERCHANT, MAX_OTP_SENDS_PER_DAY } from '../common/constants';
import { hashOtp, validateOtp } from '../common/utils/otp.helper';
import { errMsg } from '../common/utils';
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Pre-hashed dummy password used when the user doesn't exist.
   * Ensures bcrypt.compare always runs, preventing timing side-channel
   * that reveals whether an email is registered.
   * Generated via: bcrypt.hashSync('dummy-password-never-used', 12)
   */
  private static readonly DUMMY_HASH = bcrypt.hashSync('dummy-password-never-used', 12);

  /** In-memory daily OTP send counter: identifier → { count, resetAt } */
  private readonly otpDailyCounter = new Map<string, { count: number; resetAt: number }>();

  private readonly googleClient: OAuth2Client;

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

  /** Enforce daily OTP limit per identifier. Throws 429 when exceeded. */
  private checkDailyOtpLimit(identifier: string): void {
    const now = Date.now();
    const entry = this.otpDailyCounter.get(identifier);
    if (entry && now < entry.resetAt) {
      if (entry.count >= MAX_OTP_SENDS_PER_DAY) {
        throw new HttpException(
          `Limite quotidienne atteinte (${MAX_OTP_SENDS_PER_DAY} codes/jour). Réessayez demain.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      entry.count++;
    } else {
      this.otpDailyCounter.set(identifier, { count: 1, resetAt: now + 86_400_000 });
    }
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
        select: { id: true, email: true, nom: true, password: true, role: true, isActive: true, merchantId: true, failedLoginAttempts: true, lockedUntil: true },
      }),
    ]);

    if (merchant) {
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
      if (loginDto.deviceName) {
        merchantRefreshToken = randomBytes(40).toString('hex');
        const refreshHash = createHash('sha256').update(merchantRefreshToken).digest('hex');
        await this.registerDeviceSession(merchant.id, sessionId, loginDto, ipAddress, 'merchant', merchant.email, merchant.nom, refreshHash);
      }

      // Notifier le propriétaire
      this.sendLoginNotification(merchant.id, 'Propriétaire', loginDto.deviceName, merchant.pushToken)
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
      if (loginDto.deviceName) {
        tmRefreshToken = randomBytes(40).toString('hex');
        const refreshHash = createHash('sha256').update(tmRefreshToken).digest('hex');
        await this.registerDeviceSession(ownerMerchant.id, sessionId, loginDto, ipAddress, 'team_member', teamMember.email, teamMember.nom, refreshHash);
      }

      // Notifier le propriétaire qu'un membre d'équipe s'est connecté
      this.sendLoginNotification(ownerMerchant.id, teamMember.nom, loginDto.deviceName, ownerMerchant.pushToken)
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
  ) {
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
        await tx.deviceSession.update({
          where: { id: existing.id },
          data: sessionData,
        });
      } else {
        await tx.deviceSession.create({
          data: { merchantId, deviceId: loginDto.deviceId, ...sessionData },
        });
      }

      // Evict oldest sessions if over the limit
      const sessions = await tx.deviceSession.findMany({
        where: { merchantId },
        orderBy: { lastActiveAt: 'desc' },
        select: { id: true },
      });
      if (sessions.length > MAX_SESSIONS_PER_MERCHANT) {
        const toDelete = sessions.slice(MAX_SESSIONS_PER_MERCHANT).map((s: any) => s.id);
        await tx.deviceSession.deleteMany({ where: { id: { in: toDelete } } });
      }
    });
  }

  /**
   * Envoyer une notification push au propriétaire pour signaler une connexion
   */
  private async sendLoginNotification(
    merchantId: string,
    who: string,
    deviceName?: string,
    pushToken?: string | null,
  ) {
    // Si pas de pushToken fourni, le chercher en base
    let token = pushToken;
    if (!token) {
      const merchant = await this.merchantRepo.findUnique({
        where: { id: merchantId },
        select: { pushToken: true },
      });
      token = merchant?.pushToken;
    }

    if (!token) return;

    const title = '🔐 Nouvelle connexion';
    const body = deviceName
      ? `${who} s'est connecté(e) sur ${deviceName}`
      : `${who} s'est connecté(e) à votre commerce`;

    await this.pushProvider.sendMulticast([token], title, body);
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
      await this.deviceSessionRepo.delete({ where: { id: session.id } }).catch(() => {});
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

    if (!merchant || !merchant.isActive) {
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

  async register(registerDto: RegisterMerchantDto): Promise<AuthResult> {
    const existingMerchant = await this.merchantRepo.findUnique({
      where: { email: registerDto.email },
      select: { id: true },
    });

    if (existingMerchant) {
      throw new ConflictException('Un compte commerçant avec cet email existe déjà');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, BCRYPT_SALT_ROUNDS);
    const trialData = this.planService.getTrialData();

    // â”€â”€ Valider le code de parrainage si fourni â”€â”€
    let referredById: string | undefined;
    let referredByClientId: string | undefined;
    if (registerDto.referralCode) {
      // Try merchant referral code first, then client referral code
      try {
        const referrer = await this.referralService.validateCode(registerDto.referralCode);
        referredById = referrer.id;
      } catch {
        try {
          const clientReferrer = await this.clientReferralService.validateCode(registerDto.referralCode);
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
          nom: registerDto.nom,
          email: registerDto.email,
          password: hashedPassword,
          phoneNumber: registerDto.phoneNumber,
          categorie: registerDto.categorie,
          ville: registerDto.ville,
          quartier: registerDto.quartier,
          adresse: registerDto.adresse,
          logoUrl: registerDto.logoUrl,
          latitude: registerDto.latitude,
          longitude: registerDto.longitude,
          termsAccepted: registerDto.termsAccepted ?? false,
          pointsRules: DEFAULT_POINTS_RULES,
          // Plan: 30-day free PREMIUM trial
          ...trialData,
          // Parrainage
          ...(referredById && { referredById }),
          ...(referredByClientId && { referredByClientId }),
          // Auto-create the first store with the same info as the merchant
          stores: {
            create: {
              nom: registerDto.nom,
              categorie: registerDto.categorie,
              ville: registerDto.ville,
              quartier: registerDto.quartier,
              adresse: registerDto.adresse,
              latitude: registerDto.latitude,
              longitude: registerDto.longitude,
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

    // Send welcome email to merchant
    this.mailProvider.sendWelcomeMerchant(merchant.email, merchant.nom)
      .catch((err) => this.logger.warn('Welcome email failed', errMsg(err)));

    // Send verification email (fire-and-forget)
    this.sendVerificationEmail(merchant.email)
      .catch((err) => this.logger.warn('Verification email failed', errMsg(err)));

    // Merchant-to-merchant referral bonus is deferred until the referred merchant
    // completes trial and pays their first subscription (handled in adminActivatePremium / upgrade-request approval).

    // Create client referral record (fire-and-forget)
    if (referredByClientId) {
      this.clientReferralService.createReferral(referredByClientId, merchant.id)
        .catch((err) => this.logger.warn('Client referral creation failed', errMsg(err)));
    }

    const sessionId = randomUUID();
    const payload = {
      sub: merchant.id,
      email: merchant.email,
      type: USER_TYPE_MERCHANT,
      role: 'owner',
      jti: sessionId,
    };

    // Create a device session so the token can be revoked
    await this.deviceSessionRepo.create({
      data: {
        merchantId: merchant.id,
        tokenId: sessionId,
        deviceName: 'register',
        isCurrentDevice: true,
        lastActiveAt: new Date(),
      },
    });

    return {
      access_token: this.jwtService.sign(payload),
      session_id: sessionId,
      merchant,
      userType: USER_TYPE_MERCHANT,
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
          // Link Google account to existing merchant
          await this.merchantRepo.update({
            where: { id: merchant.id },
            data: { googleId },
          });
        }
      }

      if (!merchant) {
        throw new UnauthorizedException(
          'Aucun compte commerçant trouvé avec cet email. Veuillez d\'abord créer un compte.',
        );
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
      if (dto.deviceName) {
        refreshToken = randomBytes(40).toString('hex');
        const refreshHash = createHash('sha256').update(refreshToken).digest('hex');
        await this.registerDeviceSession(
          merchant.id, sessionId, dto, ipAddress,
          'merchant', merchant.email, merchant.nom, refreshHash,
        );
      }

      // Notify owner
      this.sendLoginNotification(merchant.id, 'Propriétaire (Google)', dto.deviceName, merchant.pushToken)
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

    let referredById: string | undefined;
    let referredByClientId: string | undefined;
    if (dto.referralCode) {
      try {
        const referrer = await this.referralService.validateCode(dto.referralCode);
        referredById = referrer.id;
      } catch {
        try {
          const clientReferrer = await this.clientReferralService.validateCode(dto.referralCode);
          referredByClientId = clientReferrer.id;
        } catch {
          throw new ConflictException('Code de parrainage invalide ou inexistant');
        }
      }
    }

    let merchant;
    try {
      // Google-only account: set a random password hash (cannot be used for login)
      const dummyPasswordHash = await bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_SALT_ROUNDS);

      merchant = await this.merchantRepo.create({
        data: {
          nom: dto.nom,
          email: googleEmail,
          password: dummyPasswordHash,
          googleId,
          emailVerified: true, // Google-verified email
          phoneNumber: dto.phoneNumber,
          categorie: dto.categorie,
          ville: dto.ville,
          quartier: dto.quartier,
          adresse: dto.adresse,
          logoUrl: dto.logoUrl,
          latitude: dto.latitude,
          longitude: dto.longitude,
          termsAccepted: dto.termsAccepted ?? false,
          pointsRules: DEFAULT_POINTS_RULES,
          ...trialData,
          ...(referredById && { referredById }),
          ...(referredByClientId && { referredByClientId }),
          stores: {
            create: {
              nom: dto.nom,
              categorie: dto.categorie,
              ville: dto.ville,
              quartier: dto.quartier,
              adresse: dto.adresse,
              latitude: dto.latitude,
              longitude: dto.longitude,
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

    // Send welcome email
    this.mailProvider.sendWelcomeMerchant(merchant.email, merchant.nom)
      .catch((err) => this.logger.warn('Welcome email failed', errMsg(err)));

    // Merchant-to-merchant referral bonus is deferred until the referred merchant
    // completes trial and pays their first subscription (handled in adminActivatePremium / upgrade-request approval).

    // Create client referral record (fire-and-forget)
    if (referredByClientId) {
      this.clientReferralService.createReferral(referredByClientId, merchant.id)
        .catch((err) => this.logger.warn('Client referral creation failed', errMsg(err)));
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

  // ── Forgot Password ──────────────────────────────────────────

  // ── Shared OTP helpers ───────────────────────────────────────

  /** Generate, upsert, and send an OTP email. Enforces daily limit + cooldown. */
  private async sendOtpForEmail(email: string, logLabel: string): Promise<void> {
    this.checkDailyOtpLimit(email);

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

    await this.mailProvider.sendOtpEmail(email, code, 'merchant');
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
    await this.txRunner.run(async (tx) => {
      await tx.otp.delete({ where: { id: otpId } });
      await tx.merchant.update({
        where: { email: normalizedEmail },
        data: { emailVerified: true },
      });
    });

    this.logger.log(`Email verified for ${normalizedEmail}`);

    return { success: true, message: 'Email vérifié avec succès.' };
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    const merchant = await this.merchantRepo.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (!merchant) {
      return { success: true, message: 'Si un compte existe avec cet email, un code a été envoyé.' };
    }

    await this.sendOtpForEmail(normalizedEmail, 'Password reset');

    return { success: true, message: 'Si un compte existe avec cet email, un code a été envoyé.' };
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    const otpId = await this.validateAndConsumeOtp(
      normalizedEmail, code,
      'Aucun code de réinitialisation trouvé. Veuillez en demander un nouveau.',
    );

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    await this.txRunner.run(async (tx) => {
      await tx.otp.delete({ where: { id: otpId } });
      await tx.merchant.update({
        where: { email: normalizedEmail },
        data: { password: hashedPassword },
      });
    });

    this.logger.log(`Password reset successful for ${normalizedEmail}`);

    return { success: true, message: 'Mot de passe réinitialisé avec succès.' };
  }
}
