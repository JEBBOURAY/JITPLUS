// Push texts of the booking module, per client / merchant language.

type Lang = 'fr' | 'en' | 'ar';

export interface BookingPushVars {
  merchant: string;
  service: string;
  /** DD/MM */
  day: string;
  /** HH:MM */
  time: string;
  client?: string;
  /** Reason the merchant gave for a decline or a cancellation */
  reason?: string | null;
}

/** The merchant's reason, after a decline or cancellation body, when one was given. */
const REASON_PREFIX: Record<Lang, string> = { fr: 'Motif : ', en: 'Reason: ', ar: 'السبب: ' };
const withReason = (lang: Lang, body: string, v: BookingPushVars) => (v.reason ? `${body} ${REASON_PREFIX[lang]}${v.reason}` : body);

interface Pair {
  title: (v: BookingPushVars) => string;
  body: (v: BookingPushVars) => string;
}

const CLIENT: Record<Lang, Record<'confirmed' | 'pending' | 'declined' | 'cancelled' | 'expired' | 'rescheduled' | 'reminderDay' | 'reminderHour', Pair>> = {
  fr: {
    confirmed: { title: (v) => `Rendez-vous confirmé chez ${v.merchant}`, body: (v) => `${v.service} le ${v.day} à ${v.time}.` },
    pending: { title: (v) => `Demande envoyée à ${v.merchant}`, body: (v) => `${v.service} le ${v.day} à ${v.time} : vous serez prévenu dès sa réponse.` },
    declined: { title: (v) => `${v.merchant} n'a pas pu accepter`, body: (v) => withReason('fr', `Votre demande du ${v.day} à ${v.time} est refusée. Choisissez un autre créneau.`, v) },
    cancelled: { title: (v) => `Rendez-vous annulé par ${v.merchant}`, body: (v) => withReason('fr', `${v.service} du ${v.day} à ${v.time} est annulé.`, v) },
    expired: { title: (v) => `Pas de réponse de ${v.merchant}`, body: (v) => `Votre demande du ${v.day} à ${v.time} a expiré. Choisissez un autre créneau.` },
    rescheduled: { title: (v) => `Rendez-vous déplacé par ${v.merchant}`, body: (v) => `${v.service} : nouveau rendez-vous le ${v.day} à ${v.time}. Un empêchement ? Annulez depuis l'app.` },
    reminderDay: { title: (v) => `Demain chez ${v.merchant}`, body: (v) => `${v.service} à ${v.time}. Un empêchement ? Annulez depuis l'app.` },
    reminderHour: { title: (v) => `Bientôt chez ${v.merchant}`, body: (v) => `${v.service} à ${v.time}. Montrez votre QR à l'arrivée pour vos tampons.` },
  },
  en: {
    confirmed: { title: (v) => `Booking confirmed at ${v.merchant}`, body: (v) => `${v.service} on ${v.day} at ${v.time}.` },
    pending: { title: (v) => `Request sent to ${v.merchant}`, body: (v) => `${v.service} on ${v.day} at ${v.time}: we'll let you know when they reply.` },
    declined: { title: (v) => `${v.merchant} couldn't accept`, body: (v) => withReason('en', `Your request for ${v.day} at ${v.time} was declined. Pick another time.`, v) },
    cancelled: { title: (v) => `Booking cancelled by ${v.merchant}`, body: (v) => withReason('en', `${v.service} on ${v.day} at ${v.time} is cancelled.`, v) },
    expired: { title: (v) => `No reply from ${v.merchant}`, body: (v) => `Your request for ${v.day} at ${v.time} expired. Pick another time.` },
    rescheduled: { title: (v) => `Booking moved by ${v.merchant}`, body: (v) => `${v.service}: now on ${v.day} at ${v.time}. Can't make it? Cancel in the app.` },
    reminderDay: { title: (v) => `Tomorrow at ${v.merchant}`, body: (v) => `${v.service} at ${v.time}. Can't make it? Cancel in the app.` },
    reminderHour: { title: (v) => `Soon at ${v.merchant}`, body: (v) => `${v.service} at ${v.time}. Show your QR on arrival to get your stamps.` },
  },
  ar: {
    confirmed: { title: (v) => `تم تأكيد موعدك عند ${v.merchant}`, body: (v) => `${v.service} يوم ${v.day} على الساعة ${v.time}.` },
    pending: { title: (v) => `تم إرسال طلبك إلى ${v.merchant}`, body: (v) => `${v.service} يوم ${v.day} على الساعة ${v.time}: سنخبرك فور الرد.` },
    declined: { title: (v) => `تعذر على ${v.merchant} قبول طلبك`, body: (v) => withReason('ar', `تم رفض طلبك ليوم ${v.day} على الساعة ${v.time}. اختر موعدا آخر.`, v) },
    cancelled: { title: (v) => `ألغى ${v.merchant} موعدك`, body: (v) => withReason('ar', `تم إلغاء ${v.service} يوم ${v.day} على الساعة ${v.time}.`, v) },
    expired: { title: (v) => `لا رد من ${v.merchant}`, body: (v) => `انتهت صلاحية طلبك ليوم ${v.day} على الساعة ${v.time}. اختر موعدا آخر.` },
    rescheduled: { title: (v) => `غيّر ${v.merchant} موعدك`, body: (v) => `${v.service}: الموعد الجديد يوم ${v.day} على الساعة ${v.time}. لديك مانع؟ ألغِ من التطبيق.` },
    reminderDay: { title: (v) => `غدا عند ${v.merchant}`, body: (v) => `${v.service} على الساعة ${v.time}. لديك مانع؟ ألغِ من التطبيق.` },
    reminderHour: { title: (v) => `قريبا عند ${v.merchant}`, body: (v) => `${v.service} على الساعة ${v.time}. أظهر رمز QR عند وصولك لتحصل على طوابعك.` },
  },
};

