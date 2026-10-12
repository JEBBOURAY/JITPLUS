// Shared "scratch" namespace — merged into both apps' locale files (Darija).
export const scratchAr = {
  card: {
    title: 'بطاقة الحكّ',
    scratchHere: 'حكّ هنا',
    offeredBy: 'هدية من %{merchant}',
    youWon: 'ربحتي!',
    alwaysWin: 'رابحة 100%',
    expiresOn: 'حكّها قبل %{date}',
  },
  rewardType: {
    PERCENT_DISCOUNT: 'تخفيض بالنسبة %',
    FIXED_DISCOUNT: 'تخفيض بالدرهم',
    FREE_PRODUCT: 'منتوج فابور',
    BONUS_STAMPS: 'طوابع إضافية',
  },
  rewardValue: {
    percent: '-%{value}%',
    fixed: '-%{value} درهم',
    bonusStamps: 'طوابع إضافية: +%{value}',
  },
  conditions: {
    minPurchase: 'ابتداءً من شراء %{amount} درهم',
    weekdays: 'صالح نهار: %{days}',
    hours: 'من %{from} حتى %{to}',
    validFrom: 'تقدر تستعملو من %{date}',
    expiresAt: 'صالح حتى %{date}',
    singleUse: 'كيتستعمل مرة وحدة',
  },
  weekdayShort: { 1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت', 7: 'الأحد' },
  couponStatus: {
    ACTIVE: 'صالح',
    REDEEMED: 'مستعمل',
    EXPIRED: 'سالا',
    CANCELLED: 'ملغى من طرف المحل',
  },
  cardStatus: {
    PENDING: 'باقي ما تحكّات',
    SCRATCHED: 'محكوكة',
    EXPIRED: 'سالات',
    CANCELLED: 'ملغية',
  },
  campaignStatus: {
    DRAFT: 'مسودة',
    SCHEDULED: 'مبرمجة',
    SENDING: 'كتصيفط',
    SENT: 'تصيفطات',
    ENDED: 'سالات',
    CANCELLED: 'ملغية',
  },
  design: {
    violet: 'بنفسجي',
    gold: 'ذهبي',
    emerald: 'زمردي',
    ramadan: 'رمضان',
    eid: 'العيد',
    charcoal: 'فحمي',
  },
  coupon: {
    code: 'الكود',
    showAtCheckout: 'وري هاد QR ولا هاد الكود فالكاسة',
  },
  rules: {
    title: 'القانون',
    body: 'بطاقة الحكّ هدية فابور من المحل، بلا ما تشري والو. كل بطاقة كتربّح كوبون، كيتستعمل مرة وحدة عند هاد المحل حسب الشروط المكتوبة. المحل يقدر يوقف الحملة فأي وقت: البطاقات والكوبونات اللي ما تستعملوش كيتلغاو. Apple Inc. و Google LLC ماشي منظمين ولا راعيين لهاد العرض.',
  },
};
