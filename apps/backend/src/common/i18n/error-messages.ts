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
  'error.auth.otpInvalid': {
    fr: 'Code invalide. Vérifiez-le et réessayez.',
    en: 'Invalid code. Check it and try again.',
    ar: 'الرمز غير صحيح. تحقّق منه وحاول مرة أخرى.',
  },
  'error.auth.otpInvalidLastTry': {
    fr: 'Code invalide. Il vous reste un essai.',
    en: 'Invalid code. You have one attempt left.',
    ar: 'الرمز غير صحيح. تبقّت لك محاولة واحدة.',
  },
  'error.auth.otpExpired': {
    fr: 'Code expiré. Veuillez redemander un code.',
    en: 'This code has expired. Please request a new one.',
    ar: 'انتهت صلاحية الرمز. يرجى طلب رمز جديد.',
  },
  'error.auth.otpTooManyAttempts': {
    fr: 'Trop de tentatives. Veuillez redemander un code.',
    en: 'Too many attempts. Please request a new code.',
    ar: 'محاولات كثيرة جدًا. يرجى طلب رمز جديد.',
  },
  'error.auth.otpNotSentEmail': {
    fr: 'Aucun code valide pour cet email. Veuillez redemander un code.',
    en: 'No valid code for this email. Please request a new one.',
    ar: 'لا يوجد رمز صالح لهذا البريد الإلكتروني. يرجى طلب رمز جديد.',
  },
  'error.auth.otpNotSentPhone': {
    fr: 'Aucun code valide pour ce numéro. Veuillez redemander un code.',
    en: 'No valid code for this number. Please request a new one.',
    ar: 'لا يوجد رمز صالح لهذا الرقم. يرجى طلب رمز جديد.',
  },
  'error.auth.otpAlreadyUsed': {
    fr: 'Code déjà utilisé. Veuillez redemander un code.',
    en: 'This code was already used. Please request a new one.',
    ar: 'تم استخدام هذا الرمز من قبل. يرجى طلب رمز جديد.',
  },
  'error.auth.noAccountForEmail': {
    fr: 'Aucun compte n’est associé à cet email. Veuillez vous inscrire.',
    en: 'No account is linked to this email. Please sign up.',
    ar: 'لا يوجد حساب مرتبط بهذا البريد الإلكتروني. يرجى إنشاء حساب.',
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
  'error.auth.otpFormat': {
    fr: 'Le code doit contenir 6 chiffres.',
    en: 'The code must have 6 digits.',
    ar: 'يجب أن يتكون الرمز من 6 أرقام.',
  },
  'error.auth.otpDailyLimit': {
    fr: 'Limite quotidienne de codes atteinte. Réessayez demain.',
    en: 'Daily code limit reached. Please try again tomorrow.',
    ar: 'تم بلوغ الحد اليومي للرموز. حاول مرة أخرى غدًا.',
  },
  'error.auth.phoneExists': {
    fr: 'Ce numéro est déjà utilisé par un autre compte.',
    en: 'This number is already used by another account.',
    ar: 'هذا الرقم مستخدم من طرف حساب آخر.',
  },
  'error.auth.phoneInvalid': {
    fr: 'Numéro de téléphone invalide.',
    en: 'Invalid phone number.',
    ar: 'رقم الهاتف غير صالح.',
  },
  'error.auth.birthDateInvalid': {
    fr: 'Date de naissance invalide.',
    en: 'Invalid date of birth.',
    ar: 'تاريخ الميلاد غير صالح.',
  },
  'error.auth.firstNameRequired': {
    fr: 'Le prénom est requis.',
    en: 'First name is required.',
    ar: 'الاسم الشخصي مطلوب.',
  },
  'error.auth.firstNameTooLong': {
    fr: 'Le prénom est trop long.',
    en: 'First name is too long.',
    ar: 'الاسم الشخصي طويل جدًا.',
  },
  'error.auth.lastNameTooLong': {
    fr: 'Le nom est trop long.',
    en: 'Last name is too long.',
    ar: 'الاسم العائلي طويل جدًا.',
  },
  'error.auth.passwordRequired': {
    fr: 'Le mot de passe est requis.',
    en: 'Password is required.',
    ar: 'كلمة المرور مطلوبة.',
  },
  'error.auth.passwordRequiredForDeletion': {
    fr: 'Le mot de passe est requis pour supprimer votre compte.',
    en: 'Your password is required to delete your account.',
    ar: 'كلمة المرور مطلوبة لحذف حسابك.',
  },
  'error.auth.passwordTooShort': {
    fr: 'Le mot de passe doit contenir au moins 8 caractères.',
    en: 'The password must have at least 8 characters.',
    ar: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.',
  },
  'error.auth.passwordRules': {
    fr: 'Le mot de passe doit contenir au moins une majuscule, un chiffre et un caractère spécial.',
    en: 'The password must include an uppercase letter, a digit and a special character.',
    ar: 'يجب أن تحتوي كلمة المرور على حرف كبير ورقم ورمز خاص.',
  },
  'error.auth.invalidCredentials': {
    fr: 'Email ou mot de passe incorrect. Vous pouvez aussi recevoir un code de connexion par e-mail. Après plusieurs essais, le compte est bloqué 15 minutes.',
    en: 'Incorrect email or password. You can also get a login code by email. After several attempts, the account is locked for 15 minutes.',
    ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة. يمكنك أيضًا تلقي رمز دخول عبر البريد الإلكتروني. بعد عدة محاولات، يُقفل الحساب لمدة 15 دقيقة.',
  },
  'error.auth.passwordIncorrect': {
    fr: 'Mot de passe incorrect.',
    en: 'Incorrect password.',
    ar: 'كلمة المرور غير صحيحة.',
  },
  'error.auth.passwordAlreadySet': {
    fr: 'Un mot de passe existe déjà. Utilisez le changement de mot de passe.',
    en: 'A password is already set. Use the change password option.',
    ar: 'توجد كلمة مرور بالفعل. استخدم خيار تغيير كلمة المرور.',
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
  // ── Booking ──
  'error.booking.slotTaken': {
    fr: 'Ce créneau vient d’être pris. Choisissez-en un autre.',
    en: 'This time was just taken. Please pick another one.',
    ar: 'تم حجز هذا الموعد للتو. يرجى اختيار موعد آخر.',
  },
  'error.booking.maxUpcoming': {
    fr: 'Vous avez déjà 3 rendez-vous à venir chez ce commerçant.',
    en: 'You already have 3 upcoming bookings with this merchant.',
    ar: 'لديك بالفعل 3 مواعيد قادمة عند هذا التاجر.',
  },
  'error.booking.verifyAccount': {
    fr: 'Vérifiez votre téléphone ou votre e-mail pour réserver.',
    en: 'Verify your phone or e-mail to book.',
    ar: 'يرجى تأكيد رقم هاتفك أو بريدك الإلكتروني للحجز.',
  },
  'error.booking.notCancellable': {
    fr: 'Ce rendez-vous ne peut plus être annulé.',
    en: 'This booking can no longer be cancelled.',
    ar: 'لم يعد بالإمكان إلغاء هذا الموعد.',
  },
  'error.booking.cancelTooLate': {
    fr: 'Le délai d’annulation en ligne est dépassé. Contactez le commerçant.',
    en: 'It is too late to cancel online. Please contact the merchant.',
    ar: 'انتهت مهلة الإلغاء عبر التطبيق. يرجى التواصل مع التاجر.',
  },
  'error.booking.changed': {
    fr: 'Ce rendez-vous vient de changer. Rafraîchissez.',
    en: 'This booking just changed. Please refresh.',
    ar: 'تغير هذا الموعد للتو. يرجى التحديث.',
  },
  'error.booking.notFound': {
    fr: 'Rendez-vous introuvable.',
    en: 'Booking not found.',
    ar: 'الموعد غير موجود.',
  },
  'error.booking.invalidDate': {
    fr: 'Date invalide.',
    en: 'Invalid date.',
    ar: 'تاريخ غير صالح.',
  },
  'error.booking.merchantNotFound': {
    fr: 'Commerçant introuvable.',
    en: 'Merchant not found.',
    ar: 'التاجر غير موجود.',
  },
  'error.booking.notEnabled': {
    fr: 'Ce commerçant ne prend pas de rendez-vous en ligne.',
    en: 'This merchant does not take online bookings.',
    ar: 'هذا التاجر لا يستقبل الحجوزات عبر الإنترنت.',
  },
  'error.booking.serviceNotFound': {
    fr: 'Prestation introuvable.',
    en: 'Service not found.',
    ar: 'الخدمة غير موجودة.',
  },
  'error.booking.overlap': {
    fr: 'Ce créneau chevauche un autre rendez-vous.',
    en: 'This time overlaps another booking.',
    ar: 'هذا الموعد يتداخل مع موعد آخر.',
  },
  // Agenda of the Pro app. The limits (60 services, 31 days) mirror booking.constants.
  'error.booking.rangeEndBeforeStart': {
    fr: 'Une plage horaire doit finir après son début.',
    en: 'An opening range must end after it starts.',
    ar: 'خاص الوقت ديال النهاية يكون من بعد البداية.',
  },
  'error.booking.rangesOverlap': {
    fr: 'Deux plages horaires se chevauchent le même jour.',
    en: 'Two opening ranges overlap on the same day.',
    ar: 'كاين جوج أوقات كيتداخلو فنفس النهار.',
  },
  'error.booking.setupFirst': {
    fr: 'Ajoutez au moins une prestation et vos horaires avant d’activer la réservation.',
    en: 'Add at least one service and your opening hours before turning bookings on.',
    ar: 'زيد على الأقل خدمة وحدة وأوقات الخدمة ديالك قبل ما تفعّل الحجز.',
  },
  'error.booking.maxServices': {
    fr: 'Vous avez atteint le maximum de 60 prestations.',
    en: 'You have reached the limit of 60 services.',
    ar: 'وصلتي للحد الأقصى: 60 خدمة.',
  },
  'error.booking.templateNotFound': {
    fr: 'Prestation du catalogue introuvable.',
    en: 'Catalogue service not found.',
    ar: 'هاد الخدمة ما بقاتش فالكاتالوغ.',
  },
  'error.booking.serviceNameRequired': {
    fr: 'Donnez un nom à votre prestation.',
    en: 'Give your service a name.',
    ar: 'عطي سمية للخدمة ديالك.',
  },
  'error.booking.closureEndBeforeStart': {
    fr: 'La fin doit être après le début.',
    en: 'The end must be after the start.',
    ar: 'خاص النهاية تكون من بعد البداية.',
  },
  'error.booking.closureTooLong': {
    fr: 'Période trop longue : 1 an maximum.',
    en: 'This period is too long: 1 year at most.',
    ar: 'هاد المدة طويلة بزاف: عام واحد كحد أقصى.',
  },
  'error.booking.closureNotFound': {
    fr: 'Fermeture introuvable.',
    en: 'Closure not found.',
    ar: 'هاد الإغلاق ما لقيناهش.',
  },
  'error.booking.invalidPeriod': {
    fr: 'Période invalide.',
    en: 'Invalid period.',
    ar: 'المدة ماشي صحيحة.',
  },
  'error.booking.periodTooLong': {
    fr: 'Période limitée à 31 jours.',
    en: 'The period is limited to 31 days.',
    ar: 'المدة محدودة ف 31 يوم.',
  },
  'error.booking.clientNotInFile': {
    fr: 'Ce client n’est pas dans votre fichier.',
    en: 'This customer is not in your list.',
    ar: 'هاد الزبون ما كاينش فاللائحة ديالك.',
  },
  'error.booking.clientNameRequired': {
    fr: 'Indiquez le nom du client.',
    en: 'Enter the customer’s name.',
    ar: 'كتب سمية الزبون.',
  },
  'error.booking.unknownAction': {
    fr: 'Action impossible. Mettez l’application à jour, puis réessayez.',
    en: 'This action is not available. Update the app and try again.',
    ar: 'هاد العملية ما ممكناش. حدّث التطبيق وعاود جرب.',
  },
  'error.booking.badTransition': {
    fr: 'Ce rendez-vous a déjà été traité. Rafraîchissez l’agenda.',
    en: 'This booking has already been handled. Refresh the agenda.',
    ar: 'هاد الموعد تعالج من قبل. حدّث الأجندة.',
  },
  'error.booking.alreadyPast': {
    fr: 'Ce rendez-vous est déjà passé.',
    en: 'This booking is already in the past.',
    ar: 'هاد الموعد فات.',
  },
  'error.booking.notStartedYet': {
    fr: 'Le rendez-vous n’a pas encore commencé.',
    en: 'The booking has not started yet.',
    ar: 'الموعد مازال ما بدا.',
  },
  'error.booking.alreadyCredited': {
    fr: 'Les tampons de ce rendez-vous ont déjà été donnés.',
    en: 'The stamps for this booking have already been given.',
    ar: 'الطوابع ديال هاد الموعد تعطاو من قبل.',
  },
  'error.booking.pickFutureTime': {
    fr: 'Choisissez une heure à venir.',
    en: 'Pick a time in the future.',
    ar: 'ختار وقت جاي.',
  },
  'error.booking.notMovable': {
    fr: 'Ce rendez-vous ne peut plus être déplacé.',
    en: 'This booking can no longer be moved.',
    ar: 'ما بقاش ممكن تبدل وقت هاد الموعد.',
  },
  // ── Collection game ──
  'error.collection.notFound': {
    fr: 'Collection introuvable.',
    en: 'Collection not found.',
    ar: 'المجموعة غير موجودة.',
  },
  'error.collection.notDraft': {
    fr: 'Cette collection est déjà lancée.',
    en: 'This collection is already live.',
    ar: 'هذه المجموعة انطلقت بالفعل.',
  },
  'error.collection.notEditable': {
    fr: 'Cette collection est terminée : elle ne peut plus être modifiée.',
    en: 'This collection has ended: it can no longer be edited.',
    ar: 'هذه المجموعة انتهت: لا يمكن تعديلها بعد الآن.',
  },
  'error.collection.itemsLocked': {
    fr: 'La collection est en cours : vous pouvez ajouter des produits ou les renommer, mais pas en retirer.',
    en: 'The collection is running: you can add or rename products, but not remove any.',
    ar: 'المجموعة جارية: يمكنك إضافة منتجات أو إعادة تسميتها، لكن لا يمكنك حذفها.',
  },
  'error.collection.notActive': {
    fr: 'Cette collection n’est pas en cours.',
    en: 'This collection is not running.',
    ar: 'هذه المجموعة ليست جارية.',
  },
  'error.collection.alreadyActive': {
    fr: 'Une collection est déjà en cours. Terminez-la avant d’en lancer une autre.',
    en: 'A collection is already running. End it before starting another one.',
    ar: 'توجد مجموعة جارية بالفعل. أنهِها قبل إطلاق مجموعة أخرى.',
  },
  'error.collection.tooMany': {
    fr: 'Vous avez atteint le nombre maximum de collections. Supprimez un brouillon pour en créer une autre.',
    en: 'You reached the maximum number of collections. Delete a draft to create another one.',
    ar: 'بلغت الحد الأقصى من المجموعات. احذف مسودة لإنشاء مجموعة أخرى.',
  },
  'error.collection.nameAndGiftRequired': {
    fr: 'Donnez un nom à la collection et indiquez le cadeau offert.',
    en: 'Give the collection a name and say which gift is offered.',
    ar: 'أعطِ المجموعة اسماً وحدّد الهدية المقدَّمة.',
  },
  'error.collection.invalidImage': {
    fr: 'Photo non autorisée : ajoutez une photo depuis votre téléphone.',
    en: 'Photo not allowed: add a photo from your phone.',
    ar: 'الصورة غير مسموح بها: أضف صورة من هاتفك.',
  },
  'error.collection.itemLabelRequired': {
    fr: 'Chaque produit doit avoir un nom.',
    en: 'Every product needs a name.',
    ar: 'يجب أن يكون لكل منتج اسم.',
  },
  'error.collection.duplicateItems': {
    fr: 'Deux produits portent le même nom. Donnez un nom différent à chacun.',
    en: 'Two products have the same name. Give each one a different name.',
    ar: 'منتجان يحملان الاسم نفسه. أعطِ كل منتج اسماً مختلفاً.',
  },
  'error.collection.endDateInvalid': {
    fr: 'Date de fin invalide.',
    en: 'Invalid end date.',
    ar: 'تاريخ النهاية غير صالح.',
  },
  'error.collection.endDatePast': {
    fr: 'La date de fin doit être dans le futur.',
    en: 'The end date must be in the future.',
    ar: 'يجب أن يكون تاريخ النهاية في المستقبل.',
  },
  'error.collection.noneActive': {
    fr: 'Aucune collection en cours.',
    en: 'No collection is running.',
    ar: 'لا توجد مجموعة جارية.',
  },
  'error.collection.unavailable': {
    fr: 'Les collections ne sont pas disponibles pour ce commerce pour le moment.',
    en: 'Collections are not available for this business right now.',
    ar: 'المجموعات غير متاحة لهذا المتجر حالياً.',
  },
  'error.collection.clientNotFound': {
    fr: 'Ce client n’a pas de carte de fidélité chez vous. Ajoutez d’abord un tampon.',
    en: 'This customer has no loyalty card with you. Add a stamp first.',
    ar: 'هذا الزبون لا يملك بطاقة وفاء عندك. أضف طابعاً أولاً.',
  },
  'error.collection.invalidItems': {
    fr: 'Ce produit ne fait pas partie de la collection en cours.',
    en: 'This product is not part of the current collection.',
    ar: 'هذا المنتج ليس ضمن المجموعة الجارية.',
  },
  'error.collection.onePerVisit': {
    fr: 'Un seul produit par jour pour cette collection. Le prochain sera coché à la prochaine visite.',
    en: 'Only one product a day for this collection. The next one can be ticked on the next visit.',
    ar: 'منتج واحد في اليوم لهذه المجموعة. يمكن تسجيل المنتج التالي في الزيارة القادمة.',
  },
  'error.collection.alreadyCompleted': {
    fr: 'Ce client a déjà complété cette collection.',
    en: 'This customer has already completed this collection.',
    ar: 'هذا الزبون أكمل هذه المجموعة من قبل.',
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
