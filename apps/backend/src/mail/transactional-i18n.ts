/**
 * Multilingual strings for transactional and lifecycle emails.
 * Keep keys in sync with templates that consume them.
 *
 * Languages supported: fr (default), en, ar (Darija in Latin/Arabic mix).
 * Fallback strategy: any unknown language falls back to 'fr'.
 */

export type EmailLang = 'fr' | 'en' | 'ar';

export function pickEmailLang(raw: string | null | undefined): EmailLang {
  const v = (raw || '').toLowerCase();
  if (v.startsWith('en')) return 'en';
  if (v.startsWith('ar') || v === 'darija') return 'ar';
  return 'fr';
}

export const SUPPORT_EMAIL = 'contact@jitplus.com';
export const CONTACT_EMAIL = 'contact@jitplus.com';
export const PRIVACY_URL_CLIENT = 'https://jitplus.com/privacy';
export const TERMS_URL_CLIENT = 'https://jitplus.com/cgu';
export const PRIVACY_URL_PRO = 'https://jitplus.com/privacy';
export const TERMS_URL_PRO = 'https://jitplus.com/cgu';

// Company legal info — Morocco
export const COMPANY_LEGAL = {
  name: 'JitPlus',
  // Adjust if needed when registered legal entity is finalized
  address: 'Casablanca, Maroc',
};

// ─── Footer strings ──────────────────────────────────────────────────────────

export const FOOTER_I18N: Record<EmailLang, {
  rights: (year: number, brand: string) => string;
  reasonTransactional: string;
  reasonMarketing: string;
  privacy: string;
  terms: string;
  contact: string;
  unsubscribeNote: string;
}> = {
  fr: {
    rights: (y, b) => `© ${y} ${b} — Tous droits réservés`,
    reasonTransactional: 'Vous recevez cet e-mail car vous avez un compte sur',
    reasonMarketing: 'Vous recevez cet e-mail car vous êtes inscrit aux communications de',
    privacy: 'Confidentialité',
    terms: 'CGU',
    contact: 'Contact',
    unsubscribeNote: 'Pour ne plus recevoir ces e-mails, désactivez les notifications dans l’application.',
  },
  en: {
    rights: (y, b) => `© ${y} ${b} — All rights reserved`,
    reasonTransactional: 'You are receiving this email because you have an account on',
    reasonMarketing: 'You are receiving this email because you are subscribed to communications from',
    privacy: 'Privacy',
    terms: 'Terms',
    contact: 'Contact',
    unsubscribeNote: 'To stop receiving these emails, disable notifications in the app.',
  },
  ar: {
    rights: (y, b) => `© ${y} ${b} — جميع الحقوق محفوظة`,
    reasonTransactional: 'كتوصلك هاد الإيمايل علاحقاش عندك كومبت ف',
    reasonMarketing: 'كتوصلك هاد الإيمايل علاحقاش مسجل ف الكوميونيكاسيون ديال',
    privacy: 'الخصوصية',
    terms: 'الشروط',
    contact: 'الاتصال',
    unsubscribeNote: 'باش ما تبقاش توصلك، حيد النوتيفيكاسيون من الأبليكاسيون.',
  },
};

// ─── OTP ─────────────────────────────────────────────────────────────────────

export type OtpPurpose = 'login' | 'register' | 'reset' | 'change-email' | 'change-phone' | 'verification';

