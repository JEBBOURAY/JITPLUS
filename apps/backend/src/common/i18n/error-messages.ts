import type { AppLang } from '../utils/app-lang';

/**
 * User-facing text of the error keys thrown by the services
 * (`throw new BadRequestException('error.auth.emailExists')`).
 *
 * The apps never resolved these keys — the JitPlus app displayed the raw key.
 * AllExceptionsFilter now sends the translated text as `message` and the key
 * as a stable `code`, so the apps work unchanged and can branch on `code`.
 */
export const ERROR_MESSAGES: Record<string, Record<AppLang, string>> = {
  // ── Auth: Apple ──
  'error.auth.appleTokenInvalid': {
    fr: 'Connexion Apple invalide. Veuillez réessayer.',
    en: 'Invalid Apple sign-in. Please try again.',
    ar: 'تسجيل الدخول عبر Apple غير صالح. يرجى المحاولة مرة أخرى.',
  },
  'error.auth.appleTokenInvalidId': {
    fr: 'Identifiant Apple invalide. Veuillez réessayer.',
    en: 'Invalid Apple ID. Please try again.',
    ar: 'معرّف Apple غير صالح. يرجى المحاولة مرة أخرى.',
  },
  'error.auth.appleAlgorithmNotSupported': {
    fr: 'Connexion Apple invalide. Veuillez réessayer.',
    en: 'Invalid Apple sign-in. Please try again.',
    ar: 'تسجيل الدخول عبر Apple غير صالح. يرجى المحاولة مرة أخرى.',
  },
  'error.auth.appleKeyNotFound': {
    fr: 'Connexion Apple impossible pour le moment. Veuillez réessayer.',
    en: 'Apple sign-in is unavailable right now. Please try again.',
    ar: 'تسجيل الدخول عبر Apple غير متاح حاليًا. يرجى المحاولة مرة أخرى.',
  },
  'error.auth.appleNonceMissing': {
    fr: 'Connexion Apple invalide. Veuillez réessayer.',
    en: 'Invalid Apple sign-in. Please try again.',
    ar: 'تسجيل الدخول عبر Apple غير صالح. يرجى المحاولة مرة أخرى.',
  },
  'error.auth.appleNonceMismatch': {
    fr: 'Connexion Apple invalide. Veuillez réessayer.',
    en: 'Invalid Apple sign-in. Please try again.',
    ar: 'تسجيل الدخول عبر Apple غير صالح. يرجى المحاولة مرة أخرى.',
  },
  'error.auth.appleNotConfigured': {
    fr: 'La connexion Apple n’est pas disponible pour le moment.',
    en: 'Apple sign-in is not available at the moment.',
    ar: 'تسجيل الدخول عبر Apple غير متاح حاليًا.',
  },
  'error.auth.appleFailed': {
    fr: 'La connexion avec Apple a échoué. Veuillez réessayer.',
    en: 'Apple sign-in failed. Please try again.',
    ar: 'فشل تسجيل الدخول عبر Apple. يرجى المحاولة مرة أخرى.',
  },
  'error.auth.appleEmailExists': {
    fr: 'Un compte existe déjà avec cet email. Connectez-vous avec votre méthode habituelle.',
    en: 'An account already exists with this email. Sign in with your usual method.',
    ar: 'يوجد حساب بهذا البريد الإلكتروني. سجّل الدخول بطريقتك المعتادة.',
  },
  // ── Auth: Google ──
  'error.auth.googleTokenInvalid': {
    fr: 'Connexion Google invalide. Veuillez réessayer.',
    en: 'Invalid Google sign-in. Please try again.',
    ar: 'تسجيل الدخول عبر Google غير صالح. يرجى المحاولة مرة أخرى.',
  },
  'error.auth.googleEmailMissing': {
    fr: 'Votre compte Google ne partage pas d’adresse email.',
    en: 'Your Google account does not share an email address.',
    ar: 'حساب Google الخاص بك لا يشارك عنوان بريد إلكتروني.',
  },
  'error.auth.googleNotConfigured': {
    fr: 'La connexion Google n’est pas disponible pour le moment.',
    en: 'Google sign-in is not available at the moment.',
    ar: 'تسجيل الدخول عبر Google غير متاح حاليًا.',
  },
  'error.auth.googleFailed': {
    fr: 'La connexion avec Google a échoué. Veuillez réessayer.',
    en: 'Google sign-in failed. Please try again.',
    ar: 'فشل تسجيل الدخول عبر Google. يرجى المحاولة مرة أخرى.',
  },
  'error.auth.googleEmailExists': {
    fr: 'Un compte existe déjà avec cet email. Connectez-vous avec votre méthode habituelle.',
    en: 'An account already exists with this email. Sign in with your usual method.',
    ar: 'يوجد حساب بهذا البريد الإلكتروني. سجّل الدخول بطريقتك المعتادة.',
  },
  // ── Auth: email / phone / OTP ──
  'error.auth.emailExists': {
    fr: 'Cette adresse email est déjà utilisée.',
    en: 'This email address is already in use.',
    ar: 'عنوان البريد الإلكتروني هذا مستخدم بالفعل.',
  },
  'error.auth.emailInvalid': {
    fr: 'Adresse email invalide.',
    en: 'Invalid email address.',
    ar: 'عنوان البريد الإلكتروني غير صالح.',
  },
  'error.auth.emailFail': {
    fr: 'Impossible d’envoyer l’email pour le moment. Veuillez réessayer plus tard.',
    en: 'We could not send the email right now. Please try again later.',
    ar: 'تعذّر إرسال البريد الإلكتروني حاليًا. يرجى المحاولة لاحقًا.',
  },
  'error.auth.whatsappFail': {
    fr: 'Impossible d’envoyer le code WhatsApp pour le moment. Veuillez réessayer plus tard.',
    en: 'We could not send the WhatsApp code right now. Please try again later.',
    ar: 'تعذّر إرسال رمز واتساب حاليًا. يرجى المحاولة لاحقًا.',
  },
  'error.auth.otpWait': {
    fr: 'Veuillez patienter une minute avant de demander un nouveau code.',
    en: 'Please wait a minute before requesting a new code.',
    ar: 'يرجى الانتظار دقيقة قبل طلب رمز جديد.',
  },
  'error.auth.phoneInvalidFormat': {
    fr: 'Numéro de téléphone invalide. Utilisez le format international (ex. +212…).',
    en: 'Invalid phone number. Use the international format (e.g. +212…).',
    ar: 'رقم الهاتف غير صالح. استخدم الصيغة الدولية (مثال: +212…).',
  },
  'error.auth.profileEmailMismatch': {
    fr: 'Cette adresse email ne correspond plus à votre profil.',
    en: 'This email address no longer matches your profile.',
    ar: 'عنوان البريد الإلكتروني هذا لم يعد يطابق ملفك الشخصي.',
  },
  'error.auth.profilePhoneMismatch': {
    fr: 'Ce numéro ne correspond plus à votre profil.',
    en: 'This phone number no longer matches your profile.',
    ar: 'رقم الهاتف هذا لم يعد يطابق ملفك الشخصي.',
  },
  'error.auth.termsRequired': {
    fr: 'Vous devez accepter les conditions d’utilisation.',
    en: 'You must accept the terms of use.',
    ar: 'يجب عليك قبول شروط الاستخدام.',
  },
  // ── Auth: account / password / session ──
  'error.auth.clientNotFound': {
    fr: 'Compte introuvable.',
    en: 'Account not found.',
    ar: 'الحساب غير موجود.',
  },
  'error.auth.currentPasswordRequired': {
    fr: 'Veuillez saisir votre mot de passe actuel.',
    en: 'Please enter your current password.',
    ar: 'يرجى إدخال كلمة المرور الحالية.',
  },
  'error.auth.currentPasswordIncorrect': {
    fr: 'Mot de passe actuel incorrect.',
    en: 'Current password is incorrect.',
    ar: 'كلمة المرور الحالية غير صحيحة.',
  },
  'error.auth.samePassword': {
    fr: 'Le nouveau mot de passe doit être différent de l’actuel.',
    en: 'The new password must be different from the current one.',
    ar: 'يجب أن تكون كلمة المرور الجديدة مختلفة عن الحالية.',
  },
  'error.auth.accountDisabled': {
    fr: 'Ce compte a été désactivé. Contactez le support JitPlus.',
    en: 'This account has been deactivated. Please contact JitPlus support.',
    ar: 'تم تعطيل هذا الحساب. يرجى التواصل مع دعم JitPlus.',
  },
  'error.auth.otpReverifyRequired': {
    fr: 'Pour des raisons de sécurité, veuillez redemander un code de vérification avant de changer votre mot de passe.',
    en: 'For security reasons, please request a new verification code before changing your password.',
    ar: 'لأسباب أمنية، يرجى طلب رمز تحقق جديد قبل تغيير كلمة المرور.',
  },
  'error.auth.refreshInvalid': {
    fr: 'Session invalide. Veuillez vous reconnecter.',
    en: 'Invalid session. Please sign in again.',
    ar: 'الجلسة غير صالحة. يرجى تسجيل الدخول مرة أخرى.',
  },
  'error.auth.refreshExpired': {
    fr: 'Session expirée. Veuillez vous reconnecter.',
    en: 'Session expired. Please sign in again.',
    ar: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.',
  },
  // ── Referral / payouts ──
  'error.referral.codeRequired': {
    fr: 'Veuillez saisir un code de parrainage.',
    en: 'Please enter a referral code.',
    ar: 'يرجى إدخال رمز الإحالة.',
  },
  'error.referral.codeInvalid': {
    fr: 'Code de parrainage invalide ou inexistant.',
    en: 'Invalid or unknown referral code.',
    ar: 'رمز الإحالة غير صالح أو غير موجود.',
  },
  'error.referral.clientNotFound': {
    fr: 'Compte introuvable.',
    en: 'Account not found.',
    ar: 'الحساب غير موجود.',
  },
  'error.referral.minAmount': {
    fr: 'Le montant minimum de retrait est de 100 DH.',
    en: 'The minimum withdrawal amount is 100 MAD.',
    ar: 'الحد الأدنى للسحب هو 100 درهم.',
  },
  'error.referral.balanceInsufficient': {
    fr: 'Solde insuffisant pour ce retrait.',
    en: 'Insufficient balance for this withdrawal.',
    ar: 'الرصيد غير كافٍ لهذا السحب.',
  },
  'error.referral.balanceError': {
    fr: 'Votre solde a changé entre-temps. Veuillez réessayer.',
    en: 'Your balance changed in the meantime. Please try again.',
    ar: 'تغيّر رصيدك في هذه الأثناء. يرجى المحاولة مرة أخرى.',
  },
};

