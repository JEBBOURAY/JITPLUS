import fr from '@/i18n/locales/fr';
import en from '@/i18n/locales/en';
import ar from '@/i18n/locales/ar';

function flatten(object: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(object).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [[path, value]] : Object.entries(flatten(value, path));
  }));
}

const reference = flatten(fr);
const placeholders = (value: string) => [...new Set(value.match(/%\{[^}]+\}/g) ?? [])].sort();

describe.each([['fr', fr], ['en', en], ['ar', ar]] as const)('%s translations', (_locale, translations) => {
  const strings = flatten(translations);

  it('has the same keys in every language', () => {
    expect(Object.keys(strings).sort()).toEqual(Object.keys(reference).sort());
  });

  it('keeps every interpolation parameter', () => {
    for (const [key, value] of Object.entries(strings)) {
      expect({ key, params: placeholders(value) }).toEqual({ key, params: placeholders(reference[key]) });
    }
  });

  it('uses Pro consistently in visible copy', () => {
    expect(Object.values(strings).filter((value) => /\b(Premium|Dashboard)\b/i.test(value))).toEqual([]);
  });

  it('has no emojis outside the shared games translations', () => {
    expect(Object.entries(strings).filter(([key, value]) =>
      !key.startsWith('scratch.') && !key.startsWith('luckyWheel.') && /\p{Extended_Pictographic}/u.test(value),
    )).toEqual([]);
  });
});