const MERCHANT: Record<Lang, Record<'newConfirmed' | 'newPending' | 'pendingReminder' | 'cancelledByClient' | 'requestExpired', Pair>> = {
  fr: {
    newConfirmed: { title: () => 'Nouveau rendez-vous', body: (v) => `${v.client ?? 'Un client'} · ${v.service} le ${v.day} à ${v.time}` },
    newPending: { title: () => 'Demande de rendez-vous à valider', body: (v) => `${v.client ?? 'Un client'} · ${v.service} le ${v.day} à ${v.time}` },
    pendingReminder: { title: () => 'Demande bientôt expirée', body: (v) => `${v.client ?? 'Un client'} attend votre réponse pour ${v.service} le ${v.day} à ${v.time}. Sans réponse, elle expire.` },
    cancelledByClient: { title: () => 'Rendez-vous annulé', body: (v) => `${v.client ?? 'Un client'} a annulé ${v.service} du ${v.day} à ${v.time}` },
    requestExpired: { title: () => 'Demande de rendez-vous expirée', body: (v) => `${v.client ?? 'Un client'} · ${v.service} du ${v.day} à ${v.time} : sans réponse de votre part, le client a été prévenu.` },
  },
  en: {
    newConfirmed: { title: () => 'New booking', body: (v) => `${v.client ?? 'A client'} · ${v.service} on ${v.day} at ${v.time}` },
    newPending: { title: () => 'Booking request to review', body: (v) => `${v.client ?? 'A client'} · ${v.service} on ${v.day} at ${v.time}` },
    pendingReminder: { title: () => 'Request about to expire', body: (v) => `${v.client ?? 'A client'} is waiting for your answer: ${v.service} on ${v.day} at ${v.time}. Without a reply, it expires.` },
    cancelledByClient: { title: () => 'Booking cancelled', body: (v) => `${v.client ?? 'A client'} cancelled ${v.service} on ${v.day} at ${v.time}` },
    requestExpired: { title: () => 'Booking request expired', body: (v) => `${v.client ?? 'A client'} · ${v.service} on ${v.day} at ${v.time}: no reply from you, the client has been told.` },
  },
  ar: {
    newConfirmed: { title: () => 'موعد جديد', body: (v) => `${v.client ?? 'زبون'} · ${v.service} يوم ${v.day} على الساعة ${v.time}` },
    newPending: { title: () => 'طلب موعد بانتظار موافقتك', body: (v) => `${v.client ?? 'زبون'} · ${v.service} يوم ${v.day} على الساعة ${v.time}` },
    pendingReminder: { title: () => 'طلب موعد غادي يسالي', body: (v) => `${v.client ?? 'زبون'} كيتسنى جوابك على ${v.service} يوم ${v.day} على الساعة ${v.time}. بلا جواب غادي يسالي.` },
    cancelledByClient: { title: () => 'تم إلغاء موعد', body: (v) => `ألغى ${v.client ?? 'زبون'} ${v.service} يوم ${v.day} على الساعة ${v.time}` },
    requestExpired: { title: () => 'انتهت صلاحية طلب موعد', body: (v) => `${v.client ?? 'زبون'} · ${v.service} يوم ${v.day} على الساعة ${v.time}: لم تقم بالرد، وتم إخبار الزبون.` },
  },
};

export type ClientBookingMessage = keyof (typeof CLIENT)['fr'];
export type MerchantBookingMessage = keyof (typeof MERCHANT)['fr'];

function lang(l: string | null | undefined): Lang {
  return l === 'en' || l === 'ar' ? l : 'fr';
}

export function clientBookingText(kind: ClientBookingMessage, language: string | null | undefined, v: BookingPushVars) {
  const p = CLIENT[lang(language)][kind];
  return { title: p.title(v), body: p.body(v) };
}

export function merchantBookingText(kind: MerchantBookingMessage, language: string | null | undefined, v: BookingPushVars) {
  const p = MERCHANT[lang(language)][kind];
  return { title: p.title(v), body: p.body(v) };
}
