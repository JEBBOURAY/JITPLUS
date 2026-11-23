import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ClientOtpService } from './client-otp.service';
import { ClientAuthService } from './client-auth.service';
import { ClientSessionService, REFRESH_REUSE_GRACE_MS } from './client-session.service';
import { hashOtp } from '../common/utils/otp.helper';
import { CLIENT_OTP_EXPIRY_MS, CLIENT_TERMS_VERSION } from '../common/constants';

/** Sign-up audit 2026-11-18: paths that left a new client stuck. */

const EMAIL = 'new@x.com';

function otpSetup(existing: unknown, otp: unknown = null) {
  const clientRepo = {
    findUnique: jest.fn().mockResolvedValue(existing),
    create: jest.fn().mockResolvedValue({ id: 'created', email: EMAIL, nom: null }),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const otpRepo = {
    findUnique: jest.fn().mockResolvedValue(otp),
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    delete: jest.fn().mockResolvedValue({}),
  };
  const mail = {
    sendOtpEmail: jest.fn().mockResolvedValue(undefined),
    sendAccountExistsClient: jest.fn().mockResolvedValue(undefined),
  };
  const limiter = { consume: jest.fn().mockResolvedValue(undefined) };
  const sessions = { buildAuthResponse: jest.fn().mockResolvedValue({ access_token: 't' }) };
  const service = new ClientOtpService(
    clientRepo as any, otpRepo as any, mail as any, {} as any, {} as any, limiter as any, sessions as any,
  );
  return { service, clientRepo, otpRepo, mail, limiter, sessions };
}

const validOtp = () => ({ id: 'otp', code: hashOtp('123456'), attempts: 0, expiresAt: new Date(Date.now() + 60_000) });

describe('sendOtpEmail on sign-up', () => {
  it('tells a complete, verified account by email, without any code', async () => {
    const { service, mail, otpRepo } = otpSetup({ id: 'c', nom: 'N', prenom: 'P', emailVerified: true, language: 'en' });
    await expect(service.sendOtpEmail(EMAIL, true)).resolves.toMatchObject({ success: true });
    expect(mail.sendOtpEmail).not.toHaveBeenCalled();
    expect(mail.sendAccountExistsClient).toHaveBeenCalledWith(EMAIL, 'en');
    expect(otpRepo.upsert).toHaveBeenCalled(); // same cooldown as a new address
  });

  it('applies the cooldown to an unknown address on forgot password, and sends nothing', async () => {
    const first = otpSetup(null);
    await expect(first.service.sendOtpEmail(EMAIL, false)).resolves.toMatchObject({ success: true });
    expect(first.mail.sendOtpEmail).not.toHaveBeenCalled();
    expect(first.otpRepo.upsert).toHaveBeenCalled();

    const second = otpSetup(null, justSentOtp());
    await expect(second.service.sendOtpEmail(EMAIL, false)).rejects.toThrow(HttpException);
  });

  it('sends the code when another account only claims the email', async () => {
    const { service, mail } = otpSetup({ id: 'squatter', nom: 'N', prenom: 'P', emailVerified: false });
    await service.sendOtpEmail(EMAIL, true);
    expect(mail.sendOtpEmail).toHaveBeenCalledTimes(1);
  });

  it('writes to a new client in the language of the app', async () => {
    const { service, mail } = otpSetup(null);
    await service.sendOtpEmail(EMAIL, true, 'ar');
    expect(mail.sendOtpEmail).toHaveBeenCalledWith(EMAIL, expect.any(String), 'client', 'ar', 'register');
  });

  it('names the sign-up in the email, and stays generic for login and reset', async () => {
    const { service, mail } = otpSetup({ id: 'c1', nom: 'N', prenom: 'P', emailVerified: true, language: 'fr' });
    await service.sendOtpEmail(EMAIL, false);
    expect(mail.sendOtpEmail).toHaveBeenCalledWith(EMAIL, expect.any(String), 'client', 'fr', 'verification');
  });

  it('does not use up the daily quota during the cooldown', async () => {
    const { service, limiter } = otpSetup(null, justSentOtp());
    await expect(service.sendOtpEmail(EMAIL, true)).rejects.toThrow(HttpException);
    expect(limiter.consume).not.toHaveBeenCalled();
  });

  it('frees the cooldown when the email could not be sent', async () => {
    const { service, mail, otpRepo } = otpSetup(null);
    mail.sendOtpEmail.mockRejectedValue(new Error('smtp down'));
    await expect(service.sendOtpEmail(EMAIL, true)).rejects.toThrow(HttpException);
    expect(otpRepo.deleteMany).toHaveBeenCalledWith({ where: { email: EMAIL } });
  });
});

function justSentOtp() {
  return { ...validOtp(), expiresAt: new Date(Date.now() + CLIENT_OTP_EXPIRY_MS - 1_000), createdAt: new Date(Date.now() - 1_000) };
}

describe('verifyOtpEmail on sign-up', () => {
  it('resumes a sign-up abandoned before the profile step', async () => {
    const ghost = { id: 'ghost', email: EMAIL, emailVerified: true, nom: null, prenom: null };
    const { service, sessions, clientRepo } = otpSetup(ghost, validOtp());
    await service.verifyOtpEmail(EMAIL, '123456', true);
    expect(clientRepo.create).not.toHaveBeenCalled();
    expect(sessions.buildAuthResponse).toHaveBeenCalledWith(ghost, true, { otpVerified: true });
  });

  it('still refuses a complete account', async () => {
    const owner = { id: 'c', email: EMAIL, emailVerified: true, nom: 'N', prenom: 'P' };
    const { service, sessions } = otpSetup(owner, validOtp());
    await expect(service.verifyOtpEmail(EMAIL, '123456', true)).rejects.toThrow(ConflictException);
    expect(sessions.buildAuthResponse).not.toHaveBeenCalled();
  });

  it('answers a wrong code with a 400, so the app does not replay it', async () => {
    const { service } = otpSetup(null, validOtp());
    await expect(service.verifyOtpEmail(EMAIL, '000000', true)).rejects.toThrow(BadRequestException);
  });
});

describe('verifyChangeContactOtp', () => {
  it('applies a new email only once its code is verified', async () => {
    const { service, clientRepo } = otpSetup(null, validOtp());
    clientRepo.findUnique.mockResolvedValueOnce({ email: 'old@x.com' }).mockResolvedValueOnce(null);
    await service.verifyChangeContactOtp('c1', 'email', EMAIL, '123456');
    expect(clientRepo.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { email: EMAIL, emailVerified: true } });
  });

  it('refuses an address verified by another account', async () => {
    const { service, clientRepo } = otpSetup(null, validOtp());
    clientRepo.findUnique.mockResolvedValueOnce({ email: 'old@x.com' }).mockResolvedValueOnce({ id: 'other', emailVerified: true });
    await expect(service.verifyChangeContactOtp('c1', 'email', EMAIL, '123456')).rejects.toThrow(ConflictException);
    expect(clientRepo.update).not.toHaveBeenCalled();
  });
});

