import { EMAIL_LOGO_JITPLUS, EMAIL_LOGO_JITPLUS_PRO } from '../common/constants';
import { escapeHtml } from './email-templates';

// ─── Locale support ──────────────────────────────────────────────────────────

/** Supported locales for client-facing campaign emails. */
export type Lang = 'fr' | 'en' | 'ar';

/** Normalise a raw `client.language` value into a supported Lang. */
export function pickLang(raw: string | null | undefined): Lang {
  const v = (raw ?? '').toLowerCase().slice(0, 2);
  if (v === 'en' || v === 'ar') return v;
  return 'fr';
}

/**
 * Per-locale strings used by the wrapper, CTA fallback and footer.
 * Keep this table here rather than importing the mobile i18n bundle so that
 * the backend stays fully decoupled from the app source tree.
 */
const WRAP_STRINGS: Record<Lang, {
  dir: 'ltr' | 'rtl';
  rights: string;
  footer: (brandName: string) => string;
}> = {
  fr: {
    dir: 'ltr',
    rights: 'Tous droits r&eacute;serv&eacute;s',
    footer: (b) => `Vous recevez cet e-mail car vous avez un compte ${b}. Pour ne plus recevoir ces messages, d&eacute;sactivez les notifications e-mail dans les param&egrave;tres de l'application.`,
  },
  en: {
    dir: 'ltr',
    rights: 'All rights reserved',
    footer: (b) => `You are receiving this email because you have a ${b} account. To stop receiving these messages, disable email notifications in the app settings.`,
  },
  ar: {
    dir: 'rtl',
    rights: 'جميع الحقوق محفوظة',
    footer: (b) => `كتوصلك هاد الإيمايل حيت عندك حساب ${b}. إلا بغيتي ما تبقاش توصلك هاد الرسائل، دير ديزاكتيفي الإيمايلات من الإعدادات ديال لابليكاسيون.`,
  },
};

// ─── Web fallback + UTM helper ──────────────────────────────────────────────

/**
 * Build the CTA URL for a campaign email.
 *
 * The URL points to the public web redirect (which tries to open the native
 * app via universal link / Android App Link and falls back to the store).
 * We encode the intended in-app destination as a query param so the mobile
 * app can read it after install and route the user to the right screen.
 *
 * UTM params are always appended so marketing can attribute conversions.
 */
export function buildCampaignCta(options: {
  /** In-app route the user should land on, e.g. "/(tabs)/discover" */
  appPath: string;
  /** Campaign identifier — ends up in utm_campaign */
  campaign: string;
  /** Optional merchantId for reward-specific deep links */
  merchantId?: string;
}): string {
  const base = process.env.PUBLIC_WEB_URL?.trim() || 'https://jitplus.com';
  // merchant-specific deeplink handled by /m/:id smart redirect (deeplink.controller.ts)
  const path = options.merchantId ? `/m/${options.merchantId}` : '/app';
  const params = new URLSearchParams({
    utm_source: 'email',
    utm_medium: 'campaign',
    utm_campaign: options.campaign,
    redirect: options.appPath,
  });
  return `${base.replace(/\/$/, '')}${path}?${params.toString()}`;
}

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

// ─── Base email wrapper ──────────────────────────────────────────────────────

