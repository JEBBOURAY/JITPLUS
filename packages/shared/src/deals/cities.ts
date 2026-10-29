// ── Normalised list of Moroccan cities used by the deals ("bons plans") ──────
// Keys are stored in the database (deals.city_keys, clients.deal_alert_city_key):
// never rename one. The backend keeps a copy with spelling aliases
// (apps/backend/src/deals/morocco-cities.ts); deal-enums.spec.ts checks both match.

export interface MoroccoCity {
  key: string;
  fr: string;
  en: string;
  ar: string;
  /** City centre */
  lat: number;
  lng: number;
}

export const MOROCCO_CITIES: readonly MoroccoCity[] = [
  { key: 'casablanca', fr: 'Casablanca', en: 'Casablanca', ar: 'الدار البيضاء', lat: 33.5731, lng: -7.5898 },
  { key: 'rabat', fr: 'Rabat', en: 'Rabat', ar: 'الرباط', lat: 34.0209, lng: -6.8416 },
  { key: 'marrakech', fr: 'Marrakech', en: 'Marrakesh', ar: 'مراكش', lat: 31.6295, lng: -7.9811 },
  { key: 'fes', fr: 'Fès', en: 'Fez', ar: 'فاس', lat: 34.0181, lng: -5.0078 },
  { key: 'tanger', fr: 'Tanger', en: 'Tangier', ar: 'طنجة', lat: 35.7595, lng: -5.834 },
  { key: 'agadir', fr: 'Agadir', en: 'Agadir', ar: 'أكادير', lat: 30.4278, lng: -9.5981 },
  { key: 'meknes', fr: 'Meknès', en: 'Meknes', ar: 'مكناس', lat: 33.8935, lng: -5.5473 },
  { key: 'oujda', fr: 'Oujda', en: 'Oujda', ar: 'وجدة', lat: 34.6814, lng: -1.9086 },
  { key: 'kenitra', fr: 'Kénitra', en: 'Kenitra', ar: 'القنيطرة', lat: 34.261, lng: -6.5802 },
  { key: 'tetouan', fr: 'Tétouan', en: 'Tetouan', ar: 'تطوان', lat: 35.5889, lng: -5.3626 },
  { key: 'sale', fr: 'Salé', en: 'Sale', ar: 'سلا', lat: 34.0531, lng: -6.7985 },
  { key: 'temara', fr: 'Témara', en: 'Temara', ar: 'تمارة', lat: 33.9287, lng: -6.9066 },
  { key: 'mohammedia', fr: 'Mohammedia', en: 'Mohammedia', ar: 'المحمدية', lat: 33.6866, lng: -7.383 },
  { key: 'el_jadida', fr: 'El Jadida', en: 'El Jadida', ar: 'الجديدة', lat: 33.2316, lng: -8.5007 },
  { key: 'safi', fr: 'Safi', en: 'Safi', ar: 'آسفي', lat: 32.2994, lng: -9.2372 },
  { key: 'beni_mellal', fr: 'Béni Mellal', en: 'Beni Mellal', ar: 'بني ملال', lat: 32.3394, lng: -6.3608 },
  { key: 'khouribga', fr: 'Khouribga', en: 'Khouribga', ar: 'خريبكة', lat: 32.8811, lng: -6.9063 },
  { key: 'settat', fr: 'Settat', en: 'Settat', ar: 'سطات', lat: 33.001, lng: -7.6166 },
  { key: 'berrechid', fr: 'Berrechid', en: 'Berrechid', ar: 'برشيد', lat: 33.2655, lng: -7.5875 },
  { key: 'nador', fr: 'Nador', en: 'Nador', ar: 'الناظور', lat: 35.1681, lng: -2.9335 },
  { key: 'inezgane', fr: 'Inezgane', en: 'Inezgane', ar: 'إنزكان', lat: 30.3555, lng: -9.5375 },
  { key: 'essaouira', fr: 'Essaouira', en: 'Essaouira', ar: 'الصويرة', lat: 31.5085, lng: -9.7595 },
  { key: 'ouarzazate', fr: 'Ouarzazate', en: 'Ouarzazate', ar: 'ورزازات', lat: 30.9189, lng: -6.8934 },
  { key: 'errachidia', fr: 'Errachidia', en: 'Errachidia', ar: 'الرشيدية', lat: 31.9314, lng: -4.4246 },
  { key: 'laayoune', fr: 'Laâyoune', en: 'Laayoune', ar: 'العيون', lat: 27.1253, lng: -13.1625 },
  { key: 'dakhla', fr: 'Dakhla', en: 'Dakhla', ar: 'الداخلة', lat: 23.6848, lng: -15.958 },
  { key: 'guelmim', fr: 'Guelmim', en: 'Guelmim', ar: 'كلميم', lat: 28.987, lng: -10.0574 },
  { key: 'tiznit', fr: 'Tiznit', en: 'Tiznit', ar: 'تيزنيت', lat: 29.6974, lng: -9.7316 },
  { key: 'taroudant', fr: 'Taroudant', en: 'Taroudant', ar: 'تارودانت', lat: 30.4703, lng: -8.877 },
  { key: 'taza', fr: 'Taza', en: 'Taza', ar: 'تازة', lat: 34.21, lng: -4.01 },
  { key: 'al_hoceima', fr: 'Al Hoceïma', en: 'Al Hoceima', ar: 'الحسيمة', lat: 35.2517, lng: -3.9372 },
  { key: 'larache', fr: 'Larache', en: 'Larache', ar: 'العرائش', lat: 35.1932, lng: -6.1557 },
  { key: 'ksar_el_kebir', fr: 'Ksar El Kébir', en: 'Ksar El Kebir', ar: 'القصر الكبير', lat: 35.0017, lng: -5.9097 },
  { key: 'khemisset', fr: 'Khémisset', en: 'Khemisset', ar: 'الخميسات', lat: 33.8241, lng: -6.0663 },
  { key: 'berkane', fr: 'Berkane', en: 'Berkane', ar: 'بركان', lat: 34.92, lng: -2.32 },
  { key: 'ifrane', fr: 'Ifrane', en: 'Ifrane', ar: 'إفران', lat: 33.5228, lng: -5.1106 },
  { key: 'chefchaouen', fr: 'Chefchaouen', en: 'Chefchaouen', ar: 'شفشاون', lat: 35.1688, lng: -5.2636 },
  { key: 'khenifra', fr: 'Khénifra', en: 'Khenifra', ar: 'خنيفرة', lat: 32.9394, lng: -5.6675 },
  { key: 'sidi_kacem', fr: 'Sidi Kacem', en: 'Sidi Kacem', ar: 'سيدي قاسم', lat: 34.226, lng: -5.7071 },
  { key: 'sidi_slimane', fr: 'Sidi Slimane', en: 'Sidi Slimane', ar: 'سيدي سليمان', lat: 34.2654, lng: -5.9254 },
  { key: 'benslimane', fr: 'Benslimane', en: 'Benslimane', ar: 'بنسليمان', lat: 33.6122, lng: -7.1211 },
  { key: 'skhirat', fr: 'Skhirat', en: 'Skhirat', ar: 'الصخيرات', lat: 33.853, lng: -7.031 },
];

const BY_KEY = new Map(MOROCCO_CITIES.map((c) => [c.key, c]));

export function findMoroccoCity(key: string | null | undefined): MoroccoCity | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

export function moroccoCityLabel(key: string | null | undefined, lang: string = 'fr'): string {
  const city = findMoroccoCity(key);
  if (!city) return '';
  return lang === 'ar' ? city.ar : lang === 'en' ? city.en : city.fr;
}

/** Closest city centre within `maxKm` of a position. */
export function nearestMoroccoCity(lat: number, lng: number, maxKm = 40): MoroccoCity | undefined {
  let best: MoroccoCity | undefined;
  let bestKm = maxKm;
  for (const city of MOROCCO_CITIES) {
    const km = haversineKm(lat, lng, city.lat, city.lng);
    if (km <= bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return best;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