export const OTP_I18N: Record<EmailLang, {
  subject: (code: string, brand: string, purpose: OtpPurpose) => string;
  intro: (purpose: OtpPurpose) => string;
  expires: string;
  ignore: string;
}> = {
  fr: {
    subject: (code, brand, purpose) => {
      const map: Record<OtpPurpose, string> = {
        login: 'Code de connexion',
        register: 'Code de création de compte',
        reset: 'Code de réinitialisation',
        'change-email': 'Code de changement d’e-mail',
        'change-phone': 'Code de changement de téléphone',
        verification: 'Code de vérification',
      };
      return `${code} — ${map[purpose]} ${brand}`;
    },
    intro: (purpose) => {
      const map: Record<OtpPurpose, string> = {
        login: 'Votre code pour vous connecter :',
        register: 'Votre code pour créer votre compte :',
        reset: 'Votre code pour réinitialiser votre mot de passe :',
        'change-email': 'Votre code pour changer d’adresse e-mail :',
        'change-phone': 'Votre code pour changer de numéro de téléphone :',
        verification: 'Votre code de vérification :',
      };
      return map[purpose];
    },
    expires: 'Ce code expire dans <strong>5 minutes</strong>.',
    ignore: "Si vous n'avez pas demandé ce code, ignorez cet e-mail.",
  },
  en: {
    subject: (code, brand, purpose) => {
      const map: Record<OtpPurpose, string> = {
        login: 'Login code',
        register: 'Sign-up code',
        reset: 'Password reset code',
        'change-email': 'Email change code',
        'change-phone': 'Phone change code',
        verification: 'Verification code',
      };
      return `${code} — ${brand} ${map[purpose]}`;
    },
    intro: (purpose) => {
      const map: Record<OtpPurpose, string> = {
        login: 'Your sign-in code:',
        register: 'Your account creation code:',
        reset: 'Your password reset code:',
        'change-email': 'Your email change code:',
        'change-phone': 'Your phone change code:',
        verification: 'Your verification code:',
      };
      return map[purpose];
    },
    expires: 'This code expires in <strong>5 minutes</strong>.',
    ignore: "If you didn't request this code, ignore this email.",
  },
  ar: {
    subject: (code, brand, purpose) => {
      const map: Record<OtpPurpose, string> = {
        login: 'كود الدخول',
        register: 'كود التسجيل',
        reset: 'كود تغيير الباسوورد',
        'change-email': 'كود تبديل الإيمايل',
        'change-phone': 'كود تبديل التيليفون',
        verification: 'كود التحقيق',
      };
      return `${code} — ${map[purpose]} ${brand}`;
    },
    intro: (purpose) => {
      const map: Record<OtpPurpose, string> = {
        login: 'الكود ديالك باش تدخل :',
        register: 'الكود ديالك باش تصاوب الكومبت :',
        reset: 'الكود ديالك باش تبدل الباسوورد :',
        'change-email': 'الكود ديالك باش تبدل الإيمايل :',
        'change-phone': 'الكود ديالك باش تبدل التيليفون :',
        verification: 'الكود ديال التحقيق :',
      };
      return map[purpose];
    },
    expires: 'هاد الكود كيتسالى ف <strong>5 دقايق</strong>.',
    ignore: 'إلا ماشي نتا اللي طلبتي هاد الكود، ما تعطيوش الأهمية.',
  },
};

// ─── Welcome ─────────────────────────────────────────────────────────────────

export const WELCOME_CLIENT_I18N: Record<EmailLang, {
  subject: string;
  greeting: (name: string) => string;
  intro: string;
  bullets: string[];
  cta: string;
  preheader: (name: string) => string;
}> = {
  fr: {
    subject: 'Bienvenue sur JitPlus ! 🎉',
    greeting: (n) => `Bienvenue ${n} ! 🎉`,
    intro: 'Votre compte JitPlus a été créé avec succès. Vous pouvez désormais :',
    bullets: [
      'Cumuler des points chez vos commerçants préférés',
      'Profiter de récompenses exclusives',
      'Scanner votre QR code en magasin',
    ],
    cta: "Ouvrez l'application JitPlus et commencez à fidéliser dès maintenant !",
    preheader: (n) => `Bienvenue sur JitPlus ${n} ! Votre programme de fidélité vous attend.`,
  },
  en: {
    subject: 'Welcome to JitPlus! 🎉',
    greeting: (n) => `Welcome ${n}! 🎉`,
    intro: 'Your JitPlus account is ready. You can now:',
    bullets: [
      'Earn points at your favourite merchants',
      'Enjoy exclusive rewards',
      'Scan your QR code in store',
    ],
    cta: 'Open the JitPlus app and start collecting rewards today!',
    preheader: (n) => `Welcome to JitPlus ${n}! Your loyalty program is ready.`,
  },
  ar: {
    subject: 'مرحبا بيك ف JitPlus ! 🎉',
    greeting: (n) => `مرحبا ${n} ! 🎉`,
    intro: 'الكومبت ديالك ف JitPlus تصاوب. دابا تقدر :',
    bullets: [
      'تجمع البوينطات عند الكوميرسان ديالك',
      'تستافد من ريكومبانس حصرية',
      'تسكاني الـQR ديالك ف المحل',
    ],
    cta: 'حل JitPlus و بدا تجمع البوينطات !',
    preheader: (n) => `مرحبا بيك ف JitPlus ${n} !`,
  },
};

