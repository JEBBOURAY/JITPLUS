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
  BOUCHERIE:    '🥩',
  PATISSERIE:   '🍰',
  FASTFOOD:     '🍔',
  HAMMAM:       '🧖',
  ANIMALERIE:   '🐾',
  FLEURISTE:    '💐',
  BIJOUTERIE:   '💍',
  OPTIQUE:      '👓',
  TELEPHONE:    '📱',
  BRICOLAGE:    '🔧',
  AUTO:         '🚗',
  HOTEL:        '🏨',
  PARFUMERIE:   '🌸',
  TRAITEUR:     '🍱',
  LOCATION_VOITURE: '🚙',
  SALLE_JEU:    '🎮',
  AUTRE:        '🏷️',
};

/** Get translated category label */
export function getCategoryLabel(category: MerchantCategory): string {
  return i18n.t(`categoryNames.${category}`, { defaultValue: category });
}

/** Flat list of categories for picker UIs */
export function getCategoryOptions(): { value: MerchantCategory; label: string }[] {
  return Object.values(MerchantCategory).map((cat) => ({
    value: cat,
    label: getCategoryLabel(cat),
  }));
}
