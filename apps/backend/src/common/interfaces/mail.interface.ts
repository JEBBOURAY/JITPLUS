// ── Mail Provider Interface ──────────────────────────────────────────────────
// Abstract away the email transport (SMTP/nodemailer, Resend, SendGrid, etc.).

/** Identifies which app is sending the email — controls branding/logo */
export type EmailSource = 'client' | 'merchant';

/** Supported email locales for transactional & lifecycle emails */
export type MailLang = 'fr' | 'en' | 'ar';

/** Purpose tag of an OTP — drives subject/intro localization */
export type MailOtpPurpose =
  | 'login'
  | 'register'
  | 'reset'
  | 'change-email'
  | 'change-phone'
  | 'verification';

/** Plan email kind for expiry warnings */
export type MailPlanKind = 'trial' | 'premium';

/** Payout status email kind */
export type MailPayoutStatus = 'pending' | 'approved' | 'paid' | 'rejected';

export interface IMailProvider {
  /** Send an OTP verification email (source controls branding: JitPlus vs JitPlus Pro) */
  sendOtpEmail(
    to: string,
    code: string,
    source?: EmailSource,
    lang?: MailLang,
    purpose?: MailOtpPurpose,
  ): Promise<void>;

  /** Send a welcome email to a new client */
  sendWelcomeClient(to: string, prenom?: string, lang?: MailLang): Promise<void>;

  /** Send a welcome email to a new merchant */
  sendWelcomeMerchant(to: string, nomBoutique: string, lang?: MailLang): Promise<void>;

  /** Send a referral bonus notification email */
  sendReferralBonus(
    to: string,
    referrerNom: string,
    newMerchantNom: string,
    newExpiry: Date | null,
    lang?: MailLang,
  ): Promise<void>;

  /** Account deletion confirmation — merchant */
  sendAccountDeleted(to: string, nomBoutique: string, lang?: MailLang): Promise<void>;

  /** Account deletion confirmation — client */
  sendClientAccountDeleted(to: string, prenom?: string, lang?: MailLang): Promise<void>;

  /** Security alert: new login on the account */
  sendLoginAlert(
    to: string,
    who: string,
    deviceName: string | null,
    when: Date,
    lang?: MailLang,
  ): Promise<void>;

  /** Plan activated (Premium granted manually or by referral) */
  sendPlanActivated(to: string, expiresAt: Date | null, lang?: MailLang): Promise<void>;

  /** Plan revoked (admin downgraded merchant) */
  sendPlanRevoked(to: string, lang?: MailLang): Promise<void>;

  /** Plan expiring soon (3d / 1d trial or premium) */
  sendPlanExpiring(to: string, daysLeft: number, kind: MailPlanKind, lang?: MailLang): Promise<void>;

  /** Client payout status changes */
  sendPayoutStatus(
    to: string,
    status: MailPayoutStatus,
    amountFormatted: string,
    method: string,
    rejectReason?: string | null,
    lang?: MailLang,
  ): Promise<void>;

  /** Send a raw HTML email (used by marketing blast fallback) */
  sendRaw(to: string, subject: string, html: string, unsubscribeUrl?: string): Promise<void>;

  /**
   * Deliver a client-submitted content report to the moderation inbox.
   * App Store 1.2 / Play UGC Policy require a reporting channel with
   * timely action (within 24 h).
   */
  sendContentReport(params: {
    merchantId: string;
    merchantName: string;
    reporterId: string;
    reporterEmail: string;
    reason: string;
    details?: string;
  }): Promise<void>;
}