export const WELCOME_MERCHANT_I18N: Record<EmailLang, {
  subject: (name: string) => string;
  greeting: string;
  intro: (name: string) => string;
  bullets: string[];
  cta: string;
  preheader: (name: string) => string;
}> = {
  fr: {
    subject: (n) => `Bienvenue sur JitPlus Pro, ${n} ! 🚀`,
    greeting: 'Bienvenue sur JitPlus Pro ! 🚀',
    intro: (n) => `Votre commerce <strong>${n}</strong> est maintenant enregistré sur JitPlus.`,
    bullets: [
      'Scannez les QR codes de vos clients pour leur attribuer des points',
      'Créez des récompenses attractives',
      'Suivez vos statistiques en temps réel',
      'Gérez votre équipe facilement',
    ],
    cta: "Connectez-vous à l'application JitPlus Pro pour commencer à fidéliser vos clients !",
    preheader: (n) => `${n} est maintenant sur JitPlus Pro ! Commencez à fidéliser vos clients.`,
  },
  en: {
    subject: (n) => `Welcome to JitPlus Pro, ${n}! 🚀`,
    greeting: 'Welcome to JitPlus Pro! 🚀',
    intro: (n) => `Your business <strong>${n}</strong> is now on JitPlus.`,
    bullets: [
      'Scan customer QR codes to award points',
      'Create attractive rewards',
      'Track your stats in real time',
      'Easily manage your team',
    ],
    cta: 'Open the JitPlus Pro app and start engaging your customers!',
    preheader: (n) => `${n} is now on JitPlus Pro! Start engaging your customers.`,
  },
  ar: {
    subject: (n) => `مرحبا ف JitPlus Pro, ${n} ! 🚀`,
    greeting: 'مرحبا بيك ف JitPlus Pro ! 🚀',
    intro: (n) => `الكوميرس ديالك <strong>${n}</strong> دابا مسجل ف JitPlus.`,
    bullets: [
      'سكاني الـQR ديال الكليان باش تعطيهوم البوينطات',
      'صاوب ريكومبانس مزيانة',
      'تتبع لاسطاط ديالك ف الـreal time',
      'دير الفريق ديالك بسهولة',
    ],
    cta: 'دخل JitPlus Pro و بدا فيدالايز الكليان ديالك !',
    preheader: (n) => `${n} دابا ف JitPlus Pro !`,
  },
};

// ─── Referral bonus ──────────────────────────────────────────────────────────

export const REFERRAL_I18N: Record<EmailLang, {
  subject: (newMerchantName: string) => string;
  heading: string;
  greeting: (referrerName: string) => string;
  body: (newMerchantName: string) => string;
  bonus: string;
  expiryNote: (date: string) => string;
  outro: string;
  preheader: (newMerchantName: string) => string;
}> = {
  fr: {
    subject: (n) => `🎁 ${n} a rejoint JitPlus grâce à vous — 1 mois offert !`,
    heading: '🎁 Vous avez gagné 1 mois offert !',
    greeting: (n) => `Bonjour <strong>${n}</strong>,`,
    body: (n) => `Le commerce <strong>${n}</strong> vient de s'inscrire sur JitPlus Pro avec votre code de parrainage.`,
    bonus: '+1 mois Premium offert',
    expiryNote: (d) => `Votre abonnement Premium est valable jusqu'au <strong>${d}</strong>.`,
    outro: 'Continuez à partager votre code pour cumuler encore plus de mois gratuits !',
    preheader: (n) => `${n} a rejoint JitPlus Pro grâce à vous — 1 mois Premium offert !`,
  },
  en: {
    subject: (n) => `🎁 ${n} just joined JitPlus thanks to you — 1 month free!`,
    heading: '🎁 You earned 1 free month!',
    greeting: (n) => `Hi <strong>${n}</strong>,`,
    body: (n) => `<strong>${n}</strong> just signed up on JitPlus Pro with your referral code.`,
    bonus: '+1 free Premium month',
    expiryNote: (d) => `Your Premium plan is now valid until <strong>${d}</strong>.`,
    outro: 'Keep sharing your code to earn even more free months!',
    preheader: (n) => `${n} joined JitPlus Pro thanks to you — 1 Premium month earned!`,
  },
  ar: {
    subject: (n) => `🎁 ${n} دخل JitPlus بفضلك — شهر هدية !`,
    heading: '🎁 ربحتي شهر هدية !',
    greeting: (n) => `سلام <strong>${n}</strong>,`,
    body: (n) => `الكوميرس <strong>${n}</strong> سجل ف JitPlus Pro بالكود ديالك.`,
    bonus: '+1 شهر بريميوم هدية',
    expiryNote: (d) => `الأبونمون بريميوم ديالك صالح حتى ل <strong>${d}</strong>.`,
    outro: 'كمل تشارك الكود ديالك باش تربح بزاف ديال الشهور هدية !',
    preheader: (n) => `${n} دخل JitPlus Pro بفضلك !`,
  },
};

