import { Injectable, Logger } from '@nestjs/common';
import { ISmsProvider } from '../interfaces/sms.interface';

/**
 * No-op SMS/WhatsApp provider used when Twilio (or another real provider) is not configured.
 * All calls log a warning and return `false` so that callers can fall back to email/push.
 */
@Injectable()
export class NoopSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(NoopSmsProvider.name);

  async sendWhatsAppOtp(to: string, _code: string): Promise<boolean> {
    this.logger.warn(`[noop-sms] sendWhatsAppOtp skipped for ${to} (no provider configured)`);
    return false;
  }

  async sendWhatsAppMessage(to: string, _body: string): Promise<boolean> {
    this.logger.warn(`[noop-sms] sendWhatsAppMessage skipped for ${to} (no provider configured)`);
    return false;
  }
}
