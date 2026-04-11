import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { IMailProvider, EmailSource } from '../common/interfaces';
import {
  escapeHtml,
  buildOtpEmail,
  getOtpSubject,
  buildWelcomeClientEmail,
  buildWelcomeMerchantEmail,
  buildReferralBonusEmail,
} from './email-templates';

@Injectable()
export class MailService implements IMailProvider {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;
  private readonly fromAddress: string;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const port = parseInt(String(this.configService.get('SMTP_PORT', 587)), 10);
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const pass = this.configService.get<string>('SMTP_PASS')?.trim();
    this.fromAddress = this.configService.get<string>('SMTP_FROM', 'JitPlus <contact@jitplus.com>')?.trim();

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
  async sendOtpEmail(to: string, code: string, source: EmailSource = 'client'): Promise<void> {
    const html = buildOtpEmail(code, source);
    const subject = getOtpSubject(code, source);

    if (!this.transporter) {
      this.logger.warn(`[NO SMTP] OTP email for ${to}: ${code}`);
      throw new Error('SMTP not configured — cannot send OTP email');
    }

    try {
      await this.transporter.sendMail({ from: this.fromAddress, to, subject, html });
      this.logger.log(`OTP email sent to ${to} (${source})`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${to}`, error);
      throw error;
    }
  }

  /**
   * Send a welcome email to a new client (JitPlus app)
   */
  async sendWelcomeClient(to: string, prenom?: string): Promise<void> {
    const html = buildWelcomeClientEmail(prenom);
    await this.send(to, this.fromAddress, 'Bienvenue sur JitPlus ! 🎉', html, 'welcome-client');
  }

  /**
   * Send a welcome email to a new merchant (JitPlus Pro app)
   */
  async sendWelcomeMerchant(to: string, nomBoutique: string): Promise<void> {
    const html = buildWelcomeMerchantEmail(nomBoutique);
    await this.send(to, this.fromAddress, `Bienvenue sur JitPlus Pro, ${escapeHtml(nomBoutique)} ! 🚀`, html, 'welcome-merchant');
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
  ): Promise<void> {
    const safeNewMerchantNom = escapeHtml(newMerchantNom);
    const safeReferrerNom = escapeHtml(referrerNom);
    const html = buildReferralBonusEmail(referrerNom, newMerchantNom, newExpiry);
    await this.send(to, this.fromAddress, `🎁 ${safeNewMerchantNom} a rejoint JitPlus grâce à vous — 1 mois offert !`, html, 'referral-bonus');
  }

  /**
   * Send a raw HTML email — used by marketing blast SMTP fallback.
   * Throws on failure so the caller can track success/failure counts.
   */
  async sendRaw(to: string, subject: string, html: string): Promise<void> {
    const from = this.fromAddress;
    if (!this.transporter) {
      throw new Error('SMTP not configured');
    }
    await this.transporter.sendMail({ from, to, subject, html });
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
      await this.transporter.sendMail({ from, to, subject, html });
      this.logger.log(`${tag} email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send ${tag} email to ${to}`, error);
    }
  }
}