// ─── Account deletion ────────────────────────────────────────────────────────

export const ACCOUNT_DELETED_I18N: Record<EmailLang, {
  subjectClient: string;
  subjectMerchant: string;
  heading: string;
  greeting: (name: string | null) => string;
  bodyClient: (date: string) => string;
  bodyMerchant: (name: string, date: string) => string;
  whatRemoved: string;
  bulletsClient: string[];
  bulletsMerchant: string[];
  retention: string;
  notYouContact: string;
  preheaderClient: string;
  preheaderMerchant: (name: string) => string;
}> = {
  fr: {
    subjectClient: 'Confirmation de suppression de votre compte JitPlus',
    subjectMerchant: 'Confirmation de suppression de votre compte JitPlus Pro',
    heading: 'Votre compte a été supprimé',
    greeting: (n) => n ? `Bonjour ${n},` : 'Bonjour,',
    bodyClient: (d) => `Nous confirmons la suppression de votre compte JitPlus le ${d}.`,
    bodyMerchant: (n, d) => `Nous confirmons la suppression du compte JitPlus Pro associé à <strong>${n}</strong> le ${d}.`,
    whatRemoved: 'Ce qui a été supprimé ou anonymisé :',
    bulletsClient: [
      'Vos informations personnelles (nom, e-mail, téléphone, date de naissance)',
      'Vos identifiants et sessions de connexion',
      'Votre historique de navigation et parrainages',
      'Vos cartes de fidélité (désactivées)',
    ],
    bulletsMerchant: [
      'Vos informations personnelles (nom, e-mail, téléphone, adresse)',
      'Vos identifiants et sessions de connexion',
      'Vos logos, visuels et contenus publiés',
      'Vos cartes de fidélité, récompenses et équipe',
    ],
    retention: 'Certaines données de transactions sont conservées sous forme anonymisée pour des obligations légales et comptables.',
    notYouContact: "Si vous n'êtes pas à l'origine de cette demande, contactez-nous immédiatement.",
    preheaderClient: 'Confirmation de suppression de votre compte JitPlus',
    preheaderMerchant: (n) => `Confirmation de suppression du compte JitPlus Pro ${n}`,
  },
  en: {
    subjectClient: 'JitPlus account deletion confirmation',
    subjectMerchant: 'JitPlus Pro account deletion confirmation',
    heading: 'Your account has been deleted',
    greeting: (n) => n ? `Hi ${n},` : 'Hi,',
    bodyClient: (d) => `We confirm the deletion of your JitPlus account on ${d}.`,
    bodyMerchant: (n, d) => `We confirm the deletion of the JitPlus Pro account for <strong>${n}</strong> on ${d}.`,
    whatRemoved: 'What was deleted or anonymized:',
    bulletsClient: [
      'Your personal info (name, email, phone, date of birth)',
      'Your credentials and sessions',
      'Your browsing history and referrals',
      'Your loyalty cards (deactivated)',
    ],
    bulletsMerchant: [
      'Your personal info (name, email, phone, address)',
      'Your credentials and sessions',
      'Your logos, images and published content',
      'Your loyalty cards, rewards and team',
    ],
    retention: 'Some transaction data is kept in anonymized form for legal and accounting requirements.',
    notYouContact: "If you didn't request this, contact us immediately.",
    preheaderClient: 'JitPlus account deletion confirmation',
    preheaderMerchant: (n) => `JitPlus Pro account deletion confirmation for ${n}`,
  },
  ar: {
    subjectClient: 'تأكيد حذف الكومبت ديالك ف JitPlus',
    subjectMerchant: 'تأكيد حذف الكومبت ديالك ف JitPlus Pro',
    heading: 'الكومبت ديالك تحذف',
    greeting: (n) => n ? `سلام ${n},` : 'سلام,',
    bodyClient: (d) => `كنأكدو ليك حذف الكومبت ديالك ف JitPlus نهار ${d}.`,
    bodyMerchant: (n, d) => `كنأكدو ليك حذف الكومبت JitPlus Pro المربوط ب <strong>${n}</strong> نهار ${d}.`,
    whatRemoved: 'ها شنو تحذف ولا تأنونيمي :',
    bulletsClient: [
      'المعلومات ديالك (سمية، إيمايل، تيليفون، تاريخ الازدياد)',
      'الإدانتيفيان ديالك و السيسيون',
      'لاسطوار ديال النافيغاسيون و الباراناج',
      'الكارط فيديليتي (تحيدو)',
    ],
    bulletsMerchant: [
      'المعلومات ديالك (سمية، إيمايل، تيليفون، عنوان)',
      'الإدانتيفيان ديالك و السيسيون',
      'الـlogo و الكونطنو ديالك',
      'الكارط فيديليتي، الريكومبانس و الفريق',
    ],
    retention: 'بعض المعطيات ديال الترانزاكسيون كنخليوها بلا أسماء حسب القانون و المحاسبة.',
    notYouContact: 'إلا ماشي نتا اللي طلبتي، تواصل معانا دغية.',
    preheaderClient: 'تأكيد حذف الكومبت ديالك ف JitPlus',
    preheaderMerchant: (n) => `تأكيد حذف الكومبت JitPlus Pro ديال ${n}`,
  },
};

