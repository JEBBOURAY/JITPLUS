import { shouldPersistQuery } from '@/utils/queryPersister';
import { pickCachedProfile } from '@/services/api/storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));

const ok = (queryKey: unknown[]) => ({ queryKey, state: { status: 'success' } });

describe('shouldPersistQuery', () => {
  it('persists regular browsing data', () => {
    expect(shouldPersistQuery(ok(['stamps']))).toBe(true);
    expect(shouldPersistQuery(ok(['merchant', 'm1']))).toBe(true);
  });

  it('never persists coupon tokens, payouts or referral stats', () => {
    expect(shouldPersistQuery(ok(['scratch', 'coupons']))).toBe(false);
    expect(shouldPersistQuery(ok(['payoutHistory']))).toBe(false);
    expect(shouldPersistQuery(ok(['referralStats']))).toBe(false);
    expect(shouldPersistQuery(ok(['profile']))).toBe(false);
  });

  it('skips failed and geo queries', () => {
    expect(shouldPersistQuery({ queryKey: ['stamps'], state: { status: 'error' } })).toBe(false);
    expect(shouldPersistQuery(ok(['merchants-nearby', 1, 2]))).toBe(false);
    expect(shouldPersistQuery(ok(['deals', 'feed', 'nearby', null, null, 33.5, -7.6]))).toBe(false);
    expect(shouldPersistQuery(ok(['deals', 'detail', 'd1']))).toBe(false);
  });
});

describe('pickCachedProfile', () => {
  it('drops contact details and birth date', () => {
    const cached = pickCachedProfile({
      id: 'c1', prenom: 'Sara', nom: 'B', termsAccepted: true,
      email: 'sara@example.com', telephone: '+212600000000', dateNaissance: '1990-01-01', pushToken: 'tok',
    });
    expect(cached).toEqual({ id: 'c1', prenom: 'Sara', nom: 'B', termsAccepted: true });
  });

  it('returns null for a missing profile', () => {
    expect(pickCachedProfile(null)).toBeNull();
  });
});
