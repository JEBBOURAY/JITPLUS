// Same cities as packages/shared/src/deals/cities.ts (the backend does not
// import the shared package), plus spelling aliases used to read the free-text
// `ville` of a store. deal-enums.spec.ts checks that both copies match.

export interface MoroccoCity {
  key: string;
  fr: string;
  en: string;
  ar: string;
  lat: number;
  lng: number;
  aliases: string[];
}

export const MOROCCO_CITIES: readonly MoroccoCity[] = [
  { key: 'casablanca', fr: 'Casablanca', en: 'Casablanca', ar: 'الدار البيضاء', lat: 33.5731, lng: -7.5898, aliases: ['casa', 'dar el beida', 'dar el baida', 'dar beida', 'anfa', 'ain sebaa', 'sidi maarouf', 'bouskoura', 'dar bouazza', 'الدارالبيضاء', 'كازا'] },
  { key: 'rabat', fr: 'Rabat', en: 'Rabat', ar: 'الرباط', lat: 34.0209, lng: -6.8416, aliases: ['agdal', 'hay riad'] },
  { key: 'marrakech', fr: 'Marrakech', en: 'Marrakesh', ar: 'مراكش', lat: 31.6295, lng: -7.9811, aliases: ['marrakesh', 'marakech', 'gueliz'] },
  { key: 'fes', fr: 'Fès', en: 'Fez', ar: 'فاس', lat: 34.0181, lng: -5.0078, aliases: ['fez', 'fes'] },
  { key: 'tanger', fr: 'Tanger', en: 'Tangier', ar: 'طنجة', lat: 35.7595, lng: -5.834, aliases: ['tangier', 'tangiers', 'tanja'] },
  { key: 'agadir', fr: 'Agadir', en: 'Agadir', ar: 'أكادير', lat: 30.4278, lng: -9.5981, aliases: ['akadir', 'اكادير'] },
  { key: 'meknes', fr: 'Meknès', en: 'Meknes', ar: 'مكناس', lat: 33.8935, lng: -5.5473, aliases: ['meknes', 'miknas'] },
  { key: 'oujda', fr: 'Oujda', en: 'Oujda', ar: 'وجدة', lat: 34.6814, lng: -1.9086, aliases: [] },
  { key: 'kenitra', fr: 'Kénitra', en: 'Kenitra', ar: 'القنيطرة', lat: 34.261, lng: -6.5802, aliases: ['knitra'] },
  { key: 'tetouan', fr: 'Tétouan', en: 'Tetouan', ar: 'تطوان', lat: 35.5889, lng: -5.3626, aliases: ['tetuan', 'martil', 'mdiq'] },
  { key: 'sale', fr: 'Salé', en: 'Sale', ar: 'سلا', lat: 34.0531, lng: -6.7985, aliases: ['sala'] },
  { key: 'temara', fr: 'Témara', en: 'Temara', ar: 'تمارة', lat: 33.9287, lng: -6.9066, aliases: ['harhoura'] },
  { key: 'mohammedia', fr: 'Mohammedia', en: 'Mohammedia', ar: 'المحمدية', lat: 33.6866, lng: -7.383, aliases: ['fedala'] },
  { key: 'el_jadida', fr: 'El Jadida', en: 'El Jadida', ar: 'الجديدة', lat: 33.2316, lng: -8.5007, aliases: ['jadida', 'eljadida'] },
  { key: 'safi', fr: 'Safi', en: 'Safi', ar: 'آسفي', lat: 32.2994, lng: -9.2372, aliases: ['asfi', 'اسفي'] },
  { key: 'beni_mellal', fr: 'Béni Mellal', en: 'Beni Mellal', ar: 'بني ملال', lat: 32.3394, lng: -6.3608, aliases: ['beni mellal', 'benimellal'] },
  { key: 'khouribga', fr: 'Khouribga', en: 'Khouribga', ar: 'خريبكة', lat: 32.8811, lng: -6.9063, aliases: [] },
  { key: 'settat', fr: 'Settat', en: 'Settat', ar: 'سطات', lat: 33.001, lng: -7.6166, aliases: [] },
  { key: 'berrechid', fr: 'Berrechid', en: 'Berrechid', ar: 'برشيد', lat: 33.2655, lng: -7.5875, aliases: [] },
  { key: 'nador', fr: 'Nador', en: 'Nador', ar: 'الناظور', lat: 35.1681, lng: -2.9335, aliases: [] },
  { key: 'inezgane', fr: 'Inezgane', en: 'Inezgane', ar: 'إنزكان', lat: 30.3555, lng: -9.5375, aliases: ['ait melloul', 'انزكان'] },
  { key: 'essaouira', fr: 'Essaouira', en: 'Essaouira', ar: 'الصويرة', lat: 31.5085, lng: -9.7595, aliases: ['mogador'] },
  { key: 'ouarzazate', fr: 'Ouarzazate', en: 'Ouarzazate', ar: 'ورزازات', lat: 30.9189, lng: -6.8934, aliases: [] },
  { key: 'errachidia', fr: 'Errachidia', en: 'Errachidia', ar: 'الرشيدية', lat: 31.9314, lng: -4.4246, aliases: ['rachidia'] },
  { key: 'laayoune', fr: 'Laâyoune', en: 'Laayoune', ar: 'العيون', lat: 27.1253, lng: -13.1625, aliases: ['layoune', 'el aaiun'] },
  { key: 'dakhla', fr: 'Dakhla', en: 'Dakhla', ar: 'الداخلة', lat: 23.6848, lng: -15.958, aliases: [] },
  { key: 'guelmim', fr: 'Guelmim', en: 'Guelmim', ar: 'كلميم', lat: 28.987, lng: -10.0574, aliases: ['goulimine'] },
  { key: 'tiznit', fr: 'Tiznit', en: 'Tiznit', ar: 'تيزنيت', lat: 29.6974, lng: -9.7316, aliases: [] },
  { key: 'taroudant', fr: 'Taroudant', en: 'Taroudant', ar: 'تارودانت', lat: 30.4703, lng: -8.877, aliases: [] },
  { key: 'taza', fr: 'Taza', en: 'Taza', ar: 'تازة', lat: 34.21, lng: -4.01, aliases: [] },
  { key: 'al_hoceima', fr: 'Al Hoceïma', en: 'Al Hoceima', ar: 'الحسيمة', lat: 35.2517, lng: -3.9372, aliases: ['al hoceima', 'alhoceima', 'hoceima'] },
  { key: 'larache', fr: 'Larache', en: 'Larache', ar: 'العرائش', lat: 35.1932, lng: -6.1557, aliases: [] },
  { key: 'ksar_el_kebir', fr: 'Ksar El Kébir', en: 'Ksar El Kebir', ar: 'القصر الكبير', lat: 35.0017, lng: -5.9097, aliases: ['ksar el kebir', 'ksar kebir'] },
  { key: 'khemisset', fr: 'Khémisset', en: 'Khemisset', ar: 'الخميسات', lat: 33.8241, lng: -6.0663, aliases: [] },
  { key: 'berkane', fr: 'Berkane', en: 'Berkane', ar: 'بركان', lat: 34.92, lng: -2.32, aliases: ['saidia'] },
  { key: 'ifrane', fr: 'Ifrane', en: 'Ifrane', ar: 'إفران', lat: 33.5228, lng: -5.1106, aliases: ['azrou'] },
  { key: 'chefchaouen', fr: 'Chefchaouen', en: 'Chefchaouen', ar: 'شفشاون', lat: 35.1688, lng: -5.2636, aliases: ['chaouen'] },
  { key: 'khenifra', fr: 'Khénifra', en: 'Khenifra', ar: 'خنيفرة', lat: 32.9394, lng: -5.6675, aliases: [] },
  { key: 'sidi_kacem', fr: 'Sidi Kacem', en: 'Sidi Kacem', ar: 'سيدي قاسم', lat: 34.226, lng: -5.7071, aliases: [] },
  { key: 'sidi_slimane', fr: 'Sidi Slimane', en: 'Sidi Slimane', ar: 'سيدي سليمان', lat: 34.2654, lng: -5.9254, aliases: [] },
  { key: 'benslimane', fr: 'Benslimane', en: 'Benslimane', ar: 'بنسليمان', lat: 33.6122, lng: -7.1211, aliases: ['ben slimane'] },
  { key: 'skhirat', fr: 'Skhirat', en: 'Skhirat', ar: 'الصخيرات', lat: 33.853, lng: -7.031, aliases: [] },
];

