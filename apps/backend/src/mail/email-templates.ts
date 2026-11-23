import { EMAIL_LOGO_JITPLUS, EMAIL_LOGO_JITPLUS_PRO, OTP_EXPIRY_MS, CLIENT_OTP_EXPIRY_MS } from '../common/constants';
import { EmailSource, MerchantBlastInfo } from '../common/interfaces';
import {
  EmailLang, FOOTER_I18N, OTP_I18N, OtpPurpose,
  ACCOUNT_EXISTS_CLIENT_I18N, WELCOME_CLIENT_I18N, WELCOME_MERCHANT_I18N, REFERRAL_I18N, ACCOUNT_DELETED_I18N,
  LOGIN_ALERT_I18N, PLAN_EMAIL_I18N, PAYOUT_I18N, MARKETING_BLAST_I18N,
  PRIVACY_URL_CLIENT, TERMS_URL_CLIENT, PRIVACY_URL_PRO, TERMS_URL_PRO,
  SUPPORT_EMAIL, COMPANY_LEGAL,
} from './transactional-i18n';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Brand configuration ─────────────────────────────────────────────────────

interface BrandConfig {
  name: string;
  logo: string;
  accent: string;
  accentLight: string;
  accentMuted: string;
  subtitle: string;
}

const BRANDS: Record<'client' | 'merchant', BrandConfig> = {
  client: {
    name: 'JitPlus',
    logo: EMAIL_LOGO_JITPLUS,
    accent: '#7C3AED',
    accentLight: '#F3F0FF',
    accentMuted: '#8B83B0',
    subtitle: 'Votre programme de fidélité',
  },
  merchant: {
    name: 'JitPlus Pro',
    logo: EMAIL_LOGO_JITPLUS_PRO,
    accent: '#1F2937',
    accentLight: '#F1F5F9',
    accentMuted: '#64748B',
    subtitle: 'Espace commerçant',
  },
};

// ─── Base email wrapper ───────────────────────────────────────────────────────

