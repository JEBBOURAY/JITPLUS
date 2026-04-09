import { EMAIL_LOGO_JITPLUS, EMAIL_LOGO_JITPLUS_PRO } from '../common/constants';
import { EmailSource, MerchantBlastInfo } from '../common/interfaces';

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
}): string {
  const { brand, preheader, content, extraFooter } = options;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
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
            &copy; ${year} ${brand.name} &mdash; Tous droits r&eacute;serv&eacute;s
          </p>

        </div>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Email 1: OTP verification code ──────────────────────────────────────────

export function buildOtpEmail(code: string, source: EmailSource = 'client'): string {
  const brand = BRANDS[source];

  const content = `
    <p style="color: #1E1B4B; font-size: 16px; margin: 0 0 16px;">Votre code de v&eacute;rification :</p>
    <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; display: inline-block; text-align: center; width: 100%; box-sizing: border-box;">
      <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: ${brand.accent};">${escapeHtml(code)}</span>
    </div>
    <p style="color: ${brand.accentMuted}; font-size: 13px; margin-top: 16px;">
      Ce code expire dans <strong>5 minutes</strong>.<br/>
      Si vous n'avez pas demand&eacute; ce code, ignorez cet email.
    </p>`;

  return wrapEmail({
    brand,
    preheader: `${code} est votre code de vérification ${brand.name}`,
    content,
  });
}

export function getOtpSubject(code: string, source: EmailSource = 'client'): string {
  return `${code} — Votre code ${BRANDS[source].name}`;
}

// ─── Email 2: Welcome Client ─────────────────────────────────────────────────

export function buildWelcomeClientEmail(prenom?: string): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || 'cher client');

  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">Bienvenue ${name} ! 🎉</h2>
    <p style="color: ${brand.accent}; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      Votre compte JitPlus a &eacute;t&eacute; cr&eacute;&eacute; avec succ&egrave;s. Vous pouvez d&eacute;sormais :
    </p>
    <ul style="color: #1E1B4B; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0 0 16px;">
      <li>Cumuler des points chez vos commer&ccedil;ants pr&eacute;f&eacute;r&eacute;s</li>
      <li>Profiter de r&eacute;compenses exclusives</li>
      <li>Scanner votre QR code en magasin</li>
    </ul>
    <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 0;">
      Ouvrez l'application JitPlus et commencez &agrave; fid&eacute;liser d&egrave;s maintenant !
    </p>`;

  return wrapEmail({
    brand,
    preheader: `Bienvenue sur JitPlus ${prenom || ''} ! Votre programme de fidélité vous attend.`,
    content,
  });
}

// ─── Email 3: Welcome Merchant ───────────────────────────────────────────────

export function buildWelcomeMerchantEmail(nomBoutique: string): string {
  const brand = BRANDS.merchant;
  const safeName = escapeHtml(nomBoutique);

  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">Bienvenue sur JitPlus Pro ! 🚀</h2>
    <p style="color: ${brand.accent}; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      Votre commerce <strong>${safeName}</strong> est maintenant enregistr&eacute; sur JitPlus.
    </p>
    <ul style="color: #1E1B4B; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0 0 16px;">
      <li>Scannez les QR codes de vos clients pour leur attribuer des points</li>
      <li>Cr&eacute;ez des r&eacute;compenses attractives</li>
      <li>Suivez vos statistiques en temps r&eacute;el</li>
      <li>G&eacute;rez votre &eacute;quipe facilement</li>
    </ul>
    <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 0;">
      Connectez-vous &agrave; l'application JitPlus Pro pour commencer &agrave; fid&eacute;liser vos clients !
    </p>`;

  return wrapEmail({
    brand,
    preheader: `${nomBoutique} est maintenant sur JitPlus Pro ! Commencez à fidéliser vos clients.`,
    content,
  });
}

// ─── Email 4: Referral Bonus ─────────────────────────────────────────────────

export function buildReferralBonusEmail(
  referrerNom: string,
  newMerchantNom: string,
  newExpiry: Date | null,
): string {
  const brand = BRANDS.merchant;
  const safeReferrerNom = escapeHtml(referrerNom);
  const safeNewMerchantNom = escapeHtml(newMerchantNom);
  const expiryStr = newExpiry
    ? newExpiry.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  const content = `
    <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">🎁 Vous avez gagn&eacute; 1 mois offert !</h2>
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
      Continuez &agrave; partager votre code pour cumuler encore plus de mois gratuits !
    </p>`;

  return wrapEmail({
    brand,
    preheader: `${newMerchantNom} a rejoint JitPlus Pro grâce à vous — 1 mois Premium offert !`,
    content,
  });
}

// ─── Email 5: Marketing Blast ────────────────────────────────────────────────

export function buildMarketingBlastEmail(
  rawClientName: string,
  rawBody: string,
  merchant: MerchantBlastInfo,
): string {
  const brand = BRANDS.client;
  const clientName = escapeHtml(rawClientName);
  const formattedBody = escapeHtml(rawBody).replace(/\n/g, '<br/>');
  const safeName = escapeHtml(merchant.nom);

  // Build address line from available fields
  const addressParts = [merchant.adresse, merchant.quartier, merchant.ville].filter(Boolean);
  const addressLine = addressParts.length > 0 ? escapeHtml(addressParts.join(', ')) : null;

  // Merchant info card (logo + name + contact details)
  const merchantLogo = merchant.logoUrl
    ? `<td style="vertical-align: top; padding-right: 14px;"><img src="${escapeHtml(merchant.logoUrl)}" alt="${safeName}" width="48" height="48" style="display: block; border-radius: 10px;" /></td>`
    : '';

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
            Un message de ${safeName}
          </p>
        </td>
      </tr>
    </table>
    <p style="color: #1E1B4B; font-size: 16px; margin: 0 0 20px;">Bonjour ${clientName},</p>
    <div style="color: #334155; font-size: 15px; line-height: 1.8; margin: 0;">
      ${formattedBody}
    </div>
    ${merchantCard}`;

  const extraFooter = `
    <p style="color: #94A3B8; font-size: 12px; line-height: 1.6; margin: 0 0 8px; text-align: center;">
      Vous recevez cet e-mail car vous &ecirc;tes client de <strong>${safeName}</strong> via JitPlus.<br/>
      Pour ne plus recevoir ces messages, d&eacute;sactivez les notifications e-mail dans les param&egrave;tres de l'application.
    </p>`;

  return wrapEmail({
    brand,
    preheader: `Message de ${merchant.nom} via JitPlus`,
    content,
    extraFooter,
  });
}
