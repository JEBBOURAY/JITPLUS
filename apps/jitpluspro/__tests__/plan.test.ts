import { getPlanStatus } from '@/utils/plan';

const now = Date.parse('2026-10-22T12:00:00Z');
const plan = {
  plan: 'PREMIUM' as const,
  planExpiresAt: '2026-10-29T12:00:00Z',
  trialStartedAt: '2026-10-15T12:00:00Z',
};

describe('plan status', () => {
  it('uses the actual trial duration and elapsed progress', () => {
    expect(getPlanStatus(plan, now)).toMatchObject({
      isPremium: true, isTrial: true, daysRemaining: 7,
      trialTotalDays: 14, trialProgress: 0.5,
    });
  });

  it('does not grant Pro after expiry, even with a cached profile', () => {
    expect(getPlanStatus(plan, Date.parse(plan.planExpiresAt))).toMatchObject({
      isPremium: false, isFreePlan: true, isTrial: false, daysRemaining: 0,
    });
  });

  it('does not treat an admin activation as a trial', () => {
    expect(getPlanStatus({ ...plan, planActivatedByAdmin: true }, now)).toMatchObject({
      isPremium: true, isAdminPremium: true, isTrial: false, trialProgress: null,
    });
  });

  it('allows a permanent Pro plan without an expiry', () => {
    expect(getPlanStatus({ plan: 'PREMIUM' }, now).isPremium).toBe(true);
  });

  it('rejects an invalid expiry without crashing', () => {
    expect(getPlanStatus({ ...plan, planExpiresAt: 'invalid' }, now).isPremium).toBe(false);
    expect(getPlanStatus(undefined, now).isPremium).toBe(false);
  });
});
