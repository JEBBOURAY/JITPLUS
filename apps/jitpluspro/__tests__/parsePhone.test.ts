import { parsePhone, phoneToSubmit } from '@/utils/parsePhone';

describe('parsePhone', () => {
  it('splits an international number into country and local digits', () => {
    const p = parsePhone('+212612345678');
    expect(p.country.code).toBe('MA');
    expect(p.dialCode).toBe('+212');
    expect(p.localPart).toBe('612345678');
  });

  it('matches the longest dial code first', () => {
    // +212 (Morocco) must win over any shorter code starting with +2.
    expect(parsePhone('+213550000000').country.code).toBe('DZ');
    expect(parsePhone('+20100000000').country.code).toBe('EG');
  });

  it('keeps the picked country when several share a dial code', () => {
    expect(parsePhone('+14165551234').country.code).toBe('US');
    expect(parsePhone('+14165551234', 'CA').country.code).toBe('CA');
    expect(parsePhone('+14165551234', 'CA').localPart).toBe('4165551234');
  });

  it('ignores a preferred country with another dial code', () => {
    expect(parsePhone('+14165551234', 'FR').country.code).toBe('US');
  });

  it('reads a local number as Moroccan and drops the leading 0', () => {
    const p = parsePhone('0612345678');
    expect(p.country.code).toBe('MA');
    expect(p.localPart).toBe('612345678');
  });

  it('handles an empty value', () => {
    expect(parsePhone('').localPart).toBe('');
    expect(parsePhone(undefined).country.code).toBe('MA');
  });
});

describe('phoneToSubmit', () => {
  it('sends nothing while only the dial code is there', () => {
    expect(phoneToSubmit('+212')).toBe('');
    expect(phoneToSubmit('+33')).toBe('');
  });

  it('sends the full international number once digits are typed', () => {
    expect(phoneToSubmit('+212612345678')).toBe('+212612345678');
  });
});
