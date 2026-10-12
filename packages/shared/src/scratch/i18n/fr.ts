// Shared "scratch" namespace — merged into both apps' locale files.
export const scratchFr = {
  card: {
    title: 'Carte à gratter',
    scratchHere: 'Grattez ici',
    offeredBy: 'Offerte par %{merchant}',
    youWon: 'Vous avez gagné !',
    alwaysWin: '100 % gagnant',
    expiresOn: 'À gratter avant le %{date}',
  },
  rewardType: {
    PERCENT_DISCOUNT: 'Réduction en %',
    FIXED_DISCOUNT: 'Réduction en MAD',
    FREE_PRODUCT: 'Produit offert',
    BONUS_STAMPS: 'Tampons bonus',
  },
  rewardValue: {
    percent: '-%{value} %',
    fixed: '-%{value} MAD',
    bonusStamps: 'Tampons bonus : +%{value}',
  },
  conditions: {
    minPurchase: 'Dès %{amount} MAD d\'achat',
    weekdays: 'Valable le : %{days}',
    hours: 'De %{from} à %{to}',
    validFrom: 'Utilisable à partir du %{date}',
    expiresAt: 'Valable jusqu\'au %{date}',
    singleUse: 'Utilisable une seule fois',
  },
  weekdayShort: { 1: 'lun', 2: 'mar', 3: 'mer', 4: 'jeu', 5: 'ven', 6: 'sam', 7: 'dim' },
  couponStatus: {
    ACTIVE: 'Actif',
    REDEEMED: 'Utilisé',
    EXPIRED: 'Expiré',
    CANCELLED: 'Annulé par le commerçant',
  },
  cardStatus: {
    PENDING: 'À gratter',
    SCRATCHED: 'Grattée',
    EXPIRED: 'Expirée',
    CANCELLED: 'Annulée',
  },
  campaignStatus: {
    DRAFT: 'Brouillon',
    SCHEDULED: 'Programmée',
    SENDING: 'Envoi en cours',
    SENT: 'Envoyée',
    ENDED: 'Terminée',
    CANCELLED: 'Annulée',
  },
  design: {
    violet: 'Violet',
    gold: 'Or',
    emerald: 'Émeraude',
    ramadan: 'Ramadan',
    eid: 'Aïd',
    charcoal: 'Charbon',
  },
  coupon: {
    code: 'Code',
    showAtCheckout: 'Présentez ce QR code ou ce code en caisse',
  },
  rules: {
    title: 'Règlement',
    body: 'La carte à gratter est offerte gratuitement par le commerçant, sans obligation d\'achat. Chaque carte fait gagner un coupon, à utiliser une seule fois chez ce commerçant, selon les conditions indiquées. Le commerçant peut mettre fin à la campagne à tout moment : les cartes et les coupons non utilisés sont alors annulés. Apple Inc. et Google LLC ne sont ni organisateurs ni sponsors de cette promotion.',
  },
};