function wrapEmail(options: {
  brand: BrandConfig;
  preheader: string;
  content: string;
  extraFooter?: string;
  lang?: EmailLang;
  /** Whether to include the legal/privacy footer (default true). */
  legalFooter?: boolean;
}): string {
  const { brand, preheader, content, extraFooter, lang = 'fr', legalFooter = true } = options;
  const year = new Date().getFullYear();
  const fi = FOOTER_I18N[lang];
  const isPro = brand.name === 'JitPlus Pro';
  const privacyUrl = isPro ? PRIVACY_URL_PRO : PRIVACY_URL_CLIENT;
  const termsUrl = isPro ? TERMS_URL_PRO : TERMS_URL_CLIENT;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  const legal = legalFooter ? `
          <div style="margin-top: 16px; text-align: center;">
            <p style="color: #94A3B8; font-size: 11px; line-height: 1.6; margin: 0 0 6px;">
              ${escapeHtml(fi.reasonTransactional)} <strong>${brand.name}</strong>.
            </p>
            <p style="color: #94A3B8; font-size: 11px; margin: 0 0 6px;">
              <a href="${privacyUrl}" style="color: ${brand.accentMuted}; text-decoration: underline;">${escapeHtml(fi.privacy)}</a>
              &nbsp;·&nbsp;
              <a href="${termsUrl}" style="color: ${brand.accentMuted}; text-decoration: underline;">${escapeHtml(fi.terms)}</a>
              &nbsp;·&nbsp;
              <a href="mailto:${SUPPORT_EMAIL}" style="color: ${brand.accentMuted}; text-decoration: underline;">${escapeHtml(fi.contact)}</a>
            </p>
            <p style="color: #B8C0CE; font-size: 11px; margin: 0;">
              ${escapeHtml(COMPANY_LEGAL.name)} — ${escapeHtml(COMPANY_LEGAL.address)}
            </p>
          </div>` : '';

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${brand.name}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #F4F4F7; -webkit-font-smoothing: antialiased; font-family: 'Segoe UI', Arial, sans-serif;">
  <!-- Preheader (hidden preview text) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${escapeHtml(preheader)}${'&nbsp;&zwnj;'.repeat(30)}</div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #F4F4F7;">
    <tr>
      <td align="center" style="padding: 40px 16px;">

        <!-- ─── Main card ─── -->
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FAFAFA; border-radius: 16px;">

          <!-- ─── Brand header ─── -->
          <div style="text-align: center; margin-bottom: 28px;">
            <img src="${brand.logo}" alt="${brand.name}" width="64" height="64" style="border-radius: 16px; margin-bottom: 12px;" />
            <h1 style="font-size: 28px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 4px; font-family: 'Segoe UI', Arial, sans-serif; color: ${brand.accent};">${brand.name}</h1>
            <p style="color: ${brand.accentMuted}; font-size: 14px; margin: 0;">${brand.subtitle}</p>
          </div>

          <!-- ─── Content card ─── -->
          <div style="background: #FFFFFF; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
            ${content}
          </div>

          <!-- ─── Footer ─── -->
          ${extraFooter ? `<div style="margin-top: 20px;">${extraFooter}</div>` : ''}
          <p style="text-align: center; color: #94A3B8; font-size: 12px; margin-top: 24px;">
            ${escapeHtml(fi.rights(year, brand.name))}
          </p>
          ${legal}

        </div>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Email 1: OTP verification code ──────────────────────────────────────────

export function buildOtpEmail(
  code: string,
  source: EmailSource = 'client',
  lang: EmailLang = 'fr',
  purpose: OtpPurpose = 'verification',
): string {
  const brand = BRANDS[source];
  const i = OTP_I18N[lang];

  const content = `
    <p style="color: #1E1B4B; font-size: 16px; margin: 0 0 16px;">${escapeHtml(i.intro(purpose))}</p>
    <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; display: inline-block; text-align: center; width: 100%; box-sizing: border-box;">
      <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: ${brand.accent};">${escapeHtml(code)}</span>
    </div>
    <p style="color: ${brand.accentMuted}; font-size: 13px; margin-top: 16px;">
      ${i.expires(Math.round((source === 'client' ? CLIENT_OTP_EXPIRY_MS : OTP_EXPIRY_MS) / 60_000))}<br/>
      ${escapeHtml(i.ignore)}
    </p>`;

  return wrapEmail({
    brand,
    lang,
    preheader: `${code} — ${brand.name}`,
    content,
  });
}

export function getOtpSubject(
  code: string,
  source: EmailSource = 'client',
  lang: EmailLang = 'fr',
  purpose: OtpPurpose = 'verification',
): string {
  return OTP_I18N[lang].subject(code, BRANDS[source].name, purpose);
}

// ─── Email 2: Welcome Client ─────────────────────────────────────────────────

export function buildWelcomeClientEmail(prenom?: string, lang: EmailLang = 'fr'): string {
  const brand = BRANDS.client;
  const i = WELCOME_CLIENT_I18N[lang];
  const fallback = lang === 'en' ? 'there' : (lang === 'ar' ? 'صاحبي' : 'cher client');
  const name = escapeHtml(prenom || fallback);
  const bullets = i.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('');

  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${escapeHtml(i.greeting(name))}</h2>
    <p style="color: ${brand.accent}; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      ${escapeHtml(i.intro)}
    </p>
    <ul style="color: #1E1B4B; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0 0 16px;">
      ${bullets}
    </ul>
    <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 0;">
      ${escapeHtml(i.cta)}
    </p>`;

  return wrapEmail({
    brand,
    lang,
    preheader: i.preheader(prenom || ''),
    content,
  });
}

// ─── Sign-up attempt on an existing client account ───────────────────────────

export function buildAccountExistsClientEmail(lang: EmailLang = 'fr'): string {
  const brand = BRANDS.client;
  const i = ACCOUNT_EXISTS_CLIENT_I18N[lang];
  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${escapeHtml(i.title)}</h2>
    <p style="color: ${brand.accent}; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      ${escapeHtml(i.body)}
    </p>
    <p style="color: #1E1B4B; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      ${escapeHtml(i.help)}
    </p>
    <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 0;">
      ${escapeHtml(i.ignore)}
    </p>`;

  return wrapEmail({ brand, lang, preheader: i.body, content });
}

// ─── Email 3: Welcome Merchant ───────────────────────────────────────────────

export function buildWelcomeMerchantEmail(nomBoutique: string, lang: EmailLang = 'fr'): string {
  const brand = BRANDS.merchant;
  const safeName = escapeHtml(nomBoutique);
  const i = WELCOME_MERCHANT_I18N[lang];
  const bullets = i.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('');

  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${escapeHtml(i.greeting)}</h2>
    <p style="color: ${brand.accent}; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      ${i.intro(safeName)}
    </p>
    <ul style="color: #1E1B4B; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0 0 16px;">
      ${bullets}
    </ul>
    <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 0;">
      ${escapeHtml(i.cta)}
    </p>`;

  return wrapEmail({
    brand,
    lang,
    preheader: i.preheader(nomBoutique),
    content,
  });
}

// ─── Email 4: Referral Bonus ─────────────────────────────────────────────────

export function buildReferralBonusEmail(
  referrerNom: string,
  newMerchantNom: string,
  newExpiry: Date | null,
  lang: EmailLang = 'fr',
): string {
  const brand = BRANDS.merchant;
  const i = REFERRAL_I18N[lang];
  const safeReferrerNom = escapeHtml(referrerNom);
  const safeNewMerchantNom = escapeHtml(newMerchantNom);
  const localeMap: Record<EmailLang, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar-MA' };
  const expiryStr = newExpiry
    ? newExpiry.toLocaleDateString(localeMap[lang], { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${escapeHtml(i.heading)}</h2>
    <p style="color: ${brand.accent}; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      ${i.greeting(safeReferrerNom)}
    </p>
    <p style="color: #1E1B4B; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      ${i.body(safeNewMerchantNom)}
    </p>
    <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 16px;">
      <p style="color: ${brand.accent}; font-size: 16px; font-weight: 700; margin: 0;">
        ${escapeHtml(i.bonus)}
      </p>
      ${expiryStr ? `<p style="color: ${brand.accentMuted}; font-size: 13px; margin: 6px 0 0;">${i.expiryNote(escapeHtml(expiryStr))}</p>` : ''}
    </div>
    <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 0;">
      ${escapeHtml(i.outro)}
    </p>`;

  return wrapEmail({
    brand,
    lang,
    preheader: i.preheader(newMerchantNom),
    content,
  });
}

// ─── Email 5: Account Deleted confirmation (GDPR Art. 17 / App Store 5.1.1(v)) ─

export function buildClientAccountDeletedEmail(prenom?: string, lang: EmailLang = 'fr'): string {
  const brand = BRANDS.client;
  const i = ACCOUNT_DELETED_I18N[lang];
  const safeName = prenom ? escapeHtml(prenom) : null;
  const localeMap: Record<EmailLang, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar-MA' };
  const deletedAt = new Date().toLocaleDateString(localeMap[lang], { day: '2-digit', month: 'long', year: 'numeric' });
  const bullets = i.bulletsClient.map((b) => `<li>${escapeHtml(b)}</li>`).join('');

  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${escapeHtml(i.heading)}</h2>
    <p style="color: ${brand.accent}; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      ${escapeHtml(i.greeting(safeName))}
    </p>
    <p style="color: #1E1B4B; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      ${i.bodyClient(deletedAt)}
    </p>
    <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
      <p style="color: ${brand.accent}; font-size: 13px; font-weight: 600; margin: 0 0 8px;">${escapeHtml(i.whatRemoved)}</p>
      <ul style="color: #1E1B4B; font-size: 13px; line-height: 1.7; padding-left: 18px; margin: 0;">
        ${bullets}
      </ul>
    </div>
    <p style="color: ${brand.accentMuted}; font-size: 13px; line-height: 1.6; margin: 0 0 12px;">
      ${escapeHtml(i.retention)}
    </p>
    <p style="color: ${brand.accentMuted}; font-size: 13px; line-height: 1.6; margin: 0;">
      ${escapeHtml(i.notYouContact)} <a href="mailto:${SUPPORT_EMAIL}" style="color: ${brand.accent};">${SUPPORT_EMAIL}</a>
    </p>`;

  return wrapEmail({
    brand,
    lang,
    preheader: i.preheaderClient,
    content,
  });
}

export function buildAccountDeletedEmail(nomBoutique: string, lang: EmailLang = 'fr'): string {
  const brand = BRANDS.merchant;
  const i = ACCOUNT_DELETED_I18N[lang];
  const safeName = escapeHtml(nomBoutique);
  const localeMap: Record<EmailLang, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar-MA' };
  const deletedAt = new Date().toLocaleDateString(localeMap[lang], { day: '2-digit', month: 'long', year: 'numeric' });
  const bullets = i.bulletsMerchant.map((b) => `<li>${escapeHtml(b)}</li>`).join('');

  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${escapeHtml(i.heading)}</h2>
    <p style="color: ${brand.accent}; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      ${escapeHtml(i.greeting(null))}
    </p>
    <p style="color: #1E1B4B; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      ${i.bodyMerchant(safeName, deletedAt)}
    </p>
    <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
      <p style="color: ${brand.accent}; font-size: 13px; font-weight: 600; margin: 0 0 8px;">${escapeHtml(i.whatRemoved)}</p>
      <ul style="color: #1E1B4B; font-size: 13px; line-height: 1.7; padding-left: 18px; margin: 0;">
        ${bullets}
      </ul>
    </div>
    <p style="color: ${brand.accentMuted}; font-size: 13px; line-height: 1.6; margin: 0 0 12px;">
      ${escapeHtml(i.retention)}
    </p>
    <p style="color: ${brand.accentMuted}; font-size: 13px; line-height: 1.6; margin: 0;">
      ${escapeHtml(i.notYouContact)} <a href="mailto:${SUPPORT_EMAIL}" style="color: ${brand.accent};">${SUPPORT_EMAIL}</a>
    </p>`;

  return wrapEmail({
    brand,
    lang,
    preheader: i.preheaderMerchant(nomBoutique),
    content,
  });
}

// ─── Email 7: Login alert (security) ─────────────────────────────────────────

export function buildLoginAlertEmail(
  who: string,
  deviceName: string | null,
  when: Date,
  lang: EmailLang = 'fr',
): string {
  const brand = BRANDS.merchant;
  const i = LOGIN_ALERT_I18N[lang];
  const safeWho = escapeHtml(who);
  const safeDevice = deviceName ? escapeHtml(deviceName) : null;
  const localeMap: Record<EmailLang, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar-MA' };
  const dt = when.toLocaleString(localeMap[lang], { dateStyle: 'medium', timeStyle: 'short' });
  const bullets = i.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('');

  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${escapeHtml(i.heading)}</h2>
    <p style="color: #1E1B4B; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      ${i.body(safeWho, safeDevice, escapeHtml(dt))}
    </p>
    <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
      <p style="color: #92400E; font-size: 13px; font-weight: 600; margin: 0 0 8px;">${escapeHtml(i.whatToDo)}</p>
      <ul style="color: #92400E; font-size: 13px; line-height: 1.7; padding-left: 18px; margin: 0;">
        ${bullets}
      </ul>
    </div>
    <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 0;">
      ${escapeHtml(i.ignoreNote)}
    </p>`;

  return wrapEmail({
    brand,
    lang,
    preheader: i.preheader(who),
    content,
  });
}

// ─── Email 8: Plan changes ───────────────────────────────────────────────────

export function buildPlanActivatedEmail(
  expiresAt: Date | null,
  lang: EmailLang = 'fr',
): string {
  const brand = BRANDS.merchant;
  const i = PLAN_EMAIL_I18N[lang];
  const localeMap: Record<EmailLang, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar-MA' };
  const expiryStr = expiresAt
    ? expiresAt.toLocaleDateString(localeMap[lang], { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${escapeHtml(i.activatedHeading)}</h2>
    <p style="color: #1E1B4B; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      ${i.activatedBody(expiryStr ? escapeHtml(expiryStr) : null)}
    </p>`;

  return wrapEmail({
    brand,
    lang,
    preheader: i.activatedSubject,
    content,
  });
}

export function buildPlanRevokedEmail(lang: EmailLang = 'fr'): string {
  const brand = BRANDS.merchant;
  const i = PLAN_EMAIL_I18N[lang];

  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${escapeHtml(i.revokedHeading)}</h2>
    <p style="color: #1E1B4B; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      ${escapeHtml(i.revokedBody)}
    </p>`;

  return wrapEmail({
    brand,
    lang,
    preheader: i.revokedSubject,
    content,
  });
}

export function buildPlanExpiringEmail(
  daysLeft: number,
  kind: 'trial' | 'premium',
  lang: EmailLang = 'fr',
): string {
  const brand = BRANDS.merchant;
  const i = PLAN_EMAIL_I18N[lang];

  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${escapeHtml(i.expiringHeading(daysLeft))}</h2>
    <p style="color: #1E1B4B; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      ${i.expiringBody(daysLeft, kind)}
    </p>`;

  return wrapEmail({
    brand,
    lang,
    preheader: i.expiringSubject(daysLeft),
    content,
  });
}

// ─── Email 9: Payout status ──────────────────────────────────────────────────

export type PayoutStatusKind = 'pending' | 'approved' | 'paid' | 'rejected';

export function buildPayoutStatusEmail(
  status: PayoutStatusKind,
  amountFormatted: string,
  method: string,
  rejectReason: string | null,
  lang: EmailLang = 'fr',
): { subject: string; html: string } {
  const brand = BRANDS.client;
  const i = PAYOUT_I18N[lang];
  const safeAmount = escapeHtml(amountFormatted);
  const safeMethod = escapeHtml(method);

  let subject = '';
  let heading = '';
  let body = '';
  let extraNote = '';

  switch (status) {
    case 'pending':
      subject = i.pendingSubject;
      heading = i.pendingHeading;
      body = i.pendingBody(safeAmount, safeMethod);
      extraNote = i.pendingNote;
      break;
    case 'approved':
      subject = i.approvedSubject;
      heading = i.approvedHeading;
      body = i.approvedBody(safeAmount, safeMethod);
      extraNote = i.approvedNote;
      break;
    case 'paid':
      subject = i.paidSubject;
      heading = i.paidHeading;
      body = i.paidBody(safeAmount, safeMethod);
      extraNote = '';
      break;
    case 'rejected':
      subject = i.rejectedSubject;
      heading = i.rejectedHeading;
      body = i.rejectedBody(safeAmount, rejectReason ? escapeHtml(rejectReason) : null);
      extraNote = i.rejectedContact;
      break;
  }

  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${escapeHtml(heading)}</h2>
    <p style="color: #1E1B4B; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      ${body}
    </p>
    ${extraNote ? `<p style="color: ${brand.accentMuted}; font-size: 13px; margin: 0;">${escapeHtml(extraNote)}</p>` : ''}`;

  const html = wrapEmail({
    brand,
    lang,
    preheader: subject,
    content,
  });
  return { subject, html };
}

// ─── Email 6: Marketing Blast ────────────────────────────────────────────────

export function buildMarketingBlastEmail(
  rawClientName: string,
  rawBody: string,
  merchant: MerchantBlastInfo,
  lang: EmailLang = 'fr',
): string {
  const brand = BRANDS.client;
  const i = MARKETING_BLAST_I18N[lang];
  const formattedBody = escapeHtml(rawBody).replace(/\n/g, '<br/>');
  const safeName = escapeHtml(merchant.nom);

  // Build address line from available fields
  const addressParts = [merchant.adresse, merchant.quartier, merchant.ville].filter(Boolean);
  const addressLine = addressParts.length > 0 ? escapeHtml(addressParts.join(', ')) : null;

  // Merchant info card (logo + name + contact details).
  // Gmail flags marketing emails as suspicious when image hosts don't align with
  // the sending domain. So we only embed the merchant logo if it's hosted on
  // jitplus.com — otherwise we fall back to a colored initial-letter avatar.
  const isOwnDomain = !!merchant.logoUrl && /^https?:\/\/(?:[\w-]+\.)*jitplus\.com\//i.test(merchant.logoUrl);
  const merchantInitial = escapeHtml((merchant.nom?.trim().charAt(0) || 'J').toUpperCase());
  const merchantLogo = isOwnDomain
    ? `<td style="vertical-align: top; padding-right: 14px;"><img src="${escapeHtml(merchant.logoUrl!)}" alt="${safeName}" width="48" height="48" style="display: block; border-radius: 10px;" /></td>`
    : `<td style="vertical-align: top; padding-right: 14px;"><div style="width: 48px; height: 48px; border-radius: 10px; background: ${brand.accent}; color: #FFFFFF; font-size: 20px; font-weight: 700; line-height: 48px; text-align: center; font-family: 'Segoe UI', Arial, sans-serif;">${merchantInitial}</div></td>`;

  const contactLines: string[] = [];
  if (addressLine) {
    contactLines.push(`<tr><td style="padding: 2px 0;"><span style="color: #94A3B8; font-size: 13px;">&#128205;</span> <span style="color: #64748B; font-size: 13px;">${addressLine}</span></td></tr>`);
  }
  if (merchant.phoneNumber) {
    const safePhone = escapeHtml(merchant.phoneNumber);
    contactLines.push(`<tr><td style="padding: 2px 0;"><span style="color: #94A3B8; font-size: 13px;">&#128222;</span> <a href="tel:${safePhone}" style="color: ${brand.accent}; font-size: 13px; text-decoration: none;">${safePhone}</a></td></tr>`);
  }
  if (merchant.email) {
    const safeEmail = escapeHtml(merchant.email);
    contactLines.push(`<tr><td style="padding: 2px 0;"><span style="color: #94A3B8; font-size: 13px;">&#9993;</span> <a href="mailto:${safeEmail}" style="color: ${brand.accent}; font-size: 13px; text-decoration: none;">${safeEmail}</a></td></tr>`);
  }
  
  if (merchant.socialLinks && typeof merchant.socialLinks === 'object' && !Array.isArray(merchant.socialLinks)) {
    const socials = merchant.socialLinks as any;
    if (socials.website) {
      let websiteStr: string;
      if (typeof socials.website === 'object' && socials.website.url) {
        websiteStr = socials.website.url;
      } else {
        websiteStr = socials.website as string;
      }
      contactLines.push(`<tr><td style="padding: 2px 0;"><span style="color: #94A3B8; font-size: 13px;">&#127760;</span> <a href="${escapeHtml(websiteStr.startsWith('http') ? websiteStr : 'https://' + websiteStr)}" style="color: ${brand.accent}; font-size: 13px; text-decoration: none;" target="_blank">Site web</a></td></tr>`);
    }
    if (socials.instagram) {
      let instaStr: string;
      if (typeof socials.instagram === 'object' && socials.instagram.url) {
         instaStr = socials.instagram.url;
      } else {
         instaStr = socials.instagram as string;
      }
      const instaUrl = instaStr.startsWith('http') ? instaStr : (instaStr.startsWith('@') ? `https://instagram.com/${instaStr.substring(1)}` : `https://instagram.com/${instaStr}`);
      contactLines.push(`<tr><td style="padding: 2px 0;"><span style="color: #94A3B8; font-size: 13px;">&#128247;</span> <a href="${escapeHtml(instaUrl)}" style="color: ${brand.accent}; font-size: 13px; text-decoration: none;" target="_blank">Instagram</a></td></tr>`);
    }
    if (socials.facebook) {
      let fbStr: string;
      if (typeof socials.facebook === 'object' && socials.facebook.url) {
         fbStr = socials.facebook.url;
      } else {
         fbStr = socials.facebook as string;
      }
      const fbUrl = fbStr.startsWith('http') ? fbStr : `https://facebook.com/${fbStr}`;
      contactLines.push(`<tr><td style="padding: 2px 0;"><span style="color: #94A3B8; font-size: 13px;">&#128101;</span> <a href="${escapeHtml(fbUrl)}" style="color: ${brand.accent}; font-size: 13px; text-decoration: none;" target="_blank">Facebook</a></td></tr>`);
    }
    if (socials.tiktok) {
      let tiktokStr: string;
      if (typeof socials.tiktok === 'object' && socials.tiktok.url) {
         tiktokStr = socials.tiktok.url;
      } else {
         tiktokStr = socials.tiktok as string;
      }
      const tiktokUrl = tiktokStr.startsWith('http') ? tiktokStr : (tiktokStr.startsWith('@') ? `https://tiktok.com/${tiktokStr}` : `https://tiktok.com/@${tiktokStr}`);
      contactLines.push(`<tr><td style="padding: 2px 0;"><span style="color: #94A3B8; font-size: 13px;">&#127925;</span> <a href="${escapeHtml(tiktokUrl)}" style="color: ${brand.accent}; font-size: 13px; text-decoration: none;" target="_blank">TikTok</a></td></tr>`);
    }
  }

  const merchantCard = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px 0 0;">
      <tr>
        <td style="padding: 16px; background: #F8FAFC; border-radius: 10px; border: 1px solid #E2E8F0;">
          <table cellpadding="0" cellspacing="0" role="presentation"><tr>
            ${merchantLogo}
            <td style="vertical-align: top;">
              <p style="color: #1E1B4B; font-size: 15px; font-weight: 700; margin: 0 0 4px;">${safeName}</p>
              ${contactLines.length > 0 ? `<table cellpadding="0" cellspacing="0" role="presentation">${contactLines.join('')}</table>` : ''}
            </td>
          </tr></table>
        </td>
      </tr>
    </table>`;

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 24px;">
      <tr>
        <td style="padding: 12px 16px; background: ${brand.accentLight}; border-radius: 8px; border-left: 4px solid ${brand.accent};">
          <p style="color: ${brand.accent}; font-size: 14px; font-weight: 600; margin: 0;">
            ${escapeHtml(i.messageFrom(merchant.nom))}
          </p>
        </td>
      </tr>
    </table>
    <p style="color: #1E1B4B; font-size: 16px; margin: 0 0 20px;">${escapeHtml(i.greeting(rawClientName))}</p>
    <div style="color: #334155; font-size: 15px; line-height: 1.8; margin: 0;">
      ${formattedBody}
    </div>
    ${merchantCard}`;

  const extraFooter = `
    <p style="color: #94A3B8; font-size: 12px; line-height: 1.6; margin: 0 0 8px; text-align: center;">
      ${i.unsubscribeNote(safeName)}
    </p>`;

  return wrapEmail({
    brand,
    lang,
    preheader: i.preheader(merchant.nom),
    content,
    extraFooter,
  });
}

