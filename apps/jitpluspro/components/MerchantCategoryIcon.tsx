import React from 'react';
import { 
  Coffee, 
  Utensils, 
  ShoppingBasket,
  Cake,
  Pill,
  Book,
  Shirt,
  Laptop,
  Store,
  Scissors,
  Sparkles,
  Dumbbell,
  Building2,
  type LucideIcon
} from 'lucide-react-native';
import { MerchantCategory } from '@/types';
import { getCategoryLabel, getCategoryOptions } from '@/constants/categories';
import i18n from '@/i18n';

interface MerchantCategoryIconProps {
  category: MerchantCategory;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

// Mapping des catégories aux icônes Lucide
const categoryIconMap: Record<MerchantCategory, LucideIcon> = {
  [MerchantCategory.CAFE]: Coffee,
  [MerchantCategory.RESTAURANT]: Utensils,
  [MerchantCategory.EPICERIE]: ShoppingBasket,
  [MerchantCategory.BOULANGERIE]: Cake,
  [MerchantCategory.PHARMACIE]: Pill,
  [MerchantCategory.LIBRAIRIE]: Book,
  [MerchantCategory.VETEMENTS]: Shirt,
  [MerchantCategory.ELECTRONIQUE]: Laptop,
  [MerchantCategory.COIFFURE]: Scissors,
  [MerchantCategory.BEAUTE]: Sparkles,
  [MerchantCategory.SPORT]: Dumbbell,
  [MerchantCategory.SUPERMARCHE]: Building2,
  [MerchantCategory.AUTRE]: Store,
};

/**
 * Composant qui affiche une icône dynamique selon la catégorie du commerce
 * 
 * @param category - Catégorie du merchant (enum MerchantCategory)
 * @param size - Taille de l'icône en pixels (défaut: 24)
 * @param color - Couleur de l'icône (défaut: '#7C3AED')
 * @param strokeWidth - Épaisseur du trait (défaut: 1.5)
 * 
 * @example
 * <MerchantCategoryIcon 
 *   category={MerchantCategory.CAFE} 
 *   size={48} 
 *   color="#7C3AED" 
 * />
 */
export default function MerchantCategoryIcon({
  category,
  size = 24,
  color = '#7C3AED',
  strokeWidth = 1.5,
}: MerchantCategoryIconProps) {
  // Récupérer l'icône correspondante ou utiliser Store par défaut
  const IconComponent = categoryIconMap[category] || Store;

  return (
    <IconComponent 
      size={size} 
      color={color} 
      strokeWidth={strokeWidth}
    />
  );
}

/**
 * Hook helper pour obtenir les métadonnées d'une catégorie
 */
export function useCategoryMetadata(category?: MerchantCategory) {
  if (!category) {
    return { label: '', description: '', IconComponent: Store };
  }

  return {
    label: getCategoryLabel(category),
    description: i18n.t(`categoryDesc.${category}`, { defaultValue: '' }),
    IconComponent: categoryIconMap[category] || Store,
  };
}

/** Flat list of categories for picker UIs (re-exported from constants) */
export const CATEGORY_OPTIONS = getCategoryOptions();
