import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList, RefreshControl, StyleSheet, TouchableOpacity, View,
} from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Ticket } from 'lucide-react-native';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { wp, hp, ms } from '@/utils/responsive';
import { formatDate } from '@/utils/date';
import MerchantLogo from '@/components/MerchantLogo';
import Skeleton from '@/components/Skeleton';
import FadeInView from '@/components/FadeInView';
import { useClientCoupons, type ClientCouponStatus } from '@/hooks/useScratchHooks';
import { diffDaysYmd, formatRewardValue, toYmd } from '@jitplus/shared/src/scratch';
import type { CouponDto } from '@jitplus/shared/src/scratch';

const TWO_DAYS_MS = 48 * 3600 * 1000;

type Tab = { key: ClientCouponStatus; labelKey: string };

const TABS: Tab[] = [
  { key: 'active', labelKey: 'scratch.coupons.tabActive' },
  { key: 'used', labelKey: 'scratch.coupons.tabUsed' },
  { key: 'expired', labelKey: 'scratch.coupons.tabExpired' },
];

export default function CouponsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t, isRTL, locale } = useLanguage();
  const [tab, setTab] = useState<ClientCouponStatus>('active');

  const query = useClientCoupons(tab);
  const coupons = useMemo(() => query.data ?? [], [query.data]);

  const renderCoupon = useCallback(({ item }: { item: CouponDto }) => {
    const reward = formatRewardValue({ type: item.type, value: item.value, label: item.label }, t);
    const isCancelled = item.status === 'CANCELLED';
    const expiresInMs = new Date(item.expiresAt).getTime() - Date.now();
    const soon = item.status === 'ACTIVE' && expiresInMs > 0 && expiresInMs < TWO_DAYS_MS;
    let statusLine = '';
    if (isCancelled) statusLine = t('scratch.coupons.cancelledBadge');
    else if (item.status === 'REDEEMED' && item.redeemedAt) {
      statusLine = t('scratch.coupons.usedOn', { date: formatDate(item.redeemedAt, locale) });
    } else if (item.status === 'ACTIVE') {
      // Calendar days on the device (Morocco time for our users), not 24 h slices:
      // a coupon ending tomorrow morning must not read "expires today" tonight.
      const days = diffDaysYmd(toYmd(new Date()), toYmd(new Date(item.expiresAt)));
      statusLine = days <= 0
        ? t('scratch.coupons.expiresToday')
        : t('scratch.coupons.expiresIn', { count: days });
    } else {
      statusLine = t('scratch.conditions.expiresAt', { date: formatDate(item.expiresAt, locale) });
    }

    return (
      <FadeInView>
        <TouchableOpacity
          style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
          activeOpacity={0.75}
          onPress={() => router.push({ pathname: '/coupons/[id]', params: { id: item.id } })}
          accessibilityRole="button"
          accessibilityLabel={`${reward}, ${item.merchant?.nom ?? ''}`}
        >
          <MerchantLogo logoUrl={item.merchant?.logoUrl} merchantName={item.merchant?.nom} style={styles.logo} />
          <View style={styles.cardInfo}>
            <Text style={[styles.cardReward, { color: theme.text }]} numberOfLines={1}>{reward}</Text>
            <Text style={[styles.cardMerchant, { color: theme.textSecondary }]} numberOfLines={1}>
              {item.merchant?.nom ?? ''}
            </Text>
            <Text
              style={[
                styles.cardStatus,
                { color: isCancelled ? theme.danger : soon ? theme.warning : theme.textMuted },
              ]}
              numberOfLines={1}
            >
              {statusLine}
            </Text>
          </View>
          <View style={[styles.cardBadge, { backgroundColor: `${palette.violet}14` }]}>
            <Ticket size={ms(18)} color={palette.violet} />
          </View>
        </TouchableOpacity>
      </FadeInView>
    );
  }, [theme, t, locale, router]);

  const emptyText = tab === 'active' ? t('scratch.coupons.emptyActive') : t('scratch.coupons.emptyOther');
  const emptyHint = tab === 'active' ? t('scratch.coupons.emptyActiveHint') : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top + hp(8) }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={ms(24)} color={theme.text} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('scratch.coupons.title')}</Text>
        <View style={{ width: ms(24) }} />
      </View>

      {/* Segmented tabs: Actifs / Utilisés / Expirés */}
      <View style={[styles.tabs, { backgroundColor: theme.bgCard }]}>
        {TABS.map((tb) => {
          const active = tab === tb.key;
          return (
            <TouchableOpacity
              key={tb.key}
              style={[styles.tab, active && { backgroundColor: palette.violet }]}
              onPress={() => setTab(tb.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, { color: active ? '#fff' : theme.textMuted }]}>
                {t(tb.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {query.isLoading ? (
        <View style={styles.listContent}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
              <Skeleton width={ms(44)} height={ms(44)} borderRadius={ms(12)} />
              <View style={{ flex: 1, marginLeft: wp(12), gap: hp(6) }}>
                <Skeleton width={wp(140)} height={hp(15)} borderRadius={6} />
                <Skeleton width={wp(90)} height={hp(11)} borderRadius={4} />
              </View>
            </View>
          ))}
        </View>
      ) : query.isError ? (
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t('scratch.coupons.error')}</Text>
          <TouchableOpacity style={[styles.retryBtn, { borderColor: theme.border }]} onPress={() => query.refetch()} accessibilityRole="button">
            <Text style={[styles.retryText, { color: theme.text }]}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={coupons}
          keyExtractor={(c) => c.id}
          renderItem={renderCoupon}
          contentContainerStyle={[styles.listContent, coupons.length === 0 && styles.emptyListContent]}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={theme.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIcon, { backgroundColor: `${palette.violet}12` }]}>
                <Ticket size={ms(36)} color={palette.violet} strokeWidth={1.5} />
              </View>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{emptyText}</Text>
              {emptyHint ? <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{emptyHint}</Text> : null}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: wp(20) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: hp(14) },
  headerTitle: { fontSize: ms(19), fontWeight: '700' },
  tabs: { flexDirection: 'row', borderRadius: 12, padding: 4, marginBottom: hp(12) },
  tab: { flex: 1, alignItems: 'center', paddingVertical: hp(8), borderRadius: 9 },
  tabText: { fontSize: ms(13), fontWeight: '700' },
  listContent: { paddingBottom: hp(24), gap: hp(10) },
  emptyListContent: { flexGrow: 1, justifyContent: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, borderWidth: 1, padding: wp(14), gap: wp(12),
  },
  logo: { width: ms(44), height: ms(44), borderRadius: ms(12) },
  cardInfo: { flex: 1 },
  cardReward: { fontSize: ms(15), fontWeight: '700' },
  cardMerchant: { fontSize: ms(12), fontWeight: '500', marginTop: 1 },
  cardStatus: { fontSize: ms(11), fontWeight: '600', marginTop: 3 },
  cardBadge: { width: ms(36), height: ms(36), borderRadius: ms(10), alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', gap: hp(10), paddingTop: hp(40) },
  emptyIcon: { width: ms(72), height: ms(72), borderRadius: ms(22), alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: ms(15), fontWeight: '600', textAlign: 'center' },
  emptyHint: { fontSize: ms(13), textAlign: 'center', paddingHorizontal: wp(30) },
  retryBtn: { marginTop: hp(6), paddingHorizontal: wp(24), paddingVertical: hp(10), borderRadius: 12, borderWidth: 1 },
  retryText: { fontWeight: '600', fontSize: ms(14) },
});
