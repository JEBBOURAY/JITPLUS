// Icons of the public merchant page (fiche), shared by the client page
// (apps/jitplus/components/merchant) and the Pro preview (components/fichePreview)
// so both show the same icon for an amenity or a social network.
import {
  Wifi, ParkingSquare, TreePine, Snowflake, CreditCard, Truck, ShoppingBag, Utensils, Leaf,
  Accessibility, Dog, Baby, CalendarCheck,
  Instagram, Music2, Facebook, Ghost, Youtube,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { MerchantBadge } from '../types';
import type { SocialNetwork } from '../merchantFiche';

export const MERCHANT_BADGE_ICONS: Record<MerchantBadge, LucideIcon> = {
  WIFI: Wifi,
  PARKING: ParkingSquare,
  TERRASSE: TreePine,
  CLIMATISE: Snowflake,
  CARTE_BANCAIRE: CreditCard,
  LIVRAISON: Truck,
  TAKEAWAY: ShoppingBag,
  HALAL: Utensils,
  VEGETARIEN: Leaf,
  ACCESS_PMR: Accessibility,
  PETS_OK: Dog,
  KID_FRIENDLY: Baby,
  RESERVATION: CalendarCheck,
};

export const SOCIAL_NETWORK_ICONS: Record<SocialNetwork, LucideIcon> = {
  instagram: Instagram,
  tiktok: Music2,
  facebook: Facebook,
  snapchat: Ghost,
  youtube: Youtube,
};
