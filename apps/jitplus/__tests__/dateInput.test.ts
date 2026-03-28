import { formatDateInput, toIsoDate, isoDtoDmy } from '@/utils/dateInput';

describe('formatDateInput', () => {
  it('returns raw digits if ≤2 characters', () => {
    expect(formatDateInput('12')).toBe('12');
    expect(formatDateInput('1')).toBe('1');
  });

  it('adds slash after day', () => {
    expect(formatDateInput('123')).toBe('12/3');
    expect(formatDateInput('1234')).toBe('12/34');
  });

  it('formats full DD/MM/YYYY', () => {
    expect(formatDateInput('15031990')).toBe('15/03/1990');
  });

  it('strips non-digit characters', () => {
    expect(formatDateInput('12/03/19')).toBe('12/03/19');
  });

  it('limits to 8 digits', () => {
    expect(formatDateInput('150319901234')).toBe('15/03/1990');
  });

  it('handles empty string', () => {
    expect(formatDateInput('')).toBe('');
  });
});

describe('toIsoDate', () => {
  it('converts valid DD/MM/YYYY to ISO', () => {
    const iso = toIsoDate('15/03/1990');
    expect(iso).toBeDefined();
    const d = new Date(iso!);
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCMonth()).toBe(2); // March = 2
    expect(d.getUTCFullYear()).toBe(1990);
  });

  it('rejects incomplete date', () => {
    expect(toIsoDate('15/03')).toBeUndefined();
    expect(toIsoDate('15/03/19')).toBeUndefined();
  });

  it('rejects invalid month > 12', () => {
    expect(toIsoDate('15/13/1990')).toBeUndefined();
  });

  it('rejects invalid day > 31', () => {
    expect(toIsoDate('32/01/1990')).toBeUndefined();
  });

  it('rejects Feb 31 (invalid day for month)', () => {
    expect(toIsoDate('31/02/2000')).toBeUndefined();
  });

  it('rejects Feb 29 on non-leap year', () => {
    expect(toIsoDate('29/02/2001')).toBeUndefined();
  });

  it('accepts Feb 29 on leap year', () => {
    const iso = toIsoDate('29/02/2000');
    expect(iso).toBeDefined();
  });

  it('rejects future dates', () => {
    expect(toIsoDate('01/01/2099')).toBeUndefined();
  });

  it('rejects empty string sections', () => {
    expect(toIsoDate('')).toBeUndefined();
    expect(toIsoDate('//1990')).toBeUndefined();
  });
});

describe('isoDtoDmy', () => {
  it('converts ISO to DD/MM/YYYY', () => {
    expect(isoDtoDmy('1990-03-15T00:00:00.000Z')).toBe('15/03/1990');
  });

  it('returns empty string for null', () => {
    expect(isoDtoDmy(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(isoDtoDmy(undefined)).toBe('');
  });

  it('returns empty string for invalid ISO', () => {
    expect(isoDtoDmy('not-a-date')).toBe('');
  });
});
