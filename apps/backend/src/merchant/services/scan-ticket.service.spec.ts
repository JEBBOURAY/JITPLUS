import { ConfigService } from '@nestjs/config';
import { ScanTicketService, SCAN_TICKET_TTL_SECONDS } from './scan-ticket.service';

describe('ScanTicketService', () => {
  const config = { getOrThrow: jest.fn(() => 'a'.repeat(32)) } as unknown as ConfigService;
  const service = new ScanTicketService(config);
  const NOW = Date.UTC(2026, 0, 1);

  it('accepts a ticket for the same client and merchant before expiry', () => {
    const ticket = service.issue('client-1', 'merchant-1', NOW);
    expect(service.verify(ticket, 'client-1', 'merchant-1', NOW + 60_000)).toBe(true);
  });

  it('rejects a ticket used for another client or another merchant', () => {
    const ticket = service.issue('client-1', 'merchant-1', NOW);
    expect(service.verify(ticket, 'client-2', 'merchant-1', NOW)).toBe(false);
    expect(service.verify(ticket, 'client-1', 'merchant-2', NOW)).toBe(false);
  });

  it('rejects an expired ticket', () => {
    const ticket = service.issue('client-1', 'merchant-1', NOW);
    expect(service.verify(ticket, 'client-1', 'merchant-1', NOW + (SCAN_TICKET_TTL_SECONDS + 1) * 1000)).toBe(false);
  });

  it('rejects a ticket whose expiry was tampered with', () => {
    const [version, exp, sig] = service.issue('client-1', 'merchant-1', NOW).split('.');
    const forged = [version, String(Number(exp) + 3600), sig].join('.');
    expect(service.verify(forged, 'client-1', 'merchant-1', NOW)).toBe(false);
  });

  it('rejects a ticket signed with another secret', () => {
    const other = new ScanTicketService({ getOrThrow: () => 'b'.repeat(32) } as unknown as ConfigService);
    const ticket = other.issue('client-1', 'merchant-1', NOW);
    expect(service.verify(ticket, 'client-1', 'merchant-1', NOW)).toBe(false);
  });

  it('rejects missing or malformed tickets', () => {
    for (const bad of [undefined, null, '', 'st1', 'st1.x.y', 'v2.1.2.3.4', 'x'.repeat(500)]) {
      expect(service.verify(bad as string | undefined, 'client-1', 'merchant-1', NOW)).toBe(false);
    }
  });

  // Security audit 2026-11-05: a phone-match ticket must not pass as a QR (consent) ticket.
  it('reports the kind of a valid ticket', () => {
    expect(service.verifyKind(service.issue('client-1', 'merchant-1', NOW), 'client-1', 'merchant-1', NOW)).toBe('qr');
    expect(service.verifyKind(service.issue('client-1', 'merchant-1', NOW, 'phone'), 'client-1', 'merchant-1', NOW)).toBe('phone');
  });

  it('cannot upgrade a phone ticket to a QR ticket by editing its version', () => {
    const [, exp, sig] = service.issue('client-1', 'merchant-1', NOW, 'phone').split('.');
    expect(service.verifyKind(`st1.${exp}.${sig}`, 'client-1', 'merchant-1', NOW)).toBeNull();
  });
});
