import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { IMailProvider, EmailSource } from '../common/interfaces';
import { EMAIL_LOGO_JITPLUS, EMAIL_LOGO_JITPLUS_PRO } from '../common/constants';

/** Escape user-supplied values before interpolating into HTML email templates */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Brand config per source app */
interface BrandConfig {
  name: string;
  logo: string;
  accent: string;       // primary accent color
  accentLight: string;  // light tint for backgrounds
  accentMuted: string;  // muted text
}

const BRANDS: Record<'client' | 'merchant', BrandConfig> = {
  client: {
    name: 'JitPlus',
    logo: EMAIL_LOGO_JITPLUS,
    accent: '#7C3AED',
    accentLight: '#F3F0FF',
    accentMuted: '#8B83B0',
  },
  merchant: {
    name: 'JitPlus Pro',
    logo: EMAIL_LOGO_JITPLUS_PRO,
    accent: '#1F2937',
    accentLight: '#F1F5F9',
    accentMuted: '#64748B',
  },
};

/**
 * Brand header HTML with logo image and app name.
 */
function brandHeader(brand: BrandConfig, subtitle: string): string {
  return `
    <div style="text-align: center; margin-bottom: 28px;">
      <img src="${brand.logo}" alt="${brand.name}" width="64" height="64" style="border-radius: 16px; margin-bottom: 12px;" />
      <h1 style="
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.5px;
        margin: 0 0 4px;
        font-family: 'Segoe UI', Arial, sans-serif;
        color: ${brand.accent};
      ">${brand.name}</h1>
      <p style="color: ${brand.accentMuted}; font-size: 14px; margin: 0;">${subtitle}</p>
    </div>`;
}

