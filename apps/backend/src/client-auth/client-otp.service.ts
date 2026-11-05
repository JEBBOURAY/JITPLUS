import { Injectable, UnauthorizedException, BadRequestException, ConflictException, Logger, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  OTP_REPOSITORY, type IOtpRepository,
} from '../common/repositories';
import { OTP_MIN, OTP_MAX, OTP_EXPIRY_MS, OTP_COOLDOWN_MS } from '../common/constants';
import { CLIENT_AUTH_SELECT } from '../common/prisma-selects';
import { checkOtpCode, otpDbOps, hashOtp, OtpRecord } from '../common/utils/otp.helper';
import { OtpSendLimiter } from '../common/coordination/otp-send-limiter.service';
import { IMailProvider, MAIL_PROVIDER, ISmsProvider, SMS_PROVIDER } from '../common/interfaces';
import { pickEmailLang } from '../mail/transactional-i18n';
import { ClientClaimService } from '../merchant/services/client-claim.service';
import { maskEmail } from '../common/utils/pii-mask';
import { ClientSessionService, type ClientAuthResponse } from './client-session.service';
import { normalizePhone, isValidPhone } from './client-phone.util';

/**
 * Client OTP flows: email OTP sign-in / sign-up, and the change-contact OTP
 * (email or WhatsApp) that proves ownership of a new email / phone.
 */
@Injectable()
export class ClientOtpService {
  private readonly logger = new Logger(ClientOtpService.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(OTP_REPOSITORY) private otpRepo: IOtpRepository,
    @Inject(MAIL_PROVIDER) private mailProvider: IMailProvider,
    @Inject(SMS_PROVIDER) private smsProvider: ISmsProvider,
    private clientClaimService: ClientClaimService,
    private otpSendLimiter: OtpSendLimiter,
    private sessions: ClientSessionService,
  ) {}

  /**
   * Check an OTP code (attempt reserved atomically before comparing — see
   * checkOtpCode). Throws the user-facing error on any failure.
   */
  private async verifyOtpCode(otpRecord: OtpRecord | null, code: string, notFoundMessage: string): Promise<void> {
    const result = await checkOtpCode(otpRecord, code, notFoundMessage, otpDbOps(this.otpRepo));
    if (!result.ok) {
      const { remaining } = result;
      throw new UnauthorizedException(
        `Code invalide (${remaining} essai${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''})`,
      );
    }
  }

  // ── Email OTP ─────────────────────────────────────────

