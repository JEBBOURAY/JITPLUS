import type { ComponentType } from 'react';
import {
  Store, Coffee, UtensilsCrossed, Pizza, IceCream, Cake, Cookie, Croissant, Soup, Wine, Beer, ChefHat,
  ShoppingBag, Shirt, Watch, Gem, Crown, Footprints, Sparkles,
  Scissors, Flower2, Heart,
  Laptop, Smartphone, Headphones, Gamepad2, Camera,
  Car, Wrench,
  Home, Sofa, Hammer,
  Dumbbell, Bike, Trophy,
  Stethoscope, Pill,
  PawPrint,
  Cat,
  BookOpen, Palette, Music, Briefcase,
} from 'lucide-react-native';

type LucideIcon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export const MERCHANT_ICON_MAP: Record<string, LucideIcon> = {
  store: Store,
  coffee: Coffee,
  utensilsCrossed: UtensilsCrossed,
  pizza: Pizza,
  iceCream: IceCream,
  cake: Cake,
  cookie: Cookie,
  croissant: Croissant,
  soup: Soup,
  wine: Wine,
  beer: Beer,
  chefHat: ChefHat,
  shoppingBag: ShoppingBag,
  shirt: Shirt,
  watch: Watch,
  gem: Gem,
  crown: Crown,
  footprints: Footprints,
  sparkles: Sparkles,
  scissors: Scissors,
  flower: Flower2,
  heart: Heart,
  laptop: Laptop,
  smartphone: Smartphone,
  headphones: Headphones,
  gamepad: Gamepad2,
  camera: Camera,
  car: Car,
  wrench: Wrench,
  home: Home,
  sofa: Sofa,
  hammer: Hammer,
  dumbbell: Dumbbell,
  bike: Bike,
  trophy: Trophy,
  stethoscope: Stethoscope,
  pill: Pill,
  pawPrint: PawPrint,
  cat: Cat,
  bookOpen: BookOpen,
  palette: Palette,
  music: Music,
  briefcase: Briefcase,
};

export const MERCHANT_ICON_SLUGS = Object.keys(MERCHANT_ICON_MAP);

export function getMerchantIconComponent(slug?: string | null): LucideIcon | null {
  if (!slug) return null;
  return MERCHANT_ICON_MAP[slug] ?? null;
}
