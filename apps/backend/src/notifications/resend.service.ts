import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Resend } from 'resend';
import { IEmailBlastProvider, EmailBlastResult, MerchantBlastInfo, IMailProvider, MAIL_PROVIDER } from '../common/interfaces';
import { buildMarketingBlastEmail } from '../mail/email-templates';
import { pickEmailLang } from '../mail/transactional-i18n';

type Recipient = { email: string; prenom?: string | null; lang?: string | null; clientId?: string };

@Injectable()
export class ResendService implements IEmailBlastProvider {
  private readonly logger = new Logger(ResendService.name);
  private resend: Resend | null = null;
  private readonly fromAddress: string;
  private readonly replyTo: string;
  private readonly publicApiUrl: string | undefined;
  /** mailto fallback for the List-Unsubscribe header (RFC 2369). */
  private readonly unsubscribeMailto: string;

  constructor(
    private config: ConfigService,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: IMailProvider,
    private readonly jwt: JwtService,
  ) {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    this.fromAddress = this.config.get<string>('RESEND_FROM', 'JitPlus <contact@jitplus.com>')?.trim();
    this.replyTo = this.config.get<string>('SMTP_REPLY_TO')?.trim() || 'contact@jitplus.com';
    this.publicApiUrl = this.config.get<string>('PUBLIC_API_URL')?.trim();
    this.unsubscribeMailto = `mailto:${this.replyTo}?subject=unsubscribe`;

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('Resend email service configured');
    } else {
      this.logger.log('RESEND_API_KEY not configured — using SMTP (MailService) for marketing emails');
    }
  }

  /**
   * Build a per-recipient RFC 8058 one-click unsubscribe URL.
   * Returns undefined when we don't have enough info (no clientId or no PUBLIC_API_URL).
   * Without this header Gmail/Yahoo bulk-sender rules (Feb 2024+) will demote
   * marketing mail to spam.
   */
  private buildUnsubscribeUrl(clientId?: string): string | undefined {
    if (!clientId || !this.publicApiUrl) return undefined;
    try {
      const token = this.jwt.sign(
        { clientId, purpose: 'unsubscribe_email' },
        { expiresIn: '365d' },
      );
      return `${this.publicApiUrl.replace(/\/$/, '')}/public/unsubscribe/email?t=${encodeURIComponent(token)}`;
    } catch {
      return undefined;
    }
  }

  /**
   * Build the RFC 8058 + RFC 2369 headers required by Gmail/Yahoo bulk senders.
   * - List-Unsubscribe: must contain at least one https URL OR a mailto.
   * - List-Unsubscribe-Post: triggers one-click unsubscribe in the inbox UI.
   * - List-Id: improves filter rule reliability and reputation grouping.
   */
  private buildAntiSpamHeaders(clientId?: string): Record<string, string> {
    const url = this.buildUnsubscribeUrl(clientId);
    const headers: Record<string, string> = {
      'List-Id': 'JitPlus Marketing <marketing.jitplus.com>',
      'X-Entity-Ref-ID': `jp-${Date.now()}`,
    };
    if (url) {
      headers['List-Unsubscribe'] = `<${url}>, <${this.unsubscribeMailto}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    } else {
      // No client-specific URL — at least give a mailto so providers can extract one.
      headers['List-Unsubscribe'] = `<${this.unsubscribeMailto}>`;
    }
    return headers;
  }

  /**
   * Send a marketing email blast to multiple recipients.
   * Uses Resend Batch API for efficiency (up to 100 emails per batch call).
   */
  async sendBlast(
    recipients: Recipient[],
    subject: string,
    body: string,
    merchant: MerchantBlastInfo,
  ): Promise<EmailBlastResult> {
    if (recipients.length === 0) {
      return { total: 0, successCount: 0, failureCount: 0 };
    }

    // Use Resend if available, otherwise fall back to SMTP via MailService
    if (this.resend) {
      return this.sendViaResend(recipients, subject, body, merchant);
    }

    return this.sendViaSmtp(recipients, subject, body, merchant);
  }

  private async sendViaResend(
    recipients: Recipient[],
    subject: string,
    body: string,
    merchant: MerchantBlastInfo,
  ): Promise<EmailBlastResult> {
    const total = recipients.length;

    // Reply-To: prefer the merchant's address so customer responses land
    // directly in the merchant's inbox (better engagement signals → less spam).
    const replyTo = merchant.email?.trim() || this.replyTo;

    const emails = recipients.map((r) => ({
      from: this.fromAddress,
      to: [r.email],
      reply_to: replyTo,
      subject,
      html: buildMarketingBlastEmail(r.prenom || 'cher client', body, merchant, pickEmailLang(r.lang)),
      headers: this.buildAntiSpamHeaders(r.clientId),
      // Resend "tags" feed engagement metrics back into Resend's reputation
      // engine, helping IP/domain warm-up.
      tags: [
        { name: 'category', value: 'marketing' },
        ...(merchant.nom
          ? [{ name: 'merchant', value: merchant.nom.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) }]
          : []),
      ],
    }));

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
    recipients: Recipient[],
    subject: string,
    body: string,
    merchant: MerchantBlastInfo,
  ): Promise<EmailBlastResult> {
    const total = recipients.length;

    let successCount = 0;
    let failureCount = 0;

    for (const r of recipients) {
      const html = buildMarketingBlastEmail(r.prenom || 'cher client', body, merchant, pickEmailLang(r.lang));

      try {
        // SMTP fallback: MailService already adds the List-Unsubscribe header
        // when given a URL — keep parity with the JWT-signed token used elsewhere.
        await this.mailProvider.sendRaw(r.email, subject, html, this.buildUnsubscribeUrl(r.clientId));
        successCount++;
      } catch (err) {
        this.logger.error(`SMTP send failed for ${r.email}: ${err}`);
        failureCount++;
      }
    }

    this.logger.log(`[SMTP] Email blast "${subject}" completed: ${successCount} success, ${failureCount} failures out of ${total}`);
    return { total, successCount, failureCount };
  }
}