// ─── Login alert (security) ──────────────────────────────────────────────────

export const LOGIN_ALERT_I18N: Record<EmailLang, {
  subject: string;
  heading: string;
  body: (who: string, deviceName: string | null, datetime: string) => string;
  whatToDo: string;
  bullets: string[];
  ignoreNote: string;
  preheader: (who: string) => string;
}> = {
  fr: {
    subject: '🔐 Nouvelle connexion détectée sur votre compte',
    heading: 'Nouvelle connexion détectée',
    body: (w, d, dt) => d
      ? `<strong>${w}</strong> s'est connecté(e) à votre compte JitPlus Pro depuis <strong>${d}</strong> le ${dt}.`
      : `<strong>${w}</strong> s'est connecté(e) à votre compte JitPlus Pro le ${dt}.`,
    whatToDo: 'Si ce n’est pas vous :',
    bullets: [
      'Changez votre mot de passe immédiatement',
      'Révoquez l’appareil suspect dans la rubrique « Sécurité »',
      'Contactez le support si nécessaire',
    ],
    ignoreNote: 'Si c’est bien vous, vous pouvez ignorer cet e-mail.',
    preheader: (w) => `Nouvelle connexion : ${w}`,
  },
  en: {
    subject: '🔐 New sign-in detected on your account',
    heading: 'New sign-in detected',
    body: (w, d, dt) => d
      ? `<strong>${w}</strong> signed into your JitPlus Pro account from <strong>${d}</strong> on ${dt}.`
      : `<strong>${w}</strong> signed into your JitPlus Pro account on ${dt}.`,
    whatToDo: "If this wasn't you:",
    bullets: [
      'Change your password immediately',
      'Revoke the suspicious device in the "Security" section',
      'Contact support if needed',
    ],
    ignoreNote: 'If this was you, you can ignore this email.',
    preheader: (w) => `New sign-in: ${w}`,
  },
  ar: {
    subject: '🔐 كونيكسيون جديدة ف الكومبت ديالك',
    heading: 'كونيكسيون جديدة',
    body: (w, d, dt) => d
      ? `<strong>${w}</strong> دخل(ات) للكومبت JitPlus Pro ديالك من <strong>${d}</strong> نهار ${dt}.`
      : `<strong>${w}</strong> دخل(ات) للكومبت JitPlus Pro ديالك نهار ${dt}.`,
    whatToDo: 'إلا ماشي نتا :',
    bullets: [
      'بدل الباسوورد دغية',
      'حيد الأبارايل المشكوك فيه من سكسيون «Sécurité»',
      'تواصل مع السوبور إلا حتاج',
    ],
    ignoreNote: 'إلا كان نتا، ما تعطيش الأهمية لهاد الإيمايل.',
    preheader: (w) => `كونيكسيون جديدة : ${w}`,
  },
};

