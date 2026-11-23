// Push / in-app texts of the collection game (fr, en, ar — Darija like the
// rest of the Arabic notifications).
import { pickAppLang } from '../common/utils/app-lang';

const texts = {
  fr: {
    progressTitle: (merchant: string, checked: number, total: number) => `Collection ${merchant} : ${checked}/${total}`,
    progressBody: (remaining: number, gift: string) => `Encore ${remaining} produits et « ${gift} » vous est offert.`,
    lastOneTitle: (merchant: string) => `Plus qu'un produit chez ${merchant}`,
    lastOneBody: (gift: string) => `Complétez votre collection : « ${gift} » vous est offert.`,
    completedTitle: (merchant: string) => `Collection complète chez ${merchant}`,
    completedBody: (gift: string, date: string | null) =>
      date
        ? `« ${gift} » vous est offert à partir du ${date}. Montrez votre coupon en caisse.`
        : `« ${gift} » vous est offert. Montrez votre coupon en caisse.`,
  },
  en: {
    progressTitle: (merchant: string, checked: number, total: number) => `${merchant} collection: ${checked}/${total}`,
    progressBody: (remaining: number, gift: string) => `${remaining} more products and "${gift}" is on the house.`,
    lastOneTitle: (merchant: string) => `One product to go at ${merchant}`,
    lastOneBody: (gift: string) => `Complete your collection: "${gift}" is on the house.`,
    completedTitle: (merchant: string) => `Collection complete at ${merchant}`,
    completedBody: (gift: string, date: string | null) =>
      date
        ? `"${gift}" is yours from ${date}. Show your coupon at the till.`
        : `"${gift}" is yours. Show your coupon at the till.`,
  },
  ar: {
    progressTitle: (merchant: string, checked: number, total: number) => `الكوليكسيون عند ${merchant}: ${checked}/${total}`,
    progressBody: (remaining: number, gift: string) => `باقي ليك ${remaining} ديال المنتوجات و«${gift}» فابور عليك.`,
    lastOneTitle: (merchant: string) => `باقي ليك غير منتوج واحد عند ${merchant}`,
    lastOneBody: (gift: string) => `كمّل الكوليكسيون ديالك: «${gift}» فابور عليك.`,
    completedTitle: (merchant: string) => `كمّلتي الكوليكسيون عند ${merchant}`,
    completedBody: (gift: string, date: string | null) =>
      date
        ? `«${gift}» فابور عليك من نهار ${date}. ورّي الكوبون ديالك فالكيسة.`
        : `«${gift}» فابور عليك. ورّي الكوبون ديالك فالكيسة.`,
  },
} as const;

export function getCollectionTexts(locale?: string | null) {
  return texts[pickAppLang(locale)];
}
