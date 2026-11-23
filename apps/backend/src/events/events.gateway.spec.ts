import { EventsGateway } from './events.gateway';

const makeSocket = (token?: string) => ({
  id: `sock-${Math.random()}`,
  handshake: { auth: token ? { token } : {}, headers: {} },
  data: {} as Record<string, unknown>,
  emit: jest.fn(),
  disconnect: jest.fn(),
  join: jest.fn().mockResolvedValue(undefined),
});

describe('EventsGateway auth', () => {
  const jwtService = { verify: jest.fn() };
  const config = { getOrThrow: jest.fn().mockReturnValue('test-secret') };
  const deviceSessionRepo = { findUnique: jest.fn(), findMany: jest.fn() };
  let gateway: EventsGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new EventsGateway(jwtService as never, config as never, deviceSessionRepo as never);
    gateway.afterInit();
  });

  afterEach(() => gateway.onModuleDestroy());

  it('verifies tokens with the same algorithm, issuer and audience constraints as HTTP', async () => {
    jwtService.verify.mockReturnValue({ sub: 'client-1', type: 'client', aud: 'jitplus-client' });
    const socket = makeSocket('tok');

    await gateway.handleConnection(socket as never);

    expect(jwtService.verify).toHaveBeenCalledWith('tok', expect.objectContaining({
      algorithms: ['HS256'],
      issuer: 'jitplus-api',
      audience: ['jitplus-merchant', 'jitplus-client'],
    }));
    expect(socket.join).toHaveBeenCalledWith('client:client-1');
  });

  it('rejects a merchant socket whose device session was revoked', async () => {
    jwtService.verify.mockReturnValue({ sub: 'merchant-1', type: 'merchant', aud: 'jitplus-merchant', jti: 'jti-1' });
    deviceSessionRepo.findUnique.mockResolvedValue(null);
    const socket = makeSocket('tok');

    await gateway.handleConnection(socket as never);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('auth_error', expect.anything());
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('joins the merchant room when the device session is live', async () => {
    jwtService.verify.mockReturnValue({ sub: 'merchant-1', type: 'team_member', aud: 'jitplus-merchant', jti: 'jti-1' });
    deviceSessionRepo.findUnique.mockResolvedValue({ id: 'row-1' });
    const socket = makeSocket('tok');

    await gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledWith('merchant:merchant-1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('periodic recheck disconnects sockets whose session disappeared', async () => {
    const live = makeSocket('live');
    const revoked = makeSocket('revoked');
    jwtService.verify.mockImplementation((token: string) => ({
      sub: 'merchant-1', type: 'merchant', jti: token === 'live' ? 'jti-live' : 'jti-revoked',
    }));
    deviceSessionRepo.findMany.mockResolvedValue([{ tokenId: 'jti-live' }]);
    gateway.server = { sockets: { sockets: new Map([[live.id, live], [revoked.id, revoked]]) } } as never;

    await (gateway as unknown as { recheckConnectedTokens: () => Promise<void> }).recheckConnectedTokens();

    expect(live.disconnect).not.toHaveBeenCalled();
    expect(revoked.disconnect).toHaveBeenCalledWith(true);
  });

  it('refuses the email-unsubscribe JWT (purpose, no type/sub) even though it verifies', async () => {
    jwtService.verify.mockReturnValue({ clientId: 'client-1', purpose: 'unsubscribe', aud: 'jitplus-client' });
    const socket = makeSocket('tok');

    await gateway.handleConnection(socket as never);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('refuses a token whose audience does not match its type', async () => {
    jwtService.verify.mockReturnValue({ sub: 'merchant-1', type: 'merchant', aud: 'jitplus-client', jti: 'jti-1' });
    deviceSessionRepo.findUnique.mockResolvedValue({ id: 'row-1' });
    const socket = makeSocket('tok');

    await gateway.handleConnection(socket as never);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('periodic recheck disconnects client sockets whose ClientSession was deleted', async () => {
    const clientSessionRepo = { findUnique: jest.fn(), findMany: jest.fn() };
    const gw = new EventsGateway(jwtService as never, config as never, deviceSessionRepo as never, clientSessionRepo as never);
    gw.afterInit();
    const live = makeSocket('live');
    const revoked = makeSocket('revoked');
    jwtService.verify.mockImplementation((token: string) => ({
      sub: 'client-1', type: 'client', aud: 'jitplus-client', sid: token === 'live' ? 'sid-live' : 'sid-gone',
    }));
    clientSessionRepo.findMany.mockResolvedValue([{ id: 'sid-live', clientId: 'client-1' }]);
    gw.server = { sockets: { sockets: new Map([[live.id, live], [revoked.id, revoked]]) } } as never;

    await (gw as unknown as { recheckConnectedTokens: () => Promise<void> }).recheckConnectedTokens();
    gw.onModuleDestroy();

    expect(live.disconnect).not.toHaveBeenCalled();
    expect(revoked.disconnect).toHaveBeenCalledWith(true);
  });
});