function wrapCampaignEmail(options: {
  brand: BrandConfig;
  preheader: string;
  content: string;
  ctaText?: string;
  ctaUrl?: string;
  unsubscribeNote?: string;
  /** Locale used to pick html lang/dir and the default footer text. */
  lang?: Lang;
}): string {
  const { brand, preheader, content, ctaText, ctaUrl, unsubscribeNote } = options;
  const lang: Lang = options.lang ?? 'fr';
  const wrap = WRAP_STRINGS[lang];
  const year = new Date().getFullYear();

  const ctaButton = ctaText ? `
    <div style="text-align: center; margin: 24px 0 8px;">
      <a href="${ctaUrl || '#'}" style="display: inline-block; background: ${brand.accent}; color: #FFFFFF; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px;">
        ${escapeHtml(ctaText)}
      </a>
    </div>` : '';

  const footer = unsubscribeNote || wrap.footer(brand.name);

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${wrap.dir}" xmlns="http://www.w3.org/1999/xhtml">
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
            &copy; ${year} ${brand.name} &mdash; ${wrap.rights}
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

// ─── Per-builder localized copy tables ───────────────────────────────────────
// Each builder pulls its visible text from these tables. Keep keys short and
// consistent with the corresponding push notifications in jitplus.service.ts.

const DEFAULT_NAME: Record<Lang, string> = {
  fr: 'cher client',
  en: 'dear customer',
  ar: 'عزيزي الزبون',
};

const HELLO: Record<Lang, string> = { fr: 'Bonjour', en: 'Hello', ar: 'السلام' };

// ── Welcome Series ───────────────────────────────────────────────────────────

const WELCOME_DAY1: Record<Lang, {
  pre: string; h: string; p1: (b: string) => string;
  bullets: [string, string, string]; cta: string;
}> = {
  fr: {
    pre: 'Explorez les commerces autour de vous et commencez à gagner des points !',
    h: '🏪 D&eacute;couvrez les commerces pr&egrave;s de vous !',
    p1: (b) => `Des dizaines de commerces partenaires vous attendent sur <strong style="color: ${b};">JitPlus</strong>. Caf&eacute;s, restaurants, salons de beaut&eacute;, boutiques&hellip; Gagnez des points &agrave; chaque visite !`,
    bullets: [
      '📍 Trouvez les commerces &agrave; c&ocirc;t&eacute; de vous',
      '📱 Scannez le QR code pour gagner des points',
      '🎁 &Eacute;changez vos points contre des r&eacute;compenses',
    ],
    cta: 'Explorer les commerces',
  },
  en: {
    pre: 'Discover shops around you and start earning points!',
    h: '🏪 Discover shops near you!',
    p1: (b) => `Dozens of partner shops are waiting for you on <strong style="color: ${b};">JitPlus</strong>. Cafes, restaurants, beauty salons, boutiques&hellip; Earn points on every visit!`,
    bullets: [
      '📍 Find shops right next to you',
      '📱 Scan the QR code to earn points',
      '🎁 Redeem your points for rewards',
    ],
    cta: 'Explore shops',
  },
  ar: {
    pre: 'اكتشف المحلات اللي قريبين منك وابدا تجمع النقط!',
    h: '🏪 اكتشف المحلات اللي قريبين منك!',
    p1: (b) => `عشرات المحلات الشركاء كيتسناوك ف <strong style="color: ${b};">جيت بلوس</strong>. قهاوي، ريسطوران، صالونات، حوانت&hellip; اربح نقط ف كل زيارة!`,
    bullets: [
      '📍 لقى المحلات اللي حدا ليك',
      '📱 سكاني QR كود باش تربح نقط',
      '🎁 بدل النقط ديالك بكادوات',
    ],
    cta: 'اكتشف المحلات',
  },
};

export function buildWelcomeDay1Email(prenom: string | undefined, lang: Lang = 'fr'): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || DEFAULT_NAME[lang]);
  const c = WELCOME_DAY1[lang];
  const rowBullets = c.bullets.map((b) => `<tr><td style="padding: 6px 0;"><span style="color: #334155; font-size: 14px;">${b}</span></td></tr>`).join('');

  return wrapCampaignEmail({
    brand, lang,
    preheader: c.pre,
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${c.h}</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${HELLO[lang]} ${name},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.p1(brand.accent)}</p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">${rowBullets}</table>
      </div>`,
    ctaText: c.cta,
    ctaUrl: buildCampaignCta({ appPath: '/(tabs)/discover', campaign: 'welcome_day1' }),
  });
}

const WELCOME_DAY3: Record<Lang, {
  pre: string; h: string; p1: (b: string) => string; steps: string; flow: string; cta: string;
}> = {
  fr: {
    pre: 'Gagnez vos premiers points de fidélité — c\'est gratuit et rapide !',
    h: '⭐ Gagnez vos premiers points !',
    p1: (b) => `Saviez-vous que <strong>chaque achat</strong> chez un commerce partenaire vous rapporte des points ? Il suffit de montrer votre <strong style="color: ${b};">QR code JitPlus</strong> au commer&ccedil;ant.`,
    steps: '3 &eacute;tapes simples',
    flow: '1. Achetez &mdash; 2. Scannez &mdash; 3. Gagnez !',
    cta: 'Ouvrir mon QR code',
  },
  en: {
    pre: 'Earn your first loyalty points — it\'s free and fast!',
    h: '⭐ Earn your first points!',
    p1: (b) => `Did you know that <strong>every purchase</strong> at a partner shop earns you points? Just show your <strong style="color: ${b};">JitPlus QR code</strong> to the merchant.`,
    steps: '3 simple steps',
    flow: '1. Buy &mdash; 2. Scan &mdash; 3. Earn!',
    cta: 'Open my QR code',
  },
  ar: {
    pre: 'اربح أول نقط ديالك ديال الوفاء — فابور وبزربة!',
    h: '⭐ اربح أول النقط ديالك!',
    p1: (b) => `واش كنتي تعرف بلي <strong>كل شراء</strong> عند تاجر شريك كيجيب ليك نقط؟ غير وري <strong style="color: ${b};">QR كود ديال جيت بلوس</strong> للتاجر.`,
    steps: '3 خطوات ساهلين',
    flow: '1. شري &mdash; 2. سكاني &mdash; 3. اربح!',
    cta: 'حل QR كود ديالي',
  },
};

export function buildWelcomeDay3Email(prenom: string | undefined, lang: Lang = 'fr'): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || DEFAULT_NAME[lang]);
  const c = WELCOME_DAY3[lang];

  return wrapCampaignEmail({
    brand, lang,
    preheader: c.pre,
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${c.h}</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${HELLO[lang]} ${name},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.p1(brand.accent)}</p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 16px;">
        <p style="color: ${brand.accent}; font-size: 24px; font-weight: 800; margin: 0;">${c.steps}</p>
        <p style="color: #64748B; font-size: 14px; margin: 8px 0 0;">${c.flow}</p>
      </div>`,
    ctaText: c.cta,
    ctaUrl: buildCampaignCta({ appPath: '/(tabs)/qr', campaign: 'welcome_day3' }),
  });
}

