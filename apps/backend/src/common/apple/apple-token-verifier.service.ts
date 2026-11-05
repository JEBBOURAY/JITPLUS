import { Injectable, Logger, OnApplicationBootstrap, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createPublicKey, type JsonWebKey } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { MS_PER_DAY } from '../constants';

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const JWKS_TTL_MS = MS_PER_DAY;
const JWKS_FETCH_TIMEOUT_MS = 3_000;
/**
 * Minimum gap between two forced refreshes triggered by an unknown `kid`.
 * Without it, every forged token with a random kid would cost a call to Apple.
 */
const FORCED_REFRESH_COOLDOWN_MS = 60_000;

interface AppleJwk extends JsonWebKey {
  kid: string;
}

export interface AppleTokenPayload extends jwt.JwtPayload {
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  nonce?: string;
}

/** Why an Apple identity token was rejected — each caller maps it to its own message. */
export type AppleTokenFailure =
  | 'invalid'
  | 'algorithm'
  | 'keyNotFound'
  | 'notConfigured'
  | 'nonceMissing'
  | 'nonceMismatch';

export class AppleTokenError extends Error {
  constructor(readonly reason: AppleTokenFailure) {
    super(`Apple identity token rejected: ${reason}`);
    this.name = 'AppleTokenError';
  }
}

/** User-facing messages for rejected Apple tokens (merchant app — French). */
export const MERCHANT_APPLE_ERRORS: Record<AppleTokenFailure, string> = {
  invalid: 'Token Apple invalide',
  algorithm: 'Algorithme de signature Apple non supporté',
  keyNotFound: 'Clé Apple introuvable',
  notConfigured: 'Connexion Apple non configurée',
  nonceMissing: 'Token Apple invalide — nonce manquant',
  nonceMismatch: 'Token Apple invalide — nonce incorrect',
};

/**
 * Verifies Apple Sign-In identity tokens against Apple's JWKS.
 *
 * Single instance shared by merchant auth, client auth and merchant account
 * deletion: keys are cached 24h, concurrent fetches share one request
 * (single-flight), each fetch is bounded by a timeout, and refreshes forced by
 * an unknown `kid` are rate-limited.
 *
 * Throws {@link AppleTokenError} for a token that is not acceptable,
 * `jsonwebtoken` errors for a bad signature / expired token, and
 * ServiceUnavailableException when Apple's keys cannot be fetched.
 */
@Injectable()
export class AppleTokenVerifier implements OnApplicationBootstrap {
  private readonly logger = new Logger(AppleTokenVerifier.name);
  private cache: { keys: AppleJwk[]; fetchedAt: number } | null = null;
  private inflight: Promise<AppleJwk[]> | null = null;
  private lastForcedRefreshAt = 0;

  constructor(private readonly config: ConfigService) {}

  /** Pre-warm the keys so the first Apple sign-in does not pay the fetch latency. */
  onApplicationBootstrap(): void {
    this.getKeys().catch(() => { /* already logged; retried on first use */ });
  }

  /**
   * @param rawNonce when provided, the token's `nonce` claim must equal sha256(rawNonce)
   *                 (replay protection — the app sends the hash to Apple, the raw value here).
   */
  async verify(identityToken: string, rawNonce?: string): Promise<AppleTokenPayload> {
    const decoded = jwt.decode(identityToken, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
      throw new AppleTokenError('invalid');
    }
    if (decoded.header.alg !== 'RS256') {
      throw new AppleTokenError('algorithm');
    }

    const key = await this.findKey(decoded.header.kid);
    if (!key) throw new AppleTokenError('keyNotFound');

    const audience = (this.config.get<string>('APPLE_BUNDLE_IDS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // Without an audience check, a token minted for any other Apple app would be accepted.
    if (audience.length === 0) {
      this.logger.error('Apple Sign-In misconfigured: APPLE_BUNDLE_IDS is empty');
      throw new AppleTokenError('notConfigured');
    }

    const payload = jwt.verify(identityToken, createPublicKey({ key, format: 'jwk' }), {
      algorithms: ['RS256'],
      issuer: APPLE_ISSUER,
      audience: audience as [string, ...string[]],
    }) as AppleTokenPayload;

    if (rawNonce) {
      if (!payload.nonce) throw new AppleTokenError('nonceMissing');
      if (payload.nonce !== createHash('sha256').update(rawNonce).digest('hex')) {
        throw new AppleTokenError('nonceMismatch');
      }
    }

    return payload;
  }

  /** Looks the key up, refetching once (rate-limited) if Apple may have rotated keys. */
  private async findKey(kid: string): Promise<AppleJwk | undefined> {
    const key = (await this.getKeys()).find((k) => k.kid === kid);
    if (key) return key;

    const now = Date.now();
    if (now - this.lastForcedRefreshAt < FORCED_REFRESH_COOLDOWN_MS) return undefined;
    this.lastForcedRefreshAt = now;
    this.cache = null;
    return (await this.getKeys()).find((k) => k.kid === kid);
  }

  private async getKeys(): Promise<AppleJwk[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < JWKS_TTL_MS) return this.cache.keys;
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      try {
        const res = await fetch(APPLE_JWKS_URL, { signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { keys } = (await res.json()) as { keys: AppleJwk[] };
        this.cache = { keys, fetchedAt: Date.now() };
        return keys;
      } catch (err) {
        this.logger.warn(`Apple JWKS fetch failed: ${err instanceof Error ? err.message : String(err)}`);
        throw new ServiceUnavailableException('Connexion Apple temporairement indisponible');
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}
