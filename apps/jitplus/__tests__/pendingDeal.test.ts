import {
  PENDING_DEAL_TTL_MS, clearPendingDeal, goHomeAfterLogin, savePendingDeal, savePendingMerchant,
  takePendingAutoJoin, takePendingDeal,
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

  it('keeps only the latest of a deal and a merchant page', () => {
    const router = { replace: jest.fn(), push: jest.fn() };
    savePendingDeal(ID);
    savePendingMerchant(ID, false);
    goHomeAfterLogin(router);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/merchant/[id]', params: { id: ID } });

    savePendingMerchant(ID, false);
    savePendingDeal(ID);
    expect(takePendingDeal()).toBe(ID);
  });

  it('forgets a pending merchant page on logout', () => {
    const router = { replace: jest.fn(), push: jest.fn() };
    savePendingMerchant(ID, true);
    clearPendingDeal();
    goHomeAfterLogin(router);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('reopens the merchant page with the join the visitor asked for', () => {
    savePendingMerchant('11111111-1111-4111-8111-111111111111', true);
    const router = { replace: jest.fn(), push: jest.fn() };
    goHomeAfterLogin(router);
    // The join intent stays in memory: no route param an external link could forge.
    expect(router.push).toHaveBeenCalledWith({ pathname: '/merchant/[id]', params: { id: '11111111-1111-4111-8111-111111111111' } });
    expect(takePendingAutoJoin('22222222-2222-4222-8222-222222222222')).toBe(false);
    expect(takePendingAutoJoin('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(takePendingAutoJoin('11111111-1111-4111-8111-111111111111')).toBe(false);
    goHomeAfterLogin(router);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('reopens the merchant page without auto-join when the visitor did not tap Join', () => {
    savePendingMerchant('11111111-1111-4111-8111-111111111111', false);
    goHomeAfterLogin({ replace: jest.fn(), push: jest.fn() });
    expect(takePendingAutoJoin('11111111-1111-4111-8111-111111111111')).toBe(false);
  });
});