describe('refresh token replay', () => {
  function sessionSetup(rotatedAt: Date) {
    const row = {
      id: 's1', expiresAt: new Date(Date.now() + 60_000), refreshTokenHash: 'current', rotatedAt,
      client: { id: 'c1', email: EMAIL, telephone: null, nom: 'N', deletedAt: null, createdAt: new Date() },
    };
    const repo = {
      findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const service = new ClientSessionService({} as any, repo as any, { sign: () => 'jwt' } as any);
    return { service, repo };
  }

  it('accepts the previous token right after a rotation, without extending the delay', async () => {
    const { service, repo } = sessionSetup(new Date());
    await expect(service.refreshAccessToken('previous')).resolves.toMatchObject({ access_token: 'jwt' });
    const { where, data } = repo.updateMany.mock.calls[0][0];
    expect(where.refreshTokenHash).toBe('current');
    expect(data.rotatedAt).toBeUndefined();
    // The token the first rotation handed out stays usable: the app may keep either answer.
    expect(data.previousRefreshTokenHash).toBe('current');
  });

  it('refuses it once the delay is over', async () => {
    const { service, repo } = sessionSetup(new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1));
    await expect(service.refreshAccessToken('previous')).rejects.toThrow('error.auth.refreshInvalid');
    // Reuse of a rotated token = two holders: the whole session is revoked.
    expect(repo.deleteMany).toHaveBeenCalledWith({ where: { id: 's1' } });
    expect(repo.updateMany).not.toHaveBeenCalled();
  });
});

