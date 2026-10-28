import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MerchantReferralService } from '../merchant/services/merchant-referral.service';
import { ClientReferralService } from '../client-auth/client-referral.service';

const SECRET = 'test-secret-test-secret-test-secret-123';

describe('AuthController.logout', () => {
  const authService = { logout: jest.fn().mockResolvedValue({ message: 'Déconnecté' }) };
  const jwtService = new JwtService({ secret: SECRET, signOptions: { issuer: 'jitplus-api', audience: 'jitplus-merchant' } });
  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(
      authService as unknown as AuthService,
      {} as MerchantReferralService,
      {} as ClientReferralService,
      jwtService,
    );
  });

  const sign = (payload: object, options: object = {}) =>
    jwtService.sign({ sub: 'merchant-1', type: 'merchant', ...payload }, options);

  it('revokes the session identified by the jti claim', async () => {
    const token = sign({ jti: 'session-123' });

    await controller.logout(`Bearer ${token}`);

    expect(authService.logout).toHaveBeenCalledWith('session-123');
  });

  it('still revokes the session when the access token has expired', async () => {
    const token = sign({ jti: 'session-expired', exp: Math.floor(Date.now() / 1000) - 60 });

    await controller.logout(`Bearer ${token}`);

    expect(authService.logout).toHaveBeenCalledWith('session-expired');
  });

  it('does not revoke anything for a token signed with another secret', async () => {
    const forged = new JwtService({ secret: 'another-secret-another-secret-12345' }).sign({ sub: 'x', jti: 'victim-session' });

    await controller.logout(`Bearer ${forged}`);

    expect(authService.logout).toHaveBeenCalledWith(undefined);
  });

  it('succeeds without a token', async () => {
    await controller.logout(undefined);
    await controller.logout('Basic abc');

    expect(authService.logout).toHaveBeenNthCalledWith(1, undefined);
    expect(authService.logout).toHaveBeenNthCalledWith(2, undefined);
  });

  it('propagates unexpected verification errors', async () => {
    const failing = { verify: jest.fn(() => { throw new Error('boom'); }) } as unknown as JwtService;
    controller = new AuthController(
      authService as unknown as AuthService,
      {} as MerchantReferralService,
      {} as ClientReferralService,
      failing,
    );

    await expect(controller.logout('Bearer abc.def.ghi')).rejects.toThrow('boom');
    expect(authService.logout).not.toHaveBeenCalled();
  });
});