const WELCOME_DAY7: Record<Lang, {
  pre: string; h: string; p1: (b: string) => string; bonus: string; bonusNote: string; cta: string;
}> = {
  fr: {
    pre: 'Invitez vos amis sur JitPlus et gagnez des bonus ensemble !',
    h: '🎁 Parrainez et gagnez !',
    p1: (b) => `Vous aimez JitPlus ? Partagez-le avec vos amis et gagnez des r&eacute;compenses ! Quand un ami que vous parrainez s'inscrit, vous recevez tous les deux un <strong style="color: ${b};">bonus sp&eacute;cial</strong>.`,
    bonus: '💰 25 DH de bonus',
    bonusNote: 'Pour chaque ami commer&ccedil;ant qui s\'abonne Premium',
    cta: 'Partager mon code',
  },
  en: {
    pre: 'Invite your friends to JitPlus and earn bonuses together!',
    h: '🎁 Refer a friend and earn!',
    p1: (b) => `Enjoy JitPlus? Share it with your friends and earn rewards! When a friend you refer signs up, you both receive a <strong style="color: ${b};">special bonus</strong>.`,
    bonus: '💰 25 DH bonus',
    bonusNote: 'For every merchant friend who subscribes to Premium',
    cta: 'Share my code',
  },
  ar: {
    pre: 'عيّط لصحابك على جيت بلوس واربحو بجوج!',
    h: '🎁 بارطاجي واربح!',
    p1: (b) => `كتعجبك جيت بلوس؟ بارطاجيها مع صحابك واربحو كادوات! ملي واحد من صحابك يتسجل بكود ديالك، تاتوصلو بجوج ب<strong style="color: ${b};">بونوس خاص</strong>.`,
    bonus: '💰 25 درهم بونوس',
    bonusNote: 'لكل صاحب تاجر كيشري الاشتراك بريميوم',
    cta: 'بارطاجي الكود ديالي',
  },
};

export function buildWelcomeDay7Email(prenom: string | undefined, lang: Lang = 'fr'): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || DEFAULT_NAME[lang]);
  const c = WELCOME_DAY7[lang];

  return wrapCampaignEmail({
    brand, lang,
    preheader: c.pre,
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${c.h}</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${HELLO[lang]} ${name},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.p1(brand.accent)}</p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 16px;">
        <p style="color: ${brand.accent}; font-size: 20px; font-weight: 800; margin: 0;">${c.bonus}</p>
        <p style="color: #64748B; font-size: 14px; margin: 8px 0 0;">${c.bonusNote}</p>
      </div>`,
    ctaText: c.cta,
    ctaUrl: buildCampaignCta({ appPath: '/referral', campaign: 'welcome_day7' }),
  });
}

// ── Re-engagement Emails ─────────────────────────────────────────────────────

const REENGAGE_7D: Record<Lang, { pre: string; h: string; p1: string; p2: string; cta: string; }> = {
  fr: {
    pre: 'Vos points vous attendent ! Passez chez vos commerces favoris.',
    h: '💫 Vos points vous attendent !',
    p1: 'Ça fait un moment qu\'on ne vous a pas vu ! Vos points de fidélité sont toujours là, prêts à être échangés contre des récompenses.',
    p2: 'Passez chez vos commerces favoris pour continuer à cumuler des points ! 💪',
    cta: 'Voir mes points',
  },
  en: {
    pre: 'Your points are waiting! Visit your favourite shops.',
    h: '💫 Your points are waiting!',
    p1: 'It\'s been a while! Your loyalty points are still here, ready to be redeemed for rewards.',
    p2: 'Visit your favourite shops to keep earning points! 💪',
    cta: 'View my points',
  },
  ar: {
    pre: 'النقط ديالك كتسناك! دوز عند المحلات اللي كتعجبك.',
    h: '💫 النقط ديالك كتسناك!',
    p1: 'هادي شي مدة ما شفناكش! النقط ديال الوفاء ديالك مازالين ثمة، واجدين باش تبدلهم بكادوات.',
    p2: 'دوز عند المحلات ديالك باش تكمل تجمع النقط! 💪',
    cta: 'شوف النقط ديالي',
  },
};

export function buildReengagement7dEmail(prenom: string | undefined, lang: Lang = 'fr'): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || DEFAULT_NAME[lang]);
  const c = REENGAGE_7D[lang];

  return wrapCampaignEmail({
    brand, lang,
    preheader: c.pre,
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${c.h}</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${HELLO[lang]} ${name},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.p1}</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0;">${c.p2}</p>`,
    ctaText: c.cta,
    ctaUrl: buildCampaignCta({ appPath: '/(tabs)', campaign: 'reengagement_7d' }),
  });
}

