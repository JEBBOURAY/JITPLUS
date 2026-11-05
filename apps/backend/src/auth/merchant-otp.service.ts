import { Injectable, BadRequestException, HttpException, HttpStatus, Logger, Inject } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  OTP_REPOSITORY, type IOtpRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../common/repositories';
import { IMailProvider, MAIL_PROVIDER } from '../common/interfaces';
import { pickEmailLang } from '../mail/transactional-i18n';
import { BCRYPT_SALT_ROUNDS, OTP_MIN, OTP_MAX, OTP_EXPIRY_MS, OTP_COOLDOWN_MS } from '../common/constants';
import { hashOtp, checkOtpCode, otpDbOps } from '../common/utils/otp.helper';
import { OtpSendLimiter } from '../common/coordination/otp-send-limiter.service';
import { errMsg } from '../common/utils';
import { maskEmail } from '../common/utils/pii-mask';

/** Merchant email OTP flows: email verification and forgot / reset password. */
@Injectable()
export class MerchantOtpService {
  private readonly logger = new Logger(MerchantOtpService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(OTP_REPOSITORY) private otpRepo: IOtpRepository,
    @Inject(TRANSACTION_RUNNER) private txRunner: ITransactionRunner,
    @Inject(MAIL_PROVIDER) private mailProvider: IMailProvider,
    private otpSendLimiter: OtpSendLimiter,
  ) {}

  // ── Shared OTP helpers ───────────────────────────────────────

  /** Generate, upsert, and send an OTP email. Enforces daily limit + cooldown. */
  private async sendOtpForEmail(email: string, logLabel: string): Promise<void> {
    await this.otpSendLimiter.consume(email);

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
      this.logger.error(`OTP email delivery failed for ${maskEmail(email)}: ${err?.message}`, err?.stack);
      throw new HttpException('Impossible d\'envoyer l\'email. Veuillez réessayer.', HttpStatus.SERVICE_UNAVAILABLE, { cause: error });
    }
    this.logger.log(`${logLabel} OTP sent to ${maskEmail(email)}`);
  }

  /**
   * Find the OTP record and check the code. The attempt is reserved atomically
   * before comparing (see checkOtpCode), so parallel guesses cannot exceed
   * MAX_OTP_ATTEMPTS. The caller deletes the OTP inside its own transaction.
   */
  private async validateAndConsumeOtp(email: string, code: string, notFoundMsg: string): Promise<string> {
    const otpRecord = await this.otpRepo.findUnique({ where: { email } });

    const result = await checkOtpCode(otpRecord, code, notFoundMsg, otpDbOps(this.otpRepo));
    if (!result.ok) {
      throw new BadRequestException(`Code incorrect. ${result.remaining} tentative(s) restante(s).`);
    }

    return otpRecord!.id;
  }

  // ── Email Verification (merchant) ────────────────────────────

  async sendVerificationEmail(email: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    // Same answer whatever the account state, so this endpoint cannot tell
    // whether an email is registered or already verified.
    const genericResponse = { success: true, message: 'Si un compte existe avec cet email, un code a été envoyé.' };

    const merchant = await this.merchantRepo.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, emailVerified: true },
    });

    if (merchant && !merchant.emailVerified) {
      // Not awaited: cooldown / delivery errors and the SMTP latency would
      // otherwise reveal that the account exists.
      this.sendOtpForEmail(normalizedEmail, 'Verification')
        .catch((err) => this.logger.warn(`Verification OTP not sent: ${errMsg(err)}`));
    }

    return genericResponse;
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

    this.logger.log(`Email verified for ${maskEmail(normalizedEmail)}`);

    // Send welcome email now that OTP is validated
    this.mailProvider.sendWelcomeMerchant(normalizedEmail, merchantNom ?? '', pickEmailLang(merchantLang))
      .catch((err) => this.logger.warn('Welcome email failed', errMsg(err)));

    return { success: true, message: 'Email vérifié avec succès.' };
  }

  // ── Forgot Password ──────────────────────────────────────────

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

    this.logger.log(`Password reset successful for ${maskEmail(normalizedEmail)}`);

    return { success: true, message: 'Mot de passe réinitialisé avec succès.' };
  }
}
