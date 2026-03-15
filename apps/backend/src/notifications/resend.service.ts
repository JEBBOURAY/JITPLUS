import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { IEmailBlastProvider, EmailBlastResult, IMailProvider, MAIL_PROVIDER } from '../common/interfaces';
import { EMAIL_LOGO_JITPLUS } from '../common/constants';

/** Escape user-supplied values before interpolating into HTML email templates */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

@Injectable()
export class ResendService implements IEmailBlastProvider {
  private readonly logger = new Logger(ResendService.name);
  private resend: Resend | null = null;
  private readonly fromAddress: string;

  constructor(
    private config: ConfigService,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: IMailProvider,
  ) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.fromAddress = this.config.get<string>('RESEND_FROM', 'JitPlus <contact@jitplus.com>');

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('Resend email service configured');
    } else {
      this.logger.log('RESEND_API_KEY not configured — using SMTP (MailService) for marketing emails');
    }
  }

  /**
   * Send a marketing email blast to multiple recipients.
   * Uses Resend Batch API for efficiency (up to 100 emails per batch call).
   */
  async sendBlast(
    recipients: { email: string; prenom?: string | null }[],
    subject: string,
    body: string,
    merchantName: string,
  ): Promise<EmailBlastResult> {
    if (recipients.length === 0) {
      return { total: 0, successCount: 0, failureCount: 0 };
    }

    const total = recipients.length;

    // Use Resend if available, otherwise fall back to SMTP via MailService
    if (this.resend) {
      return this.sendViaResend(recipients, subject, body, merchantName);
    }

    return this.sendViaSmtp(recipients, subject, body, merchantName);
  }

  private async sendViaResend(
    recipients: { email: string; prenom?: string | null }[],
    subject: string,
    body: string,
    merchantName: string,
  ): Promise<EmailBlastResult> {
    const total = recipients.length;
    const safeMerchantName = escapeHtml(merchantName);

    const emails = recipients.map((r) => {
      const safeName = escapeHtml(r.prenom || 'cher client');
      const safeBody = escapeHtml(body);
      return {
        from: this.fromAddress,
        to: [r.email],
        subject,
        html: this.buildEmailHtml(safeName, safeBody, safeMerchantName),
      };
    });

    let successCount = 0;
    let failureCount = 0;

    const BATCH_SIZE = 100;
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      try {
        const { data, error } = await this.resend!.batch.send(batch);
        if (error) {
          this.logger.error(`Resend batch error: ${JSON.stringify(error)}`);
          failureCount += batch.length;
        } else {
          successCount += data?.data?.length ?? batch.length;
          this.logger.log(`Resend batch sent: ${data?.data?.length ?? batch.length} email(s)`);
        }
      } catch (err) {
        this.logger.error(`Resend batch exception: ${err}`);
        failureCount += batch.length;
      }
    }

    this.logger.log(`[Resend] Email blast "${subject}" completed: ${successCount} success, ${failureCount} failures out of ${total}`);
    return { total, successCount, failureCount };
  }

  private async sendViaSmtp(
    recipients: { email: string; prenom?: string | null }[],
    subject: string,
    body: string,
    merchantName: string,
  ): Promise<EmailBlastResult> {
    const total = recipients.length;
    const safeMerchantName = escapeHtml(merchantName);

    let successCount = 0;
    let failureCount = 0;

    for (const r of recipients) {
      const safeName = escapeHtml(r.prenom || 'cher client');
      const safeBody = escapeHtml(body);
      const html = this.buildEmailHtml(safeName, safeBody, safeMerchantName);

      try {
        await this.mailProvider.sendRaw(r.email, subject, html);
        successCount++;
      } catch (err) {
        this.logger.error(`SMTP send failed for ${r.email}: ${err}`);
        failureCount++;
      }
    }

    this.logger.log(`[SMTP] Email blast "${subject}" completed: ${successCount} success, ${failureCount} failures out of ${total}`);
    return { total, successCount, failureCount };
  }

  /**
   * Build a branded HTML email template for marketing blasts.
   * These are sent on behalf of a merchant to their clients → JitPlus branding.
   */
  private buildEmailHtml(clientName: string, body: string, merchantName: string): string {
    // Convert newlines to <br> for proper rendering
    const formattedBody = body.replace(/\n/g, '<br/>');

    return `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #FAFAFA; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="${EMAIL_LOGO_JITPLUS}" alt="JitPlus" width="48" height="48" style="border-radius: 12px; margin-bottom: 10px;" />
          <h1 style="font-size: 26px; font-weight: 800; letter-spacing: -0.5px; margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #7C3AED;">JitPlus</h1>
          <p style="color: #64748B; font-size: 14px; margin-top: 4px;">Un message de <strong>${merchantName}</strong></p>
        </div>
        <div style="background: #FFFFFF; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          <p style="color: #1E1B4B; font-size: 16px; margin: 0 0 16px;">Bonjour ${clientName},</p>
          <div style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
            ${formattedBody}
          </div>
        </div>
        <div style="text-align: center; margin-top: 24px;">
          <p style="color: #64748B; font-size: 12px; margin: 0;">
            Vous recevez cet e-mail car vous êtes client de <strong>${merchantName}</strong> via JitPlus.
          </p>
          <p style="color: #94A3B8; font-size: 11px; margin-top: 8px;">
            © ${new Date().getFullYear()} JitPlus — Tous droits réservés
          </p>
        </div>
      </div>
    `;
  }
}
