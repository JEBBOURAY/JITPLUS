export type NotifLocale = 'fr' | 'en' | 'ar';

const translations = {
  fr: {
    earnTitle: (pts: number, unit: string) => `+${pts} ${unit} 🎉`,
    earnBody: (pts: number, unit: string, merchant: string, balance: number, balanceUnit: string) =>
      `Vous avez gagné ${pts} ${unit} chez ${merchant}. Solde : ${balance} ${balanceUnit}.`,
    rewardAvailableTitle: '🎁 Récompense disponible !',
    rewardAvailableBody: (threshold: number, unit: string, merchant: string) =>
      `Bravo ! Vous avez atteint ${threshold} ${unit} chez ${merchant}. Réclamez votre cadeau !`,
    redeemTitle: '✅ Récompense utilisée',
    redeemBody: (pts: number, unit: string, reward: string, merchant: string, balance: number, balanceUnit: string) =>
      `Vous avez utilisé ${pts} ${unit} pour "${reward}" chez ${merchant}. Solde : ${balance} ${balanceUnit}.`,
    redeemFallbackReward: 'une récompense',
    adjustAddTitle: (pts: number, unit: string) => `✅ +${pts} ${unit} ajoutés`,
    adjustRemoveTitle: (pts: number, unit: string) => `📝 -${pts} ${unit} retirés`,
    adjustAddBody: (pts: number, unit: string, merchant: string) =>
      `${pts} ${unit} ont été ajoutés à votre compte chez ${merchant}.`,
    adjustRemoveBody: (pts: number, unit: string, merchant: string) =>
      `${pts} ${unit} ont été retirés de votre compte chez ${merchant}.`,
    adjustReason: (note: string) => ` Motif : ${note}`,
    adjustBalance: (balance: number, unit: string) => ` Nouveau total : ${balance} ${unit}.`,
    capTitle: (merchant: string) => `📊 ${merchant} — Solde ajusté`,
    capBody: (oldPts: number, newPts: number, unit: string, merchant: string) =>
      `Votre solde est passé de ${oldPts} à ${newPts} ${unit} chez ${merchant}.`,
    capNote: (oldPts: number, newPts: number, unit: string) =>
      `Limite d'accumulation appliquée: ${oldPts} → ${newPts} ${unit}`,
    unitPoints: (n: number) => n > 1 ? 'points' : 'point',
    unitStamps: (n: number) => n > 1 ? 'tampons' : 'tampon',
  },
  en: {
    earnTitle: (pts: number, unit: string) => `+${pts} ${unit} 🎉`,
    earnBody: (pts: number, unit: string, merchant: string, balance: number, balanceUnit: string) =>
      `You earned ${pts} ${unit} at ${merchant}. Balance: ${balance} ${balanceUnit}.`,
    rewardAvailableTitle: '🎁 Reward available!',
    rewardAvailableBody: (threshold: number, unit: string, merchant: string) =>
      `Congratulations! You reached ${threshold} ${unit} at ${merchant}. Claim your reward!`,
    redeemTitle: '✅ Reward redeemed',
    redeemBody: (pts: number, unit: string, reward: string, merchant: string, balance: number, balanceUnit: string) =>
      `You used ${pts} ${unit} for "${reward}" at ${merchant}. Balance: ${balance} ${balanceUnit}.`,
    redeemFallbackReward: 'a reward',
    adjustAddTitle: (pts: number, unit: string) => `✅ +${pts} ${unit} added`,
    adjustRemoveTitle: (pts: number, unit: string) => `📝 -${pts} ${unit} removed`,
    adjustAddBody: (pts: number, unit: string, merchant: string) =>
      `${pts} ${unit} have been added to your account at ${merchant}.`,
    adjustRemoveBody: (pts: number, unit: string, merchant: string) =>
      `${pts} ${unit} have been removed from your account at ${merchant}.`,
    adjustReason: (note: string) => ` Reason: ${note}`,
    adjustBalance: (balance: number, unit: string) => ` New total: ${balance} ${unit}.`,
    capTitle: (merchant: string) => `📊 ${merchant} — Balance adjusted`,
    capBody: (oldPts: number, newPts: number, unit: string, merchant: string) =>
      `Your balance went from ${oldPts} to ${newPts} ${unit} at ${merchant}.`,
    capNote: (oldPts: number, newPts: number, unit: string) =>
      `Accumulation limit applied: ${oldPts} → ${newPts} ${unit}`,
    unitPoints: (n: number) => n > 1 ? 'points' : 'point',
    unitStamps: (n: number) => n > 1 ? 'stamps' : 'stamp',
  },
  ar: {
    earnTitle: (pts: number, unit: string) => `+${pts} ${unit} 🎉`,
    earnBody: (pts: number, unit: string, merchant: string, balance: number, balanceUnit: string) =>
      `لقد ربحت ${pts} ${unit} عند ${merchant}. الرصيد: ${balance} ${balanceUnit}.`,
    rewardAvailableTitle: '🎁 مكافأة متاحة!',
    rewardAvailableBody: (threshold: number, unit: string, merchant: string) =>
      `مبروك! لقد بلغت ${threshold} ${unit} عند ${merchant}. اطلب هديتك!`,
    redeemTitle: '✅ تم استخدام المكافأة',
    redeemBody: (pts: number, unit: string, reward: string, merchant: string, balance: number, balanceUnit: string) =>
      `لقد استخدمت ${pts} ${unit} مقابل "${reward}" عند ${merchant}. الرصيد: ${balance} ${balanceUnit}.`,
    redeemFallbackReward: 'مكافأة',
    adjustAddTitle: (pts: number, unit: string) => `✅ +${pts} ${unit} مضافة`,
    adjustRemoveTitle: (pts: number, unit: string) => `📝 -${pts} ${unit} مسحوبة`,
    adjustAddBody: (pts: number, unit: string, merchant: string) =>
      `تمت إضافة ${pts} ${unit} إلى حسابك عند ${merchant}.`,
    adjustRemoveBody: (pts: number, unit: string, merchant: string) =>
      `تم سحب ${pts} ${unit} من حسابك عند ${merchant}.`,
    adjustReason: (note: string) => ` السبب: ${note}`,
    adjustBalance: (balance: number, unit: string) => ` الرصيد الجديد: ${balance} ${unit}.`,
    capTitle: (merchant: string) => `📊 ${merchant} — تم تعديل الرصيد`,
    capBody: (oldPts: number, newPts: number, unit: string, merchant: string) =>
      `تم تعديل رصيدك من ${oldPts} إلى ${newPts} ${unit} عند ${merchant}.`,
    capNote: (oldPts: number, newPts: number, unit: string) =>
      `تم تطبيق حد التراكم: ${oldPts} → ${newPts} ${unit}`,
    unitPoints: (n: number) => n > 1 ? 'نقاط' : 'نقطة',
    unitStamps: (n: number) => n > 1 ? 'طوابع' : 'طابع',
  },
} as const;

export function getNotifTranslations(locale?: string | null) {
  const lang = (locale && locale in translations ? locale : 'fr') as NotifLocale;
  return translations[lang];
}
