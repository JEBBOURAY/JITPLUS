import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/** Request header carrying the ticket on GET client status and POST transactions. */
export const SCAN_TICKET_HEADER = 'x-scan-ticket';
export const SCAN_TICKET_TTL_SECONDS = 15 * 60;
/** Signed QR scan: the client showed their own code (consent). */
const TICKET_VERSION = 'st1';
/** Exact phone match typed by the merchant: no proof of the client's consent. */
const PHONE_TICKET_VERSION = 'st1p';
const MAX_TICKET_LENGTH = 128;

/**
 * - 'qr': may create a card and reactivate one the client had left.
 * - 'phone': may create a NEW card only — a card the client deactivated
 *   (left / blocked) is never reactivated from a typed phone number.
 */
export type ScanTicketKind = 'qr' | 'phone';

/**
 * Short-lived proof that the merchant was allowed to start a loyalty
 * relationship with a client: issued after a valid signed QR scan or an exact
 * phone-number match, and required to create (or reactivate) a loyalty card.
 * It is bound to one (client, merchant) pair, so a ticket can neither be reused
 * for another client nor by another merchant.
 */
@Injectable()
export class ScanTicketService {
  private key: Buffer | null = null;

  constructor(private readonly config: ConfigService) {}

  issue(clientId: string, merchantId: string, nowMs = Date.now(), kind: ScanTicketKind = 'qr'): string {
    const version = kind === 'phone' ? PHONE_TICKET_VERSION : TICKET_VERSION;
    const exp = Math.floor(nowMs / 1000) + SCAN_TICKET_TTL_SECONDS;
    return `${version}.${exp}.${this.sign(version, clientId, merchantId, exp)}`;
  }

  /** True for a valid ticket of any kind. */
  verify(ticket: string | null | undefined, clientId: string, merchantId: string, nowMs = Date.now()): boolean {
    return this.verifyKind(ticket, clientId, merchantId, nowMs) !== null;
  }

  /** Kind of a valid ticket, or null when missing / forged / expired / for another pair. */
  verifyKind(ticket: string | null | undefined, clientId: string, merchantId: string, nowMs = Date.now()): ScanTicketKind | null {
    if (typeof ticket !== 'string' || ticket.length > MAX_TICKET_LENGTH) return null;
    const parts = ticket.trim().split('.');
    if (parts.length !== 3) return null;
    const version = parts[0];
    if (version !== TICKET_VERSION && version !== PHONE_TICKET_VERSION) return null;

    const exp = Number(parts[1]);
    if (!Number.isSafeInteger(exp) || exp * 1000 < nowMs) return null;

    const given = Buffer.from(parts[2]);
    const expected = Buffer.from(this.sign(version, clientId, merchantId, exp));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    return version === PHONE_TICKET_VERSION ? 'phone' : 'qr';
  }

  private sign(version: string, clientId: string, merchantId: string, exp: number): string {
    return createHmac('sha256', this.getKey())
      .update(`${version}:${clientId}:${merchantId}:${exp}`)
      .digest('base64url');
  }

  // Derived lazily so a missing QR_HMAC_SECRET (optional outside production)
  // fails the scan request instead of the whole application boot. The sub-key
  // keeps ticket signatures distinct from QR code signatures.
  private getKey(): Buffer {
    if (!this.key) {
      const secret = this.config.getOrThrow<string>('QR_HMAC_SECRET');
      this.key = createHmac('sha256', secret).update('jitplus-scan-ticket-v1').digest();
    }
    return this.key;
  }
}
