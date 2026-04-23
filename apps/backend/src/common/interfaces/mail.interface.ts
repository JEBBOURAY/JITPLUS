// ── Mail Provider Interface ──────────────────────────────────────────────────
// Abstract away the email transport (SMTP/nodemailer, Resend, SendGrid, etc.).

/** Identifies which app is sending the email — controls branding/logo */
export type EmailSource = 'client' | 'merchant';

export interface IMailProvider {
  /** Send an OTP verification email (source controls branding: JitPlus vs JitPlus Pro) */
  sendOtpEmail(to: string, code: string, source?: EmailSource): Promise<void>;

  /** Send a welcome email to a new client */
  sendWelcomeClient(to: string, prenom?: string): Promise<void>;

  /** Send a welcome email to a new merchant */
  sendWelcomeMerchant(to: string, nomBoutique: string): Promise<void>;

  /** Send a referral bonus notification email */
  sendReferralBonus(
    to: string,
    referrerNom: string,
    newMerchantNom: string,
    newExpiry: Date | null,
  ): Promise<void>;

  /** Send a raw HTML email (used by marketing blast fallback) */
  sendRaw(to: string, subject: string, html: string, unsubscribeUrl?: string): Promise<void>;
}