export const MOROCCO_CITY_KEYS: ReadonlySet<string> = new Set(MOROCCO_CITIES.map((c) => c.key));

const BY_KEY = new Map(MOROCCO_CITIES.map((c) => [c.key, c]));

export function moroccoCityLabel(key: string | null | undefined, lang: string = 'fr'): string {
  const city = key ? BY_KEY.get(key) : undefined;
  if (!city) return '';
  return lang === 'ar' ? city.ar : lang === 'en' ? city.en : city.fr;
}

/** A store this close to a city centre belongs to it, whatever its `ville` says. */
const GPS_MATCH_KM = 25;
/** Fallback when the typed city is unknown. */
const GPS_FALLBACK_KM = 40;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export function nearestCityKey(lat: number, lng: number, maxKm = GPS_FALLBACK_KM): string | null {
  let best: string | null = null;
  let bestKm = maxKm;
  for (const city of MOROCCO_CITIES) {
    const km = haversineKm(lat, lng, city.lat, city.lng);
    if (km <= bestKm) {
      best = city.key;
      bestKm = km;
    }
  }
  return best;
}

function normalizeCityText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\u0600-\u06ff]+/g, ' ')
    .trim();
}

const BY_NAME = new Map<string, string>();
for (const city of MOROCCO_CITIES) {
  for (const name of [city.key.replace(/_/g, ' '), city.fr, city.en, city.ar, ...city.aliases]) {
    BY_NAME.set(normalizeCityText(name), city.key);
  }
}

export function cityKeyFromText(ville: string | null | undefined): string | null {
  if (!ville) return null;
  const text = normalizeCityText(ville);
  if (!text) return null;
  const exact = BY_NAME.get(text);
  if (exact) return exact;
  // "Casablanca - Maarif", "Hay Riad, Rabat": look for a known name among the words.
  const words = text.split(' ');
  for (let size = Math.min(3, words.length); size >= 1; size--) {
    for (let i = 0; i + size <= words.length; i++) {
      const key = BY_NAME.get(words.slice(i, i + size).join(' '));
      if (key) return key;
    }
  }
  return null;
}

/**
 * City of a store: the GPS position wins when it is close to a city centre
 * (the typed `ville` is free text), then the typed name, then the closest
 * centre further away.
 */
export function resolveCityKey(
  ville: string | null | undefined,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | null {
  const hasGps = latitude != null && longitude != null;
  if (hasGps) {
    const near = nearestCityKey(latitude, longitude, GPS_MATCH_KM);
    if (near) return near;
  }
  return cityKeyFromText(ville) ?? (hasGps ? nearestCityKey(latitude, longitude) : null);
}
