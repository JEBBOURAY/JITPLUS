import { Injectable, UnauthorizedException, BadRequestException, ConflictException, ForbiddenException, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLIENT_REPOSITORY, type IClientRepository } from '../common/repositories';
import { createHmac } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_SALT_ROUNDS } from '../common/constants';
import { errMsg } from '../common/utils';
import { checkLockout, handleFailedLogin, resetLoginAttempts, LockoutDbOps } from '../common/utils/login-lockout.helper';
import { CLIENT_AUTH_SELECT, CLIENT_LOGIN_SELECT } from '../common/prisma-selects';
import { IMailProvider, MAIL_PROVIDER, ISmsProvider, SMS_PROVIDER } from '../common/interfaces';
import { pickEmailLang } from '../mail/transactional-i18n';
import { ClientClaimService } from '../merchant/services/client-claim.service';
import { ClientSessionService, type ClientAuthResponse } from './client-session.service';
import { normalizePhone, isValidPhone, extractCountryCode } from './client-phone.util';

export type { ClientAuthResponse } from './client-session.service';

/** Subset of client fields returned after profile / password update. */
export interface ClientProfileResult {
  success: boolean;
  client: Omit<ClientAuthResponse['client'], 'isNewUser'>;
}

/**
 * Client account: email + password login, password set / reset / change,
 * profile completion, QR token and personal data export.
 * Related flows live in sibling services: ClientSessionService (refresh/logout),
 * ClientOtpService (email OTP, change-contact OTP), ClientOAuthService (Google/Apple).
 */
@Injectable()
export class ClientAuthService {
  private readonly logger = new Logger(ClientAuthService.name);
  // Dummy hash for timing-safe comparison when user not found
  private static readonly DUMMY_HASH = '$2a$12$LJ3m4ys3Lz0KDlu0BRahYOiFMfGHgdOUmrGfEdKnXqJRikMOFbECi';

