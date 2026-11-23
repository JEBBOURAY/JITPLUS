import { Injectable, BadRequestException, ConflictException, Logger, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  OTP_REPOSITORY, type IOtpRepository,
} from '../common/repositories';
import { OTP_MIN, OTP_MAX, CLIENT_OTP_EXPIRY_MS as OTP_EXPIRY_MS } from '../common/constants';
import { CLIENT_AUTH_SELECT } from '../common/prisma-selects';
import { checkOtpCode, otpDbOps, hashOtp, otpSentRecently, OtpRecord, OTP_DECOY_CODE } from '../common/utils/otp.helper';
import { OtpSendLimiter } from '../common/coordination/otp-send-limiter.service';
import { IMailProvider, MAIL_PROVIDER, ISmsProvider, SMS_PROVIDER } from '../common/interfaces';
import { pickEmailLang } from '../mail/transactional-i18n';
import type { AppLang } from '../common/utils/app-lang';
import { ClientClaimService } from '../merchant/services/client-claim.service';
import { maskEmail } from '../common/utils/pii-mask';
import { ClientSessionService, type ClientAuthResponse } from './client-session.service';
import { normalizePhone, isValidPhone, extractCountryCode } from './client-phone.util';
import { releaseUnverifiedEmail, releaseUnverifiedPhone } from './email-ownership.util';

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
    const result = await checkOtpCode(otpRecord, code, notFoundMessage, otpDbOps(this.otpRepo), {
      expired: 'error.auth.otpExpired',
      tooManyAttempts: 'error.auth.otpTooManyAttempts',
    });
    if (!result.ok) {
      // 400, not 401: the app answers a 401 by refreshing the session and replaying
      // the request, which burned a second attempt on every wrong code.
      throw new BadRequestException(result.remaining === 1 ? 'error.auth.otpInvalidLastTry' : 'error.auth.otpInvalid');
    }
  }

  /** Daily cap, with the message of the client app (the limiter is shared with Pro). */
  private async consumeSendQuota(identifier: string): Promise<void> {
    try {
      await this.otpSendLimiter.consume(identifier);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        throw new HttpException('error.auth.otpDailyLimit', HttpStatus.TOO_MANY_REQUESTS);
      }
      throw error;
    }
  }

  // ── Email OTP ─────────────────────────────────────────

  /**
   * Send OTP to email address.
   * `codeSent` is for the caller's own bookkeeping (sign-up funnel) and must
   * never reach the response: it tells whether the address has an account.
   */
  async sendOtpEmail(email: string, isRegister = false, requestLang: AppLang = 'fr'): Promise<{ success: boolean; message: string; codeSent: boolean }> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new BadRequestException('error.auth.emailInvalid');
    }

    // SECURITY: Anti-enumeration — return identical response regardless of account existence.
    // Silently skip OTP when account state doesn't match intent (register vs login),
    // EXCEPT if the profile was never completed (ghost account) or the account only
    // claims this email without having verified it: verifyOtpEmail then lets the
    // inbox owner finish signing up, so they must receive the code.
    const existingClient = await this.clientRepo.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, prenom: true, emailVerified: true, language: true },
    });

    // The first name marks a finished sign-up (the last name is optional).
    const isGhostAccount = existingClient && !existingClient.prenom;
    const GENERIC_OTP_MESSAGE = 'Si un compte correspond, un code a été envoyé par email.';

    // Valid account on sign-up: its owner is told by email, the screen stays generic.
    const accountExists = isRegister && !!existingClient?.emailVerified && !isGhostAccount;
    // Nothing to send to an unknown address on the forgot-password path.
    const nobodyToEmail = !isRegister && !existingClient;

    // Per-identifier cooldown — prevent OTP spam even if IP changes.
    // Checked first: a refused request sends nothing and must not use up the daily quota.
    const existingOtp = await this.otpRepo.findUnique({ where: { email: normalizedEmail } });
    if (existingOtp && otpSentRecently(existingOtp)) {
      throw new HttpException('error.auth.otpWait', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Daily OTP send limit per email
    await this.consumeSendQuota(normalizedEmail);

    // Stored in every case, even when the code is never sent: the cooldown then
    // answers the same whether or not the address has an account.
    // Nothing is sent to an unknown address: a decoy, so Pro does not see a pending code.
    const code = randomInt(OTP_MIN, OTP_MAX).toString();
    const codeHash = nobodyToEmail ? OTP_DECOY_CODE : hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    // Unknown address with a row already there: that row can be a pending Pro
    // (merchant) code, since both apps share the table. Never overwrite it.
    if (nobodyToEmail && existingOtp) return { success: true, message: GENERIC_OTP_MESSAGE, codeSent: false };

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
        createdAt: new Date(),
      },
    });

    if (nobodyToEmail) return { success: true, message: GENERIC_OTP_MESSAGE, codeSent: false };

    // Send OTP email — client-facing branding (JitPlus, not JitPlus Pro)
    try {
      // No account yet on sign-up: the language of the app is all we know.
      const lang = pickEmailLang(existingClient?.language ?? requestLang);
      if (accountExists) {
        await this.mailProvider.sendAccountExistsClient(normalizedEmail, lang);
      } else {
        // Login by code and forgot-password share isRegister=false: only sign-up can be named.
        await this.mailProvider.sendOtpEmail(normalizedEmail, code, 'client', lang, isRegister ? 'register' : 'verification');
      }
    } catch (error) {
      const err = error as { message?: string; stack?: string };
      this.logger.error(`OTP email delivery failed for ${maskEmail(normalizedEmail)}: ${err?.message}`, err?.stack);
      await this.forgetUndeliveredOtp({ email: normalizedEmail });
      throw new HttpException('error.auth.emailFail', HttpStatus.SERVICE_UNAVAILABLE, { cause: error });
    }

    this.logger.log(`OTP envoyé à ${maskEmail(normalizedEmail)}`);

    return { success: true, message: GENERIC_OTP_MESSAGE, codeSent: !accountExists };
  }

  /** A code that never left must not hold the cooldown: the user is told to retry. */
  private async forgetUndeliveredOtp(where: { email: string } | { telephone: string }): Promise<void> {
    await this.otpRepo.deleteMany({ where }).catch((e: unknown) => {
      this.logger.warn(`Could not remove undelivered OTP: ${String(e)}`);
    });
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

    await this.verifyOtpCode(otpRecord, code, 'error.auth.otpNotSentEmail');

    const [consumed, client] = await Promise.all([
      this.otpRepo.deleteMany({ where: { id: otpRecord!.id } }),
      this.clientRepo.findUnique({ where: { email: normalizedEmail }, select: CLIENT_AUTH_SELECT }),
    ]);
    // Single use: a concurrent request with the same code already consumed it.
    if (consumed.count !== 1) {
      throw new BadRequestException('error.auth.otpAlreadyUsed');
    }

    let resolvedClient = client;

    // The account only *claims* this email (set via profile edit, never
    // verified): proving the inbox must not log into it — that would hand the
    // inbox owner's future data to whoever typed the email (pre-hijack).
    // Login: behave as if no account exists. Register: drop the claim and
    // create the owner's own account.
    if (resolvedClient && !resolvedClient.emailVerified) {
      if (!isRegister) {
        throw new BadRequestException('error.auth.noAccountForEmail');
      }
      await releaseUnverifiedEmail(this.clientRepo, resolvedClient.id, normalizedEmail);
      resolvedClient = null;
    }

    // Same definition as the ghost account of sendOtpEmail: a sign-up abandoned
    // before the profile step resumes here instead of hitting "email exists".
    const isNewUser = !resolvedClient || !resolvedClient.prenom;

    if (!resolvedClient) {
      // Login mode: reject if no account exists
      if (!isRegister) {
        throw new BadRequestException('error.auth.noAccountForEmail');
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
    } else if (isRegister && !isNewUser) {
      // User tried to register but a complete account already exists
      throw new ConflictException('error.auth.emailExists');
    }

    // otpVerified: this session may reset the password once (forgot-password flow).
    return this.sessions.buildAuthResponse(resolvedClient, isNewUser, { otpVerified: true });
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
      // An unverified claim does not hold the address: proving the inbox takes it over.
      const existing = await this.clientRepo.findUnique({ where: { email: normalizedEmail }, select: { id: true, emailVerified: true } });
      if (existing && existing.id !== clientId && existing.emailVerified) {
        throw new ConflictException('error.auth.emailExists');
      }
      const existingOtp = await this.otpRepo.findUnique({ where: { email: normalizedEmail } });
      if (existingOtp && otpSentRecently(existingOtp)) {
        throw new HttpException('error.auth.otpWait', HttpStatus.TOO_MANY_REQUESTS);
      }
      await this.consumeSendQuota(normalizedEmail);
      const code = randomInt(OTP_MIN, OTP_MAX).toString();
      const codeHash = hashOtp(code);
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
      await this.otpRepo.upsert({
        where: { email: normalizedEmail },
        create: { email: normalizedEmail, code: codeHash, expiresAt },
        update: { code: codeHash, expiresAt, attempts: 0, createdAt: new Date() },
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
        await this.forgetUndeliveredOtp({ email: normalizedEmail });
        throw new HttpException('error.auth.emailFail', HttpStatus.SERVICE_UNAVAILABLE, { cause: error });
      }
      return { success: true, message: 'Code envoyé par email' };
    } else {
      const normalizedPhone = normalizePhone(value);
      if (!isValidPhone(normalizedPhone)) {
        throw new BadRequestException('error.auth.phoneInvalidFormat');
      }
      const existing = await this.clientRepo.findUnique({
        where: { telephone: normalizedPhone },
        select: { id: true, isAnonymous: true, telephoneVerified: true },
      });
      if (existing && existing.id !== clientId) {
        if (existing.isAnonymous) {
          throw new ConflictException(
            await this.clientClaimService.buildAnonymousPhoneConflictPayload(existing.id),
          );
        }
        // Unverified on another account = typed, never proven: whoever receives
        // the code may claim it (applied in verifyChangeContactOtp). A verified
        // number stays with its owner.
        if (existing.telephoneVerified) throw new ConflictException('error.auth.phoneExists');
      }
      const existingOtp = await this.otpRepo.findUnique({ where: { telephone: normalizedPhone } });
      if (existingOtp && otpSentRecently(existingOtp)) {
        throw new HttpException('error.auth.otpWait', HttpStatus.TOO_MANY_REQUESTS);
      }
      await this.consumeSendQuota(normalizedPhone);
      const code = randomInt(OTP_MIN, OTP_MAX).toString();
      const codeHash = hashOtp(code);
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
      await this.otpRepo.upsert({
        where: { telephone: normalizedPhone },
        create: { telephone: normalizedPhone, code: codeHash, expiresAt },
        update: { code: codeHash, expiresAt, attempts: 0, createdAt: new Date() },
      });
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug(`[DEV] OTP changement tél ${normalizedPhone}: ${code}`);
      }
      const sent = await this.smsProvider.sendWhatsAppOtp(normalizedPhone, code);
      if (!sent) {
        await this.forgetUndeliveredOtp({ telephone: normalizedPhone });
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
      await this.verifyOtpCode(otpRecord, code, 'error.auth.otpNotSentEmail');
      const client = await this.clientRepo.findUnique({ where: { id: clientId }, select: { email: true } });
      await this.otpRepo.delete({ where: { id: otpRecord!.id } });
      if (!client) throw new BadRequestException('error.auth.clientNotFound');
      // A new address is applied only now, once proven: an account never ends up
      // with an email its owner cannot use for "forgot password".
      if (client.email !== normalizedEmail) {
        const holder = await this.clientRepo.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, emailVerified: true },
        });
        if (holder && (holder.emailVerified || !(await releaseUnverifiedEmail(this.clientRepo, holder.id, normalizedEmail)))) {
          throw new ConflictException('error.auth.emailExists');
        }
      }
      try {
        await this.clientRepo.update({
          where: { id: clientId },
          data: { email: normalizedEmail, emailVerified: true },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('error.auth.emailExists');
        }
        throw error;
      }
      return { success: true, message: 'Email vérifié avec succès' };
    } else {
      const normalizedPhone = normalizePhone(value);
      const otpRecord = await this.otpRepo.findUnique({ where: { telephone: normalizedPhone } });
      await this.verifyOtpCode(otpRecord, code, 'error.auth.otpNotSentPhone');
      const client = await this.clientRepo.findUnique({ where: { id: clientId }, select: { telephone: true } });
      await this.otpRepo.delete({ where: { id: otpRecord!.id } });
      if (!client) throw new BadRequestException('error.auth.clientNotFound');
      // As for the email: the code is the proof, so a new number is applied only
      // now. It is the one moment a number may leave another account, and only
      // when that account never proved it (security review 2026-11-21: a plain
      // profile update used to take it, with no proof at all).
      if (client.telephone !== normalizedPhone) {
        const holder = await this.clientRepo.findUnique({
          where: { telephone: normalizedPhone },
          select: { id: true, isAnonymous: true, telephoneVerified: true },
        });
        if (holder && holder.id !== clientId) {
          if (holder.isAnonymous) {
            throw new ConflictException(
              await this.clientClaimService.buildAnonymousPhoneConflictPayload(holder.id),
            );
          }
          if (holder.telephoneVerified || !(await releaseUnverifiedPhone(this.clientRepo, holder.id, normalizedPhone))) {
            throw new ConflictException('error.auth.phoneExists');
          }
        }
      }
      try {
        await this.clientRepo.update({
          where: { id: clientId },
          data: { telephone: normalizedPhone, countryCode: extractCountryCode(normalizedPhone), telephoneVerified: true },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('error.auth.phoneExists');
        }
        throw error;
      }
      return { success: true, message: 'Numéro de téléphone vérifié avec succès' };
    }
  }
}
