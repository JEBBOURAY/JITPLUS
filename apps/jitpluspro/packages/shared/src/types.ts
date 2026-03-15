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
