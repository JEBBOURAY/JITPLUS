import { memo } from 'react';
import {
  View, Pressable, TouchableOpacity,
} from 'react-native';
import { Text } from '@/components/AppText';
import {
  MapPin, ChevronRight, Navigation, ExternalLink, BadgePercent,
} from 'lucide-react-native';
import { pluralKey } from '@jitplus/shared';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Merchant } from '@/types';
import MerchantLogo from '@/components/MerchantLogo';
import { wp, hp, ms, fontSize as FS } from '@/utils/responsive';
import { formatDistance } from '@/utils/distance';
import { discoverStyles as styles } from './discoverStyles';

export const FallbackMerchantCard = memo(function FallbackMerchantCard({
  merchant,
  distance,
  onPress,
  onNavigate,
}: {
  merchant: Merchant;
  distance: number | null;
  onPress: (merchant: Merchant) => void;
  onNavigate: (merchant: Merchant) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <Pressable
      style={[styles.fallbackCard, { backgroundColor: theme.bgCard }]}
      onPress={() => onPress(merchant)}
    >
      <View style={[styles.fallbackAvatar, { backgroundColor: palette.violet + '15' }]}>
        <MerchantLogo logoUrl={merchant.logoUrl} style={styles.fallbackLogo} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.fallbackName, { color: theme.text }]} numberOfLines={1}>{merchant.storeName || merchant.nomBoutique}</Text>
        {merchant.categorie && (
          <View style={[styles.catBadge, { backgroundColor: palette.violet + '15' }]}>
            <Text style={[styles.catBadgeText, { color: palette.violet }]}>{merchant.categorie}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: wp(4), marginTop: hp(2) }}>
          <MapPin size={ms(11)} color={theme.textMuted} strokeWidth={2} />
          <Text style={[styles.fallbackAddr, { color: theme.textMuted }]} numberOfLines={1}>
            {merchant.adresse || merchant.ville || t('discover.positionAvailable')}
          </Text>
        </View>
        {distance !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: wp(3), marginTop: hp(3) }}>
            <Navigation size={ms(10)} color={palette.violet} strokeWidth={2} />
            <Text style={{ fontSize: FS.xs, fontWeight: '700', color: palette.violet }}>
              {formatDistance(distance)}
            </Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={[styles.fallbackNavBtn, { backgroundColor: palette.violet }]}
        activeOpacity={0.7} onPress={() => onNavigate(merchant)}
      >
        <ExternalLink size={ms(14)} color="#fff" strokeWidth={2} />
      </TouchableOpacity>
    </Pressable>
  );
});

export const MerchantCallout = memo(function MerchantCallout({
  merchant,
  distance,
  onPress,
  onNavigate,
  onDealPress,
  style,
}: {
  merchant: Merchant;
  distance: number | null;
  onPress: () => void;
  onNavigate: () => void;
  /** Shown when the merchant has live deals */
  onDealPress?: () => void;
  style?: import('react-native').ViewStyle;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dealCount = merchant.activeDealCount ?? 0;
  return (
    <View style={[styles.calloutWrapper, style]}>
      <Pressable style={[styles.calloutCard, { backgroundColor: theme.bgCard }]} onPress={onPress}>
        <View style={styles.calloutAccent} />
        <View style={[styles.calloutAvatar, { backgroundColor: palette.violet + '10' }]}>
          <MerchantLogo logoUrl={merchant.logoUrl} style={styles.merchantLogo} merchantName={merchant.nomBoutique} />
        </View>
        <View style={styles.calloutInfo}>
          <Text style={[styles.calloutName, { color: theme.text }]} numberOfLines={1}>{merchant.storeName || merchant.nomBoutique}</Text>
          {merchant.categorie && (
            <View style={[styles.catBadge, { backgroundColor: palette.violet + '12', marginTop: hp(3) }]}>
              <Text style={[styles.catBadgeText, { color: palette.violet }]}>{merchant.categorie}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: wp(4), marginTop: hp(5) }}>
            <MapPin size={ms(11)} color={theme.textMuted} strokeWidth={2} />
            <Text style={{ fontSize: FS.xs, color: theme.textMuted }} numberOfLines={1}>
              {merchant.adresse || merchant.ville || ''}
            </Text>
          </View>
          {distance != null && (
            <View style={styles.calloutDistRow}>
              <Navigation size={ms(10)} color={palette.violet} strokeWidth={2} />
              <Text style={styles.calloutDist}>
                {formatDistance(distance)}
              </Text>
            </View>
          )}
          {dealCount > 0 && !!onDealPress && (
            <Pressable
              onPress={onDealPress}
              hitSlop={6}
              style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'center', gap: wp(4), marginTop: hp(6), alignSelf: 'flex-start' },
                { paddingHorizontal: wp(8), paddingVertical: hp(3), borderRadius: ms(8), backgroundColor: `${theme.danger}14` },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
            >
              <BadgePercent size={ms(12)} color={theme.danger} strokeWidth={2.2} />
              <Text style={{ flexShrink: 1, fontSize: FS.xs, fontWeight: '700', color: theme.danger }} numberOfLines={1}>
                {merchant.topDeal?.title ?? t(pluralKey('deals.map.count', dealCount), { count: dealCount })}
              </Text>
            </Pressable>
          )}
        </View>
        <View style={styles.calloutActions}>
          <TouchableOpacity
            style={[styles.navBtn, { backgroundColor: palette.violet }]}
            activeOpacity={0.7} onPress={onNavigate}
            accessibilityRole="button"
            accessibilityLabel={t('discover.positionAvailable')}
          >
            <Navigation size={ms(16)} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
          <ChevronRight size={ms(18)} color={theme.textMuted} strokeWidth={2} />
        </View>
      </Pressable>
    </View>
  );
});