// ─── Booking confirmed (client) ──────────────────────────────────────────────

const BOOKING_CONFIRMED_I18N: Record<EmailLang, {
  subject: (merchant: string) => string;
  heading: string;
  movedSubject: (merchant: string) => string;
  movedHeading: string;
  intro: (merchant: string) => string;
  labels: { service: string; date: string; time: string; address: string };
  qr: string;
  cancel: (hours: number) => string;
}> = {
  fr: {
    subject: (m) => `Rendez-vous confirmé chez ${m}`,
    heading: 'Votre rendez-vous est confirmé',
    movedSubject: (m) => `Rendez-vous déplacé chez ${m}`,
    movedHeading: 'Votre rendez-vous a changé d’horaire',
    intro: (m) => `${m} vous attend.`,
    labels: { service: 'Prestation', date: 'Date', time: 'Heure', address: 'Adresse' },
    qr: 'À votre arrivée, montrez votre QR JitPlus pour recevoir vos tampons.',
    cancel: (h) => (h > 0 ? `Un empêchement ? Annulez depuis l'app JitPlus jusqu'à ${h} h avant.` : "Un empêchement ? Annulez depuis l'app JitPlus."),
  },
  en: {
    subject: (m) => `Booking confirmed at ${m}`,
    heading: 'Your booking is confirmed',
    movedSubject: (m) => `Booking moved at ${m}`,
    movedHeading: 'Your booking has a new time',
    intro: (m) => `${m} is expecting you.`,
    labels: { service: 'Service', date: 'Date', time: 'Time', address: 'Address' },
    qr: 'On arrival, show your JitPlus QR to get your stamps.',
    cancel: (h) => (h > 0 ? `Can't make it? Cancel in the JitPlus app up to ${h} h before.` : "Can't make it? Cancel in the JitPlus app."),
  },
  ar: {
    subject: (m) => `تم تأكيد موعدك عند ${m}`,
    heading: 'تم تأكيد موعدك',
    movedSubject: (m) => `تم تغيير موعدك عند ${m}`,
    movedHeading: 'تم تغيير وقت موعدك',
    intro: (m) => `${m} في انتظارك.`,
    labels: { service: 'الخدمة', date: 'التاريخ', time: 'الساعة', address: 'العنوان' },
    qr: 'عند وصولك، أظهر رمز QR الخاص بـ JitPlus لتحصل على طوابعك.',
    cancel: (h) => (h > 0 ? `لديك مانع؟ ألغِ من تطبيق JitPlus قبل ${h} ساعة على الأقل.` : 'لديك مانع؟ ألغِ من تطبيق JitPlus.'),
  },
};

