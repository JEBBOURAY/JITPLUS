import { moneyFormatter } from '@jitplus/shared/src/currency';
import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Ban, CircleCheck, Clock, QrCode, Store } from 'lucide-react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { wp, hp, ms } from '@/utils/responsive';
import { formatDate } from '@/utils/date';
import { DIR_FLIP } from '@/utils/rtl';
import RetryState from '@/components/RetryState';
import Skeleton from '@/components/Skeleton';
import { useClientCoupon } from '@/hooks/useScratchHooks';
import { describeCouponConditions, formatRewardValue } from '@jitplus/shared/src/scratch';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function CouponDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useClientCoupon(id);
  const coupon = query.data ?? null;

  const isActive = !!coupon && coupon.status === 'ACTIVE' && new Date(coupon.expiresAt).getTime() > Date.now();
  // No code to show: the cashier sees the gift by scanning the client's JitPlus card.
  const openMyCard = useCallback(() => { router.dismissTo('/(tabs)/qr'); }, [router]);

  const reward = coupon
    ? formatRewardValue({ type: coupon.type, value: coupon.value, label: coupon.label }, t, moneyFormatter(coupon.merchant?.currency, locale))
    : '';

  const conditionLines = useMemo(() => {
    if (!coupon) return [];
    return describeCouponConditions(coupon, t, (iso) => formatDate(iso, locale), moneyFormatter(coupon.merchant?.currency, locale));
  }, [coupon, t, locale]);

  const renderBody = () => {
    if (query.isLoading) {
      return (
        <View style={styles.body}>
          <Skeleton width={wp(220)} height={wp(220)} borderRadius={18} />
          <Skeleton width={wp(160)} height={hp(22)} borderRadius={8} />
          <Skeleton width={wp(240)} height={hp(14)} borderRadius={6} />
        </View>
      );
    }
    if (query.isError || !coupon) {
      return (
        <RetryState withIcon message={t('scratch.coupons.error')} onRetry={() => { void query.refetch(); }} style={styles.body} />
      );
    }

    const statusIcon = coupon.status === 'REDEEMED' ? <CircleCheck size={ms(15)} color={theme.success} />
      : coupon.status === 'CANCELLED' ? <Ban size={ms(15)} color={theme.danger} />
      : !isActive ? <Clock size={ms(15)} color={theme.warning} />
      : null;
    const statusColor = coupon.status === 'REDEEMED' ? theme.success
      : coupon.status === 'CANCELLED' ? theme.danger
      : !isActive ? theme.warning
      : theme.success;

    return (
      <ScrollView contentContainerStyle={[styles.body, styles.scrollBody]} showsVerticalScrollIndicator={false}>
        {coupon.source === 'COLLECTION' && (
          <Text style={[styles.sourceTag, { color: theme.textMuted }]}>{t('home.passCollectionTag')}</Text>
        )}
        <Text style={[styles.reward, { color: theme.text }]} numberOfLines={3}>{reward}</Text>
        {!!coupon.merchant?.nom && (
          <Text style={[styles.merchant, { color: theme.textSecondary }]}>{coupon.merchant.nom}</Text>
        )}

        {/* Status pill */}
        <View style={[styles.statusPill, { backgroundColor: `${statusColor}18` }]}>
          {statusIcon}
          <Text style={[styles.statusText, { color: statusColor }]}>
            {t(`scratch.couponStatus.${coupon.status}`)}
          </Text>
        </View>

        {isActive ? (
          <>
            <View style={[styles.howBox, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
              <Text style={[styles.howTitle, { color: theme.text }]}>{t('home.passHowTitle')}</Text>
              <View style={styles.howRow}>
                <Store size={ms(18)} color={theme.primary} />
                <Text style={[styles.howText, { color: theme.textSecondary }]}>
                  {t('scratch.screen.stepVisit', { merchant: coupon.merchant?.nom || t('common.shop') })}
                </Text>
              </View>
              <View style={styles.howRow}>
                <QrCode size={ms(18)} color={theme.primary} />
                <Text style={[styles.howText, { color: theme.textSecondary }]}>{t('scratch.screen.stepShowCard')}</Text>
              </View>
              <Text style={[styles.howNote, { color: theme.textMuted }]}>{t('scratch.screen.noCouponNeeded')}</Text>
            </View>
            <TouchableOpacity
              style={[styles.cardBtn, { backgroundColor: theme.primary }]}
              onPress={openMyCard}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <QrCode size={ms(18)} color="#fff" />
              <Text style={styles.cardBtnText}>{t('scratch.screen.openMyCard')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={[styles.inactiveBox, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            {coupon.status === 'REDEEMED' && coupon.redeemedAt ? (
              <Text style={[styles.inactiveText, { color: theme.textSecondary }]}>
                {t('scratch.coupons.usedOn', { date: formatDate(coupon.redeemedAt, locale) })}
              </Text>
            ) : coupon.status === 'CANCELLED' ? (
              <Text style={[styles.inactiveText, { color: theme.textSecondary }]}>{t('scratch.coupons.cancelledBadge')}</Text>
            ) : (
              <Text style={[styles.inactiveText, { color: theme.textSecondary }]}>
                {t('scratch.conditions.expiresAt', { date: formatDate(coupon.expiresAt, locale) })}
              </Text>
            )}
          </View>
        )}

        {/* Conditions */}
        {conditionLines.length > 0 && (
          <View style={[styles.conditionsBox, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <Text style={[styles.conditionsTitle, { color: theme.textMuted }]}>{t('scratch.screen.conditions')}</Text>
            {conditionLines.map((line, i) => (
              <Text key={i} style={[styles.conditionLine, { color: theme.textSecondary }]}>• {line}</Text>
            ))}
          </View>
        )}
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top + hp(8) }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={ms(24)} color={theme.text} style={DIR_FLIP} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('scratch.coupons.title')}</Text>
        <View style={{ width: ms(24) }} />
      </View>
      {renderBody()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: wp(20) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: hp(10) },
  headerTitle: { fontSize: ms(19), fontWeight: '600' },
  body: { flex: 1, alignItems: 'center', gap: hp(12), paddingBottom: hp(30) },
  sourceTag: { fontSize: ms(13), fontWeight: '600', marginBottom: -hp(6) },
  reward: { fontSize: ms(26), fontWeight: '600', textAlign: 'center' },
  merchant: { fontSize: ms(15), fontWeight: '600', marginTop: -hp(6) },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: wp(14), paddingVertical: hp(6), borderRadius: 999 },
  statusText: { fontSize: ms(13), fontWeight: '600' },
  scrollBody: { flex: 0, flexGrow: 1 },
  howBox: { width: '100%', borderRadius: 16, borderWidth: 1, padding: wp(16), gap: hp(10), marginTop: hp(4) },
  howTitle: { fontSize: ms(15), fontWeight: '600' },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: wp(10) },
  howText: { flex: 1, fontSize: ms(14), lineHeight: ms(20) },
  howNote: { fontSize: ms(12), lineHeight: ms(18) },
  cardBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(8),
    alignSelf: 'stretch', minHeight: ms(50), borderRadius: 14,
  },
  cardBtnText: { color: '#fff', fontSize: ms(15), fontWeight: '600' },
  inactiveBox: { width: '100%', borderRadius: 16, borderWidth: 1, padding: wp(18), alignItems: 'center' },
  inactiveText: { fontSize: ms(14), fontWeight: '600', textAlign: 'center' },
  conditionsBox: { width: '100%', borderRadius: 14, borderWidth: 1, padding: wp(14), gap: 4, marginTop: hp(4) },
  conditionsTitle: { fontSize: ms(11), fontWeight: '600', marginBottom: 4 },
  conditionLine: { fontSize: ms(13), lineHeight: ms(19) },
});