const KEY_PATTERN = /^error\.[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/;

/** Language of the request: `x-lang`, then the first supported Accept-Language tag; default fr. */
export function requestLang(headers: Record<string, string | string[] | undefined>): AppLang {
  const pick = (v: string | undefined): AppLang | null => {
    const base = v?.trim().slice(0, 2).toLowerCase();
    return base === 'fr' || base === 'en' || base === 'ar' ? base : null;
  };
  const header = (name: string) => {
    const v = headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const explicit = pick(header('x-lang'));
  if (explicit) return explicit;
  for (const tag of (header('accept-language') ?? '').split(',')) {
    const lang = pick(tag);
    if (lang) return lang;
  }
  return 'fr';
}

/**
 * Resolves an error key to its text. Returns null when `message` is not a key
 * (plain French text, validation arrays…) so the caller leaves it untouched.
 * An unknown key still gets a generic text rather than leaking the key.
 */
export function resolveErrorKey(message: string, lang: AppLang): string | null {
  if (!KEY_PATTERN.test(message)) return null;
  const entry = ERROR_MESSAGES[message];
  if (entry) return entry[lang];
  return { fr: 'Une erreur est survenue. Veuillez réessayer.', en: 'Something went wrong. Please try again.', ar: 'حدث خطأ. يرجى المحاولة مرة أخرى.' }[lang];
}
