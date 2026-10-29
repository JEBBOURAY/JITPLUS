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

  it('uses %{var} interpolation only', () => {
    expect(Object.entries(strings).filter(([, value]) => /\{\{[^}]+\}\}/.test(value))).toEqual([]);
  });

  it('has the deal alert copy', () => {
    for (const key of [
      'deals.alerts.title', 'deals.alerts.privacy', 'deals.alerts.frequency', 'deals.alerts.needsCity',
      'deals.alerts.card.title', 'deals.alerts.status.off', 'deals.notification.sender',
    ]) {
      expect(strings[key]?.trim()).toBeTruthy();
    }
    expect(placeholders(strings['deals.alerts.card.title'])).toEqual(['%{city}']);
  });
});
