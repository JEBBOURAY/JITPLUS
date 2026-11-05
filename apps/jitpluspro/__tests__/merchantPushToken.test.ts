import { sendMerchantPushToken, resetMerchantPushTokenCache } from '@/services/merchantPushToken';

function fakeApi() {
  return { patch: jest.fn().mockResolvedValue({}) } as unknown as Parameters<typeof sendMerchantPushToken>[0] & { patch: jest.Mock };
}

describe('sendMerchantPushToken', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetMerchantPushTokenCache();
  });
  afterEach(() => jest.useRealTimers());

  it('sends once per token and language', async () => {
    const api = fakeApi();
    await sendMerchantPushToken(api, 'ExponentPushToken[a]', 'fr');
    await sendMerchantPushToken(api, 'ExponentPushToken[a]', 'fr');
    expect(api.patch).toHaveBeenCalledTimes(1);
  });

  it('re-sends the same token when the language changes (after the burst cooldown)', async () => {
    const api = fakeApi();
    await sendMerchantPushToken(api, 'ExponentPushToken[a]', 'fr');
    await sendMerchantPushToken(api, 'ExponentPushToken[a]', 'ar');
    await jest.advanceTimersByTimeAsync(10_000);
    expect(api.patch).toHaveBeenCalledTimes(2);
    expect(api.patch).toHaveBeenLastCalledWith('/merchant/push-token', { pushToken: 'ExponentPushToken[a]', language: 'ar' });
  });
});
