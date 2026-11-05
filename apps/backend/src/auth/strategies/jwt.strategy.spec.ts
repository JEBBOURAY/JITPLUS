import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

/** Security audit 2026-11-05 — which JWT payloads may authenticate. */

function setup() {
  const deviceSessionRepo = { findUnique: jest.fn().mockResolvedValue({ id: 's', lastActiveAt: new Date() }), update: jest.fn() };
  const clientSessionRepo = { findUnique: jest.fn().mockResolvedValue({ clientId: 'c1' }) };
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() };
  const config = { getOrThrow: () => 'x'.repeat(32) };
  const strategy = new JwtStrategy(deviceSessionRepo as any, clientSessionRepo as any, cache as any, config as any);
  return { strategy, clientSessionRepo };
}

describe('JwtStrategy.validate', () => {
  it('accepts a client token signed for the client audience with a live session', async () => {
    const { strategy } = setup();
    await expect(strategy.validate({ sub: 'c1', type: 'client', sid: 'sid-1', aud: 'jitplus-client' } as any))
      .resolves.toMatchObject({ userId: 'c1', type: 'client', clientSessionId: 'sid-1' });
  });

  it('rejects the email-unsubscribe token (same secret and audience, no type/sub)', async () => {
    const { strategy } = setup();
    await expect(strategy.validate({ clientId: 'c1', purpose: 'unsubscribe_email', aud: 'jitplus-client' } as any))
      .rejects.toThrow(UnauthorizedException);
  });

  it('rejects a type claimed under another audience (e.g. admin type on a client token)', async () => {
    const { strategy } = setup();
    await expect(strategy.validate({ sub: 'c1', type: 'admin', aud: 'jitplus-client' } as any))
      .rejects.toThrow(UnauthorizedException);
  });

  it('rejects unknown token types', async () => {
    const { strategy } = setup();
    await expect(strategy.validate({ sub: 'c1', type: 'qr', aud: 'jitplus-client' } as any))
      .rejects.toThrow(UnauthorizedException);
  });

  it('rejects a client token whose session was revoked (logout, reset, ban)', async () => {
    const { strategy, clientSessionRepo } = setup();
    clientSessionRepo.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ sub: 'c1', type: 'client', sid: 'gone', aud: 'jitplus-client' } as any))
      .rejects.toThrow(UnauthorizedException);
  });

  it('rejects a client token whose session belongs to another client', async () => {
    const { strategy, clientSessionRepo } = setup();
    clientSessionRepo.findUnique.mockResolvedValue({ clientId: 'someone-else' });
    await expect(strategy.validate({ sub: 'c1', type: 'client', sid: 'sid-1', aud: 'jitplus-client' } as any))
      .rejects.toThrow(UnauthorizedException);
  });
});
