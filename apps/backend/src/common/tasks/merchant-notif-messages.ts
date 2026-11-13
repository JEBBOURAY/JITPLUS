/**
 * Texts of the JitPlus Pro automatic pushes added with the notification
 * policy (reminders, status, targeted tips). Arabic = Moroccan Darija, like
 * the other merchant pushes.
 */

import { type AppLang, pickAppLang } from '../utils/app-lang';

/** Kept for existing importers; prefer AppLang / pickAppLang. */
export type Lang = AppLang;
export const lang = pickAppLang;

export interface Msg { title: string; body: string }
type Localized<T> = Record<Lang, T>;

export const NOTIF_MESSAGES = {
  // ── Reminders: no scan for a while (5-day text lives in merchant-engagement) ──
  scanGap10: {
    fr: { title: 'Vos clients fidèles vous attendent', body: 'Aucun passage enregistré depuis 10 jours. Scannez chaque visite : une carte qui avance donne envie de revenir.' },
    en: { title: 'Your loyal customers are waiting', body: 'No visit recorded for 10 days. Scan every visit: a card that fills up makes customers come back.' },
    ar: { title: 'الكليان ديالك كيتسناوك', body: 'حتى زيارة ما تسجلات هادي 10 أيام. سكاني كل زيارة: الكارطة اللي كتعمر كتخلي الكليان يرجعو.' },
  },
  scanGap21: {
    fr: { title: 'Besoin d\'un coup de main ?', body: 'Aucun passage depuis 3 semaines. Notre équipe peut vous aider à relancer votre carte de fidélité sur WhatsApp.' },
    en: { title: 'Need a hand?', body: 'No visit in 3 weeks. Our team can help you relaunch your loyalty card on WhatsApp.' },
    ar: { title: 'محتاج شي مساعدة؟', body: 'حتى زيارة هادي 3 سيمانات. الفريق ديالنا يقدر يعاونك تعاود تطلق الكارطة ديال الوفاء فواتساب.' },
  },

  // ── Reminders: onboarding not finished ──
  onboarding2h: {
    fr: { title: 'Votre carte de fidélité est presque prête', body: 'Plus que quelques étapes pour accueillir vos premiers clients. Reprenez là où vous vous êtes arrêté.' },
    en: { title: 'Your loyalty card is almost ready', body: 'Just a few steps left before welcoming your first customers. Pick up where you left off.' },
    ar: { title: 'الكارطة ديال الوفاء ديالك قريبة توجد', body: 'بقاو غير شي خطوات باش تستقبل أول الكليان ديالك. كمّل من فين وقفتي.' },
  },
  onboarding1d: {
    fr: { title: 'Lancez votre carte en 2 minutes', body: 'Choisissez votre récompense et affichez votre QR code : vos clients s\'inscrivent seuls.' },
    en: { title: 'Launch your card in 2 minutes', body: 'Pick your reward and display your QR code: customers sign up on their own.' },
    ar: { title: 'طلق الكارطة ديالك فـ 2 دقايق', body: 'ختار المكافأة ديالك وحط QR code ديالك: الكليان كيتسجلو بوحدهم.' },
  },
  onboarding3d: {
    fr: { title: 'On vous aide à démarrer ?', body: 'Notre équipe configure votre carte de fidélité avec vous sur WhatsApp, gratuitement.' },
    en: { title: 'Want help getting started?', body: 'Our team sets up your loyalty card with you on WhatsApp, for free.' },
    ar: { title: 'نعاونوك تبدا؟', body: 'الفريق ديالنا كيوجد معاك الكارطة ديال الوفاء فواتساب، فابور.' },
  },

  // ── Reminders: app not opened ──
  appIdle3: {
    fr: { title: 'Votre tableau de bord vous attend', body: 'Jetez un œil à vos clients et à vos récompenses de la semaine dans JitPlus Pro.' },
    en: { title: 'Your dashboard is waiting', body: 'Take a look at your customers and this week\'s rewards in JitPlus Pro.' },
    ar: { title: 'الداشبورد ديالك كيتسناك', body: 'شوف الكليان ديالك والمكافآت ديال هاد السيمانة فـ JitPlus Pro.' },
  },
  appIdle7: {
    fr: { title: 'Gardez le lien avec vos clients', body: 'Une notification ou une offre suffit pour les faire revenir cette semaine.' },
    en: { title: 'Stay in touch with your customers', body: 'One notification or offer is enough to bring them back this week.' },
    ar: { title: 'بقى على تواصل مع الكليان ديالك', body: 'نوتيفيكاسيون وحدة ولا عرض كافيين باش يرجعو هاد السيمانة.' },
  },
  appIdle14: {
    fr: { title: 'Un souci avec JitPlus Pro ?', body: 'Dites-nous ce qui vous bloque : notre équipe vous répond sur WhatsApp.' },
    en: { title: 'Any trouble with JitPlus Pro?', body: 'Tell us what\'s holding you back: our team answers on WhatsApp.' },
    ar: { title: 'كاين شي مشكل مع JitPlus Pro؟', body: 'قول لينا شنو اللي حابسك: الفريق ديالنا كيجاوبك فواتساب.' },
  },
  appIdle30: {
    fr: { title: 'Vos clients ont toujours leur carte', body: 'Leurs tampons sont toujours là. Reprenez en un scan, on s\'occupe du reste.' },
    en: { title: 'Your customers still have their card', body: 'Their stamps are still there. Restart with one scan, we handle the rest.' },
    ar: { title: 'الكليان ديالك مازال عندهم الكارطة', body: 'الطوابع ديالهم مازالين تما. عاود بدا بسكان واحد، والباقي علينا.' },
  },

  // ── Status ──
  emailUnverified: {
    fr: { title: 'Vérifiez votre adresse email', body: 'Confirmez votre email pour sécuriser votre compte et pouvoir récupérer votre mot de passe.' },
    en: { title: 'Verify your email address', body: 'Confirm your email to secure your account and be able to reset your password.' },
    ar: { title: 'أكّد الإيميل ديالك', body: 'أكّد الإيميل ديالك باش تأمّن الحساب وتقدر ترجع كلمة السر إلا نسيتيها.' },
  },
  planExpired: {
    fr: { title: 'Votre période Premium est terminée', body: 'Votre commerce est passé au plan Gratuit : emails, WhatsApp et statistiques avancées sont en pause.' },
    en: { title: 'Your Premium period has ended', body: 'Your business is now on the Free plan: emails, WhatsApp and advanced stats are paused.' },
    ar: { title: 'المدة ديال Premium سالات', body: 'الكومرس ديالك دوز للبلان المجاني: الإيميلات، واتساب والإحصائيات المفصّلة واقفين.' },
  },
  winback: {
    fr: { title: 'Réactivez Premium', body: 'Retrouvez vos campagnes email et WhatsApp, l\'équipe et les statistiques détaillées pour faire revenir vos clients.' },
    en: { title: 'Reactivate Premium', body: 'Get back email and WhatsApp campaigns, team access and detailed stats to bring customers back.' },
    ar: { title: 'عاود فعّل Premium', body: 'رجّع الحملات ديال الإيميل وواتساب، الفريق والإحصائيات المفصّلة باش يرجعو الكليان ديالك.' },
  },
  emailQuotaFull: {
    fr: { title: 'Quota email atteint', body: 'Vos emails ne partent plus jusqu\'au prochain renouvellement de votre quota.' },
    en: { title: 'Email quota reached', body: 'Your emails won\'t go out until your quota renews.' },
    ar: { title: 'الكوطا ديال الإيميل سالات', body: 'الإيميلات ديالك ما بقاوش كيمشيو حتى تتجدد الكوطا.' },
  },
  whatsappQuotaFull: {
    fr: { title: 'Quota WhatsApp atteint', body: 'Vos messages WhatsApp ne partent plus jusqu\'au prochain renouvellement de votre quota.' },
    en: { title: 'WhatsApp quota reached', body: 'Your WhatsApp messages won\'t go out until your quota renews.' },
    ar: { title: 'الكوطا ديال واتساب سالات', body: 'الميساجات ديال واتساب ما بقاوش كيمشيو حتى تتجدد الكوطا.' },
  },
  accountSuspended: {
    fr: { title: 'Votre compte est suspendu', body: 'Votre commerce n\'est plus visible par les clients. Contactez notre équipe pour en savoir plus.' },
    en: { title: 'Your account is suspended', body: 'Your business is no longer visible to customers. Contact our team to learn more.' },
    ar: { title: 'الحساب ديالك توقّف', body: 'الكومرس ديالك ما بقاش باين للكليان. تواصل مع الفريق ديالنا باش تعرف كثر.' },
  },
  accountReactivated: {
    fr: { title: 'Votre compte est réactivé', body: 'Votre commerce est de nouveau visible et vos clients peuvent cumuler leurs tampons.' },
    en: { title: 'Your account is active again', body: 'Your business is visible again and customers can collect stamps.' },
    ar: { title: 'الحساب ديالك رجع خدام', body: 'الكومرس ديالك رجع باين والكليان يقدرو يجمعو الطوابع ديالهم.' },
  },
} satisfies Record<string, Localized<Msg>>;