const REENGAGE_14D: Record<Lang, { pre: string; h: string; p1: string; badge: string; cta: string; }> = {
  fr: {
    pre: 'Ne perdez pas vos avantages fidélité — revenez profiter de vos points !',
    h: '🔥 Ne perdez pas vos avantages !',
    p1: 'Vos points et récompenses n\'attendent que vous. Ne laissez pas passer cette opportunité — des dizaines de commerces ont des offres spéciales pour vous !',
    badge: '⚡ Vos points sont toujours valables',
    cta: 'Revenir sur JitPlus',
  },
  en: {
    pre: 'Don\'t lose your loyalty perks — come back and enjoy your points!',
    h: '🔥 Don\'t lose your perks!',
    p1: 'Your points and rewards are waiting for you. Don\'t miss out — dozens of shops have special offers just for you!',
    badge: '⚡ Your points are still valid',
    cta: 'Come back to JitPlus',
  },
  ar: {
    pre: 'ما تضيعش المزايا ديالك — رجع تمتع بالنقط!',
    h: '🔥 ما تضيعش المزايا ديالك!',
    p1: 'النقط والكادوات ديالك كيتسناوك. ما تخليش الفرصة تفوت — عشرات المحلات عندهم عروض خاصة ليك!',
    badge: '⚡ النقط ديالك مازال صالحين',
    cta: 'رجع لجيت بلوس',
  },
};

export function buildReengagement14dEmail(prenom: string | undefined, lang: Lang = 'fr'): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || DEFAULT_NAME[lang]);
  const c = REENGAGE_14D[lang];

  return wrapCampaignEmail({
    brand, lang,
    preheader: c.pre,
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${c.h}</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${HELLO[lang]} ${name},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.p1}</p>
      <div style="background: #FEF3C7; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 16px;">
        <p style="color: #92400E; font-size: 15px; font-weight: 700; margin: 0;">${c.badge}</p>
      </div>`,
    ctaText: c.cta,
    ctaUrl: buildCampaignCta({ appPath: '/(tabs)/discover', campaign: 'reengagement_14d' }),
  });
}

const REENGAGE_30D: Record<Lang, { pre: string; h: string; p1: string; p2: string; cta: string; }> = {
  fr: {
    pre: 'Vous nous manquez ! De nouvelles offres vous attendent sur JitPlus.',
    h: '😢 Vous nous manquez !',
    p1: 'Cela fait 30 jours que vous n\'avez pas utilisé JitPlus. Pendant ce temps, de nouveaux commerces ont rejoint la plateforme et de nouvelles récompenses vous attendent !',
    p2: 'Revenez découvrir tout ce qu\'on a préparé pour vous. On vous promet, ça vaut le coup ! 💜',
    cta: 'Redécouvrir JitPlus',
  },
  en: {
    pre: 'We miss you! New offers are waiting for you on JitPlus.',
    h: '😢 We miss you!',
    p1: 'It\'s been 30 days since you last used JitPlus. Meanwhile, new shops have joined the platform and new rewards are waiting for you!',
    p2: 'Come back and discover what we\'ve prepared for you. Promise, it\'s worth it! 💜',
    cta: 'Rediscover JitPlus',
  },
  ar: {
    pre: 'كتخصرنا! عروض جديدة كتسناك ف جيت بلوس.',
    h: '😢 كتخصرنا!',
    p1: 'هادي 30 يوم ما استعملتيش جيت بلوس. خلال هاد الوقت، محلات جداد دخلو للمنصة، وكادوات جداد كيتسناوك!',
    p2: 'رجع اكتشف كل اللي وجدنا ليك. بالحق، كيسوا العناء! 💜',
    cta: 'رجع اكتشف جيت بلوس',
  },
};

export function buildReengagement30dEmail(prenom: string | undefined, lang: Lang = 'fr'): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || DEFAULT_NAME[lang]);
  const c = REENGAGE_30D[lang];

  return wrapCampaignEmail({
    brand, lang,
    preheader: c.pre,
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${c.h}</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${HELLO[lang]} ${name},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.p1}</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0;">${c.p2}</p>`,
    ctaText: c.cta,
    ctaUrl: buildCampaignCta({ appPath: '/(tabs)/discover', campaign: 'reengagement_30d' }),
  });
}

