import { isInternalErrorMessage, normalizeSearch, sanitizeErrorMessage } from '@jitplus/shared';
import { searchMoroccoCities } from '@/utils/dealAlerts';

describe('normalizeSearch', () => {
  it('folds case, French accents and spaces', () => {
    expect(normalizeSearch('  Pâtisserie Café ')).toBe('patisserie cafe');
  });

  it('strips Arabic vowel marks (harakat)', () => {
    expect(normalizeSearch('مَقْهَى')).toBe('مقهى');
  });

  it('is used by the deal-alert city search', () => {
    expect(searchMoroccoCities('fès').map((c) => c.key)).toContain('fes');
  });
});

describe('internal error messages', () => {
  it('flags stack traces, SQL, sockets and source paths', () => {
    expect(isInternalErrorMessage('TypeError: x is undefined')).toBe(true);
    expect(isInternalErrorMessage('SELECT * FROM client')).toBe(true);
    expect(isInternalErrorMessage('connect ECONNREFUSED 10.0.0.1')).toBe(true);
    expect(isInternalErrorMessage('listen on port 5432')).toBe(true);
    expect(isInternalErrorMessage('failed in /dist/main.js')).toBe(true);
  });

  it('keeps the translated server messages', () => {
    expect(isInternalErrorMessage('Code incorrect, réessayez')).toBe(false);
    expect(isInternalErrorMessage('Importez jusqu’à 2000 clients')).toBe(false);
    expect(sanitizeErrorMessage('Code incorrect', 'fallback')).toBe('Code incorrect');
    expect(sanitizeErrorMessage('connect ECONNREFUSED 10.0.0.1:3000', 'fallback')).toBe('fallback');
  });
});
