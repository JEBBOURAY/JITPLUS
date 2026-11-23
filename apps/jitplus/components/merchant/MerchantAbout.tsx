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
import { wp, hp, ms, fontSize } from '@/utils/responsive';
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

/**
 * What the merchant says about the shop. `description` opens the shop tab; the
 * amenities and social profiles (`details`) close it, after the practical info.
 */
function MerchantAbout({ merchant, part }: { merchant: Merchant; part: 'description' | 'details' }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const profiles = useSocialProfiles(merchant);
  const [expanded, setExpanded] = useState(false);

  const description = part === 'description' ? merchant.description?.trim() : undefined;
  const badges = part === 'details' ? getKnownBadges(merchant.badges) : [];
  if (!description && badges.length === 0 && (part !== 'details' || profiles.length === 0)) return null;

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
              <Text style={[styles.readMoreText, { color: theme.primary, fontFamily: fonts.semibold }]}>
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
                  <Icon size={ms(20)} color={theme.textSecondary} strokeWidth={1.75} />
                  <Text style={[styles.badgeText, { color: theme.text, fontFamily: fonts.regular }]} numberOfLines={1}>
                    {t(`merchant.badges.${code}`)}
                  </Text>
                </View>
              );
            })}
          </View>
        </FicheSection>
      )}

      {part === 'details' && profiles.length > 0 && (
        <FicheSection title={t('merchant.followUs')}>
          <MerchantSocialLinks profiles={profiles} />
        </FicheSection>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  description: { fontSize: fontSize.md, lineHeight: ms(22) },
  readMore: { alignSelf: 'flex-start', marginTop: hp(8) },
  readMoreText: { fontSize: fontSize.sm },
  // Two columns, like the amenities list of a maps listing.
  badges: { flexDirection: 'row', flexWrap: 'wrap', rowGap: hp(12) },
  badge: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: wp(12), paddingEnd: wp(8) },
  badgeText: { flexShrink: 1, fontSize: fontSize.md },
});

export default memo(MerchantAbout);
