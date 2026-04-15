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
import { OTP_MIN, OTP_MAX, OTP_EXPIRY_MS, OTP_COOLDOWN_MS, MAX_OTP_ATTEMPTS, BCRYPT_SALT_ROUNDS, CLIENT_REFRESH_TOKEN_DAYS, MS_PER_DAY } from '../common/constants';
import { errMsg } from '../common/utils';
import { checkLockout, handleFailedLogin, resetLoginAttempts, LockoutDbOps } from '../common/utils/login-lockout.helper';
import { CLIENT_AUTH_SELECT, CLIENT_LOGIN_SELECT } from '../common/prisma-selects';
import { validateOtp, handleOtpMismatch, hashOtp, checkDailyOtpLimit, OtpDbOps, OtpRecord } from '../common/utils/otp.helper';
import { IMailProvider, MAIL_PROVIDER, ISmsProvider, SMS_PROVIDER } from '../common/interfaces';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import { createPublicKey } from 'crypto';

/** Shape returned by buildAuthResponse — access + refresh tokens + client data. */
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
   * E.g., +212612345678 → MA, +33612345678 → FR, +441234567890 → GB
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

  /**
   * Generate and store OTP for phone number
   */
  async sendOtp(telephone: string, isRegister = false): Promise<{ success: boolean; message: string }> {
    const normalizedPhone = this.normalizePhone(telephone);

    // Validate international format
    if (!this.isValidPhone(normalizedPhone)) {
      throw new BadRequestException('Format de numéro de téléphone invalide');
    }

    // Check account existence before sending OTP
    const existingClient = await this.clientRepo.findUnique({
      where: { telephone: normalizedPhone },
      select: { id: true },
    });

    if (isRegister && existingClient) {
      throw new ConflictException('Un compte avec ce numéro de téléphone existe déjà. Veuillez vous connecter.');
    }

    if (!isRegister && !existingClient) {
      throw new BadRequestException('Aucun compte n\'est associé à ce numéro. Veuillez d\'abord ajouter votre numéro à votre profil ou vous inscrire.');
    }

    // Daily OTP send limit per phone number
    checkDailyOtpLimit(normalizedPhone);

    // Per-identifier cooldown — prevent OTP spam even if IP changes
    const existingOtp = await this.otpRepo.findUnique({ where: { telephone: normalizedPhone } });
    if (existingOtp && existingOtp.expiresAt.getTime() - OTP_EXPIRY_MS + OTP_COOLDOWN_MS > Date.now()) {
      throw new HttpException('Veuillez patienter avant de renvoyer un code.', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Generate 6-digit OTP (cryptographically secure)
    const code = randomInt(OTP_MIN, OTP_MAX).toString();
    const codeHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    // Store or update OTP (hash only — never store plaintext)
    await this.otpRepo.upsert({
      where: { telephone: normalizedPhone },
      create: {
        telephone: normalizedPhone,
        code: codeHash,
        expiresAt,
      },
      update: {
        code: codeHash,
        expiresAt,
        attempts: 0,
      },
    });

    // In dev only, log a hint (never log the full code)
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`[DEV] OTP envoyé à ${normalizedPhone} (derniers chiffres: ${code.slice(-2)})`);
    }

    // Send OTP via WhatsApp (Twilio) — works in both dev (sandbox) and prod
    const sent = await this.smsProvider.sendWhatsAppOtp(normalizedPhone, code);
    if (!sent) {
      this.logger.warn(`OTP WhatsApp non envoyé à ${normalizedPhone} — vérifiez la config Twilio`);
      throw new HttpException(
        "Impossible d'envoyer le code WhatsApp. Veuillez réessayer ou choisir la connexion par email.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { success: true, message: 'Code envoyé avec succès' };
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
    if (otpRecord && (errorMessage.includes('expiré') || errorMessage.includes('Trop de tentatives'))) {
      await this.otpRepo.delete({ where: { id: otpRecord.id } }).catch((err: unknown) =>
        this.logger.warn('OTP cleanup failed', errMsg(err)),
      );
    }
    throw error;
  }

  /**
   * Verify OTP and return JWT token + isNewUser flag
   */
  async verifyOtp(telephone: string, code: string): Promise<ClientAuthResponse> {
    const normalizedPhone = this.normalizePhone(telephone);

    const otpRecord = await this.otpRepo.findUnique({
      where: { telephone: normalizedPhone },
    });

    try {
      validateOtp(otpRecord, code, 'Aucun code n\'a été envoyé à ce numéro');
    } catch (error) {
      await this.handleOtpError(error, otpRecord);
    }

    // Delete OTP after successful verification + find client in parallel
    const [, client] = await Promise.all([
      this.otpRepo.delete({ where: { id: otpRecord!.id } }),
      this.clientRepo.findUnique({
        where: { telephone: normalizedPhone },
        select: CLIENT_AUTH_SELECT,
      }),
    ]);

    let resolvedClient = client;

    const isNewUser = !resolvedClient || !resolvedClient.nom;

    if (!resolvedClient) {
      try {
        resolvedClient = await this.clientRepo.create({
          data: {
            telephone: normalizedPhone,
            telephoneVerified: true,
            countryCode: this.extractCountryCode(normalizedPhone),
            nom: null,
            email: null,
          },
          select: CLIENT_AUTH_SELECT,
        });
      } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Un compte avec ce numéro de téléphone existe déjà');
        }
        throw error;
      }
    }

    // Mark phone as verified since OTP was validated
    if (resolvedClient && !(resolvedClient as any).telephoneVerified) {
      await this.clientRepo.update({ where: { id: resolvedClient.id }, data: { telephoneVerified: true } });
      (resolvedClient as any).telephoneVerified = true;
    }

    return this.buildAuthResponse(resolvedClient, isNewUser);
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
    return { success: true, message: 'Déconnexion réussie' };
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
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    // Check expiration — reject tokens older than CLIENT_REFRESH_TOKEN_DAYS
    if ((client as any).refreshTokenExpiresAt && new Date((client as any).refreshTokenExpiresAt) < new Date()) {
      // Invalidate the expired token
      await this.clientRepo.update({
        where: { id: client.id },
        data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
      });
      throw new UnauthorizedException('Refresh token expiré — veuillez vous reconnecter');
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

  // â”€â”€ Email OTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Send OTP to email address
   */
  async sendOtpEmail(email: string, isRegister = false, telephone?: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new BadRequestException('Adresse email invalide');
    }

    // Check account existence before sending OTP
    const existingClient = await this.clientRepo.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (isRegister && existingClient) {
      throw new ConflictException('Un compte avec cet email existe déjà. Veuillez vous connecter.');
    }

    if (!isRegister && !existingClient) {
      throw new BadRequestException('Aucun compte n\'est associé à cet email. Veuillez d\'abord ajouter votre email à votre profil ou vous inscrire.');
    }

    // If registering with a phone, ensure the phone is not already taken by an active account
    if (isRegister && telephone) {
      const phoneInUse = await this.clientRepo.findFirst({
        where: { telephone, deletedAt: null },
        select: { id: true },
      });
      if (phoneInUse) {
        throw new ConflictException('Ce numéro de téléphone est déjà associé à un autre compte.');
      }
    }

    // Daily OTP send limit per email
    checkDailyOtpLimit(normalizedEmail);

    // Per-identifier cooldown — prevent OTP spam even if IP changes
    const existingOtp = await this.otpRepo.findUnique({ where: { email: normalizedEmail } });
    if (existingOtp && existingOtp.expiresAt.getTime() - OTP_EXPIRY_MS + OTP_COOLDOWN_MS > Date.now()) {
      throw new HttpException('Veuillez patienter avant de renvoyer un code.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = randomInt(OTP_MIN, OTP_MAX).toString();
    const codeHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    // Upsert OTP by email (hash only — never store plaintext)
    // Store telephone alongside email so verifyOtpEmail can attach it to the new client
    await this.otpRepo.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        telephone: telephone || null,
        code: codeHash,
        expiresAt,
      },
      update: {
        telephone: telephone || null,
        code: codeHash,
        expiresAt,
        attempts: 0,
      },
    });

    // Send OTP email — client-facing branding (JitPlus, not JitPlus Pro)
    try {
      await this.mailProvider.sendOtpEmail(normalizedEmail, code, 'client');
    } catch {
      this.logger.error(`OTP email delivery failed for ${normalizedEmail}`);
      throw new HttpException('Impossible d\'envoyer l\'email. Veuillez réessayer.', HttpStatus.SERVICE_UNAVAILABLE);
    }

    this.logger.log(`OTP envoyé à ${normalizedEmail}`);

    return { success: true, message: 'Code envoyé par email' };
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
      validateOtp(otpRecord, code, 'Aucun code n\'a été envoyé à cet email');
    } catch (error) {
      await this.handleOtpError(error, otpRecord);
    }

    const [, client] = await Promise.all([
      this.otpRepo.delete({ where: { id: otpRecord!.id } }),
      this.clientRepo.findUnique({ where: { email: normalizedEmail }, select: CLIENT_AUTH_SELECT }),
    ]);

    // telephone was stored alongside the OTP during registration
    const registrationPhone = otpRecord!.telephone;

    let resolvedClient = client;
    const isNewUser = !resolvedClient || !resolvedClient.nom;

    if (!resolvedClient) {
      // Login mode: reject if no account exists
      if (!isRegister) {
        throw new BadRequestException('Aucun compte n\'est associé à cet email. Veuillez vous inscrire.');
      }
      try {
        resolvedClient = await this.clientRepo.create({
          data: {
            email: normalizedEmail,
            emailVerified: true,
            nom: null,
            ...(registrationPhone && { telephone: registrationPhone }),
          },
          select: CLIENT_AUTH_SELECT,
        });
      } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Un compte avec cet email existe déjà');
        }
        throw error;
      }
    } else if (isRegister) {
      // User tried to register but account already exists
      throw new ConflictException('Un compte avec cet email existe déjà. Veuillez vous connecter.');
    }

    // Mark email as verified since OTP was validated
    if (resolvedClient && !(resolvedClient as any).emailVerified) {
      await this.clientRepo.update({ where: { id: resolvedClient.id }, data: { emailVerified: true } });
      (resolvedClient as any).emailVerified = true;
    }

    return this.buildAuthResponse(resolvedClient, isNewUser);
  }

  // â”€â”€ Google Login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      // expo-auth-session uses browser flow → token audience is always the Web client ID
      const webClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
      const androidClientIds = (this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID') || '').split(',').map(s => s.trim()).filter(Boolean);
      const allowedAudiences = [webClientId, ...androidClientIds].filter(Boolean) as string[];

      if (allowedAudiences.length === 0) {
        this.logger.error('Google login misconfigured: GOOGLE_CLIENT_ID and GOOGLE_ANDROID_CLIENT_ID are both empty');
        throw new UnauthorizedException('Connexion Google non configurée');
      }

      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: allowedAudiences,
      });
      const payload = ticket.getPayload();

      if (!payload) {
        throw new UnauthorizedException('Token Google invalide');
      }

      const { sub: googleId, email, given_name, family_name } = payload;

      if (!email) {
        throw new BadRequestException('Impossible de récupérer l\'email du compte Google');
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
          // Google provides name + email — terms will be accepted during complete-profile step
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
            throw new ConflictException('Un compte avec cet email ou ce compte Google existe déjà');
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
      throw new UnauthorizedException('Échec de la connexion Google');
    }
  }

  // ── Apple Login ────────────────────────────────────────

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
      throw new UnauthorizedException('Token Apple invalide');
    }
    // Reject unexpected algorithms early (only RS256 is accepted)
    if (decoded.header.alg !== 'RS256') {
      throw new UnauthorizedException('Algorithme de signature Apple non supporté');
    }

    const keys = await this.getApplePublicKeys();
    let matchingKey = keys.find((k: any) => k.kid === decoded.header.kid);
    if (!matchingKey) {
      // Invalidate cache and retry once (Apple may have rotated keys)
      this.appleJwksCache = null;
      const freshKeys = await this.getApplePublicKeys();
      matchingKey = freshKeys.find((k: any) => k.kid === decoded.header.kid);
      if (!matchingKey) throw new UnauthorizedException('Cl\u00e9 Apple introuvable');
    }

    const publicKey = createPublicKey({ key: matchingKey, format: 'jwk' });

    const payload = jwt.verify(identityToken, publicKey, {
      algorithms: ['RS256'],
      issuer: 'https://appleid.apple.com',
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
        throw new UnauthorizedException('Token Apple invalide — identifiant manquant');
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
            throw new ConflictException('Un compte avec cet email ou ce compte Apple existe déjà');
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
      throw new UnauthorizedException('Échec de la connexion Apple');
    }
  }

  /**
   * Complete profile for new users (prénom + nom + terms acceptance + optional password)
   */
  async completeProfile(clientId: string, prenom: string, nom: string, termsAccepted: boolean, telephone?: string, dateNaissance?: string, password?: string): Promise<ClientProfileResult> {
    if (!termsAccepted) {
      throw new BadRequestException('Vous devez accepter les mentions légales');
    }

    // Build update data
    const data: { prenom: string; nom: string; termsAccepted: true; shareInfoMerchants: false; telephone?: string; countryCode?: string; dateNaissance?: Date; password?: string } = {
      prenom: prenom.trim(),
      nom: nom.trim(),
      termsAccepted: true,
      shareInfoMerchants: false, // opt-out par défaut à l'inscription
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
        throw new BadRequestException('Format de numéro de téléphone invalide');
      }

      // Check uniqueness among active accounts only
      const existing = await this.clientRepo.findFirst({ where: { telephone: normalizedPhone, deletedAt: null } });
      if (existing && existing.id !== clientId) {
        throw new ConflictException('Ce numéro de téléphone est déjà associé à un autre compte');
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
        `Bienvenue ${name} sur JitPlus ! 🎉 Vos cartes de fidélité, partout avec vous.`,
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

  // â”€â”€ Email + Password Login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    // Brute-force protection
    checkLockout(client);

    // Successful login — reset failed attempts
    await resetLoginAttempts(client, this.clientLockoutOps);

    return this.buildAuthResponse(client, false);
  }

  /**
   * Login with phone number and password (no OTP required)
   */
  async loginWithPhonePassword(telephone: string, password: string): Promise<ClientAuthResponse> {
    const normalizedPhone = this.normalizePhone(telephone);
    const genericError = 'Numéro ou mot de passe incorrect.';

    if (!this.isValidPhone(normalizedPhone)) {
      throw new BadRequestException('Format de numéro de téléphone invalide');
    }

    const client = await this.clientRepo.findUnique({
      where: { telephone: normalizedPhone },
      select: CLIENT_LOGIN_SELECT,
    });

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

    // Brute-force protection
    checkLockout(client);

    // Successful login — reset failed attempts
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
      throw new BadRequestException('Un mot de passe existe déjà. Utilisez le changement de mot de passe.');
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
    if (!client) throw new BadRequestException('Client introuvable');

    // Prevent setting same password
    if (client.password) {
      const isSame = await bcrypt.compare(newPassword, client.password);
      if (isSame) throw new BadRequestException('Le nouveau mot de passe doit être différent de l\'ancien');
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
    if (!client) throw new BadRequestException('Client introuvable');

    // Google-only accounts can set initial password without current one
    if (client.googleId && !client.password && !currentPassword) {
      // Allow setting initial password for Google accounts
    } else {
      if (!currentPassword) throw new BadRequestException('Le mot de passe actuel est requis');
      if (!client.password) throw new BadRequestException('Aucun mot de passe défini. Utilisez "Définir le mot de passe".');
      const isValid = await bcrypt.compare(currentPassword, client.password);
      if (!isValid) throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    // Prevent changing to the same password
    if (client.password) {
      const isSame = await bcrypt.compare(newPassword, client.password);
      if (isSame) throw new BadRequestException('Le nouveau mot de passe doit être différent de l\'ancien');
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
  // â”€â”€ QR Token â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  /**
   * Permanent HMAC-signed QR token for merchant scanning.
   * Format v1: "v1." + base64url(clientId) + "." + HMAC-SHA256(secret, "v1:" + clientId)
   * Versioned so the secret can be rotated (add v2 with QR_HMAC_SECRET_V2).
   */
  async generateQrToken(clientId: string): Promise<{ qr_token: string }> {
    const client = await this.clientRepo.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) {
      throw new BadRequestException('Client introuvable');
    }

    const secret = this.configService.getOrThrow<string>('QR_HMAC_SECRET');
    const idPart = Buffer.from(client.id).toString('base64url');
    const sig = createHmac('sha256', secret).update(`v1:${client.id}`).digest('base64url');
    const qr_token = `v1.${idPart}.${sig}`;

    return { qr_token };
  }
  // ── Change Contact OTP (profile update) ────────────────────────────

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
        throw new BadRequestException('Adresse email invalide');
      }
      const existing = await this.clientRepo.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
      if (existing && existing.id !== clientId) {
        throw new ConflictException('Cette adresse email est déjà utilisée par un autre compte.');
      }
      checkDailyOtpLimit(normalizedEmail);
      const existingOtp = await this.otpRepo.findUnique({ where: { email: normalizedEmail } });
      if (existingOtp && existingOtp.expiresAt.getTime() - OTP_EXPIRY_MS + OTP_COOLDOWN_MS > Date.now()) {
        throw new HttpException('Veuillez patienter avant de renvoyer un code.', HttpStatus.TOO_MANY_REQUESTS);
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
        throw new HttpException('Impossible d\'envoyer l\'email. Veuillez réessayer.', HttpStatus.SERVICE_UNAVAILABLE);
      }
      return { success: true, message: 'Code envoyé par email' };
    } else {
      const normalizedPhone = this.normalizePhone(value);
      if (!this.isValidPhone(normalizedPhone)) {
        throw new BadRequestException('Format de numéro de téléphone invalide');
      }
      const existing = await this.clientRepo.findUnique({ where: { telephone: normalizedPhone }, select: { id: true } });
      if (existing && existing.id !== clientId) {
        throw new ConflictException('Ce numéro de téléphone est déjà utilisé par un autre compte.');
      }
      checkDailyOtpLimit(normalizedPhone);
      const existingOtp = await this.otpRepo.findUnique({ where: { telephone: normalizedPhone } });
      if (existingOtp && existingOtp.expiresAt.getTime() - OTP_EXPIRY_MS + OTP_COOLDOWN_MS > Date.now()) {
        throw new HttpException('Veuillez patienter avant de renvoyer un code.', HttpStatus.TOO_MANY_REQUESTS);
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
        this.logger.debug(`[DEV] OTP changement tél ${normalizedPhone}: ${code}`);
      }
      const sent = await this.smsProvider.sendWhatsAppOtp(normalizedPhone, code);
      if (!sent) {
        throw new HttpException("Impossible d'envoyer le code WhatsApp.", HttpStatus.SERVICE_UNAVAILABLE);
      }
      return { success: true, message: 'Code envoyé avec succès' };
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
        validateOtp(otpRecord, code, "Aucun code n'a été envoyé à cet email");
      } catch (error) {
        await this.handleOtpError(error, otpRecord);
      }
      // Verify the client still has this email
      const client = await this.clientRepo.findUnique({ where: { id: clientId }, select: { email: true } });
      if (!client || client.email !== normalizedEmail) {
        await this.otpRepo.delete({ where: { id: otpRecord!.id } });
        throw new BadRequestException('L\'email du profil ne correspond plus. Veuillez réessayer.');
      }
      await this.otpRepo.delete({ where: { id: otpRecord!.id } });
      await this.clientRepo.update({
        where: { id: clientId },
        data: { emailVerified: true },
      });
      return { success: true, message: 'Email vérifié avec succès' };
    } else {
      const normalizedPhone = this.normalizePhone(value);
      const otpRecord = await this.otpRepo.findUnique({ where: { telephone: normalizedPhone } });
      try {
        validateOtp(otpRecord, code, "Aucun code n'a été envoyé à ce numéro");
      } catch (error) {
        await this.handleOtpError(error, otpRecord);
      }
      const client = await this.clientRepo.findUnique({ where: { id: clientId }, select: { telephone: true } });
      if (!client || client.telephone !== normalizedPhone) {
        await this.otpRepo.delete({ where: { id: otpRecord!.id } });
        throw new BadRequestException('Le numéro du profil ne correspond plus. Veuillez réessayer.');
      }
      await this.otpRepo.delete({ where: { id: otpRecord!.id } });
      await this.clientRepo.update({
        where: { id: clientId },
        data: { telephoneVerified: true },
      });
      return { success: true, message: 'Numéro de téléphone vérifié avec succès' };
    }
  }
  // â”€â”€ Loi 09-08 — Droit d’accès aux données personnelles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  /**
   * Export all personal data for a client as required by Loi nÂ°09-08
   * (Protection des données personnelles au Maroc, supervisée par la CNDP).
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
      throw new BadRequestException('Client introuvable');
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
