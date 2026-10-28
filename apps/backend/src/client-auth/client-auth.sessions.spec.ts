import { UnauthorizedException } from '@nestjs/common';
import { ClientAuthService } from './client-auth.service';
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
  const clientRepo = { update: jest.fn().mockResolvedValue({}) };
  const clientSessionRepo = {
    create: jest.fn().mockResolvedValue({ id: 'session-new' }),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    delete: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const jwtService = { sign: jest.fn().mockReturnValue('access-token') };
  const service = new ClientAuthService(
    clientRepo as any,
    clientSessionRepo as any,
    {} as any,
    jwtService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, clientRepo, clientSessionRepo, jwtService };
}

describe('ClientAuthService — multi-device sessions', () => {
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
});
