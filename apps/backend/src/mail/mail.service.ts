import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  IMailProvider,
  EmailSource,
  MailLang,
  MailOtpPurpose,
  MailPlanKind,
  MailPayoutStatus,
} from '../common/interfaces';
import {
  escapeHtml,
  buildOtpEmail,
  getOtpSubject,
  buildWelcomeClientEmail,
  buildWelcomeMerchantEmail,
  buildReferralBonusEmail,
  buildAccountDeletedEmail,
  buildClientAccountDeletedEmail,
  buildLoginAlertEmail,
  buildPlanActivatedEmail,
  buildPlanRevokedEmail,
  buildPlanExpiringEmail,
  buildPayoutStatusEmail,
} from './email-templates';
import {
  WELCOME_CLIENT_I18N,
  WELCOME_MERCHANT_I18N,
  REFERRAL_I18N,
  ACCOUNT_DELETED_I18N,
  LOGIN_ALERT_I18N,
  PLAN_EMAIL_I18N,
} from './transactional-i18n';

@Injectable()
export class MailService implements IMailProvider {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;
  private readonly fromAddress: string;
  private readonly replyToAddress: string;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const port = parseInt(String(this.configService.get('SMTP_PORT', 587)), 10);
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const pass = this.configService.get<string>('SMTP_PASS')?.trim();
    this.fromAddress = this.configService.get<string>('SMTP_FROM', 'JitPlus <contact@jitplus.com>')?.trim();
    // Reply-To: where users replying to a transactional email actually land (support).
    this.replyToAddress =
      this.configService.get<string>('SMTP_REPLY_TO')?.trim() || this.fromAddress;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log(`Mail transporter configured (${host}:${port})`);
    } else {
      this.logger.warn('SMTP not configured — emails will be logged to console only');
    }
  }

  /**
   * Send an OTP code email — branding depends on source app.
   * 'client' → JitPlus branding | 'merchant' → JitPlus Pro branding
   * Throws on failure so callers can inform the user correctly.
   */
  async sendOtpEmail(
    to: string,
    code: string,
    source: EmailSource = 'client',
    lang: MailLang = 'fr',
    purpose: MailOtpPurpose = 'verification',
  ): Promise<void> {
    const html = buildOtpEmail(code, source, lang, purpose);
    const subject = getOtpSubject(code, source, lang, purpose);

    if (!this.transporter) {
      this.logger.warn(`[NO SMTP] OTP email for ${to}: ${code}`);
      throw new Error('SMTP not configured — cannot send OTP email');
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
        replyTo: this.replyToAddress,
      });
      this.logger.log(`OTP email sent to ${to} (${source}/${lang})`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${to}`, error);
      throw error;
    }
  }

  /**
   * Send a welcome email to a new client (JitPlus app)
   */
  async sendWelcomeClient(to: string, prenom?: string, lang: MailLang = 'fr'): Promise<void> {
    const html = buildWelcomeClientEmail(prenom, lang);
    const subject = WELCOME_CLIENT_I18N[lang].subject;
    await this.send(to, this.fromAddress, subject, html, 'welcome-client');
  }

  /**
   * Send a welcome email to a new merchant (JitPlus Pro app)
   */
  async sendWelcomeMerchant(
    to: string,
    nomBoutique: string,
    lang: MailLang = 'fr',
  ): Promise<void> {
    const html = buildWelcomeMerchantEmail(nomBoutique, lang);
    const subject = WELCOME_MERCHANT_I18N[lang].subject(nomBoutique);
    await this.send(to, this.fromAddress, subject, html, 'welcome-merchant');
  }

  /**
   * Notify a referrer that they earned 1 free month because a new merchant
   * registered using their referral code.
   */
  async sendReferralBonus(
    to: string,
    referrerNom: string,
    newMerchantNom: string,
    newExpiry: Date | null,
    lang: MailLang = 'fr',
  ): Promise<void> {
    const html = buildReferralBonusEmail(referrerNom, newMerchantNom, newExpiry, lang);
    const subject = REFERRAL_I18N[lang].subject(newMerchantNom);
    await this.send(to, this.fromAddress, subject, html, 'referral-bonus');
  }

  /**
   * Notify a merchant that their account has been permanently deleted.
   * Sent AFTER successful deletion — best-effort (errors do not fail the flow).
   * Required by GDPR Art. 17 + App Store 5.1.1(v) + Google Play Account Deletion Policy.
   */
  async sendAccountDeleted(
    to: string,
    nomBoutique: string,
    lang: MailLang = 'fr',
  ): Promise<void> {
    const html = buildAccountDeletedEmail(nomBoutique, lang);
    const subject = ACCOUNT_DELETED_I18N[lang].subjectMerchant;
    await this.send(to, this.fromAddress, subject, html, 'account-deleted');
  }

  /**
   * Notify a client that their JitPlus account has been permanently deleted.
   * Sent AFTER successful deletion — best-effort.
   */
  async sendClientAccountDeleted(
    to: string,
    prenom?: string,
    lang: MailLang = 'fr',
  ): Promise<void> {
    const html = buildClientAccountDeletedEmail(prenom, lang);
    const subject = ACCOUNT_DELETED_I18N[lang].subjectClient;
    await this.send(to, this.fromAddress, subject, html, 'client-account-deleted');
  }

  /**
   * Security alert: new login detected on the account.
   * Best-effort — failures are logged but do not block authentication.
   */
  async sendLoginAlert(
    to: string,
    who: string,
    deviceName: string | null,
    when: Date,
    lang: MailLang = 'fr',
  ): Promise<void> {
    const html = buildLoginAlertEmail(who, deviceName, when, lang);
    const subject = LOGIN_ALERT_I18N[lang].subject;
    await this.send(to, this.fromAddress, subject, html, 'login-alert');
  }

  /** Plan activated — Premium granted (admin or referral). */
  async sendPlanActivated(
    to: string,
    expiresAt: Date | null,
    lang: MailLang = 'fr',
  ): Promise<void> {
    const html = buildPlanActivatedEmail(expiresAt, lang);
    const subject = PLAN_EMAIL_I18N[lang].activatedSubject;
    await this.send(to, this.fromAddress, subject, html, 'plan-activated');
  }

  /** Plan revoked by admin. */
  async sendPlanRevoked(to: string, lang: MailLang = 'fr'): Promise<void> {
    const html = buildPlanRevokedEmail(lang);
    const subject = PLAN_EMAIL_I18N[lang].revokedSubject;
    await this.send(to, this.fromAddress, subject, html, 'plan-revoked');
  }

  /** Plan expiring soon (e.g. 3 days, 1 day). */
  async sendPlanExpiring(
    to: string,
    daysLeft: number,
    kind: MailPlanKind,
    lang: MailLang = 'fr',
  ): Promise<void> {
    const html = buildPlanExpiringEmail(daysLeft, kind, lang);
    const subject = PLAN_EMAIL_I18N[lang].expiringSubject(daysLeft);
    await this.send(to, this.fromAddress, subject, html, 'plan-expiring');
  }

  /** Client payout status update (pending / approved / paid / rejected). */
  async sendPayoutStatus(
    to: string,
    status: MailPayoutStatus,
    amountFormatted: string,
    method: string,
    rejectReason: string | null = null,
    lang: MailLang = 'fr',
  ): Promise<void> {
    const { subject, html } = buildPayoutStatusEmail(
      status,
      amountFormatted,
      method,
      rejectReason,
      lang,
    );
    await this.send(to, this.fromAddress, subject, html, `payout-${status}`);
  }

  /**
   * Deliver a content report to the moderation inbox.
   * Used by the client-facing "Signaler ce commerce" flow (App Store 1.2 /
   * Play UGC Policy). The report is sent to the admin mailbox so moderation
   * can act within 24 hours as required.
   */
  async sendContentReport(params: {
    merchantId: string;
    merchantName: string;
    reporterId: string;
    reporterEmail: string;
    reason: string;
    details?: string;
  }): Promise<void> {
    const to = this.configService.get<string>('MODERATION_EMAIL')?.trim()
      || this.configService.get<string>('ADMIN_EMAIL')?.trim()
      || 'contact@jitplus.com';const safe = {
      merchantId: escapeHtml(params.merchantId),
      merchantName: escapeHtml(params.merchantName),
      reporterId: escapeHtml(params.reporterId),
      reporterEmail: escapeHtml(params.reporterEmail),
      reason: escapeHtml(params.reason),
      details: params.details ? escapeHtml(params.details) : '—',
    };
    const subject = `[Signalement] ${safe.merchantName} — ${safe.reason}`;
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111">
      <h2 style="color:#b91c1c;margin:0 0 16px">Nouveau signalement de commerce</h2>
      <p><strong>Commerce :</strong> ${safe.merchantName} (<code>${safe.merchantId}</code>)</p>
      <p><strong>Motif :</strong> ${safe.reason}</p>
      <p><strong>Détails :</strong><br/>${safe.details}</p>
      <hr/>
      <p style="font-size:12px;color:#666"><strong>Reporter :</strong> ${safe.reporterEmail} (<code>${safe.reporterId}</code>)</p>
      <p style="font-size:12px;color:#666">Action attendue sous 24 h — voir admin console.</p>
    </body></html>`;
    await this.send(to, this.fromAddress, subject, html, 'content-report');
  }

  /**
   * Send a raw HTML email — used by marketing blast SMTP fallback.
   * Throws on failure so the caller can track success/failure counts.
   * @param unsubscribeUrl - Optional one-click unsubscribe URL (RFC 8058).
   *   When provided, adds List-Unsubscribe and List-Unsubscribe-Post headers
   *   required by Gmail/Yahoo bulk sender policy (Feb 2024).
   */
  async sendRaw(to: string, subject: string, html: string, unsubscribeUrl?: string): Promise<void> {
    const from = this.fromAddress;
    if (!this.transporter) {
      throw new Error('SMTP not configured');
    }
    const safeSubject = escapeHtml(subject);
    const safeHtml = this.sanitizeRawHtml(html);
    const headers: Record<string, string> = {};
    if (unsubscribeUrl) {
      headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
    await this.transporter.sendMail({ from, to, subject: safeSubject, html: safeHtml, headers, replyTo: this.replyToAddress });
  }

  /**
   * Internal send helper — handles missing SMTP gracefully
   */
  private async send(to: string, from: string, subject: string, html: string, tag: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`[NO SMTP] ${tag} email to ${to} not sent`);
      return;
    }

    try {
      await this.transporter.sendMail({ from, to, subject, html, replyTo: this.replyToAddress });
      this.logger.log(`${tag} email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send ${tag} email to ${to}`, error);
    }
  }

  /**
   * Best-effort sanitization for admin-provided HTML payloads.
   * Removes script/style tags, inline event handlers, and javascript: URLs.
   */
  private sanitizeRawHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
      .replace(/javascript\s*:/gi, '');
  }
}
