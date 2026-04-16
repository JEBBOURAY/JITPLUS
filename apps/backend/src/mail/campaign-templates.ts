import { EMAIL_LOGO_JITPLUS, EMAIL_LOGO_JITPLUS_PRO } from '../common/constants';
import { escapeHtml } from './email-templates';

// ─── Brand configuration (reuse from email-templates.ts) ─────────────────────

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

// ─── Base email wrapper (same as email-templates.ts) ─────────────────────────

function wrapCampaignEmail(options: {
  brand: BrandConfig;
  preheader: string;
  content: string;
  ctaText?: string;
  ctaUrl?: string;
  unsubscribeNote?: string;
}): string {
  const { brand, preheader, content, ctaText, ctaUrl, unsubscribeNote } = options;
  const year = new Date().getFullYear();

  const ctaButton = ctaText ? `
    <div style="text-align: center; margin: 24px 0 8px;">
      <a href="${ctaUrl || '#'}" style="display: inline-block; background: ${brand.accent}; color: #FFFFFF; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px;">
        ${escapeHtml(ctaText)}
      </a>
    </div>` : '';

  const footer = unsubscribeNote || `Vous recevez cet e-mail car vous avez un compte ${brand.name}. Pour ne plus recevoir ces messages, d&eacute;sactivez les notifications e-mail dans les param&egrave;tres de l'application.`;

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
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${escapeHtml(preheader)}${'&nbsp;&zwnj;'.repeat(30)}</div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #F4F4F7;">
    <tr>
      <td align="center" style="padding: 40px 16px;">

        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #FAFAFA; border-radius: 16px;">

          <div style="text-align: center; margin-bottom: 28px;">
            <img src="${brand.logo}" alt="${brand.name}" width="64" height="64" style="border-radius: 16px; margin-bottom: 12px;" />
            <h1 style="font-size: 28px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 4px; color: ${brand.accent};">${brand.name}</h1>
            <p style="color: ${brand.accentMuted}; font-size: 14px; margin: 0;">${brand.subtitle}</p>
          </div>

          <div style="background: #FFFFFF; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
            ${content}
            ${ctaButton}
          </div>

          <p style="color: #94A3B8; font-size: 12px; line-height: 1.6; margin-top: 24px; text-align: center;">
            ${footer}
          </p>
          <p style="text-align: center; color: #94A3B8; font-size: 12px; margin-top: 8px;">
            &copy; ${year} ${brand.name} &mdash; Tous droits r&eacute;serv&eacute;s
          </p>

        </div>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CLIENT CAMPAIGN EMAILS (JitPlus branding)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Welcome Series ───────────────────────────────────────────────────────────

export function buildWelcomeDay1Email(prenom?: string): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || 'cher client');

  return wrapCampaignEmail({
    brand,
    preheader: 'Explorez les commerces autour de vous et commencez à gagner des points !',
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">🏪 D&eacute;couvrez les commerces pr&egrave;s de vous !</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour ${name},
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Des dizaines de commerces partenaires vous attendent sur <strong style="color: ${brand.accent};">JitPlus</strong>.
        Caf&eacute;s, restaurants, salons de beaut&eacute;, boutiques&hellip; Gagnez des points &agrave; chaque visite !
      </p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
          <tr>
            <td style="padding: 6px 0;"><span style="font-size: 18px;">📍</span> <span style="color: #334155; font-size: 14px;">Trouvez les commerces &agrave; c&ocirc;t&eacute; de vous</span></td>
          </tr>
          <tr>
            <td style="padding: 6px 0;"><span style="font-size: 18px;">📱</span> <span style="color: #334155; font-size: 14px;">Scannez le QR code pour gagner des points</span></td>
          </tr>
          <tr>
            <td style="padding: 6px 0;"><span style="font-size: 18px;">🎁</span> <span style="color: #334155; font-size: 14px;">&Eacute;changez vos points contre des r&eacute;compenses</span></td>
          </tr>
        </table>
      </div>`,
    ctaText: 'Explorer les commerces',
    ctaUrl: 'https://jitplus.com/app',
  });
}

export function buildWelcomeDay3Email(prenom?: string): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || 'cher client');

  return wrapCampaignEmail({
    brand,
    preheader: 'Gagnez vos premiers points de fidélité — c\'est gratuit et rapide !',
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">⭐ Gagnez vos premiers points !</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour ${name},
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Saviez-vous que <strong>chaque achat</strong> chez un commerce partenaire vous rapporte des points ?
        Il suffit de montrer votre <strong style="color: ${brand.accent};">QR code JitPlus</strong> au commer&ccedil;ant.
      </p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 16px;">
        <p style="color: ${brand.accent}; font-size: 24px; font-weight: 800; margin: 0;">3 &eacute;tapes simples</p>
        <p style="color: #64748B; font-size: 14px; margin: 8px 0 0;">
          1. Achetez &mdash; 2. Scannez &mdash; 3. Gagnez !
        </p>
      </div>`,
    ctaText: 'Ouvrir mon QR code',
    ctaUrl: 'https://jitplus.com/app',
  });
}

