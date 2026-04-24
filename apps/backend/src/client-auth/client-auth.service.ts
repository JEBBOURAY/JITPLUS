import { Injectable, UnauthorizedException, BadRequestException, ConflictException, Logger, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  OTP_REPOSITORY, type IOtpRepository,
} from '../common/repositories';
import { randomInt, randomBytes, createHash, createHmac, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { OTP_MIN, OTP_MAX, OTP_EXPIRY_MS, OTP_COOLDOWN_MS, MAX_OTP_ATTEMPTS, BCRYPT_SALT_ROUNDS, CLIENT_REFRESH_TOKEN_DAYS, MS_PER_DAY, QR_TOKEN_TTL_SECONDS } from '../common/constants';
import { errMsg } from '../common/utils';
import { checkLockout, handleFailedLogin, resetLoginAttempts, LockoutDbOps } from '../common/utils/login-lockout.helper';
import { CLIENT_AUTH_SELECT, CLIENT_LOGIN_SELECT } from '../common/prisma-selects';
import { validateOtp, handleOtpMismatch, hashOtp, checkDailyOtpLimit, OtpDbOps, OtpRecord } from '../common/utils/otp.helper';
import { IMailProvider, MAIL_PROVIDER, ISmsProvider, SMS_PROVIDER } from '../common/interfaces';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import { createPublicKey } from 'crypto';

/** Shape returned by buildAuthResponse â€” access + refresh tokens + client data. */
export interface ClientAuthResponse {
  access_token: string;
  refresh_token: string;
  isNewUser: boolean;
  client: {
    id: string;
    prenom: string | null;
    nom: string | null;
    email: string | null;
    emailVerified: boolean;
    telephone: string | null;
    telephoneVerified: boolean;
    termsAccepted: boolean;
    shareInfoMerchants: boolean;
    notifPush: boolean;
    notifWhatsapp: boolean;
    dateNaissance: Date | null;
    hasPassword: boolean;
    createdAt: Date;
  };
}

/** Subset of client fields returned after profile / password update. */
export interface ClientProfileResult {
  success: boolean;
  client: Omit<ClientAuthResponse['client'], 'isNewUser'>;
}

@Injectable()
export class ClientAuthService {
  private readonly logger = new Logger(ClientAuthService.name);
  private readonly googleClient: OAuth2Client;
  private appleJwksCache: { keys: any[]; fetchedAt: number } | null = null;
  // Dummy hash for timing-safe comparison when user not found
  private static readonly DUMMY_HASH = '$2a$12$LJ3m4ys3Lz0KDlu0BRahYOiFMfGHgdOUmrGfEdKnXqJRikMOFbECi';

  constructor(
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(OTP_REPOSITORY) private otpRepo: IOtpRepository,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject(MAIL_PROVIDER) private mailProvider: IMailProvider,
    @Inject(SMS_PROVIDER) private smsProvider: ISmsProvider,
  ) {
    this.googleClient = new OAuth2Client();
  }

  /** Lockout DB ops for Client model */
  private get clientLockoutOps(): LockoutDbOps {
    return {
      incrementFailedAttempts: (id, newAttempts, lockedUntil) =>
        this.clientRepo.update({
          where: { id },
          data: { failedLoginAttempts: newAttempts, ...(lockedUntil && { lockedUntil }) },
        }).then(() => {}),
      resetFailedAttempts: (id) =>
        this.clientRepo.update({
          where: { id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        }).then(() => {}),
    };
  }

  /**
   * Normalize phone number to international format and extract country code
   * Supports formats like: 0XXXXXXXX, 212XXXXXXX, +212XXXXXXXX, 06123456789, etc.
   */
  private normalizePhone(telephone: string): string {
    let phone = telephone.replace(/[\s\-()]/g, '');

    // If starts with 0 (local Moroccan format), convert to +212
    if (phone.startsWith('0')) {
      phone = '+212' + phone.substring(1);
    }
    // If starts with 212 without +, add +
    if (phone.startsWith('212') && !phone.startsWith('+')) {
      phone = '+' + phone;
    }

    // Ensure it starts with +
    if (!phone.startsWith('+')) {
      phone = '+' + phone;
    }

    return phone;
  }

  /**
   * Extract country code from a normalized phone number
   * E.g., +212612345678 â†’ MA, +33612345678 â†’ FR, +441234567890 â†’ GB
   */
  private extractCountryCode(normalizedPhone: string): string {
    // Map of phone prefixes to country codes
    const countryMap: Record<string, string> = {
      '1': 'US', // USA/Canada (1)
      '212': 'MA', // Morocco
      '33': 'FR', // France
      '34': 'ES', // Spain
      '39': 'IT', // Italy
      '41': 'CH', // Switzerland
      '43': 'AT', // Austria
      '44': 'GB', // UK
      '45': 'DK', // Denmark
      '46': 'SE', // Sweden
      '47': 'NO', // Norway
      '49': 'DE', // Germany
      '32': 'BE', // Belgium
      '352': 'LU', // Luxembourg
      '31': 'NL', // Netherlands
      '213': 'DZ', // Algeria
      '216': 'TN', // Tunisia
      '221': 'SN', // Senegal
      '223': 'ML', // Mali
      '225': 'CI', // Ivory Coast
    };

    // Remove leading +
    const phoneWithoutPlus = normalizedPhone.slice(1);

    // Try to match longest prefix first (for multi-digit codes like 212, 213, 216, etc.)
    for (let len = 3; len >= 1; len--) {
      const prefix = phoneWithoutPlus.substring(0, len);
      if (countryMap[prefix]) {
        return countryMap[prefix];
      }
    }

    // Return UNKNOWN for unrecognized country prefixes
    return 'UNKNOWN';
  }

  /**
   * Validate international phone number
   */
  private isValidPhone(normalizedPhone: string): boolean {
    // Must start with + and have at least 10 digits (some countries have 7-8, but we'll be generous)
    return /^\+\d{10,15}$/.test(normalizedPhone);
  }



  /** Shared DB callbacks for OTP helper */
  private get otpDbOps(): OtpDbOps {
    return {
      deleteOtp: (id: string) => this.otpRepo.delete({ where: { id } }),
      incrementAttempts: (id: string) =>
        this.otpRepo.update({ where: { id }, data: { attempts: { increment: 1 } } }),
    };
  }

  /**
   * Handle OTP validation errors: mismatch, expiry, max attempts.
   * Cleans up the OTP record when appropriate and re-throws.
   */
  private async handleOtpError(error: unknown, otpRecord: OtpRecord | null): Promise<never> {
    if (error instanceof UnauthorizedException && error.message === '__OTP_MISMATCH__') {
      await handleOtpMismatch(otpRecord!, this.otpDbOps);
    }
    const errorMessage = error instanceof Error ? error.message : '';
    if (otpRecord && (errorMessage.includes('expirÃ©') || errorMessage.includes('Trop de tentatives'))) {
      await this.otpRepo.delete({ where: { id: otpRecord.id } }).catch((err: unknown) =>
        this.logger.warn('OTP cleanup failed', errMsg(err)),
      );
    }
    throw error;
  }



  /** Generate a cryptographically random refresh token */
  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  /** SHA-256 hash of the refresh token (stored in DB) */
  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async buildAuthResponse(
    client: {
      id: string;
      nom: string | null;
      prenom?: string | null;
      email: string | null;
      emailVerified?: boolean;
      telephone: string | null;
      telephoneVerified?: boolean;
      googleId?: string | null;
      password?: string | null;
      shareInfoMerchants?: boolean;
      notifPush?: boolean;
      notifWhatsapp?: boolean;
      termsAccepted?: boolean;
      dateNaissance?: Date | null;
      createdAt: Date;
    },
    isNewUser: boolean,
  ): Promise<ClientAuthResponse> {
    const payload = {
      sub: client.id,
      jti: randomUUID(), // unique token ID for revocation support
      telephone: client.telephone,
      email: client.email,
      type: 'client' as const,
      role: 'client' as const,
    };
    const access_token = this.jwtService.sign(payload);

    // Generate & persist hashed refresh token (rotation) with expiration
    const refresh_token = this.generateRefreshToken();
    const refreshTokenExpiresAt = new Date(Date.now() + CLIENT_REFRESH_TOKEN_DAYS * MS_PER_DAY);
    await this.clientRepo.update({
      where: { id: client.id },
      data: {
        refreshTokenHash: this.hashRefreshToken(refresh_token),
        refreshTokenExpiresAt,
      },
    });

      return {
      access_token,
      refresh_token,
      isNewUser,
      client: {
        id: client.id,
        prenom: client.prenom ?? null,
        nom: client.nom,
        email: client.email,
        emailVerified: client.emailVerified ?? false,
        telephone: client.telephone ?? null,
        telephoneVerified: client.telephoneVerified ?? false,
        termsAccepted: client.termsAccepted ?? false,
        shareInfoMerchants: client.shareInfoMerchants ?? false,
        notifPush: client.notifPush ?? true,
        notifWhatsapp: client.notifWhatsapp ?? true,
        dateNaissance: client.dateNaissance ?? null,
        hasPassword: !!client.password,
        createdAt: client.createdAt,
      },
    };
  }

  /**
   * Logout: invalidate the refresh token so it cannot be reused.
   */
  async logout(clientId: string): Promise<{ success: boolean; message: string }> {
    await this.clientRepo.update({
      where: { id: clientId },
      data: { refreshTokenHash: null, refreshTokenExpiresAt: null, pushToken: null },
    });
    return { success: true, message: 'DÃ©connexion rÃ©ussie' };
  }

  /**
   * Refresh the access token using a valid refresh token.
   * Implements token rotation: the old refresh token is invalidated and a new one issued.
   */
  async refreshAccessToken(refreshToken: string): Promise<Omit<ClientAuthResponse, 'isNewUser'> & { client: ClientAuthResponse['client'] }> {
    const hash = this.hashRefreshToken(refreshToken);

    // Find the client that owns this refresh token
    const client = await this.clientRepo.findFirst({
      where: { refreshTokenHash: hash },
      select: { ...CLIENT_AUTH_SELECT, refreshTokenExpiresAt: true },
    });

    if (!client) {
      throw new UnauthorizedException('error.auth.refreshInvalid');
    }

    // Check expiration â€” reject tokens older than CLIENT_REFRESH_TOKEN_DAYS
    if ((client as any).refreshTokenExpiresAt && new Date((client as any).refreshTokenExpiresAt) < new Date()) {
      // Invalidate the expired token
      await this.clientRepo.update({
        where: { id: client.id },
        data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
      });
      throw new UnauthorizedException('error.auth.refreshExpired');
    }

    // Rotate: issue new access + refresh tokens
    const payload = {
      sub: client.id,
      jti: randomUUID(),
      telephone: client.telephone,
      email: client.email,
      type: 'client' as const,
      role: 'client' as const,
    };
    const access_token = this.jwtService.sign(payload);
    const new_refresh_token = this.generateRefreshToken();
    const newRefreshTokenExpiresAt = new Date(Date.now() + CLIENT_REFRESH_TOKEN_DAYS * MS_PER_DAY);

    await this.clientRepo.update({
      where: { id: client.id },
      data: {
        refreshTokenHash: this.hashRefreshToken(new_refresh_token),
        refreshTokenExpiresAt: newRefreshTokenExpiresAt,
      },
    });

    return {
      access_token,
      refresh_token: new_refresh_token,
      client: {
        id: client.id,
        prenom: client.prenom ?? null,
        nom: client.nom,
        email: client.email,
        emailVerified: (client as any).emailVerified ?? false,
        telephone: client.telephone ?? null,
        telephoneVerified: (client as any).telephoneVerified ?? false,
        termsAccepted: client.termsAccepted,
        shareInfoMerchants: client.shareInfoMerchants,
        notifPush: client.notifPush,
        notifWhatsapp: client.notifWhatsapp,
        dateNaissance: client.dateNaissance ?? null,
        hasPassword: !!client.password,
        createdAt: client.createdAt,
      },
    };
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Email OTP Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  /**
   * Send OTP to email address
   */
  async sendOtpEmail(email: string, isRegister = false): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new BadRequestException('error.auth.emailInvalid');
    }

    // SECURITY: Anti-enumeration â€” return identical response regardless of account existence.
    // Silently skip OTP when account state doesn't match intent (register vs login),
    // EXCEPT if the account exists but the profile was never completed (ghost account).
    const existingClient = await this.clientRepo.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, nom: true, prenom: true },
    });

    const isGhostAccount = existingClient && (!existingClient.nom || !existingClient.prenom);
    const GENERIC_OTP_MESSAGE = 'Si un compte correspond, un code a Ã©tÃ© envoyÃ© par email.';

    if (isRegister && existingClient && !isGhostAccount) {
      // Valid account already exists â€” don't send OTP but return same success response
      return { success: true, message: GENERIC_OTP_MESSAGE };
    }

    if (!isRegister && !existingClient) {
      // No account found â€” don't send OTP but return same success response
      return { success: true, message: GENERIC_OTP_MESSAGE };
    }

    // Daily OTP send limit per email
    checkDailyOtpLimit(normalizedEmail);

    // Per-identifier cooldown â€” prevent OTP spam even if IP changes
    const existingOtp = await this.otpRepo.findUnique({ where: { email: normalizedEmail } });
    if (existingOtp && existingOtp.expiresAt.getTime() - OTP_EXPIRY_MS + OTP_COOLDOWN_MS > Date.now()) {
      throw new HttpException('error.auth.otpWait', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = randomInt(OTP_MIN, OTP_MAX).toString();
    const codeHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    // Upsert OTP by email (hash only â€” never store plaintext)
    await this.otpRepo.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        code: codeHash,
        expiresAt,
      },
      update: {
        code: codeHash,
        expiresAt,
        attempts: 0,
      },
    });

    // Send OTP email â€” client-facing branding (JitPlus, not JitPlus Pro)
    try {
      await this.mailProvider.sendOtpEmail(normalizedEmail, code, 'client');
    } catch {
      this.logger.error(`OTP email delivery failed for ${normalizedEmail}`);
      throw new HttpException('error.auth.emailFail', HttpStatus.SERVICE_UNAVAILABLE);
    }

    this.logger.log(`OTP envoyÃ© Ã  ${normalizedEmail}`);

    return { success: true, message: GENERIC_OTP_MESSAGE };
  }

  /**
   * Verify email OTP and return JWT token
   * @param isRegister - if false (login), reject when no account exists
   */
  async verifyOtpEmail(email: string, code: string, isRegister = false): Promise<ClientAuthResponse> {
    const normalizedEmail = email.trim().toLowerCase();

    const otpRecord = await this.otpRepo.findUnique({
      where: { email: normalizedEmail },
    });

    try {
      validateOtp(otpRecord, code, 'Aucun code n\'a Ã©tÃ© envoyÃ© Ã  cet email');
    } catch (error) {
      await this.handleOtpError(error, otpRecord);
    }

    const [, client] = await Promise.all([
      this.otpRepo.delete({ where: { id: otpRecord!.id } }),
      this.clientRepo.findUnique({ where: { email: normalizedEmail }, select: CLIENT_AUTH_SELECT }),
    ]);

    let resolvedClient = client;
    const isNewUser = !resolvedClient || !resolvedClient.nom;

    if (!resolvedClient) {
      // Login mode: reject if no account exists
      if (!isRegister) {
        throw new BadRequestException('Aucun compte n\'est associÃ© Ã  cet email. Veuillez vous inscrire.');
      }
      try {
        resolvedClient = await this.clientRepo.create({
          data: {
            email: normalizedEmail,
            emailVerified: true,
            nom: null,
          },
          select: CLIENT_AUTH_SELECT,
        });
      } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('error.auth.emailExists');
        }
        throw error;
      }
    } else if (isRegister) {
      // User tried to register but account already exists
      throw new ConflictException('error.auth.emailExists');
    }

    // Mark email as verified since OTP was validated
    if (resolvedClient && !(resolvedClient as any).emailVerified) {
      await this.clientRepo.update({ where: { id: resolvedClient.id }, data: { emailVerified: true } });
      (resolvedClient as any).emailVerified = true;
    }

    return this.buildAuthResponse(resolvedClient, isNewUser);
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Google Login Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  /**
   * Login with Google ID token
   * Verifies the token using google-auth-library (verifyIdToken)
   */
  async googleLogin(idToken: string): Promise<ClientAuthResponse> {
    try {
      // Dev bypass: accept fake token ONLY when explicitly opted-in via a dedicated flag
      if (
        process.env.NODE_ENV === 'development' &&
        process.env.ALLOW_DEV_AUTH_BYPASS === 'true' &&
        idToken === 'dev-google-token'
      ) {
        const devEmail = 'dev-google@test.com';
        let client = await this.clientRepo.findUnique({ where: { email: devEmail }, select: CLIENT_AUTH_SELECT });
        const isNewUser = !client || !client.nom;
        if (!client) {
          client = await this.clientRepo.create({
            data: { email: devEmail, googleId: 'dev-google-id', prenom: 'Dev', nom: 'Google', termsAccepted: true },
            select: CLIENT_AUTH_SELECT,
          });
        }
        this.logger.debug('[DEV] Google dev login bypass');
        return this.buildAuthResponse(client, isNewUser);
      }

      // Verify Google ID token using google-auth-library (cryptographic verification)
      // expo-auth-session uses browser flow â†’ token audience is always the Web client ID
      const webClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
      const androidClientIds = (this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID') || '').split(',').map(s => s.trim()).filter(Boolean);
      const allowedAudiences = [webClientId, ...androidClientIds].filter(Boolean) as string[];

      if (allowedAudiences.length === 0) {
        this.logger.error('Google login misconfigured: GOOGLE_CLIENT_ID and GOOGLE_ANDROID_CLIENT_ID are both empty');
        throw new UnauthorizedException('error.auth.googleNotConfigured');
      }

      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: allowedAudiences,
      });
      const payload = ticket.getPayload();

      if (!payload) {
        throw new UnauthorizedException('error.auth.googleTokenInvalid');
      }

      const { sub: googleId, email, given_name, family_name } = payload;

      if (!email) {
        throw new BadRequestException('error.auth.googleEmailMissing');
      }

      // Try to find client by googleId first, then by email
      let client = await this.clientRepo.findUnique({ where: { googleId }, select: CLIENT_AUTH_SELECT });

      if (!client) {
        client = await this.clientRepo.findUnique({ where: { email: email.toLowerCase() }, select: CLIENT_AUTH_SELECT });
        if (client) {
          // Link Google account to existing client
          client = await this.clientRepo.update({
            where: { id: client.id },
            data: { googleId },
            select: CLIENT_AUTH_SELECT,
          });
        }
      }

      if (!client) {
        try {
          // Google provides name + email â€” terms will be accepted during complete-profile step
          client = await this.clientRepo.create({
            data: {
              email: email.toLowerCase(),
              emailVerified: true,
              googleId,
              prenom: given_name || null,
              nom: family_name || null,
              termsAccepted: false,
            },
            select: CLIENT_AUTH_SELECT,
          });
        } catch (error: any) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('error.auth.googleEmailExists');
          }
          throw error;
        }
      }

      const isNewUser = !client || !client.nom;
      return this.buildAuthResponse(client, isNewUser);
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      this.logger.error('Google login failed:', error);
      throw new UnauthorizedException('error.auth.googleFailed');
    }
  }

  // â”€â”€ Apple Login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Fetch Apple's JWKS public keys (cached for 24 hours).
   */
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

  /**
   * Verify an Apple identity token using Apple's JWKS (public keys).
   * @returns Decoded JWT payload with sub, email, etc.
   */
  private async verifyAppleToken(identityToken: string): Promise<{ sub: string; email?: string; email_verified?: string }> {
    const decoded = jwt.decode(identityToken, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
      throw new UnauthorizedException('error.auth.appleTokenInvalid');
    }
    // Reject unexpected algorithms early (only RS256 is accepted)
    if (decoded.header.alg !== 'RS256') {
      throw new UnauthorizedException('error.auth.appleAlgorithmNotSupported');
    }

    const keys = await this.getApplePublicKeys();
    let matchingKey = keys.find((k: any) => k.kid === decoded.header.kid);
    if (!matchingKey) {
      // Invalidate cache and retry once (Apple may have rotated keys)
      this.appleJwksCache = null;
      const freshKeys = await this.getApplePublicKeys();
      matchingKey = freshKeys.find((k: any) => k.kid === decoded.header.kid);
      if (!matchingKey) throw new UnauthorizedException('error.auth.appleKeyNotFound');
    }

    const publicKey = createPublicKey({ key: matchingKey, format: 'jwk' });

    // APPLE_BUNDLE_IDS: comma-separated list of bundle IDs (e.g. "com.jitplus.client,com.jitplus.pro")
    const appleBundleIds = (this.configService.get<string>('APPLE_BUNDLE_IDS') || '').split(',').map(s => s.trim()).filter(Boolean);

    const payload = jwt.verify(identityToken, publicKey, {
      algorithms: ['RS256'],
      issuer: 'https://appleid.apple.com',
      ...(appleBundleIds.length > 0 && { audience: appleBundleIds as [string, ...string[]] }),
    }) as jwt.JwtPayload & { sub: string; email?: string; email_verified?: string };

    return payload;
  }

  /**
   * Login with Apple identity token.
   * Verifies the token using Apple's JWKS endpoint.
   */
  async appleLogin(identityToken: string, givenName?: string, familyName?: string): Promise<ClientAuthResponse> {
    try {
      const payload = await this.verifyAppleToken(identityToken);
      const { sub: appleId, email } = payload;

      if (!appleId) {
        throw new UnauthorizedException('error.auth.appleTokenInvalidId');
      }

      // Try to find client by appleId first, then by email
      let client = await this.clientRepo.findFirst({ where: { appleId }, select: CLIENT_AUTH_SELECT });

      if (!client && email) {
        client = await this.clientRepo.findUnique({ where: { email: email.toLowerCase() }, select: CLIENT_AUTH_SELECT });
        if (client) {
          // Link Apple account to existing client
          client = await this.clientRepo.update({
            where: { id: client.id },
            data: { appleId },
            select: CLIENT_AUTH_SELECT,
          }) as typeof client;
        }
      }

      if (!client) {
        try {
          client = await this.clientRepo.create({
            data: {
              email: email ? email.toLowerCase() : null,
              emailVerified: !!email,
              appleId,
              prenom: givenName || null,
              nom: familyName || null,
              termsAccepted: false,
            },
            select: CLIENT_AUTH_SELECT,
          });
        } catch (error: any) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('error.auth.appleEmailExists');
          }
          throw error;
        }
      }

      const isNewUser = !client || !client.nom;
      return this.buildAuthResponse(client, isNewUser);
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      this.logger.error('Apple login failed:', error);
      throw new UnauthorizedException('error.auth.appleFailed');
    }
  }

  /**
   * Complete profile for new users (prÃ©nom + nom + terms acceptance + optional password)
   */
  async completeProfile(clientId: string, prenom: string, nom: string, termsAccepted: boolean, telephone?: string, dateNaissance?: string, password?: string): Promise<ClientProfileResult> {
    if (!termsAccepted) {
      throw new BadRequestException('error.auth.termsRequired');
    }

    // Build update data
    const data: { prenom: string; nom: string; termsAccepted: true; shareInfoMerchants: false; telephone?: string; countryCode?: string; dateNaissance?: Date; password?: string } = {
      prenom: prenom.trim(),
      nom: nom.trim(),
      termsAccepted: true,
      shareInfoMerchants: false, // opt-out par dÃ©faut Ã  l'inscription
      ...(dateNaissance ? { dateNaissance: new Date(dateNaissance) } : {}),
    };

    // If password provided, hash it and include in the atomic update
    if (password) {
      data.password = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    }

    // If telephone provided (email-registered users), normalize and save it
    if (telephone) {
      const normalizedPhone = this.normalizePhone(telephone);
      if (!this.isValidPhone(normalizedPhone)) {
        throw new BadRequestException('error.auth.phoneInvalidFormat');
      }

      // Check uniqueness among active accounts only
      const existing = await this.clientRepo.findFirst({ where: { telephone: normalizedPhone, deletedAt: null } });
      if (existing && existing.id !== clientId) {
        throw new ConflictException('Ce numÃ©ro de tÃ©lÃ©phone est dÃ©jÃ  associÃ© Ã  un autre compte');
      }

      data.telephone = normalizedPhone;
      data.countryCode = this.extractCountryCode(normalizedPhone);
    }

    const client = await this.clientRepo.update({
      where: { id: clientId },
      data,
      select: CLIENT_AUTH_SELECT,
    });

    // Send welcome message based on registration method:
    // - WhatsApp users (telephone + no googleId): welcome via WhatsApp
    // - Google users (googleId set): welcome via email
    // - Email users (email + no googleId): welcome via email
    if (client.telephone && !client.googleId && !client.email) {
      const name = client.prenom ?? 'cher client';
      this.smsProvider.sendWhatsAppMessage(
        client.telephone,
        `Bienvenue ${name} sur JitPlus ! ðŸŽ‰ Vos cartes de fidÃ©litÃ©, partout avec vous.`,
      ).catch((err) => this.logger.warn('Welcome WhatsApp failed', errMsg(err)));
    } else if (client.email) {
      this.mailProvider.sendWelcomeClient(client.email, client.prenom ?? undefined)
        .catch((err) => this.logger.warn('Welcome email failed', errMsg(err)));
    }

    return {
      success: true,
      client: {
        id: client.id,
        prenom: client.prenom,
        nom: client.nom,
        email: client.email,
        emailVerified: (client as any).emailVerified ?? false,
        telephone: client.telephone,
        telephoneVerified: (client as any).telephoneVerified ?? false,
        termsAccepted: client.termsAccepted,
        shareInfoMerchants: client.shareInfoMerchants,
        notifPush: client.notifPush,
        notifWhatsapp: client.notifWhatsapp,
        dateNaissance: client.dateNaissance,
        hasPassword: !!client.password,
        createdAt: client.createdAt,
      },
    };
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Email + Password Login Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  /**
   * Login with email and password
   */

  async loginWithEmailPassword(email: string, password: string): Promise<ClientAuthResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    const genericError = 'Email ou mot de passe incorrect.';

    const client = await this.clientRepo.findUnique({
      where: { email: normalizedEmail },
      select: CLIENT_LOGIN_SELECT,
    });

    // Brute-force protection â€” check BEFORE bcrypt to avoid resource waste on locked accounts
    if (client) {
      checkLockout(client);
    }

    // Timing-safe: always run bcrypt compare even if user not found
    const isValid = await bcrypt.compare(
      password,
      client?.password ?? ClientAuthService.DUMMY_HASH,
    );

    if (!client || !client.password || !isValid) {
      if (client) {
        await handleFailedLogin(client, this.clientLockoutOps);
      }
      throw new BadRequestException(genericError);
    }

    // Successful login â€” reset failed attempts
    await resetLoginAttempts(client, this.clientLockoutOps);

    return this.buildAuthResponse(client, false);
  }

  /**
   * Set password for a client (after OTP email registration).
   * Validation (min 8 chars, uppercase, digit, special char) is handled by SetPasswordDto.
   */
  async setPassword(clientId: string, password: string): Promise<ClientProfileResult> {
    const existing = await this.clientRepo.findUnique({
      where: { id: clientId },
      select: { password: true },
    });
    if (existing?.password) {
      throw new BadRequestException('Un mot de passe existe dÃ©jÃ . Utilisez le changement de mot de passe.');
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const client = await this.clientRepo.update({
      where: { id: clientId },
      data: { password: hashedPassword },
      select: CLIENT_AUTH_SELECT,
    });

    return {
      success: true,
      client: {
        id: client.id,
        prenom: client.prenom,
        nom: client.nom,
        email: client.email,
        emailVerified: (client as any).emailVerified ?? false,
        telephone: client.telephone,
        telephoneVerified: (client as any).telephoneVerified ?? false,
        termsAccepted: client.termsAccepted,
        shareInfoMerchants: client.shareInfoMerchants,
        notifPush: client.notifPush,
        notifWhatsapp: client.notifWhatsapp,
        dateNaissance: client.dateNaissance ?? null,
        hasPassword: true,
        createdAt: client.createdAt,
      },
    };
  }

  /**
   * Reset password for a client who verified identity via OTP (forgot password flow).
   * Unlike setPassword(), this allows overwriting an existing password.
   */
  async resetPasswordOtp(clientId: string, newPassword: string): Promise<ClientProfileResult> {
    const client = await this.clientRepo.findUnique({
      where: { id: clientId },
      select: { id: true, password: true },
    });
    if (!client) throw new BadRequestException('error.auth.clientNotFound');

    // Prevent setting same password
    if (client.password) {
      const isSame = await bcrypt.compare(newPassword, client.password);
      if (isSame) throw new BadRequestException('error.auth.samePassword');
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    const updated = await this.clientRepo.update({
      where: { id: clientId },
      data: { password: hashedPassword, refreshTokenHash: null },
      select: CLIENT_AUTH_SELECT,
    });

    return {
      success: true,
      client: {
        id: updated.id,
        prenom: updated.prenom,
        nom: updated.nom,
        email: updated.email,
        emailVerified: (updated as any).emailVerified ?? false,
        telephone: updated.telephone,
        telephoneVerified: (updated as any).telephoneVerified ?? false,
        termsAccepted: updated.termsAccepted,
        shareInfoMerchants: updated.shareInfoMerchants,
        notifPush: updated.notifPush,
        notifWhatsapp: updated.notifWhatsapp,
        dateNaissance: updated.dateNaissance ?? null,
        hasPassword: true,
        createdAt: updated.createdAt,
      },
    };
  }

  /**
   * Change password for an authenticated client.
   * Google-only accounts can set an initial password without providing currentPassword.
   */
  async changePassword(clientId: string, currentPassword: string | undefined, newPassword: string): Promise<ClientProfileResult> {
    const client = await this.clientRepo.findUnique({
      where: { id: clientId },
      select: { id: true, password: true, googleId: true },
    });
    if (!client) throw new BadRequestException('error.auth.clientNotFound');

    // OAuth accounts (Google/Apple) without a password can set one without currentPassword
    if (client.password) {
      if (!currentPassword) throw new BadRequestException('error.auth.currentPasswordRequired');
      const isValid = await bcrypt.compare(currentPassword, client.password);
      if (!isValid) throw new UnauthorizedException('error.auth.currentPasswordIncorrect');
    }

    // Prevent changing to the same password
    if (client.password) {
      const isSame = await bcrypt.compare(newPassword, client.password);
      if (isSame) throw new BadRequestException('error.auth.samePassword');
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    const updated = await this.clientRepo.update({
      where: { id: clientId },
      data: { password: hashedPassword, refreshTokenHash: null },
      select: CLIENT_AUTH_SELECT,
    });

    return {
      success: true,
      client: {
        id: updated.id,
        prenom: updated.prenom,
        nom: updated.nom,
        email: updated.email,
        emailVerified: (updated as any).emailVerified ?? false,
        telephone: updated.telephone,
        telephoneVerified: (updated as any).telephoneVerified ?? false,
        termsAccepted: updated.termsAccepted,
        shareInfoMerchants: updated.shareInfoMerchants,
        notifPush: updated.notifPush,
        notifWhatsapp: updated.notifWhatsapp,
        dateNaissance: updated.dateNaissance ?? null,
        hasPassword: true,
        createdAt: updated.createdAt,
      },
    };
  }
  // Ã¢â€â‚¬Ã¢â€â‚¬ QR Token Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  /**
   * Short-lived HMAC-signed QR token for merchant scanning.
   * Format v2: "v2." + base64url(clientId) + "." + exp + "." + nonce + "."
   *            + HMAC-SHA256(secret, "v2:" + clientId + ":" + exp + ":" + nonce)
   * - exp: unix seconds when the token becomes invalid (~60 s from now)
   * - nonce: 16 random bytes (base64url) — single-use, enforced server-side
   *
   * Legacy format v1 ("v1." + base64url(clientId) + "." + HMAC-SHA256(secret, "v1:" + clientId))
   * is still accepted by the verifier during the rollout window.
   */
  async generateQrToken(clientId: string): Promise<{ qr_token: string; expiresAt: number }> {
    const client = await this.clientRepo.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) {
      throw new BadRequestException('error.auth.clientNotFound');
    }

    const secret = this.configService.getOrThrow<string>('QR_HMAC_SECRET');
    const idPart = Buffer.from(client.id).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + QR_TOKEN_TTL_SECONDS;
    const nonce = randomBytes(16).toString('base64url');
    const sig = createHmac('sha256', secret)
      .update(`v2:${client.id}:${exp}:${nonce}`)
      .digest('base64url');
    const qr_token = `v2.${idPart}.${exp}.${nonce}.${sig}`;

    return { qr_token, expiresAt: exp };
  }
  // â”€â”€ Change Contact OTP (profile update) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Send OTP to verify ownership of a new email or phone before applying the change.
   */
  async sendChangeContactOtp(
    clientId: string,
    type: 'email' | 'telephone',
    value: string,
  ): Promise<{ success: boolean; message: string }> {
    if (type === 'email') {
      const normalizedEmail = value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new BadRequestException('error.auth.emailInvalid');
      }
      const existing = await this.clientRepo.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
      if (existing && existing.id !== clientId) {
        throw new ConflictException('Cette adresse email est dÃ©jÃ  utilisÃ©e par un autre compte.');
      }
      checkDailyOtpLimit(normalizedEmail);
      const existingOtp = await this.otpRepo.findUnique({ where: { email: normalizedEmail } });
      if (existingOtp && existingOtp.expiresAt.getTime() - OTP_EXPIRY_MS + OTP_COOLDOWN_MS > Date.now()) {
        throw new HttpException('error.auth.otpWait', HttpStatus.TOO_MANY_REQUESTS);
      }
      const code = randomInt(OTP_MIN, OTP_MAX).toString();
      const codeHash = hashOtp(code);
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
      await this.otpRepo.upsert({
        where: { email: normalizedEmail },
        create: { email: normalizedEmail, code: codeHash, expiresAt },
        update: { code: codeHash, expiresAt, attempts: 0 },
      });
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug(`[DEV] OTP changement email ${normalizedEmail}: ${code}`);
      }
      try {
        await this.mailProvider.sendOtpEmail(normalizedEmail, code, 'client');
      } catch {
        this.logger.error(`OTP email delivery failed for ${normalizedEmail}`);
        throw new HttpException('error.auth.emailFail', HttpStatus.SERVICE_UNAVAILABLE);
      }
      return { success: true, message: 'Code envoyÃ© par email' };
    } else {
      const normalizedPhone = this.normalizePhone(value);
      if (!this.isValidPhone(normalizedPhone)) {
        throw new BadRequestException('error.auth.phoneInvalidFormat');
      }
      const existing = await this.clientRepo.findUnique({ where: { telephone: normalizedPhone }, select: { id: true } });
      if (existing && existing.id !== clientId) {
        throw new ConflictException('Ce numÃ©ro de tÃ©lÃ©phone est dÃ©jÃ  utilisÃ© par un autre compte.');
      }
      checkDailyOtpLimit(normalizedPhone);
      const existingOtp = await this.otpRepo.findUnique({ where: { telephone: normalizedPhone } });
      if (existingOtp && existingOtp.expiresAt.getTime() - OTP_EXPIRY_MS + OTP_COOLDOWN_MS > Date.now()) {
        throw new HttpException('error.auth.otpWait', HttpStatus.TOO_MANY_REQUESTS);
      }
      const code = randomInt(OTP_MIN, OTP_MAX).toString();
      const codeHash = hashOtp(code);
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
      await this.otpRepo.upsert({
        where: { telephone: normalizedPhone },
        create: { telephone: normalizedPhone, code: codeHash, expiresAt },
        update: { code: codeHash, expiresAt, attempts: 0 },
      });
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug(`[DEV] OTP changement tÃ©l ${normalizedPhone}: ${code}`);
      }
      const sent = await this.smsProvider.sendWhatsAppOtp(normalizedPhone, code);
      if (!sent) {
        throw new HttpException('error.auth.whatsappFail', HttpStatus.SERVICE_UNAVAILABLE);
      }
      return { success: true, message: 'Code envoyÃ© avec succÃ¨s' };
    }
  }

  /**
   * Verify OTP and mark the email/phone as verified on the client profile.
   */
  async verifyChangeContactOtp(
    clientId: string,
    type: 'email' | 'telephone',
    value: string,
    code: string,
  ): Promise<{ success: boolean; message: string }> {
    if (type === 'email') {
      const normalizedEmail = value.trim().toLowerCase();
      const otpRecord = await this.otpRepo.findUnique({ where: { email: normalizedEmail } });
      try {
        validateOtp(otpRecord, code, "Aucun code n'a Ã©tÃ© envoyÃ© Ã  cet email");
      } catch (error) {
        await this.handleOtpError(error, otpRecord);
      }
      // Verify the client still has this email
      const client = await this.clientRepo.findUnique({ where: { id: clientId }, select: { email: true } });
      if (!client || client.email !== normalizedEmail) {
        await this.otpRepo.delete({ where: { id: otpRecord!.id } });
        throw new BadRequestException('error.auth.profileEmailMismatch');
      }
      await this.otpRepo.delete({ where: { id: otpRecord!.id } });
      await this.clientRepo.update({
        where: { id: clientId },
        data: { emailVerified: true },
      });
      return { success: true, message: 'Email vÃ©rifiÃ© avec succÃ¨s' };
    } else {
      const normalizedPhone = this.normalizePhone(value);
      const otpRecord = await this.otpRepo.findUnique({ where: { telephone: normalizedPhone } });
      try {
        validateOtp(otpRecord, code, "Aucun code n'a Ã©tÃ© envoyÃ© Ã  ce numÃ©ro");
      } catch (error) {
        await this.handleOtpError(error, otpRecord);
      }
      const client = await this.clientRepo.findUnique({ where: { id: clientId }, select: { telephone: true } });
      if (!client || client.telephone !== normalizedPhone) {
        await this.otpRepo.delete({ where: { id: otpRecord!.id } });
        throw new BadRequestException('error.auth.profilePhoneMismatch');
      }
      await this.otpRepo.delete({ where: { id: otpRecord!.id } });
      await this.clientRepo.update({
        where: { id: clientId },
        data: { telephoneVerified: true },
      });
      return { success: true, message: 'NumÃ©ro de tÃ©lÃ©phone vÃ©rifiÃ© avec succÃ¨s' };
    }
  }
  // Ã¢â€â‚¬Ã¢â€â‚¬ Loi 09-08 â€” Droit dâ€™accÃ¨s aux donnÃ©es personnelles Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  /**
   * Export all personal data for a client as required by Loi nÃ‚Â°09-08
   * (Protection des donnÃ©es personnelles au Maroc, supervisÃ©e par la CNDP).
   * Sensitive fields (password hash, OTP, refresh token) are excluded.
   */
  async exportClientData(clientId: string) {
    const client = await this.clientRepo.findUnique({
      where: { id: clientId },
      include: {
        loyaltyCards: {
          include: {
            merchant: {
              select: { id: true, nom: true, categorie: true, ville: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 1000,
          include: {
            merchant: { select: { id: true, nom: true } },
          },
        },
      },
    });

    if (!client) {
      throw new BadRequestException('error.auth.clientNotFound');
    }

    // Strip all sensitive / internal fields + included relations (returned separately)
    const {
      password: _pw,
      refreshTokenHash: _rt,
      pushToken: _push,
      failedLoginAttempts: _fa,
      lockedUntil: _lu,
      googleId: _gid,
      loyaltyCards: _lc,
      transactions: _tx,
      ...safeClient
    } = client;

    return {
      exportedAt: new Date().toISOString(),
      legalNotice:
        'Export de donn\u00e9es personnelles conform\u00e9ment \u00e0 la Loi n\u00b009-08 relative \u00e0 la protection '
        + 'des personnes physiques \u00e0 l\u2019\u00e9gard du traitement des donn\u00e9es \u00e0 caract\u00e8re personnel (Maroc, CNDP).',
      profile: safeClient,
      loyaltyCards: client.loyaltyCards,
      transactions: client.transactions,
    };
  }
}






