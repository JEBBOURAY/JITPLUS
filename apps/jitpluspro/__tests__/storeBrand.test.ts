import { normalizeSocial, isValidSocial } from '@/components/stores/brand';

const whatsapp = (raw: string) => normalizeSocial('whatsapp', raw);

describe('WhatsApp number normalization', () => {
  it('adds +212 to a local Moroccan number', () => {
    expect(whatsapp('0612345678')).toBe('+212612345678');
    expect(whatsapp('06 12 34 56 78')).toBe('+212612345678');
    expect(whatsapp('612345678')).toBe('+212612345678');
  });

  it('keeps an international Moroccan number', () => {
    expect(whatsapp('+212612345678')).toBe('+212612345678');
    expect(whatsapp('+212 6 12 34 56 78')).toBe('+212612345678');
    expect(whatsapp('212612345678')).toBe('+212612345678');
    expect(whatsapp('00212612345678')).toBe('+212612345678');
  });

  it('keeps a foreign number written with its prefix', () => {
    expect(whatsapp('+33612345678')).toBe('+33612345678');
    expect(whatsapp('0033612345678')).toBe('+33612345678');
  });

  it('returns an empty value when no digit is typed', () => {
    expect(whatsapp('')).toBe('');
    expect(whatsapp('  ')).toBe('');
    expect(whatsapp('+')).toBe('');
  });
});

describe('WhatsApp number validation', () => {
  const valid = (raw: string) => isValidSocial('whatsapp', whatsapp(raw));

  it('accepts valid Moroccan mobile and fixed numbers', () => {
    expect(valid('0612345678')).toBe(true);
    expect(valid('0712345678')).toBe(true);
    expect(valid('0522123456')).toBe(true);
  });

  it('rejects incomplete or malformed Moroccan numbers', () => {
    expect(valid('06123')).toBe(false);
    expect(valid('06123456789')).toBe(false);
    expect(valid('0812345678')).toBe(false);
  });

  it('accepts foreign numbers', () => {
    expect(valid('+33612345678')).toBe(true);
  });

  it('treats an empty field as valid (optional)', () => {
    expect(valid('')).toBe(true);
  });
});
