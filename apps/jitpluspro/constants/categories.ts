import { MerchantCategory } from '@/types';
import i18n from '@/i18n';

/**
 * Emoji mapping per category (language-independent).
 */
export const CATEGORY_EMOJIS: Record<MerchantCategory, string> = {
  CAFE:         '☕',
  RESTAURANT:   '🍽️',
  EPICERIE:     '🛒',
  BOULANGERIE:  '🥖',
  PHARMACIE:    '💊',
  LIBRAIRIE:    '📚',
  VETEMENTS:    '👗',
  ELECTRONIQUE: '📱',
  COIFFURE:     '💇',
  BEAUTE:       '💄',
  SPORT:        '⚽',
  SUPERMARCHE:  '🏪',
  AUTRE:        '🏷️',
};

/** Get translated category label */
export function getCategoryLabel(category: MerchantCategory): string {
  return i18n.t(`categoryNames.${category}`, { defaultValue: category });
}

/** Get category label + emoji (reactive to language changes) */
export function getCategoryMeta(category: MerchantCategory): { label: string; emoji: string } {
  return {
    label: getCategoryLabel(category),
    emoji: CATEGORY_EMOJIS[category] ?? '🏷️',
  };
}

/**
 * @deprecated Use getCategoryMeta() for translated labels.
 * Kept for backward compat — returns French labels statically.
 */
export const CATEGORY_LABELS: Record<MerchantCategory, { label: string; emoji: string }> = Object.fromEntries(
  Object.values(MerchantCategory).map((cat) => [
    cat,
    { label: i18n.t(`categoryNames.${cat}`, { defaultValue: cat }), emoji: CATEGORY_EMOJIS[cat] ?? '🏷️' },
  ]),
) as Record<MerchantCategory, { label: string; emoji: string }>;

/** Flat list of categories for picker UIs */
export function getCategoryOptions(): { value: MerchantCategory; label: string }[] {
  return Object.values(MerchantCategory).map((cat) => ({
    value: cat,
    label: getCategoryLabel(cat),
  }));
}

/** @deprecated Use getCategoryOptions() for translated labels */
export const CATEGORY_OPTIONS = getCategoryOptions();
