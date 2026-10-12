import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CheckCircle2, XCircle, MinusCircle, QrCode, Ticket, CircleUser } from 'lucide-react-native';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuthStore } from '@/stores/authStore';
import { useCheckCoupon, useRedeemCoupon } from '@/hooks/useScratchHooks';
import { getErrorMessage } from '@/utils/error';
import { ms } from '@/utils/responsive';
import { MAX_AMOUNT_DIGITS } from '@/constants/app';
import { computeStampsForAmount } from '@/utils/stamps';
import { formatDateTime } from '@/utils/date';
import { formatCurrency, DEFAULT_CURRENCY, getIntlLocale } from '@/config/currency';
import {
  computeCouponDiscount,
  formatCouponCode,
  formatRewardValue,
  isCompleteCouponCode,
  minutesToTime,
  normalizeCouponCode,
  type CouponCheck,
  type CouponCheckResult,
  type CouponRedeemResult,
} from '@jitplus/shared/src/scratch';
import { Button, FieldLabel, Input, Notice, ScreenHeader, Section } from '@/components/scratch/ScratchUI';

function formatMoney(amount: number, locale: string): string {
  return formatCurrency(amount, DEFAULT_CURRENCY, getIntlLocale(locale));
}

export default function CouponValidateScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale, isRTL } = useLanguage();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const merchant = useAuthStore((s) => s.merchant);

  const [fromScan, setFromScan] = useState(!!token);
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [checkResult, setCheckResult] = useState<CouponCheckResult | null>(null);
  const [redeemResult, setRedeemResult] = useState<CouponRedeemResult | null>(null);
  const checkCoupon = useCheckCoupon();
  const redeemCoupon = useRedeemCoupon();
  // One key per coupon checked: a retry after a network failure replays safely.
  const idemKeyRef = useRef(Crypto.randomUUID());
  const autoCheckRef = useRef(false);

  const runCheck = useCallback(
    (input: { token?: string; code?: string }) => {
      checkCoupon.mutate(input, {
        onSuccess: (data) => {
          idemKeyRef.current = Crypto.randomUUID();
          setCheckResult(data);
          setAmount('');
          setRedeemResult(null);
        },
        onError: (err) => {
          Alert.alert(t('common.error'), getErrorMessage(err, t('scratch.validate.checkError')));
        },
      });
    },
    [checkCoupon, t],
  );

  useEffect(() => {
    if (token && !autoCheckRef.current) {
      autoCheckRef.current = true;
      runCheck({ token });
    }
  }, [token, runCheck]);

  const coupon = checkResult?.coupon ?? null;
  const isPerAmount = merchant?.stampEarningMode === 'PER_AMOUNT';
  const minPurchase = coupon?.conditions.minPurchaseAmount ?? 0;
  const isDiscountType = coupon?.type === 'PERCENT_DISCOUNT' || coupon?.type === 'FIXED_DISCOUNT';
  const amountRequired = !!coupon && (isDiscountType || minPurchase > 0 || isPerAmount);
  const amountNum = parseFloat(amount) || 0;
  const amountOk = amountRequired ? amountNum > 0 : true;
  const minPurchaseOk = minPurchase > 0 ? amountNum >= minPurchase : true;

  // The server leaves canRedeem=false for ghost clients even when every check passes.
  const anonymousBlocked =
    !!checkResult && !checkResult.canRedeem && checkResult.checks.every((c) => c.ok !== false);

  const preview = useMemo(() => {
    if (!coupon) return null;
    const discount = computeCouponDiscount(coupon, amountNum);
    const toPay = Math.max(0, Math.round((amountNum - discount) * 100) / 100);
    const purchaseStamps =
      amountNum > 0 ? (isPerAmount ? computeStampsForAmount(toPay, merchant?.amountPerStamp).stamps : 1) : 0;
    const bonusStamps = coupon.type === 'BONUS_STAMPS' ? Math.max(0, Math.round(coupon.value ?? 0)) : 0;
    return { discount, toPay, purchaseStamps, bonusStamps };
  }, [coupon, amountNum, isPerAmount, merchant?.amountPerStamp]);

  const canSubmit =
    !!checkResult &&
    checkResult.canRedeem &&
    amountOk &&
    minPurchaseOk &&
    !redeemCoupon.isPending;

  const handleAmountChange = useCallback((text: string) => {
    if (text.trim().startsWith('-')) return;
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    let formatted = parts[0] || '';
    if (parts.length > 1) formatted += '.' + (parts[1]?.slice(0, 2) || '');
    if (formatted.length <= MAX_AMOUNT_DIGITS) setAmount(formatted);
  }, []);

  const handleRedeem = useCallback(() => {
    if (!checkResult || !canSubmit) return;
    redeemCoupon.mutate(
      {
        couponId: checkResult.coupon.id,
        purchaseAmount: amountNum,
        clientId: checkResult.client.id,
        idempotencyKey: idemKeyRef.current,
      },
      {
        onSuccess: (data) => setRedeemResult(data),
        onError: (err) => {
          Alert.alert(t('common.error'), getErrorMessage(err, t('scratch.validate.checkError')));
        },
      },
    );
  }, [checkResult, canSubmit, redeemCoupon, amountNum, t]);

  const resetAll = useCallback(() => {
    setCode('');
    setAmount('');
    setCheckResult(null);
    setRedeemResult(null);
    setFromScan(false);
    idemKeyRef.current = Crypto.randomUUID();
  }, []);

  const checkLine = useCallback(
    (check: CouponCheck): { label: string; state: 'ok' | 'ko' | 'pending' } => {
      const d = check.detail ?? {};
      switch (check.key) {
        case 'status': {
          if (check.ok) return { label: t('scratch.validate.checkStatus'), state: 'ok' };
          const status = String(d.status ?? '');
          if (status === 'REDEEMED') {
            return {
              label: t('scratch.validate.statusREDEEMED', { date: formatDateTime(String(d.redeemedAt ?? ''), locale) }),
              state: 'ko',
            };
          }
          if (status === 'CANCELLED') return { label: t('scratch.validate.statusCANCELLED'), state: 'ko' };
          return { label: t('scratch.validate.statusEXPIRED'), state: 'ko' };
        }
        case 'dates': {
          if (check.ok) return { label: t('scratch.validate.checkDates'), state: 'ok' };
          if (new Date(String(d.validFrom)).getTime() > Date.now()) {
            return { label: t('scratch.validate.notStarted', { date: formatDateTime(String(d.validFrom), locale) }), state: 'ko' };
          }
          return { label: t('scratch.validate.expiredOn', { date: formatDateTime(String(d.expiresAt), locale) }), state: 'ko' };
        }
        case 'weekday': {
          if (check.ok) return { label: t('scratch.validate.checkWeekday'), state: 'ok' };
          const days = (Array.isArray(d.allowed) ? (d.allowed as number[]) : [])
            .map((day) => t(`scratch.weekdayShort.${day}`))
            .join(', ');
          return { label: t('scratch.validate.weekdayNo', { days }), state: 'ko' };
        }
        case 'hours': {
          if (check.ok) return { label: t('scratch.validate.checkHours'), state: 'ok' };
          return {
            label: t('scratch.validate.hoursNo', { from: minutesToTime(Number(d.from)), to: minutesToTime(Number(d.to)) }),
            state: 'ko',
          };
        }
        case 'minPurchase': {
          const min = Number(d.min ?? 0);
          if (check.ok || (check.ok == null && minPurchaseOk)) {
            return { label: t('scratch.validate.checkMinPurchase', { amount: min }), state: 'ok' };
          }
          if (check.ok == null && !amountOk) {
            return { label: t('scratch.validate.checkMinPurchase', { amount: min }), state: 'pending' };
          }
          return { label: t('scratch.validate.minPurchaseNo', { amount: min }), state: 'ko' };
        }
        default:
          return { label: '', state: 'pending' };
      }
    },
    [t, locale, amountOk, minPurchaseOk],
  );

  if (shouldWait) return null;

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';

  // ── Success view ──
  if (redeemResult) {
    const totalStamps = redeemResult.stampsEarned + redeemResult.bonusStamps;
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={t('scratch.validate.title')} onBack={() => router.back()} />
        <View style={styles.successWrap}>
          <View style={[styles.successIcon, { backgroundColor: `${theme.success}14` }]}>
            <CheckCircle2 size={ms(48)} color={theme.success} strokeWidth={1.5} />
          </View>
          <Text style={[styles.successTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
            {t('scratch.validate.successTitle')}
          </Text>
          <Section style={styles.successCard}>
            {redeemResult.discountAmount > 0 && (
              <Text style={[styles.successLine, { color: theme.text, textAlign }]}>
                {t('scratch.validate.successDiscount', { amount: formatMoney(redeemResult.discountAmount, locale) })}
              </Text>
            )}
            {totalStamps > 0 && (
              <Text style={[styles.successLine, { color: theme.text, textAlign }]}>
                {t('scratch.validate.successStamps', { count: totalStamps })}
              </Text>
            )}
            <Text style={[styles.successLine, { color: theme.textSecondary, textAlign }]}>
              {t('scratch.validate.successBalance', { count: redeemResult.newBalance })}
            </Text>
          </Section>
          <View style={styles.successActions}>
            <Button label={t('scratch.validate.another')} onPress={resetAll} variant="secondary" />
            <Button label={t('scratch.validate.done')} onPress={() => router.back()} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScreenHeader title={t('scratch.validate.title')} onBack={() => router.back()} />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {fromScan ? <Notice text={t('scratch.validate.detected')} /> : null}

        {/* ── Code entry ── */}
        {!checkResult && (
          <Section>
            <FieldLabel text={t('scratch.validate.codeLabel')} />
            <Input
              value={code}
              onChangeText={(text) => setCode(normalizeCouponCode(text))}
              placeholder={t('scratch.validate.codePlaceholder')}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus={!fromScan}
              style={styles.codeInput}
            />
            <View style={styles.entryActions}>
              <Button
                label={t('scratch.validate.scan')}
                icon={QrCode}
                variant="secondary"
                onPress={() => router.replace({ pathname: '/scan-qr', params: { from: 'coupon' } })}
                style={styles.entryButton}
              />
              <Button
                label={checkCoupon.isPending ? t('scratch.validate.checking') : t('scratch.validate.check')}
                loading={checkCoupon.isPending}
                disabled={!isCompleteCouponCode(code)}
                onPress={() => runCheck({ code })}
                style={styles.entryButton}
              />
            </View>
          </Section>
        )}

        {/* ── Check result ── */}
        {checkResult && coupon && (
          <>
            <Section>
              <View style={[styles.clientRow, { flexDirection: rowDir }]}>
                <CircleUser size={ms(20)} color={theme.textSecondary} strokeWidth={1.5} />
                <Text style={[styles.clientName, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                  {[checkResult.client.prenom, checkResult.client.nom].filter(Boolean).join(' ') ||
                    t('transaction.defaultClient')}
                </Text>
                <Text style={[styles.codeChip, { color: theme.textMuted }]}>{formatCouponCode(coupon.code)}</Text>
              </View>
              <View style={[styles.clientRow, { flexDirection: rowDir }]}>
                <Ticket size={ms(20)} color={theme.primary} strokeWidth={1.5} />
                <Text style={[styles.rewardLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                  {coupon.label}
                </Text>
                <Text style={[styles.rewardValue, { color: theme.primary }]}>
                  {formatRewardValue(coupon, t)}
                </Text>
              </View>
            </Section>

            <Section title={t('scratch.validate.conditionsTitle')}>
              {checkResult.checks.map((check) => {
                const line = checkLine(check);
                if (!line.label) return null;
                const Icon = line.state === 'ok' ? CheckCircle2 : line.state === 'ko' ? XCircle : MinusCircle;
                const color = line.state === 'ok' ? theme.success : line.state === 'ko' ? theme.danger : theme.textMuted;
                return (
                  <View key={check.key} style={[styles.checkRow, { flexDirection: rowDir }]}>
                    <Icon size={ms(18)} color={color} strokeWidth={1.8} />
                    <Text style={[styles.checkText, { color, textAlign }]} maxFontSizeMultiplier={1.4}>
                      {line.label}
                    </Text>
                  </View>
                );
              })}
              {anonymousBlocked ? <Notice tone="warning" text={t('scratch.validate.anonymous')} /> : null}
            </Section>

            {/* ── Amount + preview ── */}
            {checkResult.canRedeem && (
              <Section>
                <FieldLabel
                  text={`${t('scratch.validate.amountLabel')} (${
                    amountRequired ? t('scratch.validate.amountRequired') : t('scratch.validate.amountOptional')
                  })`}
                />
                <Input
                  value={amount}
                  onChangeText={handleAmountChange}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  maxLength={MAX_AMOUNT_DIGITS}
                />
                {preview && (amountNum > 0 || isDiscountType) && (
                  <View style={styles.previewBox}>
                    {preview.discount > 0 && (
                      <View style={[styles.previewRow, { flexDirection: rowDir }]}>
                        <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>
                          {t('scratch.validate.discount')}
                        </Text>
                        <Text style={[styles.previewValue, { color: theme.danger }]}>
                          -{formatMoney(preview.discount, locale)}
                        </Text>
                      </View>
                    )}
                    {amountNum > 0 && (
                      <View style={[styles.previewRow, { flexDirection: rowDir }]}>
                        <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>
                          {t('scratch.validate.toPay')}
                        </Text>
                        <Text style={[styles.previewValue, { color: theme.text }]}>
                          {formatMoney(preview.toPay, locale)}
                        </Text>
                      </View>
                    )}
                    {preview.purchaseStamps > 0 && (
                      <Text style={[styles.previewStamps, { color: theme.success, textAlign }]}>
                        {t('scratch.validate.stamps', { count: preview.purchaseStamps })}
                      </Text>
                    )}
                    {preview.bonusStamps > 0 && (
                      <Text style={[styles.previewStamps, { color: theme.success, textAlign }]}>
                        {t('scratch.validate.bonusStamps', { count: preview.bonusStamps })}
                      </Text>
                    )}
                    <Text style={[styles.previewHint, { color: theme.textMuted, textAlign }]}>
                      {t('scratch.validate.indicative')}
                    </Text>
                  </View>
                )}
              </Section>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Bottom actions ── */}
      {checkResult && (
        <View style={[styles.footer, { borderTopColor: theme.borderLight, backgroundColor: theme.bg }]}>
          <Button label={t('scratch.validate.another')} variant="secondary" onPress={resetAll} style={styles.footerBtn} />
          {checkResult.canRedeem && (
            <Button
              label={t('scratch.validate.submit')}
              loading={redeemCoupon.isPending}
              disabled={!canSubmit}
              onPress={handleRedeem}
              style={styles.footerBtn}
            />
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16, gap: 14, paddingBottom: 24 },
  codeInput: { fontSize: ms(22), fontFamily: 'Lexend_700Bold', letterSpacing: 4, textAlign: 'center' },
  entryActions: { flexDirection: 'row', gap: 10 },
  entryButton: { flex: 1 },
  clientRow: { alignItems: 'center', gap: 10 },
  clientName: { flex: 1, fontSize: ms(15), fontFamily: 'Lexend_600SemiBold' },
  codeChip: { fontSize: ms(13), fontFamily: 'Lexend_500Medium', letterSpacing: 1 },
  rewardLabel: { flex: 1, fontSize: ms(15), fontFamily: 'Lexend_600SemiBold' },
  rewardValue: { fontSize: ms(15), fontFamily: 'Lexend_700Bold' },
  checkRow: { alignItems: 'center', gap: 10 },
  checkText: { flex: 1, fontSize: ms(13.5), fontFamily: 'Lexend_500Medium' },
  previewBox: { gap: 8 },
  previewRow: { alignItems: 'center', justifyContent: 'space-between' },
  previewLabel: { fontSize: ms(13.5), fontFamily: 'Lexend_500Medium' },
  previewValue: { fontSize: ms(16), fontFamily: 'Lexend_700Bold' },
  previewStamps: { fontSize: ms(13.5), fontFamily: 'Lexend_600SemiBold' },
  previewHint: { fontSize: ms(11.5), fontFamily: 'Lexend_400Regular' },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  footerBtn: { flex: 1 },
  successWrap: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 18 },
  successIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: ms(22), fontFamily: 'Lexend_700Bold' },
  successCard: { alignSelf: 'stretch' },
  successLine: { fontSize: ms(15), fontFamily: 'Lexend_500Medium' },
  successActions: { alignSelf: 'stretch', gap: 10 },
});