// ── Reward Reminder ────────────────────────────────────────────────────────

const REWARD_AVAILABLE: Record<Lang, {
  pre: (r: string, m: string) => string;
  h: string; hello: string;
  p1: (pts: number, m: string, accent: string) => string;
  p2: (m: string) => string;
  cta: string;
}> = {
  fr: {
    pre: (r, m) => `Vous avez assez de points pour "${r}" chez ${m} !`,
    h: '🎉 R&eacute;compense disponible !',
    hello: 'Bonjour',
    p1: (pts, m, accent) => `Bonne nouvelle ! Vous avez accumul&eacute; <strong style="color: ${accent};">${pts} points</strong> chez <strong>${m}</strong> &mdash; assez pour obtenir :`,
    p2: (m) => `Passez chez <strong>${m}</strong> pour r&eacute;cup&eacute;rer votre r&eacute;compense !`,
    cta: 'Voir ma récompense',
  },
  en: {
    pre: (r, m) => `You have enough points for "${r}" at ${m}!`,
    h: '🎉 Reward available!',
    hello: 'Hello',
    p1: (pts, m, accent) => `Good news! You have earned <strong style="color: ${accent};">${pts} points</strong> at <strong>${m}</strong> &mdash; enough to claim:`,
    p2: (m) => `Visit <strong>${m}</strong> to claim your reward!`,
    cta: 'View my reward',
  },
  ar: {
    pre: (r, m) => `عندك نقط باش تاخد "${r}" عند ${m}!`,
    h: '🎉 الكادو متاح!',
    hello: 'السلام',
    p1: (pts, m, accent) => `خبار زوين! جمعتي <strong style="color: ${accent};">${pts} نقطة</strong> عند <strong>${m}</strong> &mdash; كافيين باش تاخد:`,
    p2: (m) => `دوز عند <strong>${m}</strong> باش تاخد الكادو ديالك!`,
    cta: 'شوف الكادو ديالي',
  },
};

export function buildRewardAvailableEmail(
  prenom: string | undefined,
  merchantName: string,
  rewardName: string,
  points: number,
  merchantId?: string,
  lang: Lang = 'fr',
): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || DEFAULT_NAME[lang]);
  const safeMerchant = escapeHtml(merchantName);
  const safeReward = escapeHtml(rewardName);
  const c = REWARD_AVAILABLE[lang];

  return wrapCampaignEmail({
    brand, lang,
    preheader: c.pre(rewardName, merchantName),
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${c.h}</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.hello} ${name},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.p1(points, safeMerchant, brand.accent)}</p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 16px;">
        <p style="color: ${brand.accent}; font-size: 18px; font-weight: 800; margin: 0;">🎁 ${safeReward}</p>
      </div>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0;">${c.p2(safeMerchant)}</p>`,
    ctaText: c.cta,
    ctaUrl: buildCampaignCta({
      appPath: merchantId ? `/merchant/${merchantId}` : '/(tabs)',
      campaign: 'reward_available',
      merchantId,
    }),
  });
}

/** Localized unit label for the "almost there" email. */
function almostUnit(lang: Lang, remaining: number, isStamps: boolean): string {
  if (lang === 'fr') return isStamps ? (remaining > 1 ? 'tampons' : 'tampon') : 'points';
  if (lang === 'en') return isStamps ? (remaining > 1 ? 'stamps' : 'stamp') : 'points';
  // Arabic / darija — same form for singular and plural
  return isStamps ? 'طوابع' : 'نقط';
}

const ALMOST_THERE: Record<Lang, {
  pre: (n: number, u: string, m: string) => string;
  h: string; hello: string;
  p1: (n: number, u: string, m: string, accent: string) => string;
  badge: (n: number, u: string) => string;
  p2: (m: string) => string;
  cta: string;
}> = {
  fr: {
    pre: (n, u, m) => `Plus que ${n} ${u} chez ${m} pour votre récompense !`,
    h: '🔥 Vous y &ecirc;tes presque !',
    hello: 'Bonjour',
    p1: (n, u, m, accent) => `Il ne vous manque plus que <strong style="color: ${accent};">${n} ${u}</strong> chez <strong>${m}</strong> pour d&eacute;bloquer votre r&eacute;compense !`,
    badge: (n, u) => `⚡ Plus que ${n} ${u} !`,
    p2: (m) => `Passez chez <strong>${m}</strong> pour compl&eacute;ter votre carte et profiter de votre r&eacute;compense !`,
    cta: 'Voir mes points',
  },
  en: {
    pre: (n, u, m) => `Only ${n} more ${u} at ${m} for your reward!`,
    h: '🔥 Almost there!',
    hello: 'Hello',
    p1: (n, u, m, accent) => `You only need <strong style="color: ${accent};">${n} more ${u}</strong> at <strong>${m}</strong> to unlock your reward!`,
    badge: (n, u) => `⚡ Only ${n} ${u} left!`,
    p2: (m) => `Stop by <strong>${m}</strong> to complete your card and enjoy your reward!`,
    cta: 'View my points',
  },
  ar: {
    pre: (n, u, m) => `بقا ليك ${n} ${u} عند ${m} باش تاخد الكادو!`,
    h: '🔥 قريب توصل!',
    hello: 'السلام',
    p1: (n, u, m, accent) => `بقا ليك غير <strong style="color: ${accent};">${n} ${u}</strong> عند <strong>${m}</strong> باش تفتح الكادو!`,
    badge: (n, u) => `⚡ بقا ${n} ${u}!`,
    p2: (m) => `دوز عند <strong>${m}</strong> باش تكمل الكارط وتاخد الكادو ديالك!`,
    cta: 'شوف النقط ديالي',
  },
};

