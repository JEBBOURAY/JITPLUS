import React from 'react';
import { View, Text } from 'react-native';
import {
  Wifi, ParkingSquare, TreePine, Snowflake, CreditCard, Truck, ShoppingBag,
  Utensils, Leaf, Accessibility, Dog, Baby, CalendarCheck, LucideIcon,
} from 'lucide-react-native';
import { merchantStyles as styles } from './merchantStyles';
import { getMerchantAccent } from '@/utils/merchantAccent';
import type { Merchant, MerchantBadge } from '@/types';

const BADGE_ICONS: Record<MerchantBadge, LucideIcon> = {
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

interface Props {
  merchant: Merchant;
  theme: { bgCard: string; text: string; textSecondary: string };
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function MerchantBadges({ merchant, theme, t }: Props) {
  const badges = (merchant.badges ?? []) as MerchantBadge[];
  if (badges.length === 0) return null;
  const accent = getMerchantAccent(merchant.themeColor);

  return (
    <View style={[styles.badgesCard, { backgroundColor: theme.bgCard }]}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('merchant.badgesTitle')}</Text>
      <View style={styles.badgesWrap}>
        {badges.map((code) => {
          const Icon = BADGE_ICONS[code];
          return (
            <View key={code} style={[styles.badgePill, { backgroundColor: `${accent}12`, borderColor: `${accent}30` }]}>
              {Icon && <Icon size={14} color={accent} strokeWidth={2} />}
              <Text style={[styles.badgePillText, { color: accent }]} numberOfLines={1}>
                {t(`merchant.badges.${code}`)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default React.memo(MerchantBadges);
