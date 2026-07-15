// ── Shared types — single source of truth for all JitPlus apps ──────────────
// These enums and interfaces mirror the Prisma schema and are used across
// jitplus (client), jitpluspro (merchant), and admin apps.

// ── Enums (must match Prisma schema exactly) ────────────────────────────────

export enum MerchantCategory {
  CAFE = 'CAFE',
  RESTAURANT = 'RESTAURANT',
  EPICERIE = 'EPICERIE',
  BOULANGERIE = 'BOULANGERIE',
  PHARMACIE = 'PHARMACIE',
  LIBRAIRIE = 'LIBRAIRIE',
  VETEMENTS = 'VETEMENTS',
  ELECTRONIQUE = 'ELECTRONIQUE',
  COIFFURE = 'COIFFURE',
  BEAUTE = 'BEAUTE',
  SPORT = 'SPORT',
  SUPERMARCHE = 'SUPERMARCHE',
  BOUCHERIE = 'BOUCHERIE',
  PATISSERIE = 'PATISSERIE',
  FASTFOOD = 'FASTFOOD',
  HAMMAM = 'HAMMAM',
  ANIMALERIE = 'ANIMALERIE',
  FLEURISTE = 'FLEURISTE',
  BIJOUTERIE = 'BIJOUTERIE',
  OPTIQUE = 'OPTIQUE',
  TELEPHONE = 'TELEPHONE',
  BRICOLAGE = 'BRICOLAGE',
  AUTO = 'AUTO',
  HOTEL = 'HOTEL',
  PARFUMERIE = 'PARFUMERIE',
  TRAITEUR = 'TRAITEUR',
  LOCATION_VOITURE = 'LOCATION_VOITURE',
  SALLE_JEU = 'SALLE_JEU',
  AUTRE = 'AUTRE',
}

export type LoyaltyType = 'POINTS' | 'STAMPS';

export type MerchantPlan = 'FREE' | 'PREMIUM';

// ── Common interfaces ───────────────────────────────────────────────────────

export interface SocialLinks {
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  website?: string;
  snapchat?: string;
  youtube?: string;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── Merchant personalization ────────────────────────────────────────────────

/** Day-of-week → opening hours. Each day can be closed (null) or list time ranges. */
export interface OpeningHoursDay {
  /** If true, the merchant is closed all day (overrides slots). */
  closed?: boolean;
  /** Time slots in "HH:mm" 24h format. Usually 1 slot; 2 for split lunch break. */
  slots?: Array<{ open: string; close: string }>;
}

export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type OpeningHours = Partial<Record<WeekDay, OpeningHoursDay>>;

/** Canonical badge codes a merchant can advertise. UI labels are i18n keys. */
export const MERCHANT_BADGE_CODES = [
  'WIFI',
  'PARKING',
  'TERRASSE',
  'CLIMATISE',
  'CARTE_BANCAIRE',
  'LIVRAISON',
  'TAKEAWAY',
  'HALAL',
  'VEGETARIEN',
  'ACCESS_PMR',
  'PETS_OK',
  'KID_FRIENDLY',
  'RESERVATION',
] as const;

export type MerchantBadge = (typeof MERCHANT_BADGE_CODES)[number];
