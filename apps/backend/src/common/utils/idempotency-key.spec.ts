import { BadRequestException } from '@nestjs/common';
import { parseIdempotencyKey } from './idempotency-key';

describe('parseIdempotencyKey', () => {
  it('returns undefined without a header', () => {
    expect(parseIdempotencyKey(undefined)).toBeUndefined();
    expect(parseIdempotencyKey('   ')).toBeUndefined();
  });
  it('trims a valid key', () => {
    expect(parseIdempotencyKey('  3f2a-9c_B ')).toBe('3f2a-9c_B');
  });
  it('rejects a key that is too long or has other characters', () => {
    expect(() => parseIdempotencyKey('a'.repeat(65))).toThrow(BadRequestException);
    expect(() => parseIdempotencyKey('abc def')).toThrow(BadRequestException);
    expect(() => parseIdempotencyKey('abc;drop')).toThrow(BadRequestException);
  });
});
