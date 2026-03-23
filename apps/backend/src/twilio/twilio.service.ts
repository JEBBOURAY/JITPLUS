import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';
import { ISmsProvider } from '../common/interfaces';

@Injectable()
export class TwilioService implements ISmsProvider {
  private readonly logger = new Logger(TwilioService.name);
  private client: Twilio | null = null;
  private readonly whatsappFrom: string;
  private readonly otpContentSid?: string;
  private readonly marketingContentSid?: string;

  private toWhatsappAddress(value: string): string {
    const v = value.trim();
    return v.startsWith('whatsapp:') ? v : `whatsapp:${v}`;
  }

  constructor(private configService: ConfigService) {
    // GCP Secret Manager values may contain trailing whitespace/newlines — always trim
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID')?.trim();
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN')?.trim();
    this.whatsappFrom = this.toWhatsappAddress(
      this.configService.get<string>('TWILIO_WHATSAPP_FROM', 'whatsapp:+14155238886'),
    );
    const rawContentSid = this.configService.get<string>('TWILIO_OTP_CONTENT_SID')?.trim();
    this.otpContentSid = rawContentSid && rawContentSid.startsWith('HX') ? rawContentSid : undefined;

    const rawMarketingSid = this.configService.get<string>('TWILIO_MARKETING_CONTENT_SID')?.trim();
    this.marketingContentSid = rawMarketingSid && rawMarketingSid.startsWith('HX') ? rawMarketingSid : undefined;

    if (accountSid && authToken) {
      this.client = twilio(accountSid, authToken);
      this.logger.log(`Twilio WhatsApp client initialized (from=${this.whatsappFrom}, otp=${this.otpContentSid ? 'template' : 'plain'}, marketing=${this.marketingContentSid ? 'template' : 'plain'})`);
    } else {
      this.logger.warn('Twilio credentials missing — WhatsApp OTP will be logged only');
    }
  }

  /**
   * Send an OTP code via WhatsApp.
   * Uses a pre-approved Content Template when `TWILIO_OTP_CONTENT_SID` is set,
   * otherwise falls back to a plain text message (works in sandbox mode).
   *
   * @returns `true` if the message was accepted by Twilio, `false` otherwise.
   */
  async sendWhatsAppOtp(to: string, code: string): Promise<boolean> {
    if (!this.client) {
      this.logger.warn(`[NO-CLIENT] OTP ${code} for ${to} — Twilio not configured`);
      return false;
    }

    const destination = this.toWhatsappAddress(to);

    try {
      if (this.otpContentSid) {
        try {
          // Content Template approach (required for production WhatsApp Business)
          await this.client.messages.create({
            from: this.whatsappFrom,
            to: destination,
            contentSid: this.otpContentSid,
            contentVariables: JSON.stringify({ '1': code }),
          });
        } catch (templateError: unknown) {
          const templateErrMsg = templateError instanceof Error ? templateError.message : String(templateError);
          // Some accounts fail because of template approval / locale / variables mismatch.
          // Fallback to plain text avoids OTP outage while template is being fixed.
          this.logger.warn(`OTP template send failed, retrying as plain text: ${templateErrMsg}`);
          await this.client.messages.create({
            from: this.whatsappFrom,
            to: destination,
            body: `Votre code de vérification JitPlus est : *${code}*. Il expire dans 5 minutes.`,
          });
        }
      } else {
        // Plain text — works in Twilio sandbox
        await this.client.messages.create({
          from: this.whatsappFrom,
          to: destination,
          body: `Votre code de vérification JitPlus est : *${code}*. Il expire dans 5 minutes.`,
        });
      }

      this.logger.log(`WhatsApp OTP sent to ${to}`);
      return true;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const twilioCode = (error as any)?.code;
      const twilioStatus = (error as any)?.status;
      this.logger.error(
        `WhatsApp OTP to ${to} failed: ${errMsg}` +
        (twilioCode ? ` [code=${twilioCode}]` : '') +
        (twilioStatus ? ` [status=${twilioStatus}]` : '') +
        ` (from=${this.whatsappFrom}, template=${this.otpContentSid ?? 'none'})`,
      );
      return false;
    }
  }

  /**
   * Send a marketing / promo message via WhatsApp.
   * Uses Content Template (`TWILIO_MARKETING_CONTENT_SID`) when configured,
   * otherwise falls back to plain text (only works inside 24h session window).
   */
  async sendWhatsAppMessage(to: string, body: string): Promise<boolean> {
    if (!this.client) {
      this.logger.warn(`[NO-CLIENT] WhatsApp msg to ${to} — Twilio not configured`);
      return false;
    }

    const destination = this.toWhatsappAddress(to);

    try {
      if (this.marketingContentSid) {
        try {
          await this.client.messages.create({
            from: this.whatsappFrom,
            to: destination,
            contentSid: this.marketingContentSid,
            contentVariables: JSON.stringify({ '1': body }),
          });
        } catch (templateError: unknown) {
          const templateErrMsg = templateError instanceof Error ? templateError.message : String(templateError);
          this.logger.warn(`Marketing template send failed, retrying as plain text: ${templateErrMsg}`);
          await this.client.messages.create({
            from: this.whatsappFrom,
            to: destination,
            body,
          });
        }
      } else {
        // Plain text — works inside 24h session window (user just did OTP)
        await this.client.messages.create({
          from: this.whatsappFrom,
          to: destination,
          body,
        });
      }
      this.logger.log(`WhatsApp message sent to ${to} (template=${!!this.marketingContentSid})`);
      return true;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const twilioCode = (error as any)?.code;
      const twilioStatus = (error as any)?.status;
      this.logger.error(
        `WhatsApp message to ${to} failed: ${errMsg}` +
        (twilioCode ? ` [code=${twilioCode}]` : '') +
        (twilioStatus ? ` [status=${twilioStatus}]` : '') +
        ` (from=${this.whatsappFrom}, template=${this.marketingContentSid ?? 'none'})`,
      );
      return false;
    }
  }
}
