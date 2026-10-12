import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { ArrowLeft, AlertCircle, Copy, Check, Ban, CircleCheck, Clock } from 'lucide-react-native';

let Clipboard: typeof import('expo-clipboard') | null = null;
try { Clipboard = require('expo-clipboard'); } catch { /* module not available */ }

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { wp, hp, ms } from '@/utils/responsive';
import { formatDate } from '@/utils/date';
import { haptic } from '@/utils/haptics';
import Skeleton from '@/components/Skeleton';
import { useClientCoupon } from '@/hooks/useScratchHooks';
import {
  COUPON_QR_PREFIX, describeCouponConditions, formatCouponCode, formatRewardValue,
} from '@jitplus/shared/src/scratch';

const KEEP_AWAKE_TAG = 'jitplus-coupon';

export default function CouponDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t, isRTL, locale } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useClientCoupon(id);
  const coupon = query.data ?? null;
  const [copied, setCopied] = useState(false);

  const isActive = !!coupon && coupon.status === 'ACTIVE' && new Date(coupon.expiresAt).getTime() > Date.now();
  const qrShown = isActive && !!coupon?.qrToken;

  // Keep the screen awake and boost brightness while the QR is shown (same
  // pattern as the loyalty QR screen) so the cashier can scan first try.
  useFocusEffect(useCallback(() => {
    if (!qrShown) return undefined;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    let keepAlive: ReturnType<typeof setInterval> | null = null;
    let applying = false;
    const apply = async () => {
      if (applying) return;
      applying = true;
      try {
        const current = await Brightness.getBrightnessAsync().catch(() => 0);
        if (current < 0.98) await Brightness.setBrightnessAsync(1);
      } catch { /* non-fatal */ }
      finally { applying = false; }
    };
    apply();
    keepAlive = setInterval(apply, 8000);
    return () => {
      if (keepAlive) clearInterval(keepAlive);
      Brightness.restoreSystemBrightnessAsync().catch(() => {});
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [qrShown]));

  const reward = coupon
    ? formatRewardValue({ type: coupon.type, value: coupon.value, label: coupon.label }, t)
    : '';

  const conditionLines = useMemo(() => {
    if (!coupon) return [];
    return describeCouponConditions(coupon, t, (iso) => formatDate(iso, locale));
  }, [coupon, t, locale]);

  const copyCode = useCallback(async () => {
    if (!coupon) return;
    haptic();
    try {
      if (Clipboard?.setStringAsync) await Clipboard.setStringAsync(coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* non-fatal */ }
  }, [coupon]);

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
        <View style={styles.body}>
          <AlertCircle size={ms(44)} color={theme.danger} />
          <Text style={[styles.stateText, { color: theme.textMuted }]}>{t('scratch.coupons.error')}</Text>
          <TouchableOpacity style={[styles.retryBtn, { borderColor: theme.border }]} onPress={() => query.refetch()} accessibilityRole="button">
            <Text style={[styles.retryText, { color: theme.text }]}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
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
      <View style={styles.body}>
        <Text style={[styles.reward, { color: theme.text }]}>{reward}</Text>
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

        {/* A cancelled coupon never shows QR nor code (study §5.3) */}
        {isActive ? (
          <>
            <View style={[styles.qrBox, { backgroundColor: '#FFFFFF' }]}>
              {coupon.qrToken ? (
                <QRCode
                  value={`${COUPON_QR_PREFIX}${coupon.qrToken}`}
                  size={wp(210)}
                  color="#111827"
                  backgroundColor="#FFFFFF"
                  ecl="M"
                />
              ) : (
                <Skeleton width={wp(210)} height={wp(210)} borderRadius={8} />
              )}
            </View>
            <TouchableOpacity style={styles.codeRow} onPress={copyCode} accessibilityRole="button" accessibilityLabel={t('scratch.coupons.copyCode')}>
              <Text style={[styles.codeLabel, { color: theme.textMuted }]}>{t('scratch.coupon.code')}</Text>
              <Text style={[styles.codeValue, { color: theme.text }]}>{formatCouponCode(coupon.code)}</Text>
              {copied
                ? <Check size={ms(16)} color={theme.success} />
                : <Copy size={ms(16)} color={theme.textMuted} />}
            </TouchableOpacity>
            {copied && <Text style={[styles.copiedText, { color: theme.success }]}>{t('scratch.coupons.copied')}</Text>}
            <Text style={[styles.showHint, { color: theme.textMuted }]}>{t('scratch.coupon.showAtCheckout')}</Text>
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
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top + hp(8) }]}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={ms(24)} color={theme.text} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
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
  header: { alignItems: 'center', justifyContent: 'space-between', marginBottom: hp(10) },
  headerTitle: { fontSize: ms(19), fontWeight: '700' },
  body: { flex: 1, alignItems: 'center', gap: hp(12), paddingBottom: hp(30) },
  reward: { fontSize: ms(26), fontWeight: '800', textAlign: 'center' },
  merchant: { fontSize: ms(15), fontWeight: '600', marginTop: -hp(6) },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: wp(14), paddingVertical: hp(6), borderRadius: 999 },
  statusText: { fontSize: ms(13), fontWeight: '700' },
  qrBox: { padding: wp(16), borderRadius: 20, marginTop: hp(4) },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: wp(10), marginTop: hp(2) },
  codeLabel: { fontSize: ms(12), fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  codeValue: { fontSize: ms(28), fontWeight: '800', letterSpacing: 3, fontVariant: ['tabular-nums'] },
  copiedText: { fontSize: ms(12), fontWeight: '600', marginTop: -hp(6) },
  showHint: { fontSize: ms(12), textAlign: 'center', paddingHorizontal: wp(24) },
  inactiveBox: { width: '100%', borderRadius: 16, borderWidth: 1, padding: wp(18), alignItems: 'center' },
  inactiveText: { fontSize: ms(14), fontWeight: '600', textAlign: 'center' },
  conditionsBox: { width: '100%', borderRadius: 14, borderWidth: 1, padding: wp(14), gap: 4, marginTop: hp(4) },
  conditionsTitle: { fontSize: ms(11), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  conditionLine: { fontSize: ms(13), lineHeight: ms(19) },
  stateText: { fontSize: ms(15), fontWeight: '600', textAlign: 'center' },
  retryBtn: { marginTop: hp(4), paddingHorizontal: wp(24), paddingVertical: hp(10), borderRadius: 12, borderWidth: 1 },
  retryText: { fontWeight: '600', fontSize: ms(14) },
});
