import * as SecureStore from 'expo-secure-store';
import {
  PENDING_CLAIM_KEY,
  PENDING_CLAIM_TTL_MS,
  clearPendingClaim,
  savePendingClaim,
  takePendingClaim,
} from '@/services/pendingClaim';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((k: string) => Promise.resolve(mockStore.get(k) ?? null)),
  setItemAsync: jest.fn((k: string, v: string) => { mockStore.set(k, v); return Promise.resolve(); }),
  deleteItemAsync: jest.fn((k: string) => { mockStore.delete(k); return Promise.resolve(); }),
}));

const TOKEN = 'test-claim-token-placeholder';
const NOW = 1_700_000_000_000;

describe('pendingClaim', () => {
  beforeEach(() => { mockStore.clear(); jest.clearAllMocks(); });

  it('returns a fresh token once, then forgets it', async () => {
    await savePendingClaim(TOKEN, NOW);
    expect(await takePendingClaim(NOW + 60_000)).toBe(TOKEN);
    expect(mockStore.has(PENDING_CLAIM_KEY)).toBe(false);
    expect(await takePendingClaim(NOW + 60_000)).toBeNull();
  });

  it('drops expired tokens', async () => {
    await savePendingClaim(TOKEN, NOW);
    expect(await takePendingClaim(NOW + PENDING_CLAIM_TTL_MS + 1)).toBeNull();
    expect(mockStore.has(PENDING_CLAIM_KEY)).toBe(false);
  });

  it('drops tokens saved "in the future" (clock changes)', async () => {
    await savePendingClaim(TOKEN, NOW + 10_000);
    expect(await takePendingClaim(NOW)).toBeNull();
  });

  it('ignores the legacy bare-token format and malformed tokens', async () => {
    mockStore.set(PENDING_CLAIM_KEY, TOKEN);
    expect(await takePendingClaim(NOW)).toBeNull();
    expect(mockStore.has(PENDING_CLAIM_KEY)).toBe(false);

    mockStore.set(PENDING_CLAIM_KEY, JSON.stringify({ token: '../x', savedAt: NOW }));
    expect(await takePendingClaim(NOW)).toBeNull();
  });

  it('returns null when secure storage fails', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('locked'));
    expect(await takePendingClaim(NOW)).toBeNull();
  });

  it('clearPendingClaim removes the token', async () => {
    await savePendingClaim(TOKEN, NOW);
    await clearPendingClaim();
    expect(mockStore.has(PENDING_CLAIM_KEY)).toBe(false);
  });
});