export function buildWelcomeDay7Email(prenom?: string): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || 'cher client');

  return wrapCampaignEmail({
    brand,
    preheader: 'Invitez vos amis sur JitPlus et gagnez des bonus ensemble !',
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">🎁 Parrainez et gagnez !</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour ${name},
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Vous aimez JitPlus ? Partagez-le avec vos amis et gagnez des r&eacute;compenses !
        Quand un ami que vous parrainez s'inscrit, vous recevez tous les deux un <strong style="color: ${brand.accent};">bonus sp&eacute;cial</strong>.
      </p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 16px;">
        <p style="color: ${brand.accent}; font-size: 20px; font-weight: 800; margin: 0;">💰 25 DH de bonus</p>
        <p style="color: #64748B; font-size: 14px; margin: 8px 0 0;">
          Pour chaque ami commer&ccedil;ant qui s'abonne Premium
        </p>
      </div>`,
    ctaText: 'Partager mon code',
    ctaUrl: 'https://jitplus.com/app',
  });
}

// ── Re-engagement Emails ─────────────────────────────────────────────────────

export function buildReengagement7dEmail(prenom?: string): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || 'cher client');

  return wrapCampaignEmail({
    brand,
    preheader: 'Vos points vous attendent ! Passez chez vos commerces favoris.',
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">💫 Vos points vous attendent !</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour ${name},
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        &Ccedil;a fait un moment qu'on ne vous a pas vu ! Vos points de fid&eacute;lit&eacute; sont toujours l&agrave;,
        pr&ecirc;ts &agrave; &ecirc;tre &eacute;chang&eacute;s contre des r&eacute;compenses.
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0;">
        Passez chez vos commerces favoris pour continuer &agrave; cumuler des points ! 💪
      </p>`,
    ctaText: 'Voir mes points',
    ctaUrl: 'https://jitplus.com/app',
  });
}

export function buildReengagement14dEmail(prenom?: string): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || 'cher client');

  return wrapCampaignEmail({
    brand,
    preheader: 'Ne perdez pas vos avantages fidélité — revenez profiter de vos points !',
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">🔥 Ne perdez pas vos avantages !</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour ${name},
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Vos points et r&eacute;compenses n'attendent que vous. Ne laissez pas passer cette opportunit&eacute; &mdash;
        des dizaines de commerces ont des offres sp&eacute;ciales pour vous !
      </p>
      <div style="background: #FEF3C7; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 16px;">
        <p style="color: #92400E; font-size: 15px; font-weight: 700; margin: 0;">
          ⚡ Vos points sont toujours valables
        </p>
      </div>`,
    ctaText: 'Revenir sur JitPlus',
    ctaUrl: 'https://jitplus.com/app',
  });
}

export function buildReengagement30dEmail(prenom?: string): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || 'cher client');

  return wrapCampaignEmail({
    brand,
    preheader: 'Vous nous manquez ! De nouvelles offres vous attendent sur JitPlus.',
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">😢 Vous nous manquez !</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour ${name},
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Cela fait 30 jours que vous n'avez pas utilis&eacute; JitPlus. Pendant ce temps,
        de nouveaux commerces ont rejoint la plateforme et de nouvelles r&eacute;compenses vous attendent !
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0;">
        Revenez d&eacute;couvrir tout ce qu'on a pr&eacute;par&eacute; pour vous. On vous promet, &ccedil;a vaut le coup ! 💜
      </p>`,
    ctaText: 'Redécouvrir JitPlus',
    ctaUrl: 'https://jitplus.com/app',
  });
}

