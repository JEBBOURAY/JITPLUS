import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { buildPublicWebUrl } from '../common/utils/public-web-url';

const TOKEN_VERSION = 'sc1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** "sc1." + 16 id bytes + "." + 16 signature bytes, both base64url (22 chars). */
export const STAMP_CODE_TOKEN_RE = /^sc1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/;

/**
 * Token printed in an e-commerce QR code: the code id plus an HMAC of it.
 * Derived rather than stored, so the database holds no secret (a leak exposes
 * no usable token) and a batch can be reprinted at any time. Single use is
 * enforced by the code's status, not by the token.
 */
@Injectable()
export class StampCodeTokenService {
  private key: Buffer | null = null;

  constructor(private readonly config: ConfigService) {}

  issue(codeId: string): string {
    if (!UUID_RE.test(codeId)) throw new Error('Invalid stamp code id');
    const idPart = Buffer.from(codeId.replace(/-/g, ''), 'hex').toString('base64url');
    return `${TOKEN_VERSION}.${idPart}.${this.sign(idPart)}`;
  }

  /** Returns the code id when the token is authentic, null otherwise. */
  verify(token: string | null | undefined): string | null {
    if (typeof token !== 'string') return null;
    const trimmed = token.trim();
    if (!STAMP_CODE_TOKEN_RE.test(trimmed)) return null;
    const [, idPart, sig] = trimmed.split('.');

    const given = Buffer.from(sig);
    const expected = Buffer.from(this.sign(idPart));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    const hex = Buffer.from(idPart, 'base64url').toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  /** Public link encoded in the QR (opens the client app through the smart redirect). */
  buildUrl(codeId: string): string {
    return buildPublicWebUrl(`q/${this.issue(codeId)}`);
  }

  private sign(idPart: string): string {
    return createHmac('sha256', this.getKey())
      .update(`${TOKEN_VERSION}:${idPart}`)
      .digest()
      .subarray(0, 16)
      .toString('base64url');
  }

  // Same lazy sub-key derivation as ScanTicketService: keeps these signatures
  // distinct from QR / scan-ticket ones and a missing secret fails the request,
  // not the boot.
  private getKey(): Buffer {
    if (!this.key) {
      const secret = this.config.getOrThrow<string>('QR_HMAC_SECRET');
      this.key = createHmac('sha256', secret).update('jitplus-stamp-code-v1').digest();
    }
    return this.key;
  }
}
