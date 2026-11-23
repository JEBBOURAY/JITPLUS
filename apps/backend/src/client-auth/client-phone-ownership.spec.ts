import { ConflictException } from '@nestjs/common';
import { hashOtp } from '../common/utils/otp.helper';
import { ClientOtpService } from './client-otp.service';
import { ClientService } from './client.service';

/**
 * Security review 2026-11-21 (uncommitted work, never shipped): typing another
 * client's number in the profile took it from them whenever it was unverified,
 * the normal state after an email or Google sign-up. Merchants find clients by
 * phone at the till, so the stamps then went to the attacker.
 * Rule: a number only leaves an account for someone who received its WhatsApp code.
 */

const PHONE = '+212600000002';
const validOtp = () => ({ id: 'otp', code: hashOtp('123456'), attempts: 0, expiresAt: new Date(Date.now() + 60_000) });

describe('updateProfile — typing a number proves nothing', () => {
  function setup(holder: unknown) {
    const tx = {
      client: {
        findFirst: jest.fn().mockResolvedValue(holder),
        findUnique: jest.fn().mockResolvedValue({ email: null, telephone: null }),
        update: jest.fn().mockResolvedValue({ id: 'attacker' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const txRunner = { run: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
    const none = {} as never;
    const service = new ClientService(
      none, none, none, none, none, none, none, txRunner as never, none, none, none, none, none, none, none, none,
    );
    return { service, tx };
  }

  it("refuses a number held by another account, even unverified, and leaves the holder's row alone", async () => {
    const { service, tx } = setup({ id: 'victim', isAnonymous: false });
    await expect(service.updateProfile('attacker', { telephone: PHONE })).rejects.toThrow('error.auth.phoneExists');
    expect(tx.client.updateMany).not.toHaveBeenCalled();
    expect(tx.client.update).not.toHaveBeenCalled();
  });
});

describe('change-contact OTP — the WhatsApp code is what moves a number', () => {
  function setup(opts: { me?: unknown; holder?: unknown; otp?: unknown; released?: number }) {
    const clientRepo = {
      findUnique: jest.fn(({ where }: { where: { id?: string; telephone?: string } }) =>
        Promise.resolve(where.telephone ? opts.holder ?? null : opts.me ?? { telephone: null })),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: opts.released ?? 1 }),
    };
    const otpRepo = {
      findUnique: jest.fn().mockResolvedValue(opts.otp ?? null),
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn().mockResolvedValue({}),
    };
    const sms = { sendWhatsAppOtp: jest.fn().mockResolvedValue(true) };
    const claims = { buildAnonymousPhoneConflictPayload: jest.fn().mockResolvedValue({ code: 'ANONYMOUS_PHONE' }) };
    const limiter = { consume: jest.fn().mockResolvedValue(undefined) };
    const service = new ClientOtpService(
      clientRepo as never, otpRepo as never, {} as never, sms as never, claims as never, limiter as never, {} as never,
    );
    return { service, clientRepo, otpRepo, sms };
  }

  it('sends the code for a number another account only typed', async () => {
    const { service, sms } = setup({ holder: { id: 'squatter', isAnonymous: false, telephoneVerified: false } });
    await service.sendChangeContactOtp('owner', 'telephone', PHONE);
    expect(sms.sendWhatsAppOtp).toHaveBeenCalledWith(PHONE, expect.any(String));
  });

  it('sends nothing for a number verified on another account', async () => {
    const { service, sms } = setup({ holder: { id: 'other', isAnonymous: false, telephoneVerified: true } });
    await expect(service.sendChangeContactOtp('me', 'telephone', PHONE)).rejects.toThrow('error.auth.phoneExists');
    expect(sms.sendWhatsAppOtp).not.toHaveBeenCalled();
  });

  it('gives the number to whoever proves it: released from the unverified holder, applied verified', async () => {
    const { service, clientRepo } = setup({
      otp: validOtp(),
      holder: { id: 'squatter', isAnonymous: false, telephoneVerified: false },
    });
    await service.verifyChangeContactOtp('owner', 'telephone', PHONE, '123456');
    expect(clientRepo.updateMany).toHaveBeenCalledWith({
      where: { id: 'squatter', telephone: PHONE, telephoneVerified: false, isAnonymous: false },
      data: { telephone: null },
    });
    expect(clientRepo.update).toHaveBeenCalledWith({
      where: { id: 'owner' },
      data: { telephone: PHONE, countryCode: expect.any(String), telephoneVerified: true },
    });
  });

  it('a wrong code moves nothing', async () => {
    const { service, clientRepo } = setup({
      otp: validOtp(),
      holder: { id: 'victim', isAnonymous: false, telephoneVerified: false },
    });
    await expect(service.verifyChangeContactOtp('attacker', 'telephone', PHONE, '000000')).rejects.toThrow();
    expect(clientRepo.updateMany).not.toHaveBeenCalled();
    expect(clientRepo.update).not.toHaveBeenCalled();
  });

  it('never takes a verified number, also when the holder verified it meanwhile', async () => {
    const verified = setup({ otp: validOtp(), holder: { id: 'other', isAnonymous: false, telephoneVerified: true } });
    await expect(verified.service.verifyChangeContactOtp('me', 'telephone', PHONE, '123456')).rejects.toThrow(ConflictException);
    expect(verified.clientRepo.updateMany).not.toHaveBeenCalled();
    expect(verified.clientRepo.update).not.toHaveBeenCalled();

    // Read as unverified, verified by its holder before the conditional release.
    const raced = setup({ otp: validOtp(), holder: { id: 'other', isAnonymous: false, telephoneVerified: false }, released: 0 });
    await expect(raced.service.verifyChangeContactOtp('me', 'telephone', PHONE, '123456')).rejects.toThrow('error.auth.phoneExists');
    expect(raced.clientRepo.update).not.toHaveBeenCalled();
  });

  it('keeps the till-created (anonymous) account on its own claim flow', async () => {
    const { service, clientRepo } = setup({ otp: validOtp(), holder: { id: 'anon', isAnonymous: true, telephoneVerified: false } });
    await expect(service.verifyChangeContactOtp('me', 'telephone', PHONE, '123456')).rejects.toThrow(ConflictException);
    expect(clientRepo.updateMany).not.toHaveBeenCalled();
    expect(clientRepo.update).not.toHaveBeenCalled();
  });

  it('still verifies the number already on the profile', async () => {
    const { service, clientRepo } = setup({
      otp: validOtp(),
      me: { telephone: PHONE },
      holder: { id: 'me', isAnonymous: false, telephoneVerified: false },
    });
    await service.verifyChangeContactOtp('me', 'telephone', PHONE, '123456');
    expect(clientRepo.updateMany).not.toHaveBeenCalled();
    expect(clientRepo.update.mock.calls[0][0].data).toMatchObject({ telephone: PHONE, telephoneVerified: true });
  });
});