export const NOTIF_TEMPLATES = {
  luckyWheelEnded: {
    fr: (name: string) => ({ title: 'Votre roue est terminée', body: `La campagne « ${name} » est terminée. Lancez-en une nouvelle pour garder vos clients motivés.` }),
    en: (name: string) => ({ title: 'Your wheel has ended', body: `The "${name}" campaign is over. Launch a new one to keep customers motivated.` }),
    ar: (name: string) => ({ title: 'عجلة الحظ ديالك سالات', body: `الحملة «${name}» سالات. طلق وحدة جديدة باش يبقاو الكليان متحمسين.` }),
  },
  dealEndsTomorrow: {
    fr: (title: string) => ({ title: 'Votre bon plan expire demain', body: `« ${title} » ne sera plus visible demain. Prolongez-le ou publiez une nouvelle offre.` }),
    en: (title: string) => ({ title: 'Your deal ends tomorrow', body: `"${title}" will no longer be visible tomorrow. Extend it or publish a new one.` }),
    ar: (title: string) => ({ title: 'العرض ديالك كيسالي غدا', body: `«${title}» ما غاديش يبقى باين غدا. طوّلو ولا نشر عرض جديد.` }),
  },
} satisfies Record<string, Localized<(arg: string) => Msg>>;

// ── Targeted tips: one per unused feature ──
export const TIP_MESSAGES = {
  cardDesign: {
    fr: { title: 'Une carte à vos couleurs', body: 'Ajoutez votre couleur et votre fond : une carte reconnaissable inspire confiance à vos clients.' },
    en: { title: 'A card in your colours', body: 'Add your colour and background: a recognisable card builds trust with customers.' },
    ar: { title: 'كارطة بالألوان ديالك', body: 'زيد اللون والخلفية ديالك: الكارطة اللي كتعرف كتعطي الثقة للكليان.' },
  },
  clientQr: {
    fr: { title: 'Affichez votre QR code en caisse', body: 'Vos clients le scannent et s\'inscrivent seuls à votre carte, sans rien vous demander.' },
    en: { title: 'Display your QR code at the till', body: 'Customers scan it and join your card on their own, without asking you.' },
    ar: { title: 'حط QR code ديالك فالكاسة', body: 'الكليان كيسكانيوه وكيتسجلو فالكارطة ديالك بوحدهم، بلا ما يطلبو منك والو.' },
  },
  clientPush: {
    fr: { title: 'Parlez à tous vos clients en un geste', body: 'Une promo, une nouveauté, un horaire spécial : envoyez une notification gratuite à vos clients.' },
    en: { title: 'Reach all your customers in one tap', body: 'A promo, something new, special hours: send a free notification to your customers.' },
    ar: { title: 'هضر مع كاع الكليان ديالك بضغطة', body: 'بروموسيون، جديد، ولا وقت خاص: صيفط نوتيفيكاسيون فابور للكليان ديالك.' },
  },
  luckyWheel: {
    fr: { title: 'Faites tourner la roue 🎡', body: 'Une roue de la chance donne une raison de plus de revenir et fait parler de votre commerce.' },
    en: { title: 'Spin the wheel 🎡', body: 'A lucky wheel gives customers one more reason to come back and gets people talking.' },
    ar: { title: 'دوّر عجلة الحظ 🎡', body: 'عجلة الحظ كتعطي للكليان سبب زايد باش يرجعو وكتخلي الناس يهضرو على الكومرس ديالك.' },
  },
  scratch: {
    fr: { title: 'Surprenez vos clients avec une carte à gratter', body: 'Envoyez une carte 100 % gagnante : le coupon les fait revenir en boutique.' },
    en: { title: 'Surprise customers with a scratch card', body: 'Send a 100% winning card: the coupon brings them back to your shop.' },
    ar: { title: 'فاجئ الكليان بكارطة الحك', body: 'صيفط كارطة رابحة 100%: الكوبون كيرجّعهم للحانوت.' },
  },
  deals: {
    fr: { title: 'Publiez un bon plan', body: 'Votre offre apparaît aux clients JitPlus de votre ville : de nouveaux clients sans publicité payante.' },
    en: { title: 'Publish a deal', body: 'Your offer shows to JitPlus customers in your city: new customers without paid ads.' },
    ar: { title: 'نشر شي عرض', body: 'العرض ديالك كيبان لكليان JitPlus فالمدينة ديالك: كليان جداد بلا إشهار مخلّص.' },
  },
  stampCodes: {
    fr: { title: 'Vous vendez aussi en ligne ?', body: 'Glissez un QR code dans vos colis : vos clients gagnent leurs tampons même sans passer en boutique.' },
    en: { title: 'Do you also sell online?', body: 'Slip a QR code into your parcels: customers earn stamps even without visiting.' },
    ar: { title: 'كتبيع حتى أونلاين؟', body: 'حط QR code فالكولي ديالك: الكليان كيربحو الطوابع حتى بلا ما يجيو للحانوت.' },
  },
  team: {
    fr: { title: 'Laissez votre équipe scanner', body: 'Ajoutez vos employés : ils scannent les clients sans accéder à vos réglages.' },
    en: { title: 'Let your team scan', body: 'Add your staff: they scan customers without access to your settings.' },
    ar: { title: 'خلي الفريق ديالك يسكاني', body: 'زيد الخدامة ديالك: كيسكانيو الكليان بلا ما يدخلو للإعدادات ديالك.' },
  },
  stores: {
    fr: { title: 'Plusieurs points de vente ?', body: 'Ajoutez tous vos magasins : une seule carte de fidélité, valable partout.' },
    en: { title: 'More than one location?', body: 'Add all your shops: one loyalty card that works everywhere.' },
    ar: { title: 'عندك كثر من حانوت؟', body: 'زيد كاع المحلات ديالك: كارطة وفاء وحدة، صالحة فكل بلاصة.' },
  },
  emailBlast: {
    fr: { title: 'Lancez une campagne email', body: 'Annoncez une offre ou une nouveauté par email à tous vos clients.' },
    en: { title: 'Launch an email campaign', body: 'Announce an offer or something new by email to all your customers.' },
    ar: { title: 'طلق حملة إيميل', body: 'أعلن على عرض ولا جديد بالإيميل لكاع الكليان ديالك.' },
  },
  whatsappBlast: {
    fr: { title: 'Écrivez à vos clients sur WhatsApp', body: 'Le canal le plus lu au Maroc : envoyez votre offre à vos clients en quelques secondes.' },
    en: { title: 'Message your customers on WhatsApp', body: 'The most-read channel: send your offer to customers in seconds.' },
    ar: { title: 'كتب للكليان ديالك فواتساب', body: 'القناة اللي كتّقرا كثر: صيفط العرض ديالك للكليان فثواني.' },
  },
} satisfies Record<string, Localized<Msg>>;

export type TipKey = keyof typeof TIP_MESSAGES;

/** Screen each tip opens (keys of utils/notificationRoutes.ts in the Pro app). */
export const TIP_ACTIONS: Record<TipKey, string> = {
  cardDesign: 'open_logo',
  clientQr: 'open_client_qr',
  clientPush: 'open_messages',
  luckyWheel: 'open_lucky_wheel',
  scratch: 'open_scratch_campaigns',
  deals: 'open_deals',
  stampCodes: 'open_stamp_codes',
  team: 'open_team',
  stores: 'open_stores',
  emailBlast: 'open_messages',
  whatsappBlast: 'open_messages',
};