  /**
   * Send OTP to email address
   */
  async sendOtpEmail(email: string, isRegister = false): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new BadRequestException('error.auth.emailInvalid');
    }

    // SECURITY: Anti-enumeration — return identical response regardless of account existence.
    // Silently skip OTP when account state doesn't match intent (register vs login),
    // EXCEPT if the account exists but the profile was never completed (ghost account).
    const existingClient = await this.clientRepo.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, nom: true, prenom: true },
    });

    const isGhostAccount = existingClient && (!existingClient.nom || !existingClient.prenom);
    const GENERIC_OTP_MESSAGE = 'Si un compte correspond, un code a été envoyé par email.';

    if (isRegister && existingClient && !isGhostAccount) {
      // Valid account already exists — don't send OTP but return same success response
      return { success: true, message: GENERIC_OTP_MESSAGE };
    }

    if (!isRegister && !existingClient) {
      // No account found — don't send OTP but return same success response
      return { success: true, message: GENERIC_OTP_MESSAGE };
    }

    // Daily OTP send limit per email
    await this.otpSendLimiter.consume(normalizedEmail);

    // Per-identifier cooldown — prevent OTP spam even if IP changes
    const existingOtp = await this.otpRepo.findUnique({ where: { email: normalizedEmail } });
    if (existingOtp && existingOtp.expiresAt.getTime() - OTP_EXPIRY_MS + OTP_COOLDOWN_MS > Date.now()) {
      throw new HttpException('error.auth.otpWait', HttpStatus.TOO_MANY_REQUESTS);
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
    try {
      const existingClient = await this.clientRepo.findUnique({
        where: { email: normalizedEmail },
        select: { language: true },
      });
      const lang = pickEmailLang(existingClient?.language);
      await this.mailProvider.sendOtpEmail(normalizedEmail, code, 'client', lang);
    } catch (error) {
      const err = error as { message?: string; stack?: string };
      this.logger.error(`OTP email delivery failed for ${maskEmail(normalizedEmail)}: ${err?.message}`, err?.stack);
      throw new HttpException('error.auth.emailFail', HttpStatus.SERVICE_UNAVAILABLE, { cause: error });
    }

    this.logger.log(`OTP envoyé à ${maskEmail(normalizedEmail)}`);

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

    await this.verifyOtpCode(otpRecord, code, 'Aucun code n\'a été envoyé à cet email');

    const [consumed, client] = await Promise.all([
      this.otpRepo.deleteMany({ where: { id: otpRecord!.id } }),
      this.clientRepo.findUnique({ where: { email: normalizedEmail }, select: CLIENT_AUTH_SELECT }),
    ]);
    // Single use: a concurrent request with the same code already consumed it.
    if (consumed.count !== 1) {
      throw new BadRequestException('Code déjà utilisé. Veuillez redemander un code');
    }

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
    if (resolvedClient && !resolvedClient.emailVerified) {
      await this.clientRepo.update({ where: { id: resolvedClient.id }, data: { emailVerified: true } });
      resolvedClient.emailVerified = true;
    }

    return this.sessions.buildAuthResponse(resolvedClient, isNewUser);
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
        throw new BadRequestException('error.auth.emailInvalid');
      }
      const existing = await this.clientRepo.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
      if (existing && existing.id !== clientId) {
        throw new ConflictException('Cette adresse email est déjà utilisée par un autre compte.');
      }
      await this.otpSendLimiter.consume(normalizedEmail);
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
        const existingClient = await this.clientRepo.findUnique({
          where: { email: normalizedEmail },
          select: { language: true },
        });
        const lang = pickEmailLang(existingClient?.language);
        await this.mailProvider.sendOtpEmail(normalizedEmail, code, 'client', lang);
      } catch (error) {
        const err = error as { message?: string; stack?: string };
        this.logger.error(`OTP email delivery failed for ${maskEmail(normalizedEmail)}: ${err?.message}`, err?.stack);
        throw new HttpException('error.auth.emailFail', HttpStatus.SERVICE_UNAVAILABLE, { cause: error });
      }
      return { success: true, message: 'Code envoyé par email' };
    } else {
      const normalizedPhone = normalizePhone(value);
      if (!isValidPhone(normalizedPhone)) {
        throw new BadRequestException('error.auth.phoneInvalidFormat');
      }
      const existing = await this.clientRepo.findUnique({ where: { telephone: normalizedPhone }, select: { id: true, isAnonymous: true } });
      if (existing && existing.id !== clientId) {
        if (existing.isAnonymous) {
          throw new ConflictException(
            await this.clientClaimService.buildAnonymousPhoneConflictPayload(existing.id),
          );
        }
        throw new ConflictException('Ce numéro de téléphone est déjà utilisé par un autre compte.');
      }
      await this.otpSendLimiter.consume(normalizedPhone);
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
        this.logger.debug(`[DEV] OTP changement tél ${normalizedPhone}: ${code}`);
      }
      const sent = await this.smsProvider.sendWhatsAppOtp(normalizedPhone, code);
      if (!sent) {
        throw new HttpException('error.auth.whatsappFail', HttpStatus.SERVICE_UNAVAILABLE);
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
      await this.verifyOtpCode(otpRecord, code, "Aucun code n'a été envoyé à cet email");
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
      return { success: true, message: 'Email vérifié avec succès' };
    } else {
      const normalizedPhone = normalizePhone(value);
      const otpRecord = await this.otpRepo.findUnique({ where: { telephone: normalizedPhone } });
      await this.verifyOtpCode(otpRecord, code, "Aucun code n'a été envoyé à ce numéro");
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
      return { success: true, message: 'Numéro de téléphone vérifié avec succès' };
    }
  }
}
