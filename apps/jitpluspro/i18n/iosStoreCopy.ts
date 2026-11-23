/**
 * iOS wording for the Pro plan (App Store guidelines 3.1.1 / 3.1.3).
 *
 * The Pro plan is not sold in the app. On iOS the app may say which features
 * the plan includes, but must not invite the merchant to buy it elsewhere
 * ("Upgrade to Pro", "Contact our team"). These strings replace those keys on
 * iOS only; Android keeps the regular copy.
 */
const fr = {
  home: {
    proTeaserTitle: 'Forfait Pro',
  },
  storesCrud: {
    limitMsg: 'Vous avez atteint la limite de %{max} boutiques du forfait Pro.',
    storesLockedMsg: 'Le forfait gratuit est limité à 1 boutique. Le forfait Pro permet de gérer jusqu\'à 10 boutiques.',
  },
  account: {
    viewPlans: 'Mon forfait',
    dashboardLockedMsg: 'Les statistiques détaillées et les tendances sont incluses dans le forfait Pro.',
    logoProMsg: 'La personnalisation du logo est incluse dans le forfait Pro.',
  },
  settingsPage: {
    premiumLoyaltyDesc: 'La personnalisation des règles de fidélité est incluse dans le forfait Pro.',
    premiumRewardDesc: 'Le forfait gratuit est limité à 1 cadeau. Le forfait Pro permet de proposer autant de cadeaux que vous voulez.',
    proUnlockCta: 'Inclus dans le forfait Pro',
  },
  team: {
    proRequiredMsg: 'La gestion d\'équipe est incluse dans le forfait Pro.',
  },
  referral: {
    step3Desc: 'Quand il passe au forfait Pro, vous recevez 1 mois Pro offert.',
    termsNote: 'Programme de parrainage réservé aux commerces inscrits. 1 mois Pro offert par commerce parrainé qui passe au forfait Pro. Non cumulable avec d\'autres offres, non convertible en espèces, usage professionnel uniquement. JitPlus peut modifier ou suspendre le programme à tout moment.',
  },
  stampCodes: {
    list: {
      quotaReached: 'Vous avez utilisé vos %{limit} QR codes de ce mois.',
    },
  },
  stores: {
    unlockMoreStores: 'Boutique supplémentaire : forfait Pro',
  },
};

const en = {
  home: {
    proTeaserTitle: 'Pro plan',
  },
  storesCrud: {
    limitMsg: 'You have reached the %{max}-store limit on the Pro plan.',
    storesLockedMsg: 'The free plan is limited to 1 store. The Pro plan lets you manage up to 10 stores.',
  },
  account: {
    viewPlans: 'My plan',
    dashboardLockedMsg: 'Detailed statistics and trends are included in the Pro plan.',
    logoProMsg: 'Logo customization is included in the Pro plan.',
  },
  settingsPage: {
    premiumLoyaltyDesc: 'Customizing the loyalty rules is part of the Pro plan.',
    premiumRewardDesc: 'The free plan is limited to 1 gift. The Pro plan lets you offer as many gifts as you want.',
    proUnlockCta: 'Included in the Pro plan',
  },
  team: {
    proRequiredMsg: 'Team management is included in the Pro plan.',
  },
  referral: {
    step3Desc: 'When they move to the Pro plan, you get 1 free Pro month.',
    termsNote: 'Referral program for registered businesses only. 1 free Pro month per referred business that moves to the Pro plan. Cannot be combined with other offers, has no cash value, for professional use only. JitPlus may change or suspend the program at any time.',
  },
  stampCodes: {
    list: {
      quotaReached: 'You used your %{limit} QR codes for this month.',
    },
  },
  stores: {
    unlockMoreStores: 'Additional store: Pro plan',
  },
};

const ar = {
  home: {
    proTeaserTitle: 'عرض Pro',
  },
  storesCrud: {
    limitMsg: 'وصلتي لحد %{max} حوانت فعرض Pro.',
    storesLockedMsg: 'العرض المجاني فيه غير حانوت واحد. عرض Pro كيخليك تسيّر حتى 10 حوانت.',
  },
  account: {
    viewPlans: 'العرض ديالي',
    dashboardLockedMsg: 'الإحصائيات المفصّلة داخلة فعرض Pro.',
    logoProMsg: 'تخصيص اللوغو داخل فعرض Pro.',
  },
  settingsPage: {
    premiumLoyaltyDesc: 'تخصيص قواعد الوفاء داخل فعرض Pro.',
    premiumRewardDesc: 'العرض المجاني فيه غير هدية وحدة. عرض Pro كيخليك تعطي شحال ما بغيتي من الهدايا.',
    proUnlockCta: 'داخل فعرض Pro',
  },
  team: {
    proRequiredMsg: 'تسيير الفريق داخل فعرض Pro.',
  },
  referral: {
    step3Desc: 'ملي كيدوز لعرض Pro، كتاخد شهر Pro مجاني.',
    termsNote: 'برنامج الإحالة غير للتجار المسجلين. شهر Pro مجاني على كل تاجر محال كيدوز لعرض Pro. ما كيتجمعش مع عروض أخرى، ما كيتبدلش بالفلوس، وغير للاستعمال المهني. JitPlus تقدر تبدّل ولا توقف البرنامج فأي وقت.',
  },
  stampCodes: {
    list: {
      quotaReached: 'ستعملتي %{limit} QR codes ديال هاد الشهر.',
    },
  },
  stores: {
    unlockMoreStores: 'حانوت زايد: عرض Pro',
  },
};

export const IOS_STORE_COPY = { fr, en, ar };
