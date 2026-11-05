import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { AppleTokenError, AppleTokenVerifier } from './apple-token-verifier.service';

const BUNDLE = 'com.jitplus.client';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'kid-1', alg: 'RS256', use: 'sig' };

function token(kid = 'kid-1', claims: Record<string, unknown> = {}) {
  return jwt.sign({ sub: 'apple-user', ...claims }, privateKey, {
    algorithm: 'RS256',
    keyid: kid,
    issuer: 'https://appleid.apple.com',
    audience: BUNDLE,
    expiresIn: 300,
  });
}

describe('AppleTokenVerifier', () => {
  let fetchMock: jest.SpyInstance;
  let verifier: AppleTokenVerifier;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [JWK] }),
    } as Response);
    const config = { get: jest.fn().mockReturnValue(BUNDLE) } as unknown as ConfigService;
    verifier = new AppleTokenVerifier(config);
  });

  afterEach(() => fetchMock.mockRestore());

  it('verifies a valid token and caches the keys', async () => {
    await expect(verifier.verify(token())).resolves.toMatchObject({ sub: 'apple-user' });
    await verifier.verify(token());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one fetch between concurrent cold-start verifications', async () => {
    await Promise.all([verifier.verify(token()), verifier.verify(token()), verifier.verify(token())]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rate-limits refetches forced by unknown kids', async () => {
    await expect(verifier.verify(token('forged-1'))).rejects.toMatchObject({ reason: 'keyNotFound' });
    await expect(verifier.verify(token('forged-2'))).rejects.toBeInstanceOf(AppleTokenError);
    await expect(verifier.verify(token('forged-3'))).rejects.toBeInstanceOf(AppleTokenError);
    // initial fetch + a single forced refresh, not one per forged token
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('checks the nonce against sha256(rawNonce)', async () => {
    const hashed = require('crypto').createHash('sha256').update('raw').digest('hex');
    await expect(verifier.verify(token('kid-1', { nonce: hashed }), 'raw')).resolves.toBeDefined();
    await expect(verifier.verify(token('kid-1', { nonce: hashed }), 'other')).rejects.toMatchObject({ reason: 'nonceMismatch' });
    await expect(verifier.verify(token(), 'raw')).rejects.toMatchObject({ reason: 'nonceMissing' });
  });

  it('maps an unreachable Apple endpoint to 503', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    await expect(verifier.verify(token())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
