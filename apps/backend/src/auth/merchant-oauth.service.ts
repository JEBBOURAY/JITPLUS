import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { randomUUID } from 'crypto';
import { MERCHANT_REPOSITORY, type IMerchantRepository } from '../common/repositories';
import { GoogleLoginMerchantDto } from './dto/google-login-merchant.dto';
import { GoogleRegisterMerchantDto } from './dto/google-register-merchant.dto';
import { AppleLoginMerchantDto } from './dto/apple-login-merchant.dto';
import { AppleRegisterMerchantDto } from './dto/apple-register-merchant.dto';
import { USER_TYPE_MERCHANT } from '../common/constants';
import { AppleTokenError, AppleTokenVerifier, MERCHANT_APPLE_ERRORS, type AppleTokenPayload } from '../common/apple/apple-token-verifier.service';
import { checkLockout, resetLoginAttempts } from '../common/utils/login-lockout.helper';
import { MERCHANT_LOGIN_SELECT } from '../common/prisma-selects';
import { MerchantSessionService } from './merchant-session.service';
import { MerchantSignupService } from './merchant-signup.service';
import { type AuthResult, merchantLockoutOps } from './auth-shared';

/** Merchant sign-in and sign-up with Google / Apple identity tokens. */
@Injectable()
export class MerchantOAuthService {
  private readonly logger = new Logger(MerchantOAuthService.name);
  private readonly googleClient: OAuth2Client;

  constructor(
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    private jwtService: JwtService,
    private configService: ConfigService,
    private appleVerifier: AppleTokenVerifier,
    private sessions: MerchantSessionService,
    private signup: MerchantSignupService,
  ) {
    this.googleClient = new OAuth2Client(this.configService.get<string>('GOOGLE_CLIENT_ID'));
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
          // The lookup by googleId missed, so the account is bound to ANOTHER
          // Google identity that shows the same email (e.g. unverified address,
          // Workspace vs consumer account): never log it in (security audit
          // 2026-11-05 — Apple already enforced this).
          if (merchant.googleId !== googleId) {
            throw new UnauthorizedException('Ce compte est lié à un autre compte Google.');
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
      await resetLoginAttempts(merchant, merchantLockoutOps(this.merchantRepo));

      const { password: _, failedLoginAttempts: _fa, lockedUntil: _lu, ...merchantData } = merchant;

      const sessionId = randomUUID();
      const jwtPayload = {
        sub: merchant.id,
        email: merchant.email,
        type: USER_TYPE_MERCHANT,
        role: 'owner',
        jti: sessionId,
      };

      const session = await this.sessions.openLoginSession(
        merchant.id, sessionId, dto, ipAddress,
        { type: USER_TYPE_MERCHANT, email: merchant.email, name: merchant.nom }, { kind: 'owner', provider: 'Google' },
      );

      return {
        access_token: this.jwtService.sign(jwtPayload),
        ...session,
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
      // The merchant account is created with this email as its identity:
      // Google must vouch for it (security audit 2026-11-05).
      if (payload.email_verified !== true) {
        throw new BadRequestException("L'email de ce compte Google n'est pas vérifié");
      }
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Google token verification failed:', error);
      throw new UnauthorizedException('Token Google invalide');
    }

    // 2. Check if merchant already exists (both lookups in parallel)
    const [existingByGoogle, existingByEmail] = await Promise.all([
      this.merchantRepo.findUnique({ where: { googleId }, select: { id: true } }),
      this.merchantRepo.findUnique({ where: { email: googleEmail }, select: { id: true } }),
    ]);
    if (existingByGoogle) {
      throw new ConflictException('Un compte commerçant est déjà associé à ce compte Google');
    }
    if (existingByEmail) {
      throw new ConflictException('Un compte commerçant avec cet email existe déjà');
    }

    // 3. Create merchant. Google-only account: the constant placeholder hash
    // (computed once per process, lazily) avoids a ~300ms bcrypt.hash on every OAuth signup.
    const merchant = await this.signup.createMerchantAccount(dto, {
      email: googleEmail,
      ownerName: this.signup.signupOwnerName(dto.prenom, dto.nom, googleEmail),
      passwordHash: () => MerchantSignupService.oauthPlaceholderHash(),
      identity: { googleId },
    });

    return {
      ...(await this.sessions.issueOwnerSession(merchant, dto, 'google-register')),
      merchant,
      userType: USER_TYPE_MERCHANT,
    };
  }

  // ── Apple Login (Merchant) ─────────────────────────────────

  /**
   * Verify an Apple identity token (shared AppleTokenVerifier). When `rawNonce`
   * is provided, the JWT `nonce` claim must equal sha256(rawNonce).
   */
  private async verifyAppleToken(identityToken: string, rawNonce?: string): Promise<AppleTokenPayload> {
    try {
      return await this.appleVerifier.verify(identityToken, rawNonce);
    } catch (err) {
      if (err instanceof AppleTokenError) throw new UnauthorizedException(MERCHANT_APPLE_ERRORS[err.reason]);
      throw err;
    }
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

    // 2. Check if merchant already exists (both lookups in parallel)
    const [existingByApple, existingByEmail] = await Promise.all([
      this.merchantRepo.findFirst({ where: { appleId }, select: { id: true } }),
      this.merchantRepo.findUnique({ where: { email: appleEmail }, select: { id: true } }),
    ]);
    if (existingByApple) {
      throw new ConflictException('Un compte commerçant est déjà associé à ce compte Apple');
    }
    if (existingByEmail) {
      throw new ConflictException('Un compte commerçant avec cet email existe déjà');
    }

    // 3. Create merchant (Apple-only account, placeholder hash as for Google).
    // Display name falls back to the name Apple shares on first sign-in.
    const merchant = await this.signup.createMerchantAccount(dto, {
      email: appleEmail,
      ownerName: this.signup.signupOwnerName(dto.prenom || dto.givenName, dto.nom || dto.familyName, appleEmail),
      passwordHash: () => MerchantSignupService.oauthPlaceholderHash(),
      identity: { appleId },
    });

    return {
      ...(await this.sessions.issueOwnerSession(merchant, dto, 'apple-register')),
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
      await resetLoginAttempts(merchant, merchantLockoutOps(this.merchantRepo));

      const { password: _, failedLoginAttempts: _fa, lockedUntil: _lu, ...merchantData } = merchant;

      const sessionId = randomUUID();
      const jwtPayload = {
        sub: merchant.id,
        email: merchant.email,
        type: USER_TYPE_MERCHANT,
        role: 'owner',
        jti: sessionId,
      };

      const session = await this.sessions.openLoginSession(
        merchant.id, sessionId, dto, ipAddress,
        { type: USER_TYPE_MERCHANT, email: merchant.email, name: merchant.nom }, { kind: 'owner', provider: 'Apple' },
      );

      return {
        access_token: this.jwtService.sign(jwtPayload),
        ...session,
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
}
