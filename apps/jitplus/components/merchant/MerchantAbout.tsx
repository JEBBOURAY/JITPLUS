import React, { memo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutAnimation } from 'react-native';
import {
  Info, Wifi, ParkingSquare, TreePine, Snowflake, CreditCard, Truck, ShoppingBag,
  Utensils, Leaf, Accessibility, Dog, Baby, CalendarCheck, type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { getMerchantAccent } from '@/utils/merchantAccent';
import { wp, hp, ms } from '@/utils/responsive';
import type { Merchant, MerchantBadge } from '@/types';
import MerchantSection from './MerchantSection';
import MerchantSocialLinks, { useSocialItems } from './MerchantSocialLinks';

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

const COLLAPSED_LINES = 4;
/** Rough length past which the description no longer fits in the collapsed lines. */
const COLLAPSIBLE_LENGTH = 180;

function isKnownBadge(code: string): code is MerchantBadge {
  return code in BADGE_ICONS;
}

/** Description, amenities and social profiles in a single card. */
function MerchantAbout({ merchant }: { merchant: Merchant }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const accent = getMerchantAccent(merchant.themeColor);
  const socialItems = useSocialItems(merchant);
  const [expanded, setExpanded] = useState(false);

  const description = merchant.description?.trim();
  const badges = (merchant.badges ?? []).filter(isKnownBadge);
  if (!description && badges.length === 0 && socialItems.length === 0) return null;

  const collapsible = !!description && description.length > COLLAPSIBLE_LENGTH;
  const toggle = () => {
    haptic();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <MerchantSection title={t('merchant.aboutUs')} icon={Info} accent={accent}>
      {!!description && (
        <>
          <Text
            style={[styles.description, { color: theme.textSecondary, fontFamily: fonts.regular }]}
            numberOfLines={collapsible && !expanded ? COLLAPSED_LINES : undefined}
          >
            {description}
          </Text>
          {collapsible && (
            <Pressable onPress={toggle} hitSlop={6} accessibilityRole="button" style={styles.readMore}>
              <Text style={[styles.readMoreText, { color: accent, fontFamily: fonts.semibold }]}>
                {expanded ? t('merchant.showLess') : t('merchant.readMore')}
              </Text>
            </Pressable>
          )}
        </>
      )}

      {badges.length > 0 && (
        <View style={description ? styles.block : undefined}>
          <Text style={[styles.subheading, { color: theme.text, fontFamily: fonts.bold }]}>{t('merchant.badgesTitle')}</Text>
          <View style={styles.badges}>
            {badges.map((code) => {
              const Icon = BADGE_ICONS[code];
              return (
                <View key={code} style={[styles.badge, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                  <Icon size={ms(14)} color={accent} strokeWidth={2} />
                  <Text style={[styles.badgeText, { color: theme.textSecondary, fontFamily: fonts.medium }]} numberOfLines={1}>
                    {t(`merchant.badges.${code}`)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {socialItems.length > 0 && (
        <View style={description || badges.length ? styles.block : undefined}>
          <Text style={[styles.subheading, { color: theme.text, fontFamily: fonts.bold }]}>{t('merchant.followUs')}</Text>
          <MerchantSocialLinks items={socialItems} />
        </View>
      )}
    </MerchantSection>
  );
}

const styles = StyleSheet.create({
  description: { fontSize: ms(14), lineHeight: ms(22) },
  readMore: { alignSelf: 'flex-start', marginTop: hp(6) },
  readMoreText: { fontSize: ms(13) },
  block: { marginTop: hp(18) },
  subheading: { fontSize: ms(14), marginBottom: hp(10) },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(8) },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    paddingHorizontal: wp(12), paddingVertical: hp(7), borderRadius: 999, borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: { fontSize: ms(12) },
});

export default memo(MerchantAbout);
