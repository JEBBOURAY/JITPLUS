import { memo, useCallback } from 'react';
import { View, FlatList, Pressable, StyleSheet, Platform } from 'react-native';
import Animated, { Easing, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { X, ChevronRight, BadgePercent } from 'lucide-react-native';
import { pluralKey } from '@jitplus/shared';
import { Text } from '@/components/AppText';
import MerchantLogo from '@/components/MerchantLogo';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Merchant } from '@/types';
import { pointKey, pointName } from '@/utils/merchantPoint';
import { getDistanceKm, formatDistance } from '@/utils/distance';
import { wp, hp, ms, fontSize as FS } from '@/utils/responsive';
import { EASE_OUT } from '@/utils/motion';

/** Rows rendered at most: past that, zooming in is more useful than scrolling. */
const MAX_ROWS = 50;
// Built once: inline builders are recreated on every render.
const SHEET_IN = SlideInDown.duration(220).easing(Easing.bezier(0.32, 0.72, 0, 1));
const SHEET_OUT = SlideOutDown.duration(180).easing(EASE_OUT);

const Row = memo(function Row({ merchant, distance, onPress }: {
  merchant: Merchant;
  distance: number | null;
  onPress: (merchant: Merchant) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const name = pointName(merchant);
  const sub = [
    merchant.categorie ? t(`categories.${merchant.categorie}`, { defaultValue: merchant.categorie }) : null,
    merchant.adresse || merchant.ville,
  ].filter(Boolean).join(' · ');
  const hasDeal = (merchant.activeDealCount ?? 0) > 0;
  return (
    <Pressable
      onPress={() => onPress(merchant)}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.border }, pressed && { backgroundColor: `${palette.violet}08` }]}
      accessibilityRole="button"
      accessibilityLabel={distance != null ? `${name}, ${formatDistance(distance)}` : name}
    >
      <View style={[styles.avatar, { backgroundColor: `${palette.violet}10` }]}>
        <MerchantLogo logoUrl={merchant.logoUrl} style={styles.logo} merchantName={merchant.nomBoutique} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{name}</Text>
        {!!sub && <Text style={[styles.sub, { color: theme.textMuted }]} numberOfLines={1}>{sub}</Text>}
        {hasDeal && (
          <View style={styles.dealRow}>
            <BadgePercent size={ms(11)} color={theme.danger} strokeWidth={2.2} />
            <Text style={[styles.dealText, { color: theme.danger }]} numberOfLines={1}>
              {merchant.topDeal?.title ?? t(pluralKey('deals.map.count', merchant.activeDealCount ?? 0), { count: merchant.activeDealCount })}
            </Text>
          </View>
        )}
      </View>
      {distance != null && <Text style={styles.distance}>{formatDistance(distance)}</Text>}
      <ChevronRight size={ms(16)} color={theme.textMuted} strokeWidth={2} />
    </Pressable>
  );
});

export const MerchantListSheet = memo(function MerchantListSheet({
  title, merchants, userLocation, emptyText, onSelect, onClose, bottom, maxHeight,
}: {
  title: string;
  merchants: Merchant[];
  userLocation: { latitude: number; longitude: number } | null;
  emptyText: string;
  onSelect: (merchant: Merchant) => void;
  onClose: () => void;
  bottom: number;
  maxHeight: number;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const rows = merchants.length > MAX_ROWS ? merchants.slice(0, MAX_ROWS) : merchants;

  const renderItem = useCallback(({ item }: { item: Merchant }) => {
    const distance = userLocation && item.latitude != null && item.longitude != null
      ? getDistanceKm(userLocation.latitude, userLocation.longitude, item.latitude, item.longitude)
      : null;
    return <Row merchant={item} distance={distance} onPress={onSelect} />;
  }, [userLocation, onSelect]);

  return (
    <Animated.View
      entering={SHEET_IN}
      exiting={SHEET_OUT}
      style={[styles.sheet, { backgroundColor: theme.bgCard, borderColor: theme.border, bottom, maxHeight }]}
    >
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <View style={[styles.closePill, { backgroundColor: theme.bgInput }]}>
            <X size={ms(14)} color={theme.textMuted} strokeWidth={2} />
          </View>
        </Pressable>
      </View>
      <FlatList
        data={rows}
        keyExtractor={pointKey}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        windowSize={5}
        ListEmptyComponent={<Text style={[styles.empty, { color: theme.textMuted }]}>{emptyText}</Text>}
        ListFooterComponent={merchants.length > MAX_ROWS
          ? <Text style={[styles.empty, { color: theme.textMuted }]}>{t('discover.listZoomForMore')}</Text>
          : null}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: wp(12), right: wp(12), zIndex: 11,
    borderRadius: ms(22), borderWidth: 1, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 6 }, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: wp(16), paddingVertical: hp(12), borderBottomWidth: StyleSheet.hairlineWidth, gap: wp(10),
  },
  title: { flex: 1, fontSize: FS.md, fontWeight: '600' },
  closePill: { width: ms(28), height: ms(28), borderRadius: ms(14), alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    paddingVertical: hp(10), paddingHorizontal: wp(14), borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: ms(40), height: ms(40), borderRadius: ms(12), alignItems: 'center', justifyContent: 'center' },
  logo: { width: ms(34), height: ms(34), borderRadius: ms(10) },
  info: { flex: 1 },
  name: { fontSize: FS.sm, fontWeight: '600' },
  sub: { fontSize: FS.xs, marginTop: ms(2) },
  dealRow: { flexDirection: 'row', alignItems: 'center', gap: wp(4), marginTop: ms(3) },
  dealText: { flexShrink: 1, fontSize: FS.xs, fontWeight: '600' },
  distance: { fontSize: FS.xs, fontWeight: '600', color: palette.violet },
  empty: { textAlign: 'center', fontSize: FS.sm, paddingVertical: hp(18), paddingHorizontal: wp(16) },
});
