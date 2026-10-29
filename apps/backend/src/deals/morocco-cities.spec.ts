import { cityKeyFromText, nearestCityKey, resolveCityKey } from './morocco-cities';

describe('cityKeyFromText', () => {
  it.each([
    ['Casablanca', 'casablanca'],
    ['casa', 'casablanca'],
    ['  CASABLANCA  ', 'casablanca'],
    ['Fès', 'fes'],
    ['Fez', 'fes'],
    ['Marrakesh', 'marrakech'],
    ['الدار البيضاء', 'casablanca'],
    ['Hay Riad, Rabat', 'rabat'],
    ['Casablanca - Maarif', 'casablanca'],
    ['El Jadida', 'el_jadida'],
    ['Béni Mellal', 'beni_mellal'],
  ])('%s → %s', (input, key) => {
    expect(cityKeyFromText(input)).toBe(key);
  });

  it('returns null for unknown text', () => {
    expect(cityKeyFromText('Atlantis')).toBeNull();
    expect(cityKeyFromText('')).toBeNull();
    expect(cityKeyFromText(null)).toBeNull();
  });
});

describe('resolveCityKey', () => {
  it('prefers a GPS position close to a city centre over the typed city', () => {
    // Mohammedia centre, typed as "Casablanca"
    expect(resolveCityKey('Casablanca', 33.6866, -7.383)).toBe('mohammedia');
  });

  it('falls back to the typed city without GPS', () => {
    expect(resolveCityKey('Tanger', null, null)).toBe('tanger');
  });

  it('uses the closest centre further away when the text is unknown', () => {
    // ~30 km south of Agadir
    expect(resolveCityKey('Douar X', 30.15, -9.55)).not.toBeNull();
  });

  it('returns null far from any city', () => {
    expect(nearestCityKey(48.85, 2.35)).toBeNull();
    expect(resolveCityKey(null, 48.85, 2.35)).toBeNull();
  });
});