// ─── Plan changes (Premium activated/revoked/expiring) ───────────────────────

export const PLAN_EMAIL_I18N: Record<EmailLang, {
  activatedSubject: string;
  activatedHeading: string;
  activatedBody: (expiryDate: string | null) => string;
  activatedCta: string;

  revokedSubject: string;
  revokedHeading: string;
  revokedBody: string;
  revokedCta: string;

  expiringSubject: (days: number) => string;
  expiringHeading: (days: number) => string;
  expiringBody: (days: number, kind: 'trial' | 'premium') => string;
  expiringCta: string;
}> = {
  fr: {
    activatedSubject: '🎉 Votre plan Premium JitPlus Pro est actif !',
    activatedHeading: '🎉 Plan Premium activé',
    activatedBody: (d) => d
      ? `Votre commerce profite maintenant de toutes les fonctionnalités Premium jusqu'au <strong>${d}</strong>.`
      : 'Votre commerce profite maintenant de toutes les fonctionnalités Premium.',
    activatedCta: 'Ouvrir l’application',

    revokedSubject: 'Votre plan Premium est désactivé',
    revokedHeading: 'Plan Premium désactivé',
    revokedBody: 'Votre commerce est repassé en plan Gratuit. Vos données sont préservées et vous pouvez réactiver Premium à tout moment.',
    revokedCta: 'Voir les plans',

    expiringSubject: (d) => d <= 1 ? '⚠️ Votre plan expire demain' : `⏳ Votre plan expire dans ${d} jours`,
    expiringHeading: (d) => d <= 1 ? '⚠️ Plan bientôt expiré' : '⏳ Plan bientôt expiré',
    expiringBody: (d, k) => {
      const what = k === 'trial' ? 'Votre période d’essai' : 'Votre plan Premium';
      return d <= 1
        ? `${what} se termine <strong>demain</strong>. Renouvelez maintenant pour ne perdre aucune fonctionnalité.`
        : `${what} se termine dans <strong>${d} jours</strong>. Pensez à le renouveler.`;
    },
    expiringCta: 'Renouveler maintenant',
  },
  en: {
    activatedSubject: '🎉 Your JitPlus Pro Premium plan is active!',
    activatedHeading: '🎉 Premium plan activated',
    activatedBody: (d) => d
      ? `Your business now enjoys all Premium features until <strong>${d}</strong>.`
      : 'Your business now enjoys all Premium features.',
    activatedCta: 'Open the app',

    revokedSubject: 'Your Premium plan has been deactivated',
    revokedHeading: 'Premium plan deactivated',
    revokedBody: 'Your business is back on the Free plan. Your data is preserved and you can re-enable Premium any time.',
    revokedCta: 'View plans',

    expiringSubject: (d) => d <= 1 ? '⚠️ Your plan expires tomorrow' : `⏳ Your plan expires in ${d} days`,
    expiringHeading: (d) => d <= 1 ? '⚠️ Plan expiring soon' : '⏳ Plan expiring soon',
    expiringBody: (d, k) => {
      const what = k === 'trial' ? 'Your trial' : 'Your Premium plan';
      return d <= 1
        ? `${what} ends <strong>tomorrow</strong>. Renew now to keep all features.`
        : `${what} ends in <strong>${d} days</strong>. Consider renewing.`;
    },
    expiringCta: 'Renew now',
  },
  ar: {
    activatedSubject: '🎉 الپلان Premium ديالك خدام !',
    activatedHeading: '🎉 الپلان Premium نشط',
    activatedBody: (d) => d
      ? `الكوميرس ديالك دابا كيستفد من جميع الفونكسيونات Premium حتى ل <strong>${d}</strong>.`
      : 'الكوميرس ديالك دابا كيستفد من جميع الفونكسيونات Premium.',
    activatedCta: 'حل الأبليكاسيون',

    revokedSubject: 'الپلان Premium ديالك توقف',
    revokedHeading: 'الپلان Premium توقف',
    revokedBody: 'الكوميرس ديالك رجع للپلان مجاني. المعطيات ديالك محفوظة و تقدر ترجع تنشط Premium وقت ما بغيتي.',
    revokedCta: 'شوف الپلانات',

    expiringSubject: (d) => d <= 1 ? '⚠️ الپلان ديالك كيتسالى غدا' : `⏳ الپلان ديالك كيتسالى ف ${d} ايام`,
    expiringHeading: (d) => d <= 1 ? '⚠️ الپلان قارب يتسالى' : '⏳ الپلان قارب يتسالى',
    expiringBody: (d, k) => {
      const what = k === 'trial' ? 'الفترة ديال التجربة' : 'الپلان Premium';
      return d <= 1
        ? `${what} كيسالى <strong>غدا</strong>. جدد دابا باش ما تخسرش حتى فونكسيون.`
        : `${what} كيسالى ف <strong>${d} ايام</strong>. ما تنساش تجدد.`;
    },
    expiringCta: 'جدد دابا',
  },
};

