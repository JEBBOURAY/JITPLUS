import { ConfigService } from '@nestjs/config';
import { StampCodeTokenService, STAMP_CODE_TOKEN_RE } from './stamp-code-token.service';

describe('StampCodeTokenService', () => {
  const config = { getOrThrow: jest.fn(() => 'a'.repeat(32)) } as unknown as ConfigService;
  const service = new StampCodeTokenService(config);
  const ID = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';

  it('round-trips a code id through a compact token', () => {
    const token = service.issue(ID);
    expect(token).toMatch(STAMP_CODE_TOKEN_RE);
    expect(service.verify(token)).toBe(ID);
  });

  it('rejects a tampered signature or id', () => {
    const [v, id, sig] = service.issue(ID).split('.');
    const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    expect(service.verify(`${v}.${id}.${flip(sig)}`)).toBeNull();
    expect(service.verify(`${v}.${flip(id)}.${sig}`)).toBeNull();
  });

  it('rejects a token signed with another secret', () => {
    const other = new StampCodeTokenService({ getOrThrow: () => 'b'.repeat(32) } as unknown as ConfigService);
    expect(service.verify(other.issue(ID))).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(service.verify(undefined)).toBeNull();
    expect(service.verify('')).toBeNull();
    expect(service.verify('sc1.abc.def')).toBeNull();
    expect(service.verify(`sc2.${service.issue(ID).slice(4)}`)).toBeNull();
  });

  it('builds the public link on PUBLIC_WEB_URL', () => {
    const prev = process.env.PUBLIC_WEB_URL;
    process.env.PUBLIC_WEB_URL = 'https://example.test/';
    try {
      expect(service.buildUrl(ID)).toBe(`https://example.test/q/${service.issue(ID)}`);
    } finally {
      process.env.PUBLIC_WEB_URL = prev;
    }
  });
});
