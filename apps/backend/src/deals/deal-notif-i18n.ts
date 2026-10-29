type Lang = 'fr' | 'en' | 'ar';

const pick = (lang: string | null | undefined): Lang => (lang === 'en' || lang === 'ar' ? lang : 'fr');

/** Inbox entry sent to the merchant when a deal reaches its end date. */
export function dealEndedTexts(lang: string | null | undefined, title: string, views: number, clicks: number) {
  switch (pick(lang)) {
    case 'en':
      return {
        title: 'Your deal has ended',
        body: `"${title}" has ended: ${views} views, ${clicks} clicks. Relaunch it from the Deals screen.`,
      };
    case 'ar':
      return {
        title: 'انتهى عرضك',
        body: `انتهى العرض «${title}»: ${views} مشاهدة و${clicks} نقرة. يمكنك إعادة إطلاقه من شاشة العروض.`,
      };
    default:
      return {
        title: 'Votre bon plan est terminé',
        body: `« ${title} » est terminé : ${views} vues, ${clicks} clics. Relancez-le depuis l’écran Bons plans.`,
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
