import { BadRequestException } from '@nestjs/common';
import { toE164Phone, tryToE164Phone } from './phone';

describe('toE164Phone', () => {
  it.each([
    ['0612345678', '+212612345678'],
    ['612345678', '+212612345678'],
    ['+212612345678', '+212612345678'],
    ['00212612345678', '+212612345678'],
    ['212 612 345 678', '+212612345678'],
    ['06 12-34.56.78', '+212612345678'],
  ])('normalizes %s for Morocco', (raw, expected) => {
    expect(toE164Phone(raw)).toBe(expected);
  });

  it('treats numbers as international for other countries', () => {
    expect(toE164Phone('33612345678', 'FR')).toBe('+33612345678');
  });

  it('throws on empty or implausible numbers', () => {
    expect(() => toE164Phone('')).toThrow(BadRequestException);
    expect(() => toE164Phone('+12')).toThrow(BadRequestException);
    expect(() => toE164Phone('+1234567890123456')).toThrow(BadRequestException);
  });

  it('tryToE164Phone returns null instead of throwing', () => {
    expect(tryToE164Phone('abc')).toBeNull();
    expect(tryToE164Phone('0612345678')).toBe('+212612345678');
  });
});