// ─── Payout status ───────────────────────────────────────────────────────────

export const PAYOUT_I18N: Record<EmailLang, {
  pendingSubject: string;
  pendingHeading: string;
  pendingBody: (amount: string, method: string) => string;
  pendingNote: string;

  approvedSubject: string;
  approvedHeading: string;
  approvedBody: (amount: string, method: string) => string;
  approvedNote: string;

  paidSubject: string;
  paidHeading: string;
  paidBody: (amount: string, method: string) => string;

  rejectedSubject: string;
  rejectedHeading: string;
  rejectedBody: (amount: string, reason: string | null) => string;
  rejectedContact: string;
}> = {
  fr: {
    pendingSubject: 'Votre demande de retrait est reçue',
    pendingHeading: 'Demande de retrait reçue',
    pendingBody: (a, m) => `Nous avons bien reçu votre demande de retrait de <strong>${a}</strong> via <strong>${m}</strong>.`,
    pendingNote: 'Notre équipe va examiner votre demande sous 48 h ouvrables.',

    approvedSubject: 'Votre demande de retrait est approuvée',
    approvedHeading: 'Demande approuvée',
    approvedBody: (a, m) => `Votre demande de retrait de <strong>${a}</strong> via <strong>${m}</strong> a été approuvée.`,
    approvedNote: 'Le paiement sera effectué sous 24 h. Vous recevrez une confirmation dès que c’est fait.',

    paidSubject: 'Paiement effectué — votre retrait est terminé',
    paidHeading: '✅ Paiement effectué',
    paidBody: (a, m) => `Votre retrait de <strong>${a}</strong> via <strong>${m}</strong> a été versé. Vérifiez votre compte sous 24 h.`,

    rejectedSubject: 'Votre demande de retrait a été refusée',
    rejectedHeading: 'Demande refusée',
    rejectedBody: (a, r) => r
      ? `Votre demande de retrait de <strong>${a}</strong> a été refusée. Raison : ${r}.`
      : `Votre demande de retrait de <strong>${a}</strong> a été refusée.`,
    rejectedContact: "Contactez le support pour plus d'informations.",
  },
  en: {
    pendingSubject: 'Your payout request was received',
    pendingHeading: 'Payout request received',
    pendingBody: (a, m) => `We've received your payout request of <strong>${a}</strong> via <strong>${m}</strong>.`,
    pendingNote: 'Our team will review your request within 48 business hours.',

    approvedSubject: 'Your payout request was approved',
    approvedHeading: 'Request approved',
    approvedBody: (a, m) => `Your payout request of <strong>${a}</strong> via <strong>${m}</strong> has been approved.`,
    approvedNote: 'Payment will be issued within 24 h. You will receive a confirmation when done.',

    paidSubject: 'Payment sent — your payout is complete',
    paidHeading: '✅ Payment sent',
    paidBody: (a, m) => `Your payout of <strong>${a}</strong> via <strong>${m}</strong> has been sent. Check your account within 24 h.`,

    rejectedSubject: 'Your payout request was rejected',
    rejectedHeading: 'Request rejected',
    rejectedBody: (a, r) => r
      ? `Your payout request of <strong>${a}</strong> was rejected. Reason: ${r}.`
      : `Your payout request of <strong>${a}</strong> was rejected.`,
    rejectedContact: 'Contact support for more information.',
  },
  ar: {
    pendingSubject: 'طلب السحب ديالك توصلنا بيه',
    pendingHeading: 'طلب السحب توصلنا',
    pendingBody: (a, m) => `توصلنا بطلب السحب ديالك ديال <strong>${a}</strong> ب <strong>${m}</strong>.`,
    pendingNote: 'الفريق ديالنا غادي يشوف الطلب ديالك ف 48 ساعة خدمة.',

    approvedSubject: 'طلب السحب ديالك تقبل',
    approvedHeading: 'الطلب تقبل',
    approvedBody: (a, m) => `طلب السحب ديالك ديال <strong>${a}</strong> ب <strong>${m}</strong> تقبل.`,
    approvedNote: 'الخلاص غادي يتم ف 24 ساعة. غادي توصلك تأكيد مني يتم.',

    paidSubject: 'تخلصتي — السحب كمل',
    paidHeading: '✅ الخلاص تم',
    paidBody: (a, m) => `السحب ديالك ديال <strong>${a}</strong> ب <strong>${m}</strong> تخلص. تحقق من الكومبت ديالك ف 24 ساعة.`,

    rejectedSubject: 'طلب السحب ديالك ترفض',
    rejectedHeading: 'الطلب ترفض',
    rejectedBody: (a, r) => r
      ? `طلب السحب ديالك ديال <strong>${a}</strong> ترفض. السبب : ${r}.`
      : `طلب السحب ديالك ديال <strong>${a}</strong> ترفض.`,
    rejectedContact: 'تواصل مع السوبور للمزيد من المعلومات.',
  },
};


