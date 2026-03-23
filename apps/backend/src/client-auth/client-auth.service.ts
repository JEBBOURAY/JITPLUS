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
import { OTP_MIN, OTP_MAX, OTP_EXPIRY_MS, OTP_COOLDOWN_MS, MAX_OTP_ATTEMPTS, BCRYPT_SALT_ROUNDS, MAX_OTP_SENDS_PER_DAY } from '../common/constants';
import { errMsg } from '../common/utils';
import { checkLockout, handleFailedLogin, resetLoginAttempts, LockoutDbOps } from '../common/utils/login-lockout.helper';
import { CLIENT_AUTH_SELECT, CLIENT_LOGIN_SELECT } from '../common/prisma-selects';
import { validateOtp, handleOtpMismatch, hashOtp, OtpDbOps, OtpRecord } from '../common/utils/otp.helper';
import { IMailProvider, MAIL_PROVIDER, ISmsProvider, SMS_PROVIDER } from '../common/interfaces';
import { OAuth2Client } from 'google-auth-library';

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
    telephone: string | null;
    termsAccepted: boolean;
    shareInfoMerchants: boolean;
    notifPush: boolean;
    notifWhatsapp: boolean;
    dateNaissance: Date | null;
    createdAt: Date;
  };
}

/** Subset of client fields returned after profile / password update. */
export interface ClientProfileResult {
  success: boolean;
  client: Omit<ClientAuthResponse['client'], 'isNewUser'> & { hasPassword?: boolean };
}

@Injectable()
export class ClientAuthService {
  private readonly logger = new Logger(ClientAuthService.name);
  private readonly googleClient: OAuth2Client;
  // Dummy hash for timing-safe comparison when user not found
  private static readonly DUMMY_HASH = '$2a$12$LJ3m4ys3Lz0KDlu0BRahYOiFMfGHgdOUmrGfEdKnXqJRikMOFbECi';

  /** In-memory daily OTP send counter: identifier → { count, resetAt } */
  private readonly otpDailyCounter = new Map<string, { count: number; resetAt: number }>();

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

  /**
   * Enforce daily OTP limit per identifier (phone or email).
   * Throws 429 if the identifier has exceeded MAX_OTP_SENDS_PER_DAY.
   */
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
      // Reset or create counter for next 24 hours
      this.otpDailyCounter.set(identifier, { count: 1, resetAt: now + 86_400_000 });
    }
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
    this.checkDailyOtpLimit(normalizedPhone);

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

    // In dev only, log the code for convenience
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`[DEV] OTP pour ${normalizedPhone}: ${code}`);
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
      await this.otpRepo.delete({ where: { id: otpRecord.id } }).catch((err) =>
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
      telephone: string | null;
      googleId?: string | null;
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

    // Generate & persist hashed refresh token (rotation)
    const refresh_token = this.generateRefreshToken();
    await this.clientRepo.update({
      where: { id: client.id },
      data: { refreshTokenHash: this.hashRefreshToken(refresh_token) },
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
        telephone: client.telephone ?? null,
        termsAccepted: client.termsAccepted ?? false,
        shareInfoMerchants: client.shareInfoMerchants ?? false,
        notifPush: client.notifPush ?? true,
        notifWhatsapp: client.notifWhatsapp ?? true,
        dateNaissance: client.dateNaissance ?? null,
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
      data: { refreshTokenHash: null },
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
      select: CLIENT_AUTH_SELECT,
    });

    if (!client) {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
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

    await this.clientRepo.update({
      where: { id: client.id },
      data: { refreshTokenHash: this.hashRefreshToken(new_refresh_token) },
    });

    return {
      access_token,
      refresh_token: new_refresh_token,
      client: {
        id: client.id,
        prenom: client.prenom ?? null,
        nom: client.nom,
        email: client.email,
        telephone: client.telephone ?? null,
        termsAccepted: client.termsAccepted,
        shareInfoMerchants: client.shareInfoMerchants,
        notifPush: client.notifPush,
        notifWhatsapp: client.notifWhatsapp,
        dateNaissance: client.dateNaissance ?? null,
        createdAt: client.createdAt,
      },
    };
  }

  // â”€â”€ Email OTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Send OTP to email address
   */
  async sendOtpEmail(email: string, isRegister = false): Promise<{ success: boolean; message: string }> {
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

    // Daily OTP send limit per email
    this.checkDailyOtpLimit(normalizedEmail);

    // Per-identifier cooldown — prevent OTP spam even if IP changes
    const existingOtp = await this.otpRepo.findUnique({ where: { email: normalizedEmail } });
    if (existingOtp && existingOtp.expiresAt.getTime() - OTP_EXPIRY_MS + OTP_COOLDOWN_MS > Date.now()) {
      throw new HttpException('Veuillez patienter avant de renvoyer un code.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = randomInt(OTP_MIN, OTP_MAX).toString();
    const codeHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    // Upsert OTP by email (hash only — never store plaintext)
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

    // Send OTP email — client-facing branding (JitPlus, not JitPlus Pro)
    await this.mailProvider.sendOtpEmail(normalizedEmail, code, 'client');

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
            nom: null,
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

    return this.buildAuthResponse(resolvedClient, isNewUser);
  }

  // â”€â”€ Google Login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Login with Google ID token
   * Verifies the token using google-auth-library (verifyIdToken)
   */
  async googleLogin(idToken: string): Promise<ClientAuthResponse> {
    try {
      // Dev bypass: accept fake token ONLY in development environment
      if (process.env.NODE_ENV === 'development' && idToken === 'dev-google-token') {
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
      // Accept both Web and Android client IDs as valid audiences
      const webClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
      const androidClientId = this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID');
      const allowedAudiences = [webClientId, androidClientId].filter(Boolean) as string[];
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

      const isNewUser = !client || !client.nom;

      if (!client) {
        try {
          client = await this.clientRepo.create({
            data: {
              email: email.toLowerCase(),
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

      return this.buildAuthResponse(client, isNewUser);
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      this.logger.error('Google login failed:', error);
      throw new UnauthorizedException('Échec de la connexion Google');
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

      // Check uniqueness
      const existing = await this.clientRepo.findUnique({ where: { telephone: normalizedPhone } });
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
        telephone: client.telephone,
        termsAccepted: client.termsAccepted,
        shareInfoMerchants: client.shareInfoMerchants,
        notifPush: client.notifPush,
        notifWhatsapp: client.notifWhatsapp,
        dateNaissance: client.dateNaissance,
        createdAt: client.createdAt,        ...(password ? { hasPassword: true } : {}),      },
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
        telephone: client.telephone,
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

  // â”€â”€ QR Token â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  /**
   * Permanent HMAC-signed QR token for merchant scanning.
   * Format: base64url(clientId) + "." + HMAC-SHA256(secret, clientId)
   * Deterministic & never expires — safe to share as image.
   */
  async generateQrToken(clientId: string): Promise<{ qr_token: string }> {
    const client = await this.clientRepo.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) {
      throw new BadRequestException('Client introuvable');
    }

    const secret = this.configService.getOrThrow<string>('QR_HMAC_SECRET');
    const idPart = Buffer.from(client.id).toString('base64url');
    const sig = createHmac('sha256', secret).update(client.id).digest('base64url');
    const qr_token = `${idPart}.${sig}`;

    return { qr_token };
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
