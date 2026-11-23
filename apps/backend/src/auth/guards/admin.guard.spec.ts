import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminAuthService } from '../../admin/admin.service';

/**
 * Security audit 2026-11-21: admin logout used to live only in a per-instance
 * in-memory cache, so a logged-out token kept working on other Cloud Run
 * instances and after a restart. The cutoff is now stored on the Admin row.
 */
describe('AdminGuard — database-backed logout', () => {
  const ctx = (user: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

  function guardWith(admin: Record<string, unknown> | null) {
    const adminRepo = { findUnique: jest.fn().mockResolvedValue(admin) };
    return new AdminGuard(adminRepo as never);
  }

  it('accepts an active admin that never logged out', async () => {
    const guard = guardWith({ id: 'a1', isActive: true, tokensValidAfter: null });
    await expect(guard.canActivate(ctx({ sub: 'a1', type: 'admin', issuedAt: 1_700_000_000 }))).resolves.toBe(true);
  });

  it('rejects a token issued before the logout cutoff, whatever instance serves it', async () => {
    const cutoff = new Date(1_700_000_100_500);
    const guard = guardWith({ id: 'a1', isActive: true, tokensValidAfter: cutoff });
    await expect(
      guard.canActivate(ctx({ sub: 'a1', type: 'admin', issuedAt: 1_700_000_000 })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a token issued after the logout cutoff (new login)', async () => {
    const guard = guardWith({ id: 'a1', isActive: true, tokensValidAfter: new Date(1_700_000_100_500) });
    await expect(guard.canActivate(ctx({ sub: 'a1', type: 'admin', issuedAt: 1_700_000_200 }))).resolves.toBe(true);
  });

  it('accepts a new login in the same second as the logout (ms issue time)', async () => {
    // Logout at …100.500 s, login at …100.900 s: iat = …100, iatMs orders them.
    const guard = guardWith({ id: 'a1', isActive: true, tokensValidAfter: new Date(1_700_000_100_500) });
    await expect(
      guard.canActivate(ctx({ sub: 'a1', type: 'admin', issuedAt: 1_700_000_100, issuedAtMs: 1_700_000_100_900 })),
    ).resolves.toBe(true);
  });

  it('rejects a token issued earlier in the same second as the logout', async () => {
    const guard = guardWith({ id: 'a1', isActive: true, tokensValidAfter: new Date(1_700_000_100_500) });
    await expect(
      guard.canActivate(ctx({ sub: 'a1', type: 'admin', issuedAt: 1_700_000_100, issuedAtMs: 1_700_000_100_200 })),
    ).rejects.toThrow(UnauthorizedException);
    // A token from before iatMs existed: its second is ambiguous, so refused.
    await expect(guard.canActivate(ctx({ sub: 'a1', type: 'admin', issuedAt: 1_700_000_100 }))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token without iat once a cutoff exists', async () => {
    const guard = guardWith({ id: 'a1', isActive: true, tokensValidAfter: new Date(1_700_000_100_500) });
    await expect(guard.canActivate(ctx({ sub: 'a1', type: 'admin' }))).rejects.toThrow(UnauthorizedException);
  });

  it('still refuses a deactivated admin', async () => {
    const guard = guardWith({ id: 'a1', isActive: false, tokensValidAfter: null });
    await expect(guard.canActivate(ctx({ sub: 'a1', type: 'admin', issuedAt: 1 }))).rejects.toThrow(ForbiddenException);
  });
});

describe('AdminAuthService.logout — writes the cutoff to the database', () => {
  it('stores tokensValidAfter on the admin row and keeps the local cache marker', async () => {
    const adminRepo = { update: jest.fn().mockResolvedValue({}) };
    const cache = { set: jest.fn().mockResolvedValue(undefined), del: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminAuthService(adminRepo as never, cache as never, {} as never);

    await service.logout('jti-1', 'a1');

    expect(adminRepo.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { tokensValidAfter: expect.any(Date) },
    });
    expect(cache.set).toHaveBeenCalledWith('admin-revoked:jti-1', true, expect.any(Number));
  });
});