// ── Reward Reminder ──────────────────────────────────────────────────────────

export function buildRewardAvailableEmail(
  prenom: string | undefined,
  merchantName: string,
  rewardName: string,
  points: number,
): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || 'cher client');
  const safeMerchant = escapeHtml(merchantName);
  const safeReward = escapeHtml(rewardName);

  return wrapCampaignEmail({
    brand,
    preheader: `Vous avez assez de points pour "${rewardName}" chez ${merchantName} !`,
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">🎉 R&eacute;compense disponible !</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour ${name},
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonne nouvelle ! Vous avez accumul&eacute; <strong style="color: ${brand.accent};">${points} points</strong> chez
        <strong>${safeMerchant}</strong> &mdash; assez pour obtenir :
      </p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 16px;">
        <p style="color: ${brand.accent}; font-size: 18px; font-weight: 800; margin: 0;">🎁 ${safeReward}</p>
      </div>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0;">
        Passez chez <strong>${safeMerchant}</strong> pour r&eacute;cup&eacute;rer votre r&eacute;compense !
      </p>`,
    ctaText: 'Voir ma récompense',
    ctaUrl: 'https://jitplus.com/app',
  });
}

export function buildAlmostThereEmail(
  prenom: string | undefined,
  merchantName: string,
  remaining: number,
  isStamps: boolean,
): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || 'cher client');
  const safeMerchant = escapeHtml(merchantName);
  const unit = isStamps ? (remaining > 1 ? 'tampons' : 'tampon') : 'points';

  return wrapCampaignEmail({
    brand,
    preheader: `Plus que ${remaining} ${unit} chez ${merchantName} pour votre récompense !`,
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">🔥 Vous y &ecirc;tes presque !</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour ${name},
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Il ne vous manque plus que <strong style="color: ${brand.accent};">${remaining} ${unit}</strong> chez
        <strong>${safeMerchant}</strong> pour d&eacute;bloquer votre r&eacute;compense !
      </p>
      <div style="background: #FEF3C7; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 16px;">
        <p style="color: #92400E; font-size: 16px; font-weight: 700; margin: 0;">
          ⚡ Plus que ${remaining} ${unit} !
        </p>
      </div>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0;">
        Passez chez <strong>${safeMerchant}</strong> pour compl&eacute;ter votre carte et profiter de votre r&eacute;compense !
      </p>`,
    ctaText: 'Voir mes points',
    ctaUrl: 'https://jitplus.com/app',
  });
}

// ── Weekly Digest ────────────────────────────────────────────────────────────

export function buildWeeklyDigestEmail(
  prenom: string | undefined,
  totalPoints: number,
  merchantCount: number,
): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || 'cher client');

  return wrapCampaignEmail({
    brand,
    preheader: `Cette semaine : +${totalPoints} points chez ${merchantCount} commerce(s) !`,
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">📊 Votre r&eacute;sum&eacute; de la semaine</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour ${name},
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">
        Voici vos stats de la semaine sur JitPlus :
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 20px;">
        <tr>
          <td style="width: 50%; padding: 12px; background: ${brand.accentLight}; border-radius: 10px 0 0 10px; text-align: center;">
            <p style="color: ${brand.accent}; font-size: 28px; font-weight: 800; margin: 0;">+${totalPoints}</p>
            <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 4px 0 0;">points gagn&eacute;s</p>
          </td>
          <td style="width: 50%; padding: 12px; background: ${brand.accentLight}; border-radius: 0 10px 10px 0; text-align: center;">
            <p style="color: ${brand.accent}; font-size: 28px; font-weight: 800; margin: 0;">${merchantCount}</p>
            <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 4px 0 0;">commerce(s) visit&eacute;(s)</p>
          </td>
        </tr>
      </table>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0;">
        ${totalPoints > 0 ? 'Bravo, continuez comme &ccedil;a ! 💪' : 'Visitez vos commerces favoris cette semaine pour gagner des points !'}
      </p>`,
    ctaText: 'Voir tous mes points',
    ctaUrl: 'https://jitplus.com/app',
  });
}

// ── Referral Campaign ────────────────────────────────────────────────────────

export function buildReferralCampaignEmail(prenom?: string): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || 'cher client');

  return wrapCampaignEmail({
    brand,
    preheader: 'Invitez un commerçant sur JitPlus et gagnez 25 DH de bonus !',
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">💰 Parrainez et gagnez 25 DH !</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour ${name},
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Connaissez-vous un commer&ccedil;ant qui aimerait fid&eacute;liser ses clients ?
        Invitez-le sur <strong style="color: ${brand.accent};">JitPlus</strong> et recevez
        <strong>25 DH de bonus</strong> quand il s'abonne au plan Premium !
      </p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
          <tr>
            <td style="padding: 6px 0;"><span style="font-size: 16px;">1️⃣</span> <span style="color: #334155; font-size: 14px;">Partagez votre code de parrainage</span></td>
          </tr>
          <tr>
            <td style="padding: 6px 0;"><span style="font-size: 16px;">2️⃣</span> <span style="color: #334155; font-size: 14px;">Le commer&ccedil;ant s'inscrit avec votre code</span></td>
          </tr>
          <tr>
            <td style="padding: 6px 0;"><span style="font-size: 16px;">3️⃣</span> <span style="color: #334155; font-size: 14px;">Vous recevez 25 DH d&egrave;s qu'il s'abonne</span></td>
          </tr>
        </table>
      </div>`,
    ctaText: 'Partager mon code',
    ctaUrl: 'https://jitplus.com/app',
  });
}

