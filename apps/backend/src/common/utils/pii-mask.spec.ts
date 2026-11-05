import { maskEmail, maskPhone } from './pii-mask';

describe('pii-mask', () => {
  it('keeps only the first letter and the domain of an email', () => {
    expect(maskEmail('ayoub.je@gmail.com')).toBe('a***@gmail.com');
    expect(maskEmail('nope')).toBe('***');
    expect(maskEmail(null)).toBe('<none>');
  });

  it('keeps only the prefix and last two digits of a phone', () => {
    expect(maskPhone('+212612345678')).toBe('+21********78');
    expect(maskPhone('123')).toBe('***');
    expect(maskPhone(undefined)).toBe('<none>');
  });
});
