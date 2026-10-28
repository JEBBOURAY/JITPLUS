import { resolveIncomingUrl } from '@/utils/deepLinks';
import { isClaimToken, isEntityId } from '@/utils/ids';
import { redirectSystemPath } from '@/app/+native-intent';

const UUID = '3f2b8c1e-9a4d-4e2b-8f1a-0c5d6e7f8a9b';
const CUID = 'ckq1z2x3y4w5v6u7t8s9r0q1p';
const TOKEN = 'test-claim-token-placeholder';

describe('isEntityId / isClaimToken', () => {
  it('accepts uuids and legacy cuids only', () => {
    expect(isEntityId(UUID)).toBe(true);
    expect(isEntityId(UUID.toUpperCase())).toBe(true);
    expect(isEntityId(CUID)).toBe(true);
    expect(isEntityId('../client/profile')).toBe(false);
    expect(isEntityId(`${UUID}/leave`)).toBe(false);
    expect(isEntityId('')).toBe(false);
    expect(isEntityId(undefined)).toBe(false);
    expect(isEntityId(42)).toBe(false);
  });

  it('accepts url-safe claim tokens of reasonable length', () => {
    expect(isClaimToken(TOKEN)).toBe(true);
    expect(isClaimToken('short')).toBe(false);
    expect(isClaimToken('a'.repeat(65))).toBe(false);
    expect(isClaimToken('abc/def?ghi=jklmnop')).toBe(false);
    expect(isClaimToken(null)).toBe(false);
  });
});

describe('resolveIncomingUrl', () => {
  it('routes claim links from every entry point', () => {
    const expected = `/claim?token=${TOKEN}`;
    expect(resolveIncomingUrl(`jitplus://claim?token=${TOKEN}`)).toBe(expected);
    expect(resolveIncomingUrl(`https://jitplus.com/d/claim?token=${TOKEN}`)).toBe(expected);
    expect(resolveIncomingUrl(`https://jitplus.com/d/claim/?utm=wa&token=${TOKEN}#x`)).toBe(expected);
    expect(resolveIncomingUrl(`/d/claim?token=${TOKEN}`)).toBe(expected);
  });

  it('sends invalid or missing claim tokens to /claim without a token', () => {
    expect(resolveIncomingUrl('jitplus://claim')).toBe('/claim');
    expect(resolveIncomingUrl('jitplus://claim?token=bad')).toBe('/claim');
    expect(resolveIncomingUrl('jitplus://claim?token=%E0%A4%A')).toBe('/claim');
  });

  it('routes merchant share links and rejects bad ids', () => {
    expect(resolveIncomingUrl(`jitplus://merchant/${UUID}`)).toBe(`/merchant/${UUID}`);
    expect(resolveIncomingUrl(`https://jitplus.com/m/${UUID.toUpperCase()}?ref=share`)).toBe(`/merchant/${UUID}`);
    expect(resolveIncomingUrl(`/m/${CUID}`)).toBe(`/merchant/${CUID}`);
    expect(resolveIncomingUrl('jitplus://merchant/..%2Fsettings')).toBe('/');
    expect(resolveIncomingUrl('https://jitplus.com/m/not-an-id')).toBe('/');
  });

  it('routes deal share links and rejects bad ids', () => {
    expect(resolveIncomingUrl(`jitplus://deal/${UUID}`)).toBe(`/deal/${UUID}`);
    expect(resolveIncomingUrl(`https://jitplus.com/bp/${UUID.toUpperCase()}?utm=wa`)).toBe(`/deal/${UUID}`);
    expect(resolveIncomingUrl(`https://jitplus-api.example.run.app/bp/${UUID}#top`)).toBe(`/deal/${UUID}`);
    expect(resolveIncomingUrl(`/bp/${UUID}`)).toBe(`/deal/${UUID}`);
    expect(resolveIncomingUrl('jitplus://deal/..%2Fprofile')).toBe('/');
    expect(resolveIncomingUrl('https://jitplus.com/bp/42')).toBe('/');
  });

  it('leaves other urls to expo-router', () => {
    expect(resolveIncomingUrl('jitplus://oauthredirect?code=1')).toBeNull();
    expect(resolveIncomingUrl('/settings')).toBeNull();
    expect(resolveIncomingUrl('https://jitplus.com/d/claimed')).toBeNull();
    expect(resolveIncomingUrl('https://jitplus.com/bpx/1')).toBeNull();
  });
});

describe('redirectSystemPath', () => {
  it('rewrites known links and passes through the rest', () => {
    expect(redirectSystemPath({ path: `jitplus://merchant/${UUID}`, initial: true })).toBe(`/merchant/${UUID}`);
    expect(redirectSystemPath({ path: '/discover', initial: false })).toBe('/discover');
  });
});