  constructor(
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    private configService: ConfigService,
    @Inject(MAIL_PROVIDER) private mailProvider: IMailProvider,
    @Inject(SMS_PROVIDER) private smsProvider: ISmsProvider,
    private clientClaimService: ClientClaimService,
    private sessions: ClientSessionService,
  ) {}

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
   * Complete profile for new users (prénom + nom + terms acceptance + optional password)
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
      shareInfoMerchants: false, // opt-out par défaut à l'inscription
      ...(dateNaissance ? { dateNaissance: new Date(dateNaissance) } : {}),
    };

    // If password provided, hash it and include in the atomic update.
    // Never overwrite an existing one: that would bypass change-password's
    // current-password check (and reset-password-otp's OTP proof).
    if (password) {
      const current = await this.clientRepo.findUnique({ where: { id: clientId }, select: { password: true } });
      if (current?.password) {
        throw new BadRequestException('Un mot de passe existe déjà. Utilisez le changement de mot de passe.');
      }
      data.password = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    }

    // If telephone provided (email-registered users), normalize and save it
    if (telephone) {
      const normalizedPhone = normalizePhone(telephone);
      if (!isValidPhone(normalizedPhone)) {
        throw new BadRequestException('error.auth.phoneInvalidFormat');
      }

      // Check uniqueness among active accounts only
      const existing = await this.clientRepo.findFirst({ where: { telephone: normalizedPhone, deletedAt: null } });
      if (existing && existing.id !== clientId) {
        if (existing.isAnonymous) {
          throw new ConflictException(
            await this.clientClaimService.buildAnonymousPhoneConflictPayload(existing.id),
          );
        }
        throw new ConflictException('Ce numéro de téléphone est déjà associé à un autre compte');
      }

      data.telephone = normalizedPhone;
      data.countryCode = extractCountryCode(normalizedPhone);
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
      const langRow = await this.clientRepo.findUnique({ where: { id: client.id }, select: { language: true } });
      this.mailProvider.sendWelcomeClient(client.email, client.prenom ?? undefined, pickEmailLang(langRow?.language))
        .catch((err) => this.logger.warn('Welcome email failed', errMsg(err)));
    }

    return {
      success: true,
      client: {
        id: client.id,
        prenom: client.prenom,
        nom: client.nom,
        email: client.email,
        emailVerified: client.emailVerified ?? false,
        telephone: client.telephone,
        telephoneVerified: client.telephoneVerified ?? false,
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

  // ── Email + Password Login ───────────────────────────────

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

    // Brute-force protection — check BEFORE bcrypt to avoid resource waste on locked accounts
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

    // Successful login — reset failed attempts
    await resetLoginAttempts(client, this.clientLockoutOps);

    return this.sessions.buildAuthResponse(client, false);
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
        emailVerified: client.emailVerified ?? false,
        telephone: client.telephone,
        telephoneVerified: client.telephoneVerified ?? false,
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
   * Unlike setPassword(), this allows overwriting an existing password, so the
   * caller's session must have been opened by an email OTP login within the
   * last OTP_PASSWORD_RESET_WINDOW_MS — a bare access token is not enough
   * (stolen token / unlocked phone would otherwise allow a takeover).
   */
  async resetPasswordOtp(clientId: string, newPassword: string, currentSessionId?: string): Promise<ClientProfileResult> {
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

    // Single use, consumed only once the new password is known to be valid.
    if (!(await this.sessions.consumeOtpProof(clientId, currentSessionId))) {
      throw new ForbiddenException('error.auth.otpReverifyRequired');
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    const updated = await this.clientRepo.update({
      where: { id: clientId },
      data: { password: hashedPassword },
      select: CLIENT_AUTH_SELECT,
    });
    await this.sessions.revokeOtherSessions(clientId, currentSessionId);

    return {
      success: true,
      client: {
        id: updated.id,
        prenom: updated.prenom,
        nom: updated.nom,
        email: updated.email,
        emailVerified: updated.emailVerified ?? false,
        telephone: updated.telephone,
        telephoneVerified: updated.telephoneVerified ?? false,
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
  async changePassword(clientId: string, currentPassword: string | undefined, newPassword: string, currentSessionId?: string): Promise<ClientProfileResult> {
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
      data: { password: hashedPassword },
      select: CLIENT_AUTH_SELECT,
    });
    await this.sessions.revokeOtherSessions(clientId, currentSessionId);

    return {
      success: true,
      client: {
        id: updated.id,
        prenom: updated.prenom,
        nom: updated.nom,
        email: updated.email,
        emailVerified: updated.emailVerified ?? false,
        telephone: updated.telephone,
        telephoneVerified: updated.telephoneVerified ?? false,
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
  // ── QR Token ──────────────────────────────────────────────
  /**
   * HMAC-signed permanent QR token for merchant scanning.
   *
   * Format v1: "v1." + base64url(clientId) + "." + HMAC-SHA256(secret, "v1:" + clientId)
   *
   * Product decision: the loyalty QR is bound to the client identity and must
   * remain valid indefinitely (no rotation, no single-use). The verifier still
   * accepts v0/v1/v2; v2 short-lived tokens are kept on the verifier side only
   * for backward compatibility with already-installed app versions.
   */
  async generateQrToken(clientId: string): Promise<{ qr_token: string; expiresAt: number | null }> {
    const client = await this.clientRepo.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) {
      throw new BadRequestException('error.auth.clientNotFound');
    }

    const secret = this.configService.getOrThrow<string>('QR_HMAC_SECRET');
    const idPart = Buffer.from(client.id).toString('base64url');
    const sig = createHmac('sha256', secret)
      .update(`v1:${client.id}`)
      .digest('base64url');
    const qr_token = `v1.${idPart}.${sig}`;

    return { qr_token, expiresAt: null };
  }
  // ── Loi 09-08 — Droit d’accès aux données personnelles ────────────────────────
  /**
   * Export all personal data for a client as required by Loi n°09-08
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
