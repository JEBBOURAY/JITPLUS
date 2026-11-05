import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AdminAuthService } from './admin.service';
import { MAX_LOGIN_ATTEMPTS } from '../common/constants';

/**
 * Security audit 2026-11-05 — the admin lockout must not act as a password
 * oracle, and every failure returns the same message.
 */

const GENERIC = new UnauthorizedException('Email ou mot de passe incorrect');
const PASSWORD = 'Correct-Horse-9';
let HASH: string;

beforeAll(async () => {
  HASH = await bcrypt.hash(PASSWORD, 4);
});

function setup(admin: Record<string, unknown> | null) {
  const adminRepo = {
    findUnique: jest.fn().mockResolvedValue(admin),
    update: jest.fn().mockResolvedValue({}),
  };
  const cache = { set: jest.fn(), del: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('admin-token') };
  const service = new AdminAuthService(adminRepo as any, cache as any, jwtService as any);
  return { service, adminRepo, jwtService };
}

const baseAdmin = () => ({
  id: 'a1', email: 'admin@x.com', nom: 'Admin', role: 'ADMIN', password: HASH,
  isActive: true, failedLoginAttempts: 0, lockedUntil: null as Date | null,
});

describe('AdminAuthService.login', () => {
  it('logs in with the right password', async () => {
    const { service, jwtService } = setup(baseAdmin());

    await expect(service.login('admin@x.com', PASSWORD)).resolves.toMatchObject({ access_token: 'admin-token' });
    expect(jwtService.sign).toHaveBeenCalled();
  });

  it('returns the same generic error for unknown email, wrong password and inactive admin', async () => {
    await expect(setup(null).service.login('nobody@x.com', PASSWORD)).rejects.toThrow(GENERIC);
    await expect(setup(baseAdmin()).service.login('admin@x.com', 'wrong')).rejects.toThrow(GENERIC);
    await expect(setup({ ...baseAdmin(), isActive: false }).service.login('admin@x.com', PASSWORD)).rejects.toThrow(GENERIC);
  });

  it('while locked: the correct password gets the same error and no token (no oracle)', async () => {
    const locked = { ...baseAdmin(), failedLoginAttempts: MAX_LOGIN_ATTEMPTS, lockedUntil: new Date(Date.now() + 10 * 60_000) };
    const { service, jwtService } = setup(locked);

    await expect(service.login('admin@x.com', PASSWORD)).rejects.toThrow(GENERIC);
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('while locked: wrong passwords do not extend the lock', async () => {
    const locked = { ...baseAdmin(), failedLoginAttempts: MAX_LOGIN_ATTEMPTS, lockedUntil: new Date(Date.now() + 10 * 60_000) };
    const { service, adminRepo } = setup(locked);

    await expect(service.login('admin@x.com', 'wrong')).rejects.toThrow(GENERIC);
    expect(adminRepo.update).not.toHaveBeenCalled();
  });

  it('locks the account on the last allowed failure', async () => {
    const { service, adminRepo } = setup({ ...baseAdmin(), failedLoginAttempts: MAX_LOGIN_ATTEMPTS - 1 });

    await expect(service.login('admin@x.com', 'wrong')).rejects.toThrow(GENERIC);
    expect(adminRepo.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { failedLoginAttempts: MAX_LOGIN_ATTEMPTS, lockedUntil: expect.any(Date) },
    });
  });

  it('an expired lock no longer blocks the right password', async () => {
    const expired = { ...baseAdmin(), failedLoginAttempts: MAX_LOGIN_ATTEMPTS, lockedUntil: new Date(Date.now() - 1000) };
    const { service, jwtService } = setup(expired);

    await expect(service.login('admin@x.com', PASSWORD)).resolves.toMatchObject({ access_token: 'admin-token' });
    expect(jwtService.sign).toHaveBeenCalled();
  });
});