export function buildAlmostThereEmail(
  prenom: string | undefined,
  merchantName: string,
  remaining: number,
  isStamps: boolean,
  merchantId?: string,
  lang: Lang = 'fr',
): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || DEFAULT_NAME[lang]);
  const safeMerchant = escapeHtml(merchantName);
  const unit = almostUnit(lang, remaining, isStamps);
  const c = ALMOST_THERE[lang];

  return wrapCampaignEmail({
    brand, lang,
    preheader: c.pre(remaining, unit, merchantName),
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${c.h}</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.hello} ${name},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.p1(remaining, unit, safeMerchant, brand.accent)}</p>
      <div style="background: #FEF3C7; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 16px;">
        <p style="color: #92400E; font-size: 16px; font-weight: 700; margin: 0;">${c.badge(remaining, unit)}</p>
      </div>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0;">${c.p2(safeMerchant)}</p>`,
    ctaText: c.cta,
    ctaUrl: buildCampaignCta({
      appPath: merchantId ? `/merchant/${merchantId}` : '/(tabs)',
      campaign: 'reward_almost',
      merchantId,
    }),
  });
}

// ── Weekly Digest ────────────────────────────────────────────────────────────

const WEEKLY_DIGEST: Record<Lang, {
  pre: (pts: number, n: number) => string;
  h: string; hello: string; intro: string;
  earnedLabel: string; visitsLabel: string;
  outroPositive: string; outroEmpty: string;
  cta: string;
}> = {
  fr: {
    pre: (pts, n) => `Cette semaine : +${pts} points chez ${n} commerce(s) !`,
    h: '📊 Votre r&eacute;sum&eacute; de la semaine',
    hello: 'Bonjour',
    intro: 'Voici vos stats de la semaine sur JitPlus :',
    earnedLabel: 'points gagn&eacute;s',
    visitsLabel: 'commerce(s) visit&eacute;(s)',
    outroPositive: 'Bravo, continuez comme &ccedil;a ! 💪',
    outroEmpty: 'Visitez vos commerces favoris cette semaine pour gagner des points !',
    cta: 'Voir tous mes points',
  },
  en: {
    pre: (pts, n) => `This week: +${pts} points across ${n} shop(s)!`,
    h: '📊 Your week on JitPlus',
    hello: 'Hello',
    intro: 'Here are your JitPlus stats for the week:',
    earnedLabel: 'points earned',
    visitsLabel: 'shop(s) visited',
    outroPositive: 'Great work, keep it up! 💪',
    outroEmpty: 'Visit your favourite shops this week to earn points!',
    cta: 'View all my points',
  },
  ar: {
    pre: (pts, n) => `هاد السيمانة: +${pts} نقطة عند ${n} محل!`,
    h: '📊 الملخص ديال السيمانة ديالك',
    hello: 'السلام',
    intro: 'هاهي الإحصائيات ديالك ف جيت بلوس هاد السيمانة:',
    earnedLabel: 'نقط مربوحة',
    visitsLabel: 'محل مزور',
    outroPositive: 'برافو، كمل هكاك! 💪',
    outroEmpty: 'زور المحلات ديالك هاد السيمانة باش تربح نقط!',
    cta: 'شوف كل النقط ديالي',
  },
};

