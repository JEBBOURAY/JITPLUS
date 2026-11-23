import { pickAppLang } from '../common/utils/app-lang';

const pick = pickAppLang;

export interface DealEndedFigures {
  views: number;
  /** Link clicks, directions and calls */
  actions: number;
  /** Clients who tapped "J'en profite" */
  claims: number;
}

/** Inbox entry sent to the merchant when a deal reaches its end date. */
export function dealEndedTexts(lang: string | null | undefined, title: string, f: DealEndedFigures) {
  switch (pick(lang)) {
    case 'en':
      return {
        title: 'Your deal has ended',
        body: `"${title}" has ended: ${f.views} views, ${f.actions} actions, ${f.claims} uses. Relaunch it from the Deals screen.`,
      };
    case 'ar':
      return {
        title: 'انتهى عرضك',
        body: `انتهى العرض «${title}»: ${f.views} مشاهدة، ${f.actions} تفاعل، ${f.claims} استعمال. يمكنك إعادة إطلاقه من شاشة العروض.`,
      };
    default:
      return {
        title: 'Votre bon plan est terminé',
        body: `« ${title} » est terminé : ${f.views} vues, ${f.actions} actions, ${f.claims} utilisations. Relancez-le depuis l’écran Bons plans.`,
      };
  }
}

/** Inbox entry sent to the merchant when moderation takes a deal down. */
export function dealRemovedTexts(lang: string | null | undefined, title: string, reason: string) {
  switch (pick(lang)) {
    case 'en':
      return { title: 'Deal removed by moderation', body: `"${title}" is no longer visible. Reason: ${reason}` };
    case 'ar':
      return { title: 'تمت إزالة عرض من طرف الإشراف', body: `لم يعد العرض «${title}» ظاهرًا. السبب: ${reason}` };
    default:
      return { title: 'Bon plan retiré par la modération', body: `« ${title} » n’est plus visible. Motif : ${reason}` };
  }
}

/** Inbox entry sent to the merchant when client reports hide a deal until moderation reviews it. */
export function dealAutoHiddenTexts(lang: string | null | undefined, title: string) {
  switch (pick(lang)) {
    case 'en':
      return {
        title: 'Deal hidden after reports',
        body: `Several customers reported "${title}". It is hidden while our team checks it; you will be told if it is removed.`,
      };
    case 'ar':
      return {
        title: 'تم إخفاء عرض بعد تبليغات',
        body: `بلّغ عدة زبناء عن العرض «${title}». تم إخفاؤه إلى أن يراجعه فريقنا، وسنخبرك إذا تمت إزالته.`,
      };
    default:
      return {
        title: 'Bon plan masqué après des signalements',
        body: `Plusieurs clients ont signalé « ${title} ». Il est masqué le temps que notre équipe le vérifie ; vous serez prévenu s’il est retiré.`,
      };
  }
}

/** Push sent to the clients holding the merchant's loyalty card when it publishes deals. */
export function dealCardholderTexts(lang: string | null | undefined, merchant: string, firstTitle: string, count: number) {
  switch (pick(lang)) {
    case 'en':
      return count === 1
        ? { title: `New deal at ${merchant}`, body: firstTitle }
        : { title: `${count} new deals at ${merchant}`, body: firstTitle };
    case 'ar':
      return count === 1
        ? { title: `عرض جديد عند ${merchant}`, body: firstTitle }
        : { title: `${count} عروض جديدة عند ${merchant}`, body: firstTitle };
    default:
      return count === 1
        ? { title: `Nouveau bon plan chez ${merchant}`, body: firstTitle }
        : { title: `${count} nouveaux bons plans chez ${merchant}`, body: firstTitle };
  }
}

/** Push sent the day before a deal the client saved ends. */
export function dealSavedReminderTexts(lang: string | null | undefined, merchant: string, title: string) {
  switch (pick(lang)) {
    case 'en':
      return { title: 'A deal you saved ends soon', body: `${merchant}: ${title}` };
    case 'ar':
      return { title: 'عرض حفظته غادي يسالي قريب', body: `${merchant}: ${title}` };
    default:
      return { title: 'Un bon plan enregistré se termine bientôt', body: `${merchant} : ${title}` };
  }
}

export interface DealDigestInput {
  count: number;
  /** Localized city name, empty for an ONLINE-only digest */
  city: string;
  withOnline: boolean;
  first: { merchant: string; title: string };
  /** Distinct merchant names, digest order */
  merchants: string[];
}

const MAX_NAMES = 3;

/** Daily "bons plans" push sent to clients (also stored as the in-app entry). */
export function dealDigestTexts(lang: string | null | undefined, d: DealDigestInput) {
  const l = pick(lang);
  const single = `🔥 ${d.first.merchant} : ${d.first.title}`;
  const names = d.merchants.slice(0, MAX_NAMES);
  const rest = d.count - names.length;
  switch (l) {
    case 'en': {
      if (d.count === 1) {
        return { title: d.city ? `New deal in ${d.city}` : 'New online deal', body: `🔥 ${d.first.merchant}: ${d.first.title}` };
      }
      const where = d.city ? ` in ${d.city}${d.withOnline ? ' and online' : ''}` : ' online';
      return { title: `🔥 ${d.count} new deals${where}`, body: names.join(', ') + (rest > 0 ? ` and ${rest} more` : '') };
    }
    case 'ar': {
      if (d.count === 1) {
        return { title: d.city ? `عرض جديد في ${d.city}` : 'عرض جديد أونلاين', body: `🔥 ${d.first.merchant}: ${d.first.title}` };
      }
      const where = d.city ? ` في ${d.city}${d.withOnline ? ' وأونلاين' : ''}` : ' أونلاين';
      return { title: `🔥 ${d.count} عروض جديدة${where}`, body: names.join('، ') + (rest > 0 ? ` و${rest} آخرين` : '') };
    }
    default: {
      if (d.count === 1) {
        return { title: d.city ? `Nouveau bon plan à ${d.city}` : 'Nouveau bon plan en ligne', body: single };
      }
      const where = d.city ? ` à ${d.city}${d.withOnline ? ' et en ligne' : ''}` : ' en ligne';
      return { title: `🔥 ${d.count} nouveaux bons plans${where}`, body: names.join(', ') + (rest > 0 ? ` et ${rest} autres` : '') };
    }
  }
}
