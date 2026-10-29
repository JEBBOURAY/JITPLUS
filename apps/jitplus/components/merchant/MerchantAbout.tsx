import { memo, useState } from 'react';
import { View, Pressable, StyleSheet, LayoutAnimation } from 'react-native';
import { Text } from '@/components/AppText';
import {
  Wifi, ParkingSquare, TreePine, Snowflake, CreditCard, Truck, ShoppingBag,
  Utensils, Leaf, Accessibility, Dog, Baby, CalendarCheck, type LucideIcon,
} from 'lucide-react-native';
import { getKnownBadges } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { wp, hp, ms } from '@/utils/responsive';
import type { Merchant, MerchantBadge } from '@/types';
import FicheSection from './FicheSection';
import MerchantSocialLinks, { useSocialProfiles } from './MerchantSocialLinks';
import LinkifiedText from './LinkifiedText';

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

/** Description, amenities and social profiles. */
function MerchantAbout({ merchant }: { merchant: Merchant }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const profiles = useSocialProfiles(merchant);
  const [expanded, setExpanded] = useState(false);

  const description = merchant.description?.trim();
  const badges = getKnownBadges(merchant.badges);
  if (!description && badges.length === 0 && profiles.length === 0) return null;

  const collapsible = !!description && description.length > COLLAPSIBLE_LENGTH;
  const toggle = () => {
    haptic();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <>
      {!!description && (
        <FicheSection title={t('merchant.aboutUs')}>
          <LinkifiedText
            text={description}
            linkColor={theme.primary}
            style={[styles.description, { color: theme.textSecondary, fontFamily: fonts.regular }]}
            numberOfLines={collapsible && !expanded ? COLLAPSED_LINES : undefined}
          />
          {collapsible && (
            <Pressable onPress={toggle} hitSlop={6} accessibilityRole="button" style={styles.readMore}>
              <Text style={[styles.readMoreText, { color: theme.text, fontFamily: fonts.semibold }]}>
                {expanded ? t('merchant.showLess') : t('merchant.readMore')}
              </Text>
            </Pressable>
          )}
        </FicheSection>
      )}

      {badges.length > 0 && (
        <FicheSection title={t('merchant.badgesTitle')}>
          <View style={styles.badges}>
            {badges.map((code) => {
              const Icon = BADGE_ICONS[code];
              return (
                <View key={code} style={styles.badge}>
                  <Icon size={ms(18)} color={theme.textSecondary} strokeWidth={1.8} />
                  <Text style={[styles.badgeText, { color: theme.text, fontFamily: fonts.regular }]} numberOfLines={1}>
                    {t(`merchant.badges.${code}`)}
                  </Text>
                </View>
              );
            })}
          </View>
        </FicheSection>
      )}

      {profiles.length > 0 && (
        <FicheSection title={t('merchant.followUs')}>
          <MerchantSocialLinks profiles={profiles} />
        </FicheSection>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  description: { fontSize: ms(15), lineHeight: ms(22) },
  readMore: { alignSelf: 'flex-start', marginTop: hp(6) },
  readMoreText: { fontSize: ms(14) },
  // Two columns, like the amenities list of a maps listing.
  badges: { flexDirection: 'row', flexWrap: 'wrap', rowGap: hp(12) },
  badge: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: wp(10), paddingRight: wp(8) },
  badgeText: { flexShrink: 1, fontSize: ms(14) },
});

export default memo(MerchantAbout);
