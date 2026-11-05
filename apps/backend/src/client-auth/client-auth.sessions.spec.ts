import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ClientSessionService, OTP_PASSWORD_RESET_WINDOW_MS } from './client-session.service';
import { MAX_SESSIONS_PER_CLIENT } from '../common/constants';

const CLIENT = {
  id: 'client-1',
  prenom: 'Ayoub',
  nom: 'J',
  email: 'a@b.c',
  emailVerified: true,
  telephone: null,
  telephoneVerified: false,
  password: 'hash',
  termsAccepted: true,
  shareInfoMerchants: true,
  notifPush: true,
  notifWhatsapp: false,
  dateNaissance: null,
  createdAt: new Date('2026-01-01'),
};

function setup() {
  const clientRepo = {
    update: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue({ deletedAt: null }),
  };
  const clientSessionRepo = {
    create: jest.fn().mockResolvedValue({ id: 'session-new' }),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    delete: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const jwtService = { sign: jest.fn().mockReturnValue('access-token') };
  const service = new ClientSessionService(
    clientRepo as any,
    clientSessionRepo as any,
    jwtService as any,
  );
  return { service, clientRepo, clientSessionRepo, jwtService };
}

describe('ClientSessionService — multi-device sessions', () => {
  it('opens a new session per login and binds the access token to it', async () => {
    const { service, clientSessionRepo, jwtService } = setup();

    const res = await (service as any).buildAuthResponse(CLIENT, false);

    expect(clientSessionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: CLIENT.id }) }),
    );
    expect(jwtService.sign).toHaveBeenCalledWith(expect.objectContaining({ sub: CLIENT.id, sid: 'session-new' }));
    expect(res.refresh_token).toEqual(expect.any(String));
    // Other devices are not touched: only expired sessions are purged
    expect(clientSessionRepo.deleteMany).toHaveBeenCalledWith({
      where: { clientId: CLIENT.id, expiresAt: { lt: expect.any(Date) } },
    });
  });

  it('evicts least recently used sessions beyond the per-client cap', async () => {
    const { service, clientSessionRepo } = setup();
    clientSessionRepo.findMany.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }]);

    await (service as any).buildAuthResponse(CLIENT, false);

    expect(clientSessionRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { lastUsedAt: 'desc' }, skip: MAX_SESSIONS_PER_CLIENT }),
    );
    expect(clientSessionRepo.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old-1', 'old-2'] } } });
  });

  it('rotates the refresh token of the matching session only', async () => {
    const { service, clientSessionRepo, jwtService } = setup();
    clientSessionRepo.findUnique.mockResolvedValue({
      id: 'session-a',
      expiresAt: new Date(Date.now() + 60_000),
      client: CLIENT,
    });

    const res = await service.refreshAccessToken('old-refresh');

    const where = clientSessionRepo.updateMany.mock.calls[0][0].where;
    expect(where.id).toBe('session-a');
    expect(where.refreshTokenHash).toEqual(expect.any(String));
    expect(res.refresh_token).not.toBe('old-refresh');
    expect(jwtService.sign).toHaveBeenCalledWith(expect.objectContaining({ sid: 'session-a' }));
  });

  it('rejects an unknown refresh token', async () => {
    const { service, clientSessionRepo } = setup();
    clientSessionRepo.findUnique.mockResolvedValue(null);

    await expect(service.refreshAccessToken('nope')).rejects.toThrow(new UnauthorizedException('error.auth.refreshInvalid'));
  });

  it('rejects and deletes an expired session', async () => {
    const { service, clientSessionRepo } = setup();
    clientSessionRepo.findUnique.mockResolvedValue({ id: 'session-a', expiresAt: new Date(Date.now() - 1), client: CLIENT });

    await expect(service.refreshAccessToken('old')).rejects.toThrow(new UnauthorizedException('error.auth.refreshExpired'));
    expect(clientSessionRepo.delete).toHaveBeenCalledWith({ where: { id: 'session-a' } });
  });

  it('rejects the loser of two concurrent refreshes with the same token', async () => {
    const { service, clientSessionRepo } = setup();
    clientSessionRepo.findUnique.mockResolvedValue({ id: 'session-a', expiresAt: new Date(Date.now() + 60_000), client: CLIENT });
    clientSessionRepo.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.refreshAccessToken('old')).rejects.toThrow(new UnauthorizedException('error.auth.refreshInvalid'));
  });

  it('logout revokes only the current device session', async () => {
    const { service, clientSessionRepo } = setup();

    await service.logout(CLIENT.id, 'session-a');

    expect(clientSessionRepo.deleteMany).toHaveBeenCalledWith({ where: { clientId: CLIENT.id, id: 'session-a' } });
  });

  it('logout without a session id (legacy token) revokes every session', async () => {
    const { service, clientSessionRepo } = setup();

    await service.logout(CLIENT.id);

    expect(clientSessionRepo.deleteMany).toHaveBeenCalledWith({ where: { clientId: CLIENT.id } });
  });

  // ── Security audit 2026-11-05 ──

  it('refuses to open a session for a client deactivated by an admin', async () => {
    const { service, clientRepo, clientSessionRepo } = setup();
    clientRepo.findUnique.mockResolvedValue({ deletedAt: new Date() });

    await expect(service.buildAuthResponse(CLIENT, false)).rejects.toThrow(new ForbiddenException('error.auth.accountDisabled'));
    expect(clientSessionRepo.create).not.toHaveBeenCalled();
  });

  it('refuses to refresh a deactivated client and revokes all its sessions', async () => {
    const { service, clientSessionRepo } = setup();
    clientSessionRepo.findUnique.mockResolvedValue({
      id: 'session-a',
      expiresAt: new Date(Date.now() + 60_000),
      client: { ...CLIENT, deletedAt: new Date() },
    });

    await expect(service.refreshAccessToken('old')).rejects.toThrow(new UnauthorizedException('error.auth.accountDisabled'));
    expect(clientSessionRepo.deleteMany).toHaveBeenCalledWith({ where: { clientId: CLIENT.id } });
    expect(clientSessionRepo.updateMany).not.toHaveBeenCalled();
  });

  it('marks the session opened by an email OTP login (password reset proof)', async () => {
    const { service, clientSessionRepo } = setup();

    await service.buildAuthResponse(CLIENT, false, { otpVerified: true });

    expect(clientSessionRepo.create.mock.calls[0][0].data.otpVerifiedAt).toEqual(expect.any(Date));
  });

  it('does not mark sessions opened by other login methods', async () => {
    const { service, clientSessionRepo } = setup();

    await service.buildAuthResponse(CLIENT, false);

    expect(clientSessionRepo.create.mock.calls[0][0].data.otpVerifiedAt).toBeUndefined();
  });

  it('consumes the OTP proof once, scoped to the session, client and window', async () => {
    const { service, clientSessionRepo } = setup();

    await expect(service.consumeOtpProof(CLIENT.id, 'session-a')).resolves.toBe(true);
    const { where, data } = clientSessionRepo.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 'session-a', clientId: CLIENT.id, otpVerifiedAt: { gte: expect.any(Date) } });
    expect(Date.now() - where.otpVerifiedAt.gte.getTime()).toBeCloseTo(OTP_PASSWORD_RESET_WINDOW_MS, -3);
    expect(data).toEqual({ otpVerifiedAt: null });

    clientSessionRepo.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.consumeOtpProof(CLIENT.id, 'session-a')).resolves.toBe(false);
  });

  it('has no OTP proof without a session id', async () => {
    const { service, clientSessionRepo } = setup();

    await expect(service.consumeOtpProof(CLIENT.id, undefined)).resolves.toBe(false);
    expect(clientSessionRepo.updateMany).not.toHaveBeenCalled();
  });
});