export function buildWeeklyDigestEmail(
  prenom: string | undefined,
  totalPoints: number,
  merchantCount: number,
  lang: Lang = 'fr',
): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || DEFAULT_NAME[lang]);
  const c = WEEKLY_DIGEST[lang];

  return wrapCampaignEmail({
    brand, lang,
    preheader: c.pre(totalPoints, merchantCount),
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${c.h}</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.hello} ${name},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">${c.intro}</p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 20px;">
        <tr>
          <td style="width: 50%; padding: 12px; background: ${brand.accentLight}; border-radius: 10px 0 0 10px; text-align: center;">
            <p style="color: ${brand.accent}; font-size: 28px; font-weight: 800; margin: 0;">+${totalPoints}</p>
            <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 4px 0 0;">${c.earnedLabel}</p>
          </td>
          <td style="width: 50%; padding: 12px; background: ${brand.accentLight}; border-radius: 0 10px 10px 0; text-align: center;">
            <p style="color: ${brand.accent}; font-size: 28px; font-weight: 800; margin: 0;">${merchantCount}</p>
            <p style="color: ${brand.accentMuted}; font-size: 13px; margin: 4px 0 0;">${c.visitsLabel}</p>
          </td>
        </tr>
      </table>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0;">${totalPoints > 0 ? c.outroPositive : c.outroEmpty}</p>`,
    ctaText: c.cta,
    ctaUrl: buildCampaignCta({ appPath: '/(tabs)', campaign: 'weekly_digest' }),
  });
}

// ── Referral Campaign ────────────────────────────────────────────────────────

const REFERRAL: Record<Lang, {
  pre: string; h: string; hello: string;
  p1: (accent: string) => string;
  steps: [string, string, string];
  cta: string;
}> = {
  fr: {
    pre: 'Invitez un commerçant sur JitPlus et gagnez 25 DH de bonus !',
    h: '💰 Parrainez et gagnez 25 DH !',
    hello: 'Bonjour',
    p1: (accent) => `Connaissez-vous un commer&ccedil;ant qui aimerait fid&eacute;liser ses clients ? Invitez-le sur <strong style="color: ${accent};">JitPlus</strong> et recevez <strong>25 DH de bonus</strong> quand il s'abonne au plan Premium !`,
    steps: [
      '1️⃣ Partagez votre code de parrainage',
      '2️⃣ Le commer&ccedil;ant s\'inscrit avec votre code',
      '3️⃣ Vous recevez 25 DH d&egrave;s qu\'il s\'abonne',
    ],
    cta: 'Partager mon code',
  },
  en: {
    pre: 'Invite a merchant to JitPlus and earn a 25 DH bonus!',
    h: '💰 Refer and earn 25 DH!',
    hello: 'Hello',
    p1: (accent) => `Know a merchant who\'d love to build customer loyalty? Invite them to <strong style="color: ${accent};">JitPlus</strong> and get a <strong>25 DH bonus</strong> when they subscribe to Premium!`,
    steps: [
      '1️⃣ Share your referral code',
      '2️⃣ The merchant signs up using your code',
      '3️⃣ You receive 25 DH as soon as they subscribe',
    ],
    cta: 'Share my code',
  },
  ar: {
    pre: 'عيط لتاجر على جيت بلوس واربح 25 درهم بونوس!',
    h: '💰 بارطاجي واربح 25 درهم!',
    hello: 'السلام',
    p1: (accent) => `واش كتعرف تاجر بغا يفيّد الزبناء ديالو؟ عيط ليه ل<strong style="color: ${accent};">جيت بلوس</strong> واخد <strong>25 درهم بونوس</strong> ملي يشري الاشتراك بريميوم!`,
    steps: [
      '1️⃣ بارطاجي كود التعريف ديالك',
      '2️⃣ التاجر كيتسجل بالكود ديالك',
      '3️⃣ كتوصلك 25 درهم ملي كيشري الاشتراك',
    ],
    cta: 'بارطاجي الكود ديالي',
  },
};

