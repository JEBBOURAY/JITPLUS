import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/** Request header carrying the ticket on GET client status and POST transactions. */
export const SCAN_TICKET_HEADER = 'x-scan-ticket';
export const SCAN_TICKET_TTL_SECONDS = 15 * 60;
const TICKET_VERSION = 'st1';
const MAX_TICKET_LENGTH = 128;

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

  issue(clientId: string, merchantId: string, nowMs = Date.now()): string {
    const exp = Math.floor(nowMs / 1000) + SCAN_TICKET_TTL_SECONDS;
    return `${TICKET_VERSION}.${exp}.${this.sign(clientId, merchantId, exp)}`;
  }

  verify(ticket: string | null | undefined, clientId: string, merchantId: string, nowMs = Date.now()): boolean {
    if (typeof ticket !== 'string' || ticket.length > MAX_TICKET_LENGTH) return false;
    const parts = ticket.trim().split('.');
    if (parts.length !== 3 || parts[0] !== TICKET_VERSION) return false;

    const exp = Number(parts[1]);
    if (!Number.isSafeInteger(exp) || exp * 1000 < nowMs) return false;

    const given = Buffer.from(parts[2]);
    const expected = Buffer.from(this.sign(clientId, merchantId, exp));
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private sign(clientId: string, merchantId: string, exp: number): string {
    return createHmac('sha256', this.getKey())
      .update(`${TICKET_VERSION}:${clientId}:${merchantId}:${exp}`)
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
