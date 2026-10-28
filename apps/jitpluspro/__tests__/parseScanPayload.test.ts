import { parseScanPayload } from '@/utils/parseScanPayload';

const UUID = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

describe('parseScanPayload', () => {
  describe('coupon', () => {
    it('recognises the coupon deep link and keeps the raw data as token', () => {
      expect(parseScanPayload('jitplus://coupon/abc')).toEqual({ kind: 'coupon', token: 'jitplus://coupon/abc' });
    });

    it('recognises a bare c1. token', () => {
      expect(parseScanPayload('c1.payload.sig')).toEqual({ kind: 'coupon', token: 'c1.payload.sig' });
    });
  });

  describe('signed client QR', () => {
    it('extracts the trimmed token', () => {
      expect(parseScanPayload('jitplus://scan/ eyJ.token ')).toEqual({ kind: 'signed', token: 'eyJ.token' });
    });

    it('reports a missing token', () => {
      expect(parseScanPayload('jitplus://scan/')).toEqual({ kind: 'missingToken' });
      expect(parseScanPayload('jitplus://scan/   ')).toEqual({ kind: 'missingToken' });
    });
  });

  describe('legacy client id', () => {
    it('accepts jitplus://client/{uuid}', () => {
      expect(parseScanPayload(`jitplus://client/${UUID}`)).toEqual({ kind: 'legacyClient', clientId: UUID });
    });

    it('rejects jitplus://client/ with a non-uuid', () => {
      expect(parseScanPayload('jitplus://client/123')).toEqual({ kind: 'invalid' });
    });

    it('reads clientId from the query string of an allowed host', () => {
      expect(parseScanPayload(`https://jitplus.com/c?clientId=${UUID}`)).toEqual({ kind: 'legacyClient', clientId: UUID });
    });

    it('falls back to the last path segment of an allowed host', () => {
      expect(parseScanPayload(`https://www.yams.app/client/${UUID}`)).toEqual({ kind: 'legacyClient', clientId: UUID });
    });

    it('compares hosts case-insensitively', () => {
      expect(parseScanPayload(`http://JITPLUS.APP/${UUID}`)).toEqual({ kind: 'legacyClient', clientId: UUID });
    });

    it('rejects an untrusted host even with a valid uuid', () => {
      expect(parseScanPayload(`https://evil.example.com/${UUID}`)).toEqual({ kind: 'invalid' });
    });

    it('rejects a malformed URL', () => {
      expect(parseScanPayload('https://')).toEqual({ kind: 'invalid' });
    });

    it('reads clientId= from a non-URL payload', () => {
      expect(parseScanPayload(`foo?clientId=${UUID}&x=1`)).toEqual({ kind: 'legacyClient', clientId: UUID });
    });

    it('accepts a raw uuid with surrounding spaces', () => {
      expect(parseScanPayload(`  ${UUID}  `)).toEqual({ kind: 'legacyClient', clientId: UUID });
    });

    it('rejects arbitrary text and empty data', () => {
      expect(parseScanPayload('hello world')).toEqual({ kind: 'invalid' });
      expect(parseScanPayload('')).toEqual({ kind: 'invalid' });
    });
  });
});
