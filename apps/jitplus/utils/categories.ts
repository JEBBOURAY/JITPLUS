import {
  Sparkles, Coffee, Utensils, Store, Croissant, Pill, BookOpen,
  Shirt, Cpu, Scissors, Heart, Dumbbell, ShoppingBag, MoreHorizontal,
  Beef, Cake, Sandwich, Droplets, PawPrint, Flower2, Gem, Glasses,
  Smartphone, Wrench, Car, BedDouble, SprayCan, ChefHat, CarFront, Gamepad2,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

/** Shared category filter list used by Cartes (index) and Discover pages.
 *  Labels are resolved at call-time so they respect the current locale. */
export const CATEGORIES: { id: string; labelKey: string; icon: LucideIcon }[] = [
  { id: 'all', labelKey: 'categories.all', icon: Sparkles },
  { id: 'CAFE', labelKey: 'categories.CAFE', icon: Coffee },
  { id: 'RESTAURANT', labelKey: 'categories.RESTAURANT', icon: Utensils },
  { id: 'EPICERIE', labelKey: 'categories.EPICERIE', icon: Store },
  { id: 'BOULANGERIE', labelKey: 'categories.BOULANGERIE', icon: Croissant },
  { id: 'PHARMACIE', labelKey: 'categories.PHARMACIE', icon: Pill },
  { id: 'LIBRAIRIE', labelKey: 'categories.LIBRAIRIE', icon: BookOpen },
  { id: 'VETEMENTS', labelKey: 'categories.VETEMENTS', icon: Shirt },
  { id: 'ELECTRONIQUE', labelKey: 'categories.ELECTRONIQUE', icon: Cpu },
  { id: 'COIFFURE', labelKey: 'categories.COIFFURE', icon: Scissors },
  { id: 'BEAUTE', labelKey: 'categories.BEAUTE', icon: Heart },
  { id: 'SPORT', labelKey: 'categories.SPORT', icon: Dumbbell },
  { id: 'SUPERMARCHE', labelKey: 'categories.SUPERMARCHE', icon: ShoppingBag },
  { id: 'BOUCHERIE', labelKey: 'categories.BOUCHERIE', icon: Beef },
  { id: 'PATISSERIE', labelKey: 'categories.PATISSERIE', icon: Cake },
  { id: 'FASTFOOD', labelKey: 'categories.FASTFOOD', icon: Sandwich },
  { id: 'HAMMAM', labelKey: 'categories.HAMMAM', icon: Droplets },
  { id: 'ANIMALERIE', labelKey: 'categories.ANIMALERIE', icon: PawPrint },
  { id: 'FLEURISTE', labelKey: 'categories.FLEURISTE', icon: Flower2 },
  { id: 'BIJOUTERIE', labelKey: 'categories.BIJOUTERIE', icon: Gem },
  { id: 'OPTIQUE', labelKey: 'categories.OPTIQUE', icon: Glasses },
  { id: 'TELEPHONE', labelKey: 'categories.TELEPHONE', icon: Smartphone },
  { id: 'BRICOLAGE', labelKey: 'categories.BRICOLAGE', icon: Wrench },
  { id: 'AUTO', labelKey: 'categories.AUTO', icon: Car },
  { id: 'HOTEL', labelKey: 'categories.HOTEL', icon: BedDouble },
  { id: 'PARFUMERIE', labelKey: 'categories.PARFUMERIE', icon: SprayCan },
  { id: 'TRAITEUR', labelKey: 'categories.TRAITEUR', icon: ChefHat },
  { id: 'LOCATION_VOITURE', labelKey: 'categories.LOCATION_VOITURE', icon: CarFront },
  { id: 'SALLE_JEU', labelKey: 'categories.SALLE_JEU', icon: Gamepad2 },
  { id: 'AUTRE', labelKey: 'categories.AUTRE', icon: MoreHorizontal },
];

/**
 * Shared category emoji mapping used across the app.
 */
export const CATEGORY_EMOJI: Record<string, string> = {
  CAFE: '☕',
  RESTAURANT: '🍽️',
  EPICERIE: '🛒',
  BOULANGERIE: '🥖',
  PHARMACIE: '💊',
  LIBRAIRIE: '📚',
  VETEMENTS: '👗',
  ELECTRONIQUE: '📱',
  COIFFURE: '💇',
  BEAUTE: '💄',
  SPORT: '⚽',
  SUPERMARCHE: '🏪',
  BOUCHERIE: '🥩',
  PATISSERIE: '🍰',
  FASTFOOD: '🍔',
  HAMMAM: '🧖',
  ANIMALERIE: '🐾',
  FLEURISTE: '💐',
  BIJOUTERIE: '💍',
  OPTIQUE: '👓',
  TELEPHONE: '📱',
  BRICOLAGE: '🔧',
  AUTO: '🚗',
  HOTEL: '🏨',
  PARFUMERIE: '🌸',
  TRAITEUR: '🍱',
  LOCATION_VOITURE: '🚙',
  SALLE_JEU: '🎮',
  AUTRE: '🏷️',
};

/** Fuzzy keyword → emoji lookup used when exact key match fails. */
const FUZZY_EMOJI: [string[], string][] = [
  [['café', 'coffee', 'cafe'], '☕'],
  [['restaurant', 'food', 'cuisine'], '🍽️'],
  [['beauty', 'beauté', 'coiffure'], '💇'],
  [['sport', 'fitness', 'gym'], '🏋️'],
  [['pharma', 'santé', 'health'], '💊'],
  [['shop', 'mode', 'vêtement'], '👗'],
  [['supermarché', 'épicerie'], '🛒'],
  [['boulangerie'], '🥖'],
  [['librairie'], '📚'],
  [['electronique', 'tech'], '📱'],
];

/**
 * Get a category emoji by matching category string (case-insensitive fuzzy match).
 * Falls back to '🏪' if no match found.
 */
export function getCategoryEmoji(category: string | undefined): string {
  if (!category) return '🏪';

  // Try exact key match first
  const upper = category.toUpperCase();
  if (CATEGORY_EMOJI[upper]) return CATEGORY_EMOJI[upper];

  // Fuzzy match on lowercase
  const c = category.toLowerCase();
  for (const [keywords, emoji] of FUZZY_EMOJI) {
    if (keywords.some((kw) => c.includes(kw))) return emoji;
  }
  return '🏪';
}
