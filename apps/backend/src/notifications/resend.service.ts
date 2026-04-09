import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { IEmailBlastProvider, EmailBlastResult, MerchantBlastInfo, IMailProvider, MAIL_PROVIDER } from '../common/interfaces';
import { buildMarketingBlastEmail } from '../mail/email-templates';

@Injectable()
export class ResendService implements IEmailBlastProvider {
  private readonly logger = new Logger(ResendService.name);
  private resend: Resend | null = null;
  private readonly fromAddress: string;

  constructor(
    private config: ConfigService,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: IMailProvider,
  ) {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    this.fromAddress = this.config.get<string>('RESEND_FROM', 'JitPlus <contact@jitplus.com>')?.trim();

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
    merchant: MerchantBlastInfo,
  ): Promise<EmailBlastResult> {
    if (recipients.length === 0) {
      return { total: 0, successCount: 0, failureCount: 0 };
    }

    const total = recipients.length;

    // Use Resend if available, otherwise fall back to SMTP via MailService
    if (this.resend) {
      return this.sendViaResend(recipients, subject, body, merchant);
    }

    return this.sendViaSmtp(recipients, subject, body, merchant);
  }

  private async sendViaResend(
    recipients: { email: string; prenom?: string | null }[],
    subject: string,
    body: string,
    merchant: MerchantBlastInfo,
  ): Promise<EmailBlastResult> {
    const total = recipients.length;

    const emails = recipients.map((r) => {
      return {
        from: this.fromAddress,
        to: [r.email],
        subject,
        html: buildMarketingBlastEmail(r.prenom || 'cher client', body, merchant),
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
    merchant: MerchantBlastInfo,
  ): Promise<EmailBlastResult> {
    const total = recipients.length;

    let successCount = 0;
    let failureCount = 0;

    for (const r of recipients) {
      const html = buildMarketingBlastEmail(r.prenom || 'cher client', body, merchant);

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
}