// ── Feature Highlights ───────────────────────────────────────────────────────

export function buildFeatureStampsEmail(prenom?: string): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || 'cher client');

  return wrapCampaignEmail({
    brand,
    preheader: 'Découvrez les cartes de tampons — collectez et gagnez des récompenses gratuites !',
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">📋 Le saviez-vous ?</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour ${name},
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Certains commerces sur JitPlus proposent des <strong style="color: ${brand.accent};">cartes de tampons</strong>.
        &Agrave; chaque visite, vous collectez un tampon. Une fois la carte compl&egrave;te, vous gagnez une r&eacute;compense gratuite !
      </p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 16px;">
        <p style="font-size: 28px; margin: 0;">☕ ☕ ☕ ☕ ☕ ☕ ☕ ☕ ☕ 🎁</p>
        <p style="color: ${brand.accent}; font-size: 14px; font-weight: 600; margin: 8px 0 0;">
          10 tampons = 1 r&eacute;compense gratuite
        </p>
      </div>`,
    ctaText: 'Découvrir les commerces',
    ctaUrl: 'https://jitplus.com/app',
  });
}

export function buildFeatureQREmail(prenom?: string): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || 'cher client');

  return wrapCampaignEmail({
    brand,
    preheader: 'Scanner = Gagner ! Gagnez des points automatiquement à chaque achat.',
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">📱 Scanner = Gagner !</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour ${name},
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Avec JitPlus, chaque achat vous rapporte des points. Comment &ccedil;a marche ?
      </p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
          <tr>
            <td style="padding: 8px 0;"><span style="font-size: 18px;">🛒</span> <span style="color: #334155; font-size: 14px;">Faites vos achats normalement</span></td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><span style="font-size: 18px;">📲</span> <span style="color: #334155; font-size: 14px;">Montrez votre QR code au commer&ccedil;ant</span></td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><span style="font-size: 18px;">⭐</span> <span style="color: #334155; font-size: 14px;">Les points s'ajoutent automatiquement</span></td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><span style="font-size: 18px;">🎁</span> <span style="color: #334155; font-size: 14px;">&Eacute;changez contre des r&eacute;compenses</span></td>
          </tr>
        </table>
      </div>`,
    ctaText: 'Ouvrir mon QR code',
    ctaUrl: 'https://jitplus.com/app',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MERCHANT CAMPAIGN EMAILS (JitPlus Pro branding)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Weekly Performance Digest ────────────────────────────────────────────────

export function buildMerchantWeeklyDigestEmail(
  nomBoutique: string,
  weekScans: number,
  newClients: number,
  totalClients: number,
): string {
  const brand = BRANDS.merchant;
  const safeName = escapeHtml(nomBoutique);

  return wrapCampaignEmail({
    brand,
    preheader: `${nomBoutique} cette semaine : ${weekScans} scans, ${newClients} nouveaux clients`,
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">📈 Votre semaine en chiffres</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">
        Bonjour <strong>${safeName}</strong>, voici le r&eacute;sum&eacute; de votre semaine :
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 20px;">
        <tr>
          <td style="width: 33%; padding: 12px 4px; background: ${brand.accentLight}; border-radius: 10px 0 0 10px; text-align: center;">
            <p style="color: ${brand.accent}; font-size: 24px; font-weight: 800; margin: 0;">${weekScans}</p>
            <p style="color: ${brand.accentMuted}; font-size: 12px; margin: 4px 0 0;">scans</p>
          </td>
          <td style="width: 33%; padding: 12px 4px; background: ${brand.accentLight}; text-align: center;">
            <p style="color: ${brand.accent}; font-size: 24px; font-weight: 800; margin: 0;">${newClients}</p>
            <p style="color: ${brand.accentMuted}; font-size: 12px; margin: 4px 0 0;">nouveaux clients</p>
          </td>
          <td style="width: 33%; padding: 12px 4px; background: ${brand.accentLight}; border-radius: 0 10px 10px 0; text-align: center;">
            <p style="color: ${brand.accent}; font-size: 24px; font-weight: 800; margin: 0;">${totalClients}</p>
            <p style="color: ${brand.accentMuted}; font-size: 12px; margin: 4px 0 0;">clients total</p>
          </td>
        </tr>
      </table>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0;">
        ${weekScans > 0
          ? 'Bravo, votre programme de fid&eacute;lit&eacute; fonctionne ! Continuez &agrave; scanner vos clients pour les fid&eacute;liser.'
          : 'Scannez vos clients cette semaine pour activer votre programme de fid&eacute;lit&eacute; et augmenter vos ventes !'}
      </p>`,
    ctaText: 'Voir mon tableau de bord',
    ctaUrl: 'https://jitplus.com/pro',
    unsubscribeNote: 'Vous recevez cet e-mail car vous avez un compte JitPlus Pro. Pour ne plus recevoir ces r&eacute;sum&eacute;s, d&eacute;sactivez les notifications e-mail dans les param&egrave;tres.',
  });
}

// ── Client Milestone ─────────────────────────────────────────────────────────

export function buildMerchantMilestoneEmail(nomBoutique: string, milestone: number): string {
  const brand = BRANDS.merchant;
  const safeName = escapeHtml(nomBoutique);

  return wrapCampaignEmail({
    brand,
    preheader: `Félicitations ${nomBoutique} ! Vous avez atteint ${milestone} clients fidèles.`,
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">🎯 Nouveau cap atteint !</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour <strong>${safeName}</strong>,
      </p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 16px;">
        <p style="color: ${brand.accent}; font-size: 36px; font-weight: 800; margin: 0;">🏆 ${milestone}</p>
        <p style="color: ${brand.accentMuted}; font-size: 15px; margin: 8px 0 0;">clients fid&egrave;les</p>
      </div>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0;">
        F&eacute;licitations ! Votre programme de fid&eacute;lit&eacute; porte ses fruits. Continuez &agrave; offrir
        des r&eacute;compenses attractives pour maintenir cet &eacute;lan ! 🚀
      </p>`,
    ctaText: 'Voir mes clients',
    ctaUrl: 'https://jitplus.com/pro',
  });
}

// ── Feature Tips ─────────────────────────────────────────────────────────────

export function buildMerchantTipNotificationsEmail(nomBoutique: string): string {
  const brand = BRANDS.merchant;
  const safeName = escapeHtml(nomBoutique);

  return wrapCampaignEmail({
    brand,
    preheader: 'Astuce : Envoyez des notifications push à tous vos clients en 1 clic !',
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">💡 Astuce : Notifications push</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour <strong>${safeName}</strong>,
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Saviez-vous que vous pouvez envoyer des <strong style="color: ${brand.accent};">notifications push</strong>
        &agrave; tous vos clients en un seul clic ? C'est l'outil id&eacute;al pour :
      </p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
          <tr><td style="padding: 6px 0;">📢 Annoncer une <strong>promotion</strong></td></tr>
          <tr><td style="padding: 6px 0;">🆕 Pr&eacute;senter un <strong>nouveau produit</strong></td></tr>
          <tr><td style="padding: 6px 0;">🎉 Inviter &agrave; un <strong>&eacute;v&eacute;nement</strong></td></tr>
          <tr><td style="padding: 6px 0;">⏰ Rappeler une <strong>offre limit&eacute;e</strong></td></tr>
        </table>
      </div>`,
    ctaText: 'Envoyer une notification',
    ctaUrl: 'https://jitplus.com/pro',
  });
}

export function buildMerchantTipRewardsEmail(nomBoutique: string): string {
  const brand = BRANDS.merchant;
  const safeName = escapeHtml(nomBoutique);

  return wrapCampaignEmail({
    brand,
    preheader: 'Astuce : Créez des récompenses attractives pour fidéliser vos clients !',
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">💡 Astuce : R&eacute;compenses personnalis&eacute;es</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour <strong>${safeName}</strong>,
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Les r&eacute;compenses sont le c&oelig;ur de votre programme de fid&eacute;lit&eacute;. Voici quelques id&eacute;es
        qui fonctionnent bien chez nos marchands :
      </p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
          <tr><td style="padding: 6px 0;">☕ <strong>Caf&eacute; gratuit</strong> &mdash; 100 points</td></tr>
          <tr><td style="padding: 6px 0;">🏷️ <strong>Remise 10%</strong> &mdash; 200 points</td></tr>
          <tr><td style="padding: 6px 0;">🎁 <strong>Cadeau surprise</strong> &mdash; 500 points</td></tr>
          <tr><td style="padding: 6px 0;">⭐ <strong>Service VIP</strong> &mdash; 1000 points</td></tr>
        </table>
      </div>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0;">
        Cr&eacute;ez des r&eacute;compenses vari&eacute;es et accessibles pour encourager les visites r&eacute;p&eacute;t&eacute;es !
      </p>`,
    ctaText: 'Gérer mes récompenses',
    ctaUrl: 'https://jitplus.com/pro',
  });
}

// ── Upgrade Nudge ────────────────────────────────────────────────────────────

export function buildMerchantUpgradeEmail(nomBoutique: string): string {
  const brand = BRANDS.merchant;
  const safeName = escapeHtml(nomBoutique);

  return wrapCampaignEmail({
    brand,
    preheader: 'Passez au Premium et débloquez emails, WhatsApp, analyses et plus — 30 jours gratuits !',
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">⚡ Passez au Premium !</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Bonjour <strong>${safeName}</strong>,
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Votre programme de fid&eacute;lit&eacute; est lanc&eacute;, bravo ! Pour aller encore plus loin,
        d&eacute;couvrez tout ce que le <strong style="color: ${brand.accent};">plan Premium</strong> peut vous offrir :
      </p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
          <tr><td style="padding: 8px 0;">📧 <strong>Campagnes e-mail</strong> &mdash; Envoyez des emails marketing &agrave; tous vos clients</td></tr>
          <tr><td style="padding: 8px 0;">💬 <strong>WhatsApp Business</strong> &mdash; Atteignez vos clients directement</td></tr>
          <tr><td style="padding: 8px 0;">📊 <strong>Analyses d&eacute;taill&eacute;es</strong> &mdash; Comprenez vos tendances et performances</td></tr>
          <tr><td style="padding: 8px 0;">👥 <strong>&Eacute;quipe multi-employ&eacute;s</strong> &mdash; Ajoutez des membres pour scanner</td></tr>
          <tr><td style="padding: 8px 0;">🔓 <strong>R&eacute;compenses illimit&eacute;es</strong> &mdash; Cr&eacute;ez autant de r&eacute;compenses que vous voulez</td></tr>
        </table>
      </div>
      <div style="background: #ECFDF5; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 16px;">
        <p style="color: #065F46; font-size: 16px; font-weight: 700; margin: 0;">
          🎁 Essayez 30 jours gratuits
        </p>
        <p style="color: #047857; font-size: 13px; margin: 6px 0 0;">
          Aucune carte requise &mdash; annulez &agrave; tout moment
        </p>
      </div>`,
    ctaText: 'Essayer Premium gratuitement',
    ctaUrl: 'https://jitplus.com/pro',
  });
}
