import { MerchantCategory } from '@/types';

/**
 * Single source of truth for category display labels and emojis.
 * Import this instead of defining CATEGORY_LABELS locally.
 */
export const CATEGORY_LABELS: Record<MerchantCategory, { label: string; emoji: string }> = {
  CAFE:         { label: 'Café',          emoji: '☕' },
  RESTAURANT:   { label: 'Restaurant',    emoji: '🍽️' },
  EPICERIE:     { label: 'Épicerie',      emoji: '🛒' },
  BOULANGERIE:  { label: 'Boulangerie',   emoji: '🥖' },
  PHARMACIE:    { label: 'Pharmacie',     emoji: '💊' },
  LIBRAIRIE:    { label: 'Librairie',     emoji: '📚' },
  VETEMENTS:    { label: 'Mode',          emoji: '👗' },
  ELECTRONIQUE: { label: 'Électronique',  emoji: '📱' },
  COIFFURE:     { label: 'Coiffure',      emoji: '💇' },
  BEAUTE:       { label: 'Beauté',        emoji: '💄' },
  SPORT:        { label: 'Sport',         emoji: '⚽' },
  SUPERMARCHE:  { label: 'Supermarché',   emoji: '🏪' },
  AUTRE:        { label: 'Autre',         emoji: '🏷️' },
};

/** Flat list of categories for picker UIs */
export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, { label }]) => ({
  value: value as MerchantCategory,
  label,
}));

/** Get category label string */
export function getCategoryLabel(category: MerchantCategory): string {
  return CATEGORY_LABELS[category]?.label ?? category;
}
