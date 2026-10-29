import {
  Bath, BedDouble, Beef, BookOpen, Brush, CakeSlice, Car, Coffee, Croissant, Dumbbell, Flower2, Gamepad2, Gem,
  Glasses, Hammer, Hamburger, HandPlatter, KeyRound, Laptop, PawPrint, Pill, Scissors, Shirt, ShoppingBasket,
  ShoppingCart, Smartphone, SprayCan, Store, UtensilsCrossed, type LucideIcon,
} from 'lucide-react-native';
import { MerchantCategory } from '@/types';
import i18n from '@/i18n';

export const CATEGORY_ICONS: Record<MerchantCategory, LucideIcon> = {
  CAFE: Coffee,
  RESTAURANT: UtensilsCrossed,
  EPICERIE: ShoppingBasket,
  BOULANGERIE: Croissant,
  PHARMACIE: Pill,
  LIBRAIRIE: BookOpen,
  VETEMENTS: Shirt,
  ELECTRONIQUE: Laptop,
  COIFFURE: Scissors,
  BEAUTE: Brush,
  SPORT: Dumbbell,
  SUPERMARCHE: ShoppingCart,
  BOUCHERIE: Beef,
  PATISSERIE: CakeSlice,
  FASTFOOD: Hamburger,
  HAMMAM: Bath,
  ANIMALERIE: PawPrint,
  FLEURISTE: Flower2,
  BIJOUTERIE: Gem,
  OPTIQUE: Glasses,
  TELEPHONE: Smartphone,
  BRICOLAGE: Hammer,
  AUTO: Car,
  HOTEL: BedDouble,
  PARFUMERIE: SprayCan,
  TRAITEUR: HandPlatter,
  LOCATION_VOITURE: KeyRound,
  SALLE_JEU: Gamepad2,
  AUTRE: Store,
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