@Injectable()
export class MailService implements IMailProvider {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT', 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

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
   */
  async sendOtpEmail(to: string, code: string, source: EmailSource = 'client'): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM', 'JitPlus <contact@jitplus.com>');
    const brand = BRANDS[source];

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FAFAFA; border-radius: 16px;">
        ${brandHeader(brand, source === 'merchant' ? 'Espace commerçant' : 'Votre programme de fidélité')}
        <div style="background: #FFFFFF; border-radius: 12px; padding: 24px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          <p style="color: #1E1B4B; font-size: 16px; margin: 0 0 16px;">Votre code de vérification :</p>
          <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; display: inline-block;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: ${brand.accent};">${escapeHtml(code)}</span>
          </div>
          <p style="color: ${brand.accentMuted}; font-size: 13px; margin-top: 16px;">
            Ce code expire dans <strong>5 minutes</strong>.<br/>
            Si vous n'avez pas demandé ce code, ignorez cet email.
          </p>
        </div>
        <p style="text-align: center; color: #94A3B8; font-size: 12px; margin-top: 24px;">
          © ${new Date().getFullYear()} ${brand.name} — Tous droits réservés
        </p>
      </div>
    `;

    if (!this.transporter) {
      this.logger.warn(`[NO SMTP] OTP email for ${to}: ${code}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `${code} — Votre code ${brand.name}`,
        html,
      });
      this.logger.log(`OTP email sent to ${to} (${source})`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${to}`, error);
    }
  }

  /**
   * Send a welcome email to a new client (JitPlus app)
   */
  async sendWelcomeClient(to: string, prenom?: string): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM', 'JitPlus <contact@jitplus.com>');
    const brand = BRANDS.client;
    const name = escapeHtml(prenom || 'cher client');

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FAFAFA; border-radius: 16px;">
        ${brandHeader(brand, 'Votre programme de fidélité')}
        <div style="background: #FFFFFF; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">Bienvenue ${name} ! 🎉</h2>
          <p style="color: ${brand.accent}; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
            Votre compte JitPlus a été créé avec succès. Vous pouvez désormais :
          </p>
          <ul style="color: #1E1B4B; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0 0 16px;">
            <li>Cumuler des points chez vos commerçants préférés</li>
            <li>Profiter de récompenses exclusives</li>
            <li>Scanner votre QR code en magasin</li>
          </ul>
          <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 0;">
            Ouvrez l'application JitPlus et commencez à fidéliser dès maintenant !
          </p>
        </div>
        <p style="text-align: center; color: #94A3B8; font-size: 12px; margin-top: 24px;">
          © ${new Date().getFullYear()} JitPlus — Tous droits réservés
        </p>
      </div>
    `;

    await this.send(to, from, 'Bienvenue sur JitPlus ! 🎉', html, 'welcome-client');
  }

  /**
   * Send a welcome email to a new merchant (JitPlus Pro app)
   */
  async sendWelcomeMerchant(to: string, nomBoutique: string): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM', 'JitPlus <contact@jitplus.com>');
    const brand = BRANDS.merchant;

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FAFAFA; border-radius: 16px;">
        ${brandHeader(brand, 'Espace commerçant')}
        <div style="background: #FFFFFF; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">Bienvenue sur JitPlus Pro ! 🚀</h2>
          <p style="color: ${brand.accent}; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
            Votre commerce <strong>${escapeHtml(nomBoutique)}</strong> est maintenant enregistré sur JitPlus.
          </p>
          <ul style="color: #1E1B4B; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0 0 16px;">
            <li>Scannez les QR codes de vos clients pour leur attribuer des points</li>
            <li>Créez des récompenses attractives</li>
            <li>Suivez vos statistiques en temps réel</li>
            <li>Gérez votre équipe facilement</li>
          </ul>
          <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 0;">
            Connectez-vous à l'application JitPlus Pro pour commencer à fidéliser vos clients !
          </p>
        </div>
        <p style="text-align: center; color: #94A3B8; font-size: 12px; margin-top: 24px;">
          © ${new Date().getFullYear()} JitPlus Pro — Tous droits réservés
        </p>
      </div>
    `;

    await this.send(to, from, `Bienvenue sur JitPlus Pro, ${escapeHtml(nomBoutique)} ! 🚀`, html, 'welcome-merchant');
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
    const from = this.configService.get<string>('SMTP_FROM', 'JitPlus <contact@jitplus.com>');
    const brand = BRANDS.merchant;
    const safeReferrerNom = escapeHtml(referrerNom);
    const safeNewMerchantNom = escapeHtml(newMerchantNom);
    const expiryStr = newExpiry
      ? newExpiry.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
      : null;

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FAFAFA; border-radius: 16px;">
        ${brandHeader(brand, 'Espace commerçant')}
        <div style="background: #FFFFFF; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">🎁 Vous avez gagné 1 mois offert !</h2>
          <p style="color: ${brand.accent}; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
            Bonjour <strong>${safeReferrerNom}</strong>,
          </p>
          <p style="color: #1E1B4B; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
            Le commerce <strong>${safeNewMerchantNom}</strong> vient de s'inscrire sur JitPlus Pro avec votre code de parrainage.
          </p>
          <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 16px;">
            <p style="color: ${brand.accent}; font-size: 16px; font-weight: 700; margin: 0;">
              +1 mois Premium offert
            </p>
            ${expiryStr ? `<p style="color: ${brand.accentMuted}; font-size: 13px; margin: 6px 0 0;">Votre abonnement Premium est valable jusqu'au <strong>${expiryStr}</strong>.</p>` : ''}
          </div>
          <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 0;">
            Continuez à partager votre code pour cumuler encore plus de mois gratuits !
          </p>
        </div>
        <p style="text-align: center; color: #94A3B8; font-size: 12px; margin-top: 24px;">
          © ${new Date().getFullYear()} JitPlus Pro — Tous droits réservés
        </p>
      </div>
    `;

    await this.send(to, from, `🎁 ${safeNewMerchantNom} a rejoint JitPlus grâce à vous — 1 mois offert !`, html, 'referral-bonus');
  }

  /**
   * Send a raw HTML email — used by marketing blast SMTP fallback.
   * Throws on failure so the caller can track success/failure counts.
   */
  async sendRaw(to: string, subject: string, html: string): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM', 'JitPlus <contact@jitplus.com>');
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
