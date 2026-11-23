import { MerchantOtpService } from './merchant-otp.service';

/**
 * Security audit 2026-11-21: an email set on a merchant account without
 * verification (profile email change) must not let whoever linked Google/Apple
 * before keep a login once the real inbox owner recovers the account.
 */
describe('MerchantOtpService.resetPassword — inbox proof unbinds unproven identities', () => {
  function build(merchant: { id: string; emailVerified: boolean } | null) {
    const tx = {
      otp: { delete: jest.fn().mockResolvedValue(undefined) },
      merchant: { update: jest.fn().mockResolvedValue(undefined) },
      deviceSession: {
        findMany: jest.fn().mockResolvedValue([{ tokenId: 't1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const merchantRepo = { findUnique: jest.fn().mockResolvedValue(merchant) };
    const txRunner = { run: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
    const cache = { del: jest.fn().mockResolvedValue(undefined) };
    const service = new MerchantOtpService(
      merchantRepo as never, {} as never, txRunner as never, {} as never, {} as never, cache as never,
    );
    jest.spyOn(service as unknown as { validateAndConsumeOtp: () => Promise<string> }, 'validateAndConsumeOtp')
      .mockResolvedValue('otp-1');
    return { service, tx };
  }

  it('drops googleId/appleId and marks the email verified when the address was never verified', async () => {
    const { service, tx } = build({ id: 'm-1', emailVerified: false });

    await service.resetPassword('Victim@Example.test', '123456', 'NewPassw0rd!');

    const { where, data } = tx.merchant.update.mock.calls[0][0];
    expect(where).toEqual({ email: 'victim@example.test' });
    expect(data).toEqual(expect.objectContaining({ googleId: null, appleId: null, emailVerified: true }));
    expect(tx.deviceSession.deleteMany).toHaveBeenCalledWith({ where: { merchantId: 'm-1' } });
  });

  it('keeps the Google/Apple links when the email was already verified', async () => {
    const { service, tx } = build({ id: 'm-1', emailVerified: true });

    await service.resetPassword('owner@example.test', '123456', 'NewPassw0rd!');

    const { data } = tx.merchant.update.mock.calls[0][0];
    expect(data).not.toHaveProperty('googleId');
    expect(data).not.toHaveProperty('appleId');
    expect(data.emailVerified).toBe(true);
  });
});
