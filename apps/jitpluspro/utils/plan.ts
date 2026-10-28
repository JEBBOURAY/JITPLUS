import type { Merchant } from '@/types';

type PlanSource = Pick<Merchant, 'plan' | 'planExpiresAt' | 'planActivatedByAdmin' | 'trialStartedAt'>;
const MS_PER_DAY = 86_400_000;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getPlanStatus(source: PlanSource | null | undefined, now = Date.now()) {
  const planExpiresAt = parseDate(source?.planExpiresAt);
  const trialStartedAt = parseDate(source?.trialStartedAt);
  const isPremium = source?.plan === 'PREMIUM'
    && (!source.planExpiresAt || (planExpiresAt !== null && planExpiresAt.getTime() > now));
  const isAdminPremium = isPremium && source?.planActivatedByAdmin === true;
  const isTrial = isPremium && !isAdminPremium && trialStartedAt !== null && planExpiresAt !== null;
  const daysRemaining = planExpiresAt
    ? Math.max(0, Math.ceil((planExpiresAt.getTime() - now) / MS_PER_DAY))
    : null;
  const duration = isTrial ? planExpiresAt.getTime() - trialStartedAt.getTime() : 0;

  return {
    isPremium,
    isFreePlan: source?.plan === 'FREE' || (source?.plan === 'PREMIUM' && !isPremium),
    isAdminPremium,
    isTrial,
    planExpiresAt,
    daysRemaining,
    trialTotalDays: isTrial ? Math.max(1, Math.round(duration / MS_PER_DAY)) : null,
    trialProgress: isTrial
      ? duration > 0 ? Math.min(1, Math.max(0, (now - trialStartedAt.getTime()) / duration)) : 1
      : null,
  };
}