export interface BookingEmailParams {
  merchant: string;
  service: string;
  /** Already formatted in the merchant's zone and the client's language */
  date: string;
  time: string;
  address: string | null;
  cancelDeadlineHours: number;
  /** The merchant moved the booking: same e-mail with a "new time" title, so the first one is not relied on */
  moved?: boolean;
}

export function getBookingConfirmedSubject(p: Pick<BookingEmailParams, 'merchant' | 'moved'>, lang: EmailLang = 'fr'): string {
  const i = BOOKING_CONFIRMED_I18N[lang];
  return (p.moved ? i.movedSubject : i.subject)(p.merchant);
}

export function buildBookingConfirmedEmail(p: BookingEmailParams, lang: EmailLang = 'fr'): string {
  const brand = BRANDS.client;
  const i = BOOKING_CONFIRMED_I18N[lang];
  const row = (label: string, value: string | null) =>
    value
      ? `<tr><td style="color: ${brand.accentMuted}; font-size: 13px; padding: 4px 12px 4px 0;">${escapeHtml(label)}</td><td style="color: #1E1B4B; font-size: 14px; font-weight: 600; padding: 4px 0;">${escapeHtml(value)}</td></tr>`
      : '';
  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${escapeHtml(p.moved ? i.movedHeading : i.heading)}</h2>
    <p style="color: ${brand.accent}; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">${escapeHtml(i.intro(p.merchant))}</p>
    <table role="presentation" style="border-collapse: collapse; margin: 0 0 16px;">
      ${row(i.labels.service, p.service)}
      ${row(i.labels.date, p.date)}
      ${row(i.labels.time, p.time)}
      ${row(i.labels.address, p.address)}
    </table>
    <p style="color: #1E1B4B; font-size: 14px; line-height: 1.6; margin: 0 0 8px;">${escapeHtml(i.qr)}</p>
    <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 0;">${escapeHtml(i.cancel(p.cancelDeadlineHours))}</p>`;
  return wrapEmail({ brand, lang, preheader: getBookingConfirmedSubject(p, lang), content });
}
