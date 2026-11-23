import { SignupFunnelService, failedCodeStep, signupPlatform } from './signup-funnel.service';

describe('sign-up funnel', () => {
  it('reads the platform from the user agent of the apps', () => {
    expect(signupPlatform('okhttp/4.12.0')).toBe('android');
    expect(signupPlatform('JitPlus/69 CFNetwork/1568.200.51 Darwin/24.1.0')).toBe('ios');
    expect(signupPlatform('Mozilla/5.0 (Windows NT 10.0)')).toBe('other');
    expect(signupPlatform(undefined)).toBe('other');
  });

  it('maps a refused code to its step and ignores other errors', () => {
    expect(failedCodeStep('error.auth.otpInvalid')).toBe('code_wrong');
    expect(failedCodeStep('error.auth.otpTooManyAttempts')).toBe('code_wrong');
    expect(failedCodeStep('error.auth.otpExpired')).toBe('code_expired');
    expect(failedCodeStep('error.auth.emailExists')).toBeNull();
  });

  it('never throws when the counter cannot be written', async () => {
    const rawQuery = { executeRaw: jest.fn().mockRejectedValue(new Error('db down')), queryRaw: jest.fn() };
    const service = new SignupFunnelService(rawQuery as any);
    expect(() => service.record('completed', 'email', 'android')).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(rawQuery.executeRaw).toHaveBeenCalledTimes(1);
  });
});
