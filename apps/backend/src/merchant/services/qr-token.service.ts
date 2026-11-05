import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { QR_NONCE_REPOSITORY, type IQrNonceRepository } from '../../common/repositories';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVALID = 'QR code invalide.';
/** Share of v2 scans that also purge expired nonces (best-effort housekeeping). */
const NONCE_CLEANUP_RATE = 0.01;

/**
 * Verifies the client QR codes scanned by merchants and returns the client id
 * they carry. Formats:
 * - v2 `v2.{idB64}.{exp}.{nonce}.{sig}` — short-lived and single-use (nonce)
 * - v1 `v1.{idB64}.{sig}` and legacy v0 `{idB64}.{sig}` — permanent, kept during rollout
 *
 * Every rejection is a BadRequestException with a user-facing message.
 */
@Injectable()
export class QrTokenService {
  private readonly logger = new Logger(QrTokenService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(QR_NONCE_REPOSITORY) private readonly nonces: IQrNonceRepository,
  ) {}

  async resolveClientId(rawToken: string): Promise<string> {
    // Strip invisible control chars / BOM that QR scanners may inject
    const token = rawToken.replace(/[\x00-\x1f\x7f-\x9f﻿]/g, '').trim();
    const parts = token.split('.');
    return parts[0] === 'v2' ? this.verifyV2(parts) : this.verifyLegacy(token, parts);
  }

  private async verifyV2(parts: string[]): Promise<string> {
    if (parts.length !== 5) throw new BadRequestException(INVALID);
    const [, idB64, expStr, nonce, sig] = parts;
    if (!idB64 || !expStr || !nonce || !sig) throw new BadRequestException(INVALID);

    const clientId = decodeClientId(idB64);
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp <= 0) throw new BadRequestException(INVALID);

    const now = Math.floor(Date.now() / 1000);
    if (exp < now) {
      this.logger.warn(`QR verify failed – v2 expired [clientId=${clientId}, lag=${now - exp}s]`);
      throw new BadRequestException('QR code expiré. Demandez au client de rafraîchir.');
    }

    if (!this.signatureMatches(sig, `v2:${clientId}:${exp}:${nonce}`)) {
      this.logger.warn(`QR verify failed – v2 HMAC mismatch [clientId=${clientId}]`);
      throw new BadRequestException(INVALID);
    }

    // Single-use nonce: INSERT atomically. A second scan of the same QR collides
    // on the primary key and is rejected as a replay.
    try {
      await this.nonces.create({
        data: { nonce, clientId, expiresAt: new Date(exp * 1000) },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        this.logger.warn(`QR verify failed – v2 nonce replay [clientId=${clientId}]`);
        throw new BadRequestException('QR code déjà utilisé. Demandez au client de rafraîchir.');
      }
      throw e;
    }

    if (Math.random() < NONCE_CLEANUP_RATE) {
      this.nonces
        .deleteMany({ where: { expiresAt: { lt: new Date() } } })
        .catch((err: unknown) => this.logger.debug(`QR nonce cleanup failed: ${String(err)}`));
    }

    return clientId;
  }

  private verifyLegacy(token: string, parts: string[]): string {
    let version: 'v1' | 'v0';
    let idB64: string;
    let sig: string;

    if (parts[0] === 'v1') {
      version = 'v1';
      if (parts.length !== 3) throw new BadRequestException(INVALID);
      [, idB64, sig] = parts;
    } else {
      // Legacy unversioned format — backward compatible
      version = 'v0';
      const dotIdx = token.indexOf('.');
      if (dotIdx < 1) throw new BadRequestException(INVALID);
      idB64 = token.substring(0, dotIdx);
      sig = token.substring(dotIdx + 1);
    }

    const clientId = decodeClientId(idB64);
    // v1 includes the version prefix in the HMAC input, v0 does not
    const hmacInput = version === 'v1' ? `v1:${clientId}` : clientId;
    if (!this.signatureMatches(sig, hmacInput)) {
      this.logger.warn(`QR verify failed – HMAC mismatch [version=${version}, len=${token.length}]`);
      throw new BadRequestException(INVALID);
    }
    return clientId;
  }

  private signatureMatches(sig: string, input: string): boolean {
    const expected = createHmac('sha256', this.config.getOrThrow<string>('QR_HMAC_SECRET'))
      .update(input)
      .digest('base64url');
    return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }
}

/** Decodes the base64url client id and requires it to be a UUID. */
function decodeClientId(idB64: string): string {
  const clientId = Buffer.from(idB64, 'base64url').toString();
  if (!UUID_RE.test(clientId)) throw new BadRequestException(INVALID);
  return clientId;
}
