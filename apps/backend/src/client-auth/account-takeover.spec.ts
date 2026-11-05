import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ClientOAuthService } from './client-oauth.service';
import { ClientOtpService } from './client-otp.service';
import { ClientAuthService } from './client-auth.service';
import { hashOtp } from '../common/utils/otp.helper';

/**
 * Security audit 2026-11-05 — account pre-hijack via an unverified email
 * claim, and password reset without OTP proof.
 */

const SQUATTER = { id: 'attacker', email: 'victim@x.com', emailVerified: false, googleId: null, appleId: null };
const OWNER = { id: 'owner', email: 'victim@x.com', emailVerified: true, googleId: null, appleId: null };

describe('ClientOAuthService.linkByEmail', () => {
  function setup(existing: unknown) {
    const clientRepo = {
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...(existing as object), ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const service = new ClientOAuthService(clientRepo as any, {} as any, {} as any, {} as any);
    const link = (verified: boolean, id = 'g-1') =>
      (service as any).linkByEmail('victim@x.com', verified, 'googleId', id, 'error.auth.googleEmailExists');
    return { clientRepo, link };
  }

  it('drops an unverified email claim instead of linking the provider to it', async () => {
    const { clientRepo, link } = setup(SQUATTER);

    await expect(link(true)).resolves.toBeNull();
    expect(clientRepo.update).not.toHaveBeenCalled();
    expect(clientRepo.updateMany).toHaveBeenCalledWith({
      where: { id: 'attacker', email: 'victim@x.com', emailVerified: false },
      data: { email: null },
    });
  });

  it('links when both the account and the provider verified the email', async () => {
    const { clientRepo, link } = setup(OWNER);

    await expect(link(true)).resolves.toMatchObject({ id: 'owner', googleId: 'g-1' });
    expect(clientRepo.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'owner' }, data: { googleId: 'g-1' } }));
  });

  it('refuses to link a provider identity whose email is not verified', async () => {
    const { clientRepo, link } = setup(OWNER);

    await expect(link(false)).rejects.toThrow(ConflictException);
    expect(clientRepo.update).not.toHaveBeenCalled();
  });

  it('never overwrites a different identity already bound to the account', async () => {
    const { clientRepo, link } = setup({ ...OWNER, googleId: 'g-other' });

    await expect(link(true, 'g-1')).rejects.toThrow(ConflictException);
    expect(clientRepo.update).not.toHaveBeenCalled();
  });
});

describe('ClientOtpService.verifyOtpEmail — unverified email claims', () => {
  function setup(existing: unknown) {
    const clientRepo = {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue({ ...OWNER, id: 'new-owner', nom: null }),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const otpRecord = { id: 'otp-1', code: hashOtp('123456'), attempts: 0, expiresAt: new Date(Date.now() + 60_000) };
    const otpRepo = {
      findUnique: jest.fn().mockResolvedValue(otpRecord),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn().mockResolvedValue({}),
    };
    const sessions = { buildAuthResponse: jest.fn().mockResolvedValue({ access_token: 't' }) };
    const service = new ClientOtpService(
      clientRepo as any, otpRepo as any, {} as any, {} as any, {} as any, {} as any, sessions as any,
    );
    return { service, clientRepo, sessions };
  }

  it('login: does not log into an account that only claims the email', async () => {
    const { service, sessions, clientRepo } = setup(SQUATTER);

    await expect(service.verifyOtpEmail('victim@x.com', '123456', false)).rejects.toThrow(BadRequestException);
    expect(sessions.buildAuthResponse).not.toHaveBeenCalled();
    expect(clientRepo.update).not.toHaveBeenCalled(); // claim is NOT verified on the squatter
  });

  it('register: drops the claim and creates the inbox owner account', async () => {
    const { service, sessions, clientRepo } = setup(SQUATTER);

    await service.verifyOtpEmail('victim@x.com', '123456', true);

    expect(clientRepo.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { email: null } }));
    expect(clientRepo.create).toHaveBeenCalled();
    expect(sessions.buildAuthResponse).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-owner' }), true, { otpVerified: true },
    );
  });

  it('login on a verified account opens an OTP-proven session', async () => {
    const { service, sessions } = setup({ ...OWNER, nom: 'V' });

    await service.verifyOtpEmail('victim@x.com', '123456', false);

    expect(sessions.buildAuthResponse).toHaveBeenCalledWith(expect.objectContaining({ id: 'owner' }), false, { otpVerified: true });
  });
});

describe('ClientAuthService.resetPasswordOtp', () => {
  function setup(proof: boolean) {
    const clientRepo = {
      findUnique: jest.fn().mockResolvedValue({ id: 'c1', password: null }),
      update: jest.fn().mockResolvedValue({ id: 'c1', createdAt: new Date() }),
    };
    const sessions = {
      consumeOtpProof: jest.fn().mockResolvedValue(proof),
      revokeOtherSessions: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ClientAuthService(clientRepo as any, {} as any, {} as any, {} as any, {} as any, sessions as any);
    return { service, clientRepo, sessions };
  }

  it('refuses a bare access token (no fresh OTP proof on the session)', async () => {
    const { service, clientRepo, sessions } = setup(false);

    await expect(service.resetPasswordOtp('c1', 'NewPass1!', 'sid-1')).rejects.toThrow(
      new ForbiddenException('error.auth.otpReverifyRequired'),
    );
    expect(clientRepo.update).not.toHaveBeenCalled();
    expect(sessions.revokeOtherSessions).not.toHaveBeenCalled();
  });

  it('resets once the OTP proof of the session is consumed', async () => {
    const { service, clientRepo, sessions } = setup(true);

    await service.resetPasswordOtp('c1', 'NewPass1!', 'sid-1');

    expect(sessions.consumeOtpProof).toHaveBeenCalledWith('c1', 'sid-1');
    expect(clientRepo.update).toHaveBeenCalled();
    expect(sessions.revokeOtherSessions).toHaveBeenCalledWith('c1', 'sid-1');
  });

  it('completeProfile never overwrites an existing password', async () => {
    const { service, clientRepo } = setup(true);
    clientRepo.findUnique.mockResolvedValue({ password: 'existing-hash' });

    await expect(service.completeProfile('c1', 'A', 'B', true, undefined, undefined, 'NewPass1!')).rejects.toThrow(BadRequestException);
    expect(clientRepo.update).not.toHaveBeenCalled();
  });
});