export function buildReferralCampaignEmail(prenom: string | undefined, lang: Lang = 'fr'): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || DEFAULT_NAME[lang]);
  const c = REFERRAL[lang];
  const stepRows = c.steps.map((s) => `<tr><td style="padding: 6px 0;"><span style="color: #334155; font-size: 14px;">${s}</span></td></tr>`).join('');

  return wrapCampaignEmail({
    brand, lang,
    preheader: c.pre,
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${c.h}</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.hello} ${name},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.p1(brand.accent)}</p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">${stepRows}</table>
      </div>`,
    ctaText: c.cta,
    ctaUrl: buildCampaignCta({ appPath: '/referral', campaign: 'referral_campaign' }),
  });
}

// ── Feature Highlights ───────────────────────────────────────────────────────

const FEATURE_STAMPS: Record<Lang, {
  pre: string; h: string; hello: string;
  p1: (accent: string) => string;
  caption: string; cta: string;
}> = {
  fr: {
    pre: 'Découvrez les cartes de tampons — collectez et gagnez des récompenses gratuites !',
    h: '📋 Le saviez-vous ?',
    hello: 'Bonjour',
    p1: (accent) => `Certains commerces sur JitPlus proposent des <strong style="color: ${accent};">cartes de tampons</strong>. &Agrave; chaque visite, vous collectez un tampon. Une fois la carte compl&egrave;te, vous gagnez une r&eacute;compense gratuite !`,
    caption: '10 tampons = 1 r&eacute;compense gratuite',
    cta: 'Découvrir les commerces',
  },
  en: {
    pre: 'Discover stamp cards — collect and earn free rewards!',
    h: '📋 Did you know?',
    hello: 'Hello',
    p1: (accent) => `Some shops on JitPlus offer <strong style="color: ${accent};">stamp cards</strong>. Every visit, you collect a stamp. Once the card is full, you get a free reward!`,
    caption: '10 stamps = 1 free reward',
    cta: 'Discover shops',
  },
  ar: {
    pre: 'اكتشف كارطات الطوابع — جمع واربح كادوات فابور!',
    h: '📋 واش كنتي تعرف؟',
    hello: 'السلام',
    p1: (accent) => `بعض المحلات ف جيت بلوس كيقدمو <strong style="color: ${accent};">كارطات الطوابع</strong>. ف كل زيارة كتجمع طابع. ملي تكمل الكارطة، كتاخد كادو فابور!`,
    caption: '10 طوابع = كادو فابور',
    cta: 'اكتشف المحلات',
  },
};

export function buildFeatureStampsEmail(prenom: string | undefined, lang: Lang = 'fr'): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || DEFAULT_NAME[lang]);
  const c = FEATURE_STAMPS[lang];

  return wrapCampaignEmail({
    brand, lang,
    preheader: c.pre,
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${c.h}</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.hello} ${name},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.p1(brand.accent)}</p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 16px;">
        <p style="font-size: 28px; margin: 0;">☕ ☕ ☕ ☕ ☕ ☕ ☕ ☕ ☕ 🎁</p>
        <p style="color: ${brand.accent}; font-size: 14px; font-weight: 600; margin: 8px 0 0;">${c.caption}</p>
      </div>`,
    ctaText: c.cta,
    ctaUrl: buildCampaignCta({ appPath: '/(tabs)/discover', campaign: 'feature_stamps' }),
  });
}

const FEATURE_QR: Record<Lang, {
  pre: string; h: string; hello: string;
  intro: string;
  steps: [string, string, string, string];
  cta: string;
}> = {
  fr: {
    pre: 'Scanner = Gagner ! Gagnez des points automatiquement à chaque achat.',
    h: '📱 Scanner = Gagner !',
    hello: 'Bonjour',
    intro: 'Avec JitPlus, chaque achat vous rapporte des points. Comment &ccedil;a marche ?',
    steps: [
      '🛒 Faites vos achats normalement',
      '📲 Montrez votre QR code au commer&ccedil;ant',
      '⭐ Les points s\'ajoutent automatiquement',
      '🎁 &Eacute;changez contre des r&eacute;compenses',
    ],
    cta: 'Ouvrir mon QR code',
  },
  en: {
    pre: 'Scan = Earn! Get points automatically on every purchase.',
    h: '📱 Scan = Earn!',
    hello: 'Hello',
    intro: 'With JitPlus, every purchase earns you points. How does it work?',
    steps: [
      '🛒 Shop as usual',
      '📲 Show your QR code to the merchant',
      '⭐ Points are added automatically',
      '🎁 Redeem for rewards',
    ],
    cta: 'Open my QR code',
  },
  ar: {
    pre: 'سكاني = اربح! اربح نقط أوتوماتيك ف كل شراء.',
    h: '📱 سكاني = اربح!',
    hello: 'السلام',
    intro: 'مع جيت بلوس، كل شراء كيجيب ليك نقط. كيفاش كتخدم؟',
    steps: [
      '🛒 دير الشراء ديالك بشكل عادي',
      '📲 وري QR كود ديالك للتاجر',
      '⭐ النقط كتزاد أوتوماتيك',
      '🎁 بدلهم بكادوات',
    ],
    cta: 'حل QR كود ديالي',
  },
};

export function buildFeatureQREmail(prenom: string | undefined, lang: Lang = 'fr'): string {
  const brand = BRANDS.client;
  const name = escapeHtml(prenom || DEFAULT_NAME[lang]);
  const c = FEATURE_QR[lang];
  const rows = c.steps.map((s) => `<tr><td style="padding: 8px 0;"><span style="color: #334155; font-size: 14px;">${s}</span></td></tr>`).join('');

  return wrapCampaignEmail({
    brand, lang,
    preheader: c.pre,
    content: `
      <h2 style="color: #1E1B4B; font-size: 20px; margin: 0 0 12px;">${c.h}</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.hello} ${name},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${c.intro}</p>
      <div style="background: ${brand.accentLight}; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">${rows}</table>
      </div>`,
    ctaText: c.cta,
    ctaUrl: buildCampaignCta({ appPath: '/(tabs)/qr', campaign: 'feature_qr' }),
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
