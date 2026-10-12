export type NotifLocale = 'fr' | 'en' | 'ar';

const translations = {
  fr: {
    earnTitle: (stamps: number, unit: string) => `+${stamps} ${unit} 🎉`,
    earnBody: (stamps: number, unit: string, merchant: string, balance: number, balanceUnit: string) =>
      `Vous avez gagné ${stamps} ${unit} chez ${merchant}. Solde : ${balance} ${balanceUnit}.`,
    rewardAvailableTitle: '🎁 Récompense disponible !',
    rewardAvailableBody: (threshold: number, unit: string, merchant: string) =>
      `Bravo ! Vous avez atteint ${threshold} ${unit} chez ${merchant}. Réclamez votre cadeau !`,
    redeemTitle: '✅ Récompense utilisée',
    redeemBody: (stamps: number, unit: string, reward: string, merchant: string, balance: number, balanceUnit: string) =>
      `Vous avez utilisé ${stamps} ${unit} pour "${reward}" chez ${merchant}. Solde : ${balance} ${balanceUnit}.`,
    redeemFallbackReward: 'une récompense',
    adjustAddTitle: (stamps: number, unit: string) => `✅ +${stamps} ${unit} ajoutés`,
    adjustRemoveTitle: (stamps: number, unit: string) => `📝 -${stamps} ${unit} retirés`,
    adjustAddBody: (stamps: number, unit: string, merchant: string) =>
      `${stamps} ${unit} ont été ajoutés à votre compte chez ${merchant}.`,
    adjustRemoveBody: (stamps: number, unit: string, merchant: string) =>
      `${stamps} ${unit} ont été retirés de votre compte chez ${merchant}.`,
    adjustReason: (note: string) => ` Motif : ${note}`,
    adjustBalance: (balance: number, unit: string) => ` Nouveau total : ${balance} ${unit}.`,
    capTitle: (merchant: string) => `📊 ${merchant} — Solde ajusté`,
    capBody: (oldStamps: number, newStamps: number, unit: string, merchant: string) =>
      `Votre solde est passé de ${oldStamps} à ${newStamps} ${unit} chez ${merchant}.`,
    capNote: (oldStamps: number, newStamps: number, unit: string) =>
      `Limite d'accumulation appliquée: ${oldStamps} → ${newStamps} ${unit}`,
    unitStamps: (n: number) => n > 1 ? 'tampons' : 'tampon',
    expiringTitle: '⏳ Vos tampons expirent bientôt',
    expiringBody: (stamps: number, unit: string, merchant: string, date: string) =>
      `Vos ${stamps} ${unit} chez ${merchant} expirent le ${date}. Passez avant pour les garder !`,
    expiredNote: (days: number) => `Tampons expirés : aucune visite depuis ${days} jours`,
    luckyWheelTicketTitle: (n: number) => n > 1 ? `🎟️ ${n} tickets gagnés !` : '🎟️ Ticket gagné !',
    luckyWheelTicketBody: (n: number, merchant: string) =>
      n > 1
        ? `Vous avez gagné ${n} tickets pour la roue de la chance chez ${merchant}. Tentez votre chance !`
        : `Vous avez gagné un ticket pour la roue de la chance chez ${merchant}. Tentez votre chance !`,
  },
  en: {
    earnTitle: (stamps: number, unit: string) => `+${stamps} ${unit} 🎉`,
    earnBody: (stamps: number, unit: string, merchant: string, balance: number, balanceUnit: string) =>
      `You earned ${stamps} ${unit} at ${merchant}. Balance: ${balance} ${balanceUnit}.`,
    rewardAvailableTitle: '🎁 Reward available!',
    rewardAvailableBody: (threshold: number, unit: string, merchant: string) =>
      `Congratulations! You reached ${threshold} ${unit} at ${merchant}. Claim your reward!`,
    redeemTitle: '✅ Reward redeemed',
    redeemBody: (stamps: number, unit: string, reward: string, merchant: string, balance: number, balanceUnit: string) =>
      `You used ${stamps} ${unit} for "${reward}" at ${merchant}. Balance: ${balance} ${balanceUnit}.`,
    redeemFallbackReward: 'a reward',
    adjustAddTitle: (stamps: number, unit: string) => `✅ +${stamps} ${unit} added`,
    adjustRemoveTitle: (stamps: number, unit: string) => `📝 -${stamps} ${unit} removed`,
    adjustAddBody: (stamps: number, unit: string, merchant: string) =>
      `${stamps} ${unit} have been added to your account at ${merchant}.`,
    adjustRemoveBody: (stamps: number, unit: string, merchant: string) =>
      `${stamps} ${unit} have been removed from your account at ${merchant}.`,
    adjustReason: (note: string) => ` Reason: ${note}`,
    adjustBalance: (balance: number, unit: string) => ` New total: ${balance} ${unit}.`,
    capTitle: (merchant: string) => `📊 ${merchant} — Balance adjusted`,
    capBody: (oldStamps: number, newStamps: number, unit: string, merchant: string) =>
      `Your balance went from ${oldStamps} to ${newStamps} ${unit} at ${merchant}.`,
    capNote: (oldStamps: number, newStamps: number, unit: string) =>
      `Accumulation limit applied: ${oldStamps} → ${newStamps} ${unit}`,
    unitStamps: (n: number) => n > 1 ? 'stamps' : 'stamp',
    expiringTitle: '⏳ Your stamps expire soon',
    expiringBody: (stamps: number, unit: string, merchant: string, date: string) =>
      `Your ${stamps} ${unit} at ${merchant} expire on ${date}. Visit before then to keep them!`,
    expiredNote: (days: number) => `Stamps expired: no visit for ${days} days`,
    luckyWheelTicketTitle: (n: number) => n > 1 ? `🎟️ ${n} wheel tickets won!` : '🎟️ Wheel ticket won!',
    luckyWheelTicketBody: (n: number, merchant: string) =>
      n > 1
        ? `You won ${n} wheel-of-fortune tickets at ${merchant}. Try your luck!`
        : `You won a wheel-of-fortune ticket at ${merchant}. Try your luck!`,
  },
  ar: {
    earnTitle: (stamps: number, unit: string) => `+${stamps} ${unit} 🎉`,
    earnBody: (stamps: number, unit: string, merchant: string, balance: number, balanceUnit: string) =>
      `لقد ربحت ${stamps} ${unit} عند ${merchant}. الرصيد: ${balance} ${balanceUnit}.`,
    rewardAvailableTitle: '🎁 مكافأة متاحة!',
    rewardAvailableBody: (threshold: number, unit: string, merchant: string) =>
      `مبروك! لقد بلغت ${threshold} ${unit} عند ${merchant}. اطلب هديتك!`,
    redeemTitle: '✅ تم استخدام المكافأة',
    redeemBody: (stamps: number, unit: string, reward: string, merchant: string, balance: number, balanceUnit: string) =>
      `لقد استخدمت ${stamps} ${unit} مقابل "${reward}" عند ${merchant}. الرصيد: ${balance} ${balanceUnit}.`,
    redeemFallbackReward: 'مكافأة',
    adjustAddTitle: (stamps: number, unit: string) => `✅ +${stamps} ${unit} مضافة`,
    adjustRemoveTitle: (stamps: number, unit: string) => `📝 -${stamps} ${unit} مسحوبة`,
    adjustAddBody: (stamps: number, unit: string, merchant: string) =>
      `تمت إضافة ${stamps} ${unit} إلى حسابك عند ${merchant}.`,
    adjustRemoveBody: (stamps: number, unit: string, merchant: string) =>
      `تم سحب ${stamps} ${unit} من حسابك عند ${merchant}.`,
    adjustReason: (note: string) => ` السبب: ${note}`,
    adjustBalance: (balance: number, unit: string) => ` الرصيد الجديد: ${balance} ${unit}.`,
    capTitle: (merchant: string) => `📊 ${merchant} — تم تعديل الرصيد`,
    capBody: (oldStamps: number, newStamps: number, unit: string, merchant: string) =>
      `تم تعديل رصيدك من ${oldStamps} إلى ${newStamps} ${unit} عند ${merchant}.`,
    capNote: (oldStamps: number, newStamps: number, unit: string) =>
      `تم تطبيق حد التراكم: ${oldStamps} → ${newStamps} ${unit}`,
    unitStamps: (n: number) => n > 1 ? 'طوابع' : 'طابع',
    expiringTitle: '⏳ الطوابع ديالك غادي تسالي قريب',
    expiringBody: (stamps: number, unit: string, merchant: string, date: string) =>
      `${stamps} ${unit} ديالك عند ${merchant} غادي تسالي نهار ${date}. دوز قبل باش تحافظ عليهم!`,
    expiredNote: (days: number) => `انتهات صلاحية الطوابع: ما كانتش زيارة هادي ${days} يوم`,
    luckyWheelTicketTitle: (n: number) => n > 1 ? `🎟️ ${n} تذاكر لعجلة الحظ!` : '🎟️ تذكرة لعجلة الحظ!',
    luckyWheelTicketBody: (n: number, merchant: string) =>
      n > 1
        ? `لقد ربحت ${n} تذاكر لعجلة الحظ عند ${merchant}. جرّب حظك!`
        : `لقد ربحت تذكرة لعجلة الحظ عند ${merchant}. جرّب حظك!`,
  },
} as const;

export function getNotifTranslations(locale?: string | null) {
  const lang = (locale && locale in translations ? locale : 'fr') as NotifLocale;
  return translations[lang];
}
