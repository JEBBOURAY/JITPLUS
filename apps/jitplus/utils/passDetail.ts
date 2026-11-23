import { moneyFormatter } from '@jitplus/shared/src/currency';
import {
  describeCouponConditions, diffDaysYmd, rewardDisplay, toYmd,
  type CouponDto, type ScratchTranslate,
} from '@jitplus/shared/src/scratch';
import type { PassDetail } from '@/components/home/PassDetailSheet';
import type { LuckyWheelDraw } from '@/types';
import { formatDate } from '@/utils/date';

/** A pass expiring within this many days is flagged. */
const SOON_DAYS = 2;

function daysUntil(iso: string): number {
  return diffDaysYmd(toYmd(new Date()), toYmd(new Date(iso)));
}

/** One won prize or coupon of the home: its ticket and the sheet it opens, computed once. */
export interface PassView {
  id: string;
  kind: PassDetail['kind'];
  merchantName: string;
  logoUrl?: string | null;
  headline: string;
  tag: string;
  /** Short expiry line on the ticket. */
  status: string;
  /** Expires soon. */
  warning: boolean;
  a11yLabel: string;
  detail: PassDetail;
}

export function describePrize(draw: LuckyWheelDraw, t: ScratchTranslate, locale: string): PassView {
  const merchant = draw.ticket.campaign.merchant;
  const merchantName = merchant?.nom ?? draw.ticket.campaign.name;
  const headline = draw.prize?.label ?? t('luckyWheel.won');
  const tag = t('home.passPrizeTag');
  const soon = !!draw.claimBefore && daysUntil(draw.claimBefore) <= SOON_DAYS;
  return {
    id: draw.id,
    kind: 'prize',
    merchantName,
    logoUrl: merchant?.logoUrl,
    headline,
    tag,
    status: draw.claimBefore
      ? t('luckyWheel.claimBefore', { date: formatDate(draw.claimBefore, locale) })
      : t('luckyWheel.pending'),
    warning: soon,
    a11yLabel: `${tag}, ${draw.prize?.label ?? ''}, ${merchantName}`,
    detail: {
      kind: 'prize',
      tag,
      headline,
      detail: draw.prize?.description,
      merchantName,
      logoUrl: merchant?.logoUrl,
      intro: t('home.passPrizeIntro', { merchant: merchantName }),
      steps: [t('scratch.screen.stepVisit', { merchant: merchantName }), t('home.passPrizeStep')],
      conditions: [],
      expiry: draw.claimBefore
        ? t('luckyWheel.claimBeforeLong', { date: formatDate(draw.claimBefore, locale) })
        : t('home.passNoExpiry'),
      expirySoon: soon,
    },
  };
}

export function describeCoupon(coupon: CouponDto, t: ScratchTranslate, locale: string): PassView {
  const merchantName = coupon.merchant?.nom || t('common.shop');
  const money = moneyFormatter(coupon.merchant?.currency, locale);
  const reward = rewardDisplay({ type: coupon.type, value: coupon.value, label: coupon.label }, t, money);
  const fromCollection = coupon.source === 'COLLECTION';
  const kind = fromCollection ? 'collection' : 'coupon';
  const tag = t(fromCollection ? 'home.passCollectionTag' : 'home.passCouponTag');
  const days = daysUntil(coupon.expiresAt);
  // Without expiresAt the helper returns [rules…, validFrom?, singleUse]: the
  // expiry has its own row in the sheet and "single use" adds nothing here.
  const conditions = describeCouponConditions(
    { conditions: coupon.conditions, validFrom: coupon.validFrom },
    t,
    (iso) => formatDate(iso, locale),
    money,
  ).slice(0, -1);
  return {
    id: coupon.id,
    kind,
    merchantName,
    logoUrl: coupon.merchant?.logoUrl,
    headline: reward.headline,
    tag,
    status: days <= 0 ? t('scratch.coupons.expiresToday') : t('scratch.coupons.expiresIn', { count: days }),
    warning: days <= SOON_DAYS,
    a11yLabel: `${tag}, ${reward.headline}, ${merchantName}`,
    detail: {
      kind,
      tag,
      headline: reward.headline,
      detail: reward.detail,
      merchantName,
      logoUrl: coupon.merchant?.logoUrl,
      intro: t(fromCollection ? 'home.passCollectionIntro' : 'home.passCouponIntro', { merchant: merchantName }),
      steps: [t('scratch.screen.stepVisit', { merchant: merchantName }), t('home.passCouponStep')],
      conditions,
      expiry: t('scratch.conditions.expiresAt', { date: formatDate(coupon.expiresAt, locale) }),
      expirySoon: days <= SOON_DAYS,
    },
  };
}
