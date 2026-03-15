/** Principales villes du Maroc — utilisé dans register et edit-profile */
export const VILLES = [
  'Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger',
  'Agadir', 'Meknès', 'Oujda', 'Kénitra', 'Tétouan',
  'Salé', 'Nador', 'Mohammedia', 'El Jadida', 'Béni Mellal',
  'Taza', 'Khouribga', 'Settat', 'Laâyoune', 'Berrechid',
] as const;

export type Ville = (typeof VILLES)[number];
