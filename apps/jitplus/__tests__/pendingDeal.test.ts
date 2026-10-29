import {
  PENDING_DEAL_TTL_MS, clearPendingDeal, goHomeAfterLogin, savePendingDeal, takePendingDeal,
} from '@/services/pendingDeal';

const ID = '3f2b8c1e-9a4d-4e2b-8f1a-0c5d6e7f8a9b';

describe('pending deal', () => {
  beforeEach(() => clearPendingDeal());

  it('returns a fresh deal once', () => {
    savePendingDeal(ID, 1000);
    expect(takePendingDeal(2000)).toBe(ID);
    expect(takePendingDeal(2000)).toBeNull();
  });

  it('forgets expired, future-dated and invalid entries', () => {
    savePendingDeal(ID, 1000);
    expect(takePendingDeal(1000 + PENDING_DEAL_TTL_MS + 1)).toBeNull();
    savePendingDeal(ID, 5000);
    expect(takePendingDeal(1000)).toBeNull();
    savePendingDeal('../profile', 1000);
    expect(takePendingDeal(1000)).toBeNull();
  });

  it('opens the deal on top of the QR tab after login', () => {
    const router = { replace: jest.fn(), push: jest.fn() };
    savePendingDeal(ID);
    goHomeAfterLogin(router);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/qr');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/deal/[id]', params: { id: ID } });

    goHomeAfterLogin(router);
    expect(router.replace).toHaveBeenCalledTimes(2);
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});
