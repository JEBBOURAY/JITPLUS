// Push / in-app texts of the scratch-card feature (fr, en, ar — Darija like the
// rest of the Arabic notifications).
export type ScratchLocale = 'fr' | 'en' | 'ar';

const texts = {
  fr: {
    cardReceivedTitle: (merchant: string) => `🎁 ${merchant} vous offre une carte à gratter`,
    cardReceivedBody: (message: string | null) =>
      message ? `${message} — Grattez-la, c'est gagné à coup sûr !` : 'Grattez-la, c\'est gagné à coup sûr !',
    cardExpiringTitle: '⏳ Votre carte à gratter expire bientôt',
    cardExpiringBody: (merchant: string, date: string) =>
      `Votre carte de ${merchant} n'est pas encore grattée. Elle expire le ${date}.`,
    couponExpiringTitle: '⏳ Votre coupon expire bientôt',
    couponExpiringBody: (label: string, merchant: string, date: string) =>
      `« ${label} » chez ${merchant} est valable jusqu'au ${date}. Passez en profiter !`,
    couponRedeemedTitle: '✅ Coupon utilisé',
    couponRedeemedBody: (label: string, merchant: string, stamps: number) =>
      stamps > 0
        ? `« ${label} » utilisé chez ${merchant} · +${stamps} tampon${stamps > 1 ? 's' : ''}.`
        : `« ${label} » utilisé chez ${merchant}.`,
    campaignCancelledTitle: (merchant: string) => `${merchant} a mis fin à son offre`,
    campaignCancelledBody: (label: string) => `Votre coupon « ${label} » n'est plus valable.`,
    datesExtendedTitle: '📅 Bonne nouvelle !',
    datesExtendedBody: (merchant: string, date: string) =>
      `Votre coupon chez ${merchant} est prolongé jusqu'au ${date}.`,
    campaignNotSentTitle: 'Campagne non envoyée : abonnement Premium expiré',
    campaignNotSentBody: (name: string) => `« ${name} » est revenue en brouillon. Renouvelez Premium pour l'envoyer.`,
  },
  en: {
    cardReceivedTitle: (merchant: string) => `🎁 ${merchant} sent you a scratch card`,
    cardReceivedBody: (message: string | null) =>
      message ? `${message} — Scratch it, every card wins!` : 'Scratch it, every card wins!',
    cardExpiringTitle: '⏳ Your scratch card expires soon',
    cardExpiringBody: (merchant: string, date: string) =>
      `Your card from ${merchant} is not scratched yet. It expires on ${date}.`,
    couponExpiringTitle: '⏳ Your coupon expires soon',
    couponExpiringBody: (label: string, merchant: string, date: string) =>
      `"${label}" at ${merchant} is valid until ${date}. Don't miss it!`,
    couponRedeemedTitle: '✅ Coupon used',
    couponRedeemedBody: (label: string, merchant: string, stamps: number) =>
      stamps > 0
        ? `"${label}" used at ${merchant} · +${stamps} stamp${stamps > 1 ? 's' : ''}.`
        : `"${label}" used at ${merchant}.`,
    campaignCancelledTitle: (merchant: string) => `${merchant} ended its offer`,
    campaignCancelledBody: (label: string) => `Your coupon "${label}" is no longer valid.`,
    datesExtendedTitle: '📅 Good news!',
    datesExtendedBody: (merchant: string, date: string) =>
      `Your coupon at ${merchant} has been extended until ${date}.`,
    campaignNotSentTitle: 'Campaign not sent: Premium subscription expired',
    campaignNotSentBody: (name: string) => `"${name}" is back in drafts. Renew Premium to send it.`,
  },
  ar: {
    cardReceivedTitle: (merchant: string) => `🎁 ${merchant} صيفط ليك كارطة للحك`,
    cardReceivedBody: (message: string | null) =>
      message ? `${message} — حكّها، كل كارطة رابحة!` : 'حكّها، كل كارطة رابحة!',
    cardExpiringTitle: '⏳ كارطة الحك ديالك غادي تسالي قريب',
    cardExpiringBody: (merchant: string, date: string) =>
      `الكارطة ديال ${merchant} مازال ما حكّيتيهاش. كتسالي نهار ${date}.`,
    couponExpiringTitle: '⏳ الكوبون ديالك غادي يسالي قريب',
    couponExpiringBody: (label: string, merchant: string, date: string) =>
      `«${label}» عند ${merchant} صالح حتى ${date}. دوز استافد منو!`,
    couponRedeemedTitle: '✅ تستعمل الكوبون',
    couponRedeemedBody: (label: string, merchant: string, stamps: number) =>
      stamps > 0
        ? `«${label}» تستعمل عند ${merchant} · +${stamps} طابع.`
        : `«${label}» تستعمل عند ${merchant}.`,
    campaignCancelledTitle: (merchant: string) => `${merchant} وقّف العرض ديالو`,
    campaignCancelledBody: (label: string) => `الكوبون «${label}» ما بقاش صالح.`,
    datesExtendedTitle: '📅 خبر زوين!',
    datesExtendedBody: (merchant: string, date: string) =>
      `الكوبون ديالك عند ${merchant} تمدّد حتى ${date}.`,
    campaignNotSentTitle: 'الحملة ما تصيفطاتش: الاشتراك Premium سالا',
    campaignNotSentBody: (name: string) => `«${name}» رجعات مسودة. جدّد Premium باش تصيفطها.`,
  },
} as const;

export function scratchLocale(locale?: string | null): ScratchLocale {
  return locale === 'en' || locale === 'ar' ? locale : 'fr';
}

export function getScratchTexts(locale?: string | null) {
  return texts[scratchLocale(locale)];
}
