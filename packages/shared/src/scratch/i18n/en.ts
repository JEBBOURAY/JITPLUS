// Shared "scratch" namespace — merged into both apps' locale files.
export const scratchEn = {
  card: {
    title: 'Scratch card',
    scratchHere: 'Scratch here',
    offeredBy: 'Offered by %{merchant}',
    youWon: 'You won!',
    alwaysWin: '100% winning',
    expiresOn: 'Scratch before %{date}',
  },
  rewardType: {
    PERCENT_DISCOUNT: 'Percentage discount',
    FIXED_DISCOUNT: 'Discount in MAD',
    FREE_PRODUCT: 'Free product',
    BONUS_STAMPS: 'Bonus stamps',
  },
  rewardValue: {
    percent: '-%{value}%',
    fixed: '-%{value} MAD',
    bonusStamps: 'Bonus stamps: +%{value}',
  },
  conditions: {
    minPurchase: 'From a %{amount} MAD purchase',
    weekdays: 'Valid on: %{days}',
    hours: 'From %{from} to %{to}',
    validFrom: 'Usable from %{date}',
    expiresAt: 'Valid until %{date}',
    singleUse: 'Single use',
  },
  weekdayShort: { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' },
  couponStatus: {
    ACTIVE: 'Active',
    REDEEMED: 'Used',
    EXPIRED: 'Expired',
    CANCELLED: 'Cancelled by the shop',
  },
  cardStatus: {
    PENDING: 'To scratch',
    SCRATCHED: 'Scratched',
    EXPIRED: 'Expired',
    CANCELLED: 'Cancelled',
  },
  campaignStatus: {
    DRAFT: 'Draft',
    SCHEDULED: 'Scheduled',
    SENDING: 'Sending',
    SENT: 'Sent',
    ENDED: 'Ended',
    CANCELLED: 'Cancelled',
  },
  design: {
    violet: 'Violet',
    gold: 'Gold',
    emerald: 'Emerald',
    ramadan: 'Ramadan',
    eid: 'Eid',
    charcoal: 'Charcoal',
  },
  coupon: {
    code: 'Code',
    showAtCheckout: 'Show this QR code or this code at the till',
  },
  rules: {
    title: 'Rules',
    body: 'The scratch card is offered free of charge by the shop, with no purchase required. Every card wins a coupon, usable once at this shop under the stated conditions. The shop can end the campaign at any time: unused cards and coupons are then cancelled. Apple Inc. and Google LLC are neither organisers nor sponsors of this promotion.',
  },
};