// ─── Marketing Blast (merchant -> clients) ───────────────────────────────────

export const MARKETING_BLAST_I18N: Record<EmailLang, {
  preheader: (merchantName: string) => string;
  messageFrom: (merchantName: string) => string;
  greeting: (clientName: string) => string;
  unsubscribeNote: (merchantName: string) => string;
}> = {
  fr: {
    preheader: (n) => `Message de ${n} via JitPlus`,
    messageFrom: (n) => `Un message de ${n}`,
    greeting: (n) => `Bonjour ${n},`,
    unsubscribeNote: (n) => `Vous recevez cet e-mail car vous êtes client de <strong>${n}</strong> via JitPlus.<br/>Pour ne plus recevoir ces messages, désactivez les notifications e-mail dans les paramètres de l'application.`,
  },
  en: {
    preheader: (n) => `Message from ${n} via JitPlus`,
    messageFrom: (n) => `A message from ${n}`,
    greeting: (n) => `Hello ${n},`,
    unsubscribeNote: (n) => `You are receiving this email because you are a customer of <strong>${n}</strong> via JitPlus.<br/>To stop receiving these messages, disable email notifications in the app settings.`,
  },
  ar: {
    preheader: (n) => `رسالة من ${n} عبر JitPlus`,
    messageFrom: (n) => `رسالة من ${n}`,
    greeting: (n) => `السلام ${n}،`,
    unsubscribeNote: (n) => `كتوصلك هاد الإيمايل علاحقاش راك كليان ديال <strong>${n}</strong> عبر JitPlus.<br/>باش ما تبقاش توصلك، حيد نوتيفيكاسيون الإيمايل من إعدادات الأبليكاسيون.`,
  },
};