describe('ClientAuthService', () => {
  function authSetup(row: Record<string, unknown>) {
    const clientRepo = {
      findUnique: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({ id: 'c1', email: EMAIL, prenom: 'P', nom: 'N', createdAt: new Date() }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const mail = { sendWelcomeClient: jest.fn().mockResolvedValue(undefined) };
    const service = new ClientAuthService(clientRepo as any, {} as any, mail as any, {} as any, {} as any, {} as any);
    return { service, clientRepo, mail };
  }

  it('accepts the retry of a profile completion whose response was lost', async () => {
    const hash = await bcrypt.hash('NewPass1!', 4);
    const { service, clientRepo, mail } = authSetup({ password: hash, termsAccepted: true });

    await expect(service.completeProfile('c1', 'P', 'N', true, undefined, undefined, 'NewPass1!'))
      .resolves.toMatchObject({ success: true });
    expect(clientRepo.update.mock.calls[0][0].data.password).toBeUndefined();
    expect(mail.sendWelcomeClient).not.toHaveBeenCalled();
  });

  it('welcomes a client on the first completion', async () => {
    const { service, mail } = authSetup({ password: null, termsAccepted: false, language: 'en' });
    await service.completeProfile('c1', 'P', 'N', true);
    expect(mail.sendWelcomeClient).toHaveBeenCalledWith(EMAIL, 'P', 'en');
  });

  it('records when the terms were accepted and their version, once', async () => {
    const first = authSetup({ password: null, termsAccepted: false });
    await first.service.completeProfile('c1', 'P', 'N', true);
    expect(first.clientRepo.update.mock.calls[0][0].data).toMatchObject({
      termsAccepted: true, termsAcceptedAt: expect.any(Date), termsVersion: CLIENT_TERMS_VERSION,
    });

    const retry = authSetup({ password: null, termsAccepted: true });
    await retry.service.completeProfile('c1', 'P', 'N', true);
    expect(retry.clientRepo.update.mock.calls[0][0].data.termsAcceptedAt).toBeUndefined();
  });

  it('leaves the info-sharing choice alone (DB default on, the client changes it in settings)', async () => {
    const { service, clientRepo } = authSetup({ password: null, termsAccepted: false });
    await service.completeProfile('c1', 'P', 'N', true);
    expect(clientRepo.update.mock.calls[0][0].data).not.toHaveProperty('shareInfoMerchants');
  });

  it('accepts a sign-up without a last name', async () => {
    const { service, clientRepo } = authSetup({ password: null, termsAccepted: false });
    await expect(service.completeProfile('c1', 'P', '  ', true)).resolves.toMatchObject({ success: true });
    expect(clientRepo.update.mock.calls[0][0].data).toMatchObject({ prenom: 'P', nom: null });
  });

  it('drops the phone verification when the number changes', async () => {
    const { service, clientRepo } = authSetup({ password: null, telephone: '+212600000001', termsAccepted: true });
    (clientRepo as any).findFirst = jest.fn().mockResolvedValue(null);
    await service.completeProfile('c1', 'P', 'N', true, '+212600000002');
    expect(clientRepo.update.mock.calls[0][0].data).toMatchObject({ telephone: '+212600000002', telephoneVerified: false });
  });

  // Security review 2026-11-21: typing a number proves nothing. It is only taken
  // from another account with the WhatsApp code (client-phone-ownership.spec).
  it('refuses a number held by another account, even unverified, without touching that account', async () => {
    const { service, clientRepo } = authSetup({ password: null, telephone: null, termsAccepted: true });
    (clientRepo as any).findFirst = jest.fn().mockResolvedValue({ id: 'victim', isAnonymous: false });
    await expect(service.completeProfile('c1', 'P', 'N', true, '+212600000002')).rejects.toThrow('error.auth.phoneExists');
    expect(clientRepo.updateMany).not.toHaveBeenCalled();
    expect(clientRepo.update).not.toHaveBeenCalled();
  });

  it('gives the same login error with or without an account', async () => {
    const known = authSetup({ id: 'c1', password: await bcrypt.hash('Right1!x', 4), failedLoginAttempts: 0, lockedUntil: null });
    const unknown = authSetup({});
    unknown.clientRepo.findUnique.mockResolvedValue(null);

    const message = (p: Promise<unknown>) => p.catch((e: BadRequestException) => `${e.getStatus()} ${e.message}`);
    const a = await message(known.service.loginWithEmailPassword(EMAIL, 'Wrong1!x'));
    const b = await message(unknown.service.loginWithEmailPassword(EMAIL, 'Wrong1!x'));

    expect(a).toBe('400 error.auth.invalidCredentials');
    expect(b).toBe(a);
    expect(known.clientRepo.update).toHaveBeenCalled(); // the failed attempt still counts
  });

  it('answers the same on a locked account, even with the right password', async () => {
    const { service, clientRepo } = authSetup({
      id: 'c1', password: await bcrypt.hash('Right1!x', 4), failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 60_000),
    });
    await expect(service.loginWithEmailPassword(EMAIL, 'Right1!x')).rejects.toThrow('error.auth.invalidCredentials');
    expect(clientRepo.update).not.toHaveBeenCalled();
  });
});

describe('completeProfile input checks', () => {
  const service = () => new ClientAuthService({ findUnique: jest.fn(), update: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any, {} as any);

  it('refuses blank names', async () => {
    await expect(service().completeProfile('c1', '  ', 'N', true)).rejects.toThrow('error.auth.firstNameRequired');
  });

  it('refuses a birth date in the future', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await expect(service().completeProfile('c1', 'P', 'N', true, undefined, future)).rejects.toThrow('error.auth.birthDateInvalid');
  });
});
