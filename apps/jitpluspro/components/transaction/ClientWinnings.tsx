import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import { JitGames, JitGift, JitLock, JitTicket } from '@/components/icons';
import { LinearGradient } from 'expo-linear-gradient';
import { randomUUID } from '@/utils/crypto';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { useFulfilLuckyWheelPrize, type LuckyWheelPendingDraw } from '@/hooks/useQueryHooks';
import { useRedeemCoupon } from '@/hooks/useScratchHooks';
import { getErrorMessage } from '@/utils/error';
import { font, icon } from '@/constants/design';
import { ms, radius } from '@/utils/responsive';
import { formatDate, formatDateTime } from '@/utils/date';
import { MAX_AMOUNT_DIGITS } from '@/constants/app';
import { computeStampsForAmount } from '@/utils/stamps';
import { sanitizeAmountInput } from '@/utils/stampTransaction';
import { formatCurrency, DEFAULT_CURRENCY, getIntlLocale } from '@/config/currency';
import {
  computeCouponDiscount,
  formatCouponCode,
  formatRewardValue,
  minutesToTime,
  type ClientCouponAtTill,
  type CouponCheck,
} from '@jitplus/shared/src/scratch';
import { Button, FieldLabel, Input, Notice } from '@/components/scratch/ScratchUI';
import { cardSurface, cardStyles } from './ui';

type Selection = { kind: 'prize'; id: string } | { kind: 'coupon'; id: string } | null;

interface Props {
  prizes: LuckyWheelPendingDraw[];
  coupons: ClientCouponAtTill[];
  loading: boolean;
  clientId: string;
  /** Purchase amount already typed on the stamps screen, reused for the coupon. */
  defaultAmount?: string;
  /** Called after a coupon redemption, with the ticket amount it recorded. */
  onCouponRedeemed?: (purchaseAmount: number) => void;
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** Why a coupon cannot be used right now, from the first failed server check. */
function couponBlockedReason(checks: CouponCheck[], t: Translate, locale: string): string | null {
  const failed = checks.find((c) => c.ok === false);
  if (!failed) return null;
  const d = failed.detail ?? {};
  switch (failed.key) {
    case 'dates':
      return new Date(String(d.validFrom)).getTime() > Date.now()
        ? t('scratch.validate.notStarted', { date: formatDateTime(String(d.validFrom), locale) })
        : t('scratch.validate.expiredOn', { date: formatDateTime(String(d.expiresAt), locale) });
    case 'weekday': {
      const days = (Array.isArray(d.allowed) ? (d.allowed as number[]) : [])
        .map((day) => t(`scratch.weekdayShort.${day}`))
        .join(', ');
      return t('scratch.validate.weekdayNo', { days });
    }
    case 'hours':
      return t('scratch.validate.hoursNo', { from: minutesToTime(Number(d.from)), to: minutesToTime(Number(d.to)) });
    default:
      return t('scratch.validate.statusEXPIRED');
  }
}

function ClientWinningsBase({ prizes, coupons, loading, clientId, defaultAmount = '', onCouponRedeemed }: Props) {
  const theme = useTheme();
  const { t, locale, isRTL } = useLanguage();
  const merchant = useAuthStore((s) => s.merchant);
  const isPerAmount = merchant?.stampEarningMode === 'PER_AMOUNT';
  const row = isRTL ? 'row-reverse' : 'row';

  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [amount, setAmount] = useState(defaultAmount);
  // One key per selected coupon: a retry after a network failure replays safely.
  const idemKeyRef = useRef(randomUUID());

  const fulfil = useFulfilLuckyWheelPrize();
  const redeem = useRedeemCoupon();
  const busy = fulfil.isPending || redeem.isPending;

  const money = useCallback(
    (value: number) => formatCurrency(value, DEFAULT_CURRENCY, getIntlLocale(locale)),
    [locale],
  );

  const select = useCallback(
    (next: Selection) => {
      if (busy) return;
      setSelection((prev) => (prev && next && prev.kind === next.kind && prev.id === next.id ? null : next));
      idemKeyRef.current = randomUUID();
      setAmount(defaultAmount);
    },
    [busy, defaultAmount],
  );

  const selectedPrize = selection?.kind === 'prize' ? prizes.find((p) => p.id === selection.id) ?? null : null;
  const selectedCoupon = selection?.kind === 'coupon' ? coupons.find((c) => c.coupon.id === selection.id) ?? null : null;

  const amountNum = parseFloat(amount) || 0;
  const couponRules = useMemo(() => {
    if (!selectedCoupon) return null;
    const { coupon } = selectedCoupon;
    const minPurchase = coupon.conditions.minPurchaseAmount ?? 0;
    const isDiscount = coupon.type === 'PERCENT_DISCOUNT' || coupon.type === 'FIXED_DISCOUNT';
    const required = isDiscount || minPurchase > 0 || isPerAmount;
    const discount = computeCouponDiscount(coupon, amountNum);
    const toPay = Math.max(0, Math.round((amountNum - discount) * 100) / 100);
    const purchaseStamps =
      amountNum > 0 ? (isPerAmount ? computeStampsForAmount(toPay, merchant?.amountPerStamp).stamps : 1) : 0;
    const bonusStamps = coupon.type === 'BONUS_STAMPS' ? Math.max(0, Math.round(coupon.value ?? 0)) : 0;
    const ok = (!required || amountNum > 0) && amountNum >= minPurchase;
    return { minPurchase, required, discount, toPay, purchaseStamps, bonusStamps, ok };
  }, [selectedCoupon, amountNum, isPerAmount, merchant?.amountPerStamp]);

  const givePrize = useCallback(() => {
    if (!selectedPrize) return;
    const label = selectedPrize.prize?.label ?? '';
    Alert.alert(t('transactionAmount.giveAction'), t('transactionAmount.givePrizeConfirm', { prize: label }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: () =>
          fulfil.mutate(selectedPrize.id, {
            onSuccess: () => {
              setSelection(null);
              Alert.alert(t('transactionAmount.givenPrizeTitle'), t('transactionAmount.givenPrizeSuccess'));
            },
            onError: (err) => Alert.alert(t('common.error'), getErrorMessage(err, t('transactionAmount.giveError'))),
          }),
      },
    ]);
  }, [selectedPrize, fulfil, t]);

  const giveCoupon = useCallback(() => {
    if (!selectedCoupon || !couponRules?.ok) return;
    const { coupon } = selectedCoupon;
    Alert.alert(t('transactionAmount.giveAction'), t('transactionAmount.giveCouponConfirm', { label: coupon.label }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: () =>
          redeem.mutate(
            { couponId: coupon.id, purchaseAmount: amountNum, clientId, idempotencyKey: idemKeyRef.current },
            {
              onSuccess: (res) => {
                setSelection(null);
                onCouponRedeemed?.(amountNum);
                const lines: string[] = [];
                if (res.discountAmount > 0) {
                  lines.push(t('scratch.validate.successDiscount', { amount: money(res.discountAmount) }));
                }
                const stamps = res.stampsEarned + res.bonusStamps;
                if (stamps > 0) lines.push(t('scratch.validate.successStamps', { count: stamps }));
                lines.push(t('scratch.validate.successBalance', { count: res.newBalance }));
                Alert.alert(t('transactionAmount.givenCouponTitle'), lines.join('\n'));
              },
              onError: (err) => Alert.alert(t('common.error'), getErrorMessage(err, t('transactionAmount.giveError'))),
            },
          ),
      },
    ]);
  }, [selectedCoupon, couponRules?.ok, redeem, amountNum, clientId, money, onCouponRedeemed, t]);

  const textAlign = isRTL ? 'right' : 'left';
  const rowBorder = theme.mode === 'dark' ? theme.border : theme.borderLight;

  const renderIndicator = (selected: boolean) => (
    <View
      style={[
        styles.indicator,
        { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : 'transparent' },
      ]}
    >
      {selected && <Check size={ms(13)} color="#fff" strokeWidth={icon.strokeSmall} />}
    </View>
  );

  const renderGroupTitle = (Icon: typeof JitTicket, color: string, text: string) => (
    <View style={[styles.groupHeader, { flexDirection: row }]}>
      <Icon size={ms(13)} color={color} strokeWidth={icon.strokeSmall} />
      <Text style={[styles.groupTitle, { color: theme.textMuted }]}>{text}</Text>
    </View>
  );

  const count = prizes.length + coupons.length;
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <View style={[cardStyles.card, cardSurface(theme), styles.card, { borderColor: `${theme.warning}55` }]}>
      <TouchableOpacity
        style={[styles.header, { flexDirection: row }]}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <LinearGradient colors={[palette.gold, theme.warning]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerIcon}>
          <JitGift size={ms(20)} color={palette.charbonDark} strokeWidth={icon.stroke} />
        </LinearGradient>
        <View style={styles.info}>
          <Text style={[styles.title, { color: theme.text, textAlign }]}>
            {loading && count === 0 ? t('stampScreen.winningsLoading') : t(count === 1 ? 'stampScreen.winningsTitle_one' : 'stampScreen.winningsTitle_other', { count })}
          </Text>
          <Text style={[styles.meta, { color: theme.textMuted, textAlign }]}>{t('stampScreen.winningsSubtitle')}</Text>
        </View>
        {loading && count === 0 ? (
          <ActivityIndicator size="small" color={theme.warning} />
        ) : (
          <View style={[styles.chevron, { backgroundColor: `${theme.warning}1A` }]}>
            <Chevron size={ms(18)} color={theme.warning} strokeWidth={icon.stroke} />
          </View>
        )}
      </TouchableOpacity>

      {!open ? null : loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      ) : prizes.length === 0 && coupons.length === 0 ? (
        <View style={styles.empty}>
          <JitGift size={ms(32)} color={theme.textMuted} strokeWidth={icon.stroke} />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t('transactionAmount.winningsEmpty')}</Text>
        </View>
      ) : (
        <>
          <View style={[styles.divider, { backgroundColor: rowBorder }]} />
          <Text style={[styles.hint, { color: theme.textMuted, textAlign }]}>{t('transactionAmount.winningsHint')}</Text>
          {prizes.length > 0 && (
            <View style={styles.group}>
              {renderGroupTitle(JitGames, theme.warning, t('transactionAmount.wheelSection'))}
              {prizes.map((draw) => {
                const selected = selection?.kind === 'prize' && selection.id === draw.id;
                const meta = [
                  draw.ticket?.campaign?.name,
                  draw.claimBefore ? t('transactionAmount.claimBefore', { date: formatDate(draw.claimBefore, locale) }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <View
                    key={draw.id}
                    style={[
                      styles.item,
                      selected
                        ? { borderColor: theme.primary, backgroundColor: theme.primaryBg }
                        : { borderColor: rowBorder, backgroundColor: theme.bg },
                    ]}
                  >
                    <TouchableOpacity
                      style={[styles.row, { flexDirection: row }]}
                      onPress={() => select({ kind: 'prize', id: draw.id })}
                      activeOpacity={0.75}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                    >
                      <View style={[styles.itemIcon, { backgroundColor: `${theme.warning}1A` }]}>
                        <JitGames size={ms(18)} color={theme.warning} strokeWidth={icon.stroke} />
                      </View>
                      <View style={styles.info}>
                        <Text style={[styles.name, { color: theme.text, textAlign }]}>{draw.prize?.label ?? ''}</Text>
                        {!!draw.prize?.description && (
                          <Text style={[styles.meta, { color: theme.textSecondary, textAlign }]}>{draw.prize.description}</Text>
                        )}
                        {!!meta && <Text style={[styles.meta, { color: theme.textMuted, textAlign }]}>{meta}</Text>}
                      </View>
                      {renderIndicator(selected)}
                    </TouchableOpacity>
                    {selected && (
                      <View style={styles.panel}>
                        <Button
                          label={t('transactionAmount.giveAction')}
                          icon={JitGift}
                          onPress={givePrize}
                          loading={fulfil.isPending}
                          disabled={busy}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {coupons.length > 0 && (
            <View style={styles.group}>
              {renderGroupTitle(JitTicket, theme.primary, t('transactionAmount.scratchSection'))}
              {coupons.map((item) => {
                const { coupon } = item;
                const selected = selection?.kind === 'coupon' && selection.id === coupon.id;
                const blocked = item.canRedeem
                  ? null
                  : couponBlockedReason(item.checks, t, locale) ?? t('scratch.validate.anonymous');
                const value = formatRewardValue(coupon, t);
                return (
                  <View
                    key={coupon.id}
                    style={[
                      styles.item,
                      selected
                        ? { borderColor: theme.primary, backgroundColor: theme.primaryBg }
                        : { borderColor: rowBorder, backgroundColor: theme.bg },
                      { opacity: blocked ? 0.6 : 1 },
                    ]}
                  >
                    <TouchableOpacity
                      style={[styles.row, { flexDirection: row }]}
                      onPress={() => select({ kind: 'coupon', id: coupon.id })}
                      disabled={!!blocked}
                      activeOpacity={0.75}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: !!blocked }}
                    >
                      <View style={[styles.itemIcon, { backgroundColor: theme.primaryBg }]}>
                        <JitTicket size={ms(18)} color={theme.primary} strokeWidth={icon.stroke} />
                      </View>
                      <View style={styles.info}>
                        <Text style={[styles.name, { color: theme.text, textAlign }]}>{value}</Text>
                        {coupon.label.trim() !== value && (
                          <Text style={[styles.meta, { color: theme.textSecondary, textAlign }]}>{coupon.label}</Text>
                        )}
                        <Text style={[styles.meta, { color: theme.textMuted, textAlign }]}>
                          {t('transactionAmount.couponCode', { code: formatCouponCode(coupon.code) })} ·{' '}
                          {t('transactionAmount.couponExpires', { date: formatDate(coupon.expiresAt, locale) })}
                        </Text>
                        {!!blocked && (
                          <View style={[styles.blocked, { flexDirection: row, alignSelf: isRTL ? 'flex-end' : 'flex-start', backgroundColor: `${theme.danger}14` }]}>
                            <JitLock size={ms(11)} color={theme.danger} strokeWidth={icon.strokeSmall} />
                            <Text style={[styles.blockedText, { color: theme.danger, textAlign }]}>{blocked}</Text>
                          </View>
                        )}
                      </View>
                      {!blocked && renderIndicator(selected)}
                    </TouchableOpacity>

                    {selected && couponRules && (
                      <View style={[styles.panel, styles.couponPanel]}>
                        <FieldLabel
                          text={`${t('scratch.validate.amountLabel')} (${
                            couponRules.required ? t('scratch.validate.amountRequired') : t('scratch.validate.amountOptional')
                          })`}
                        />
                        <Input
                          value={amount}
                          onChangeText={(text) => {
                            const next = sanitizeAmountInput(text);
                            if (next !== null) setAmount(next);
                          }}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          maxLength={MAX_AMOUNT_DIGITS}
                        />
                        {couponRules.minPurchase > 0 && amountNum > 0 && amountNum < couponRules.minPurchase && (
                          <Text style={[styles.meta, { color: theme.danger, textAlign }]}>
                            {t('scratch.validate.minPurchaseNo', { amount: couponRules.minPurchase })}
                          </Text>
                        )}
                        {(couponRules.discount > 0 || amountNum > 0) && (
                          <View style={[styles.receipt, { backgroundColor: theme.bgCard, borderColor: rowBorder }]}>
                            {couponRules.discount > 0 && (
                              <View style={[styles.previewRow, { flexDirection: row }]}>
                                <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>{t('scratch.validate.discount')}</Text>
                                <Text style={[styles.previewValue, { color: theme.danger }]}>-{money(couponRules.discount)}</Text>
                              </View>
                            )}
                            {amountNum > 0 && (
                              <View style={[styles.previewRow, { flexDirection: row }]}>
                                <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>{t('scratch.validate.toPay')}</Text>
                                <Text style={[styles.previewValue, styles.previewTotal, { color: theme.text }]}>{money(couponRules.toPay)}</Text>
                              </View>
                            )}
                          </View>
                        )}
                        {(couponRules.purchaseStamps > 0 || couponRules.bonusStamps > 0) && (
                          <View style={[styles.stampChips, { flexDirection: row }]}>
                            {couponRules.purchaseStamps > 0 && (
                              <View style={[styles.stampChip, { backgroundColor: `${theme.success}1A` }]}>
                                <Text style={[styles.stampChipText, { color: theme.success }]}>
                                  {t('scratch.validate.stamps', { count: couponRules.purchaseStamps })}
                                </Text>
                              </View>
                            )}
                            {couponRules.bonusStamps > 0 && (
                              <View style={[styles.stampChip, { backgroundColor: `${theme.success}1A` }]}>
                                <Text style={[styles.stampChipText, { color: theme.success }]}>
                                  {t('scratch.validate.bonusStamps', { count: couponRules.bonusStamps })}
                                </Text>
                              </View>
                            )}
                          </View>
                        )}
                        <Notice text={t('transactionAmount.couponRecordsPurchase')} />
                        <Button
                          label={t('transactionAmount.giveAction')}
                          icon={JitTicket}
                          onPress={giveCoupon}
                          loading={redeem.isPending}
                          disabled={busy || !couponRules.ok}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

export const ClientWinnings = memo(ClientWinningsBase);

const styles = StyleSheet.create({
  card: { marginTop: 14, gap: 10, padding: 14 },
  header: { alignItems: 'center', gap: 12, minHeight: 48 },
  headerIcon: { width: ms(42), height: ms(42), borderRadius: ms(21), alignItems: 'center', justifyContent: 'center' },
  chevron: { width: ms(32), height: ms(32), borderRadius: ms(16), alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: ms(15), fontFamily: font.semibold },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  hint: { fontSize: ms(13), lineHeight: ms(18), fontFamily: font.regular },
  loading: { paddingVertical: 20, alignItems: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  emptyText: { fontSize: ms(14), textAlign: 'center', fontFamily: font.medium },
  group: { gap: 8, marginTop: 4 },
  groupHeader: { alignItems: 'center', gap: 6, marginTop: 2 },
  groupTitle: { fontSize: ms(12), fontFamily: font.semibold },
  item: { borderRadius: radius.lg, borderWidth: 1.5, overflow: 'hidden' },
  row: { alignItems: 'center', padding: 12, gap: 12 },
  itemIcon: { width: ms(40), height: ms(40), borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: ms(15), fontFamily: font.semibold },
  meta: { fontSize: ms(13), fontFamily: font.regular },
  blocked: { alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4 },
  blockedText: { flexShrink: 1, fontSize: ms(12), fontFamily: font.medium },
  indicator: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  panel: { paddingHorizontal: 12, paddingBottom: 12 },
  couponPanel: { gap: 10 },
  receipt: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  previewRow: { alignItems: 'center', justifyContent: 'space-between' },
  previewLabel: { fontSize: ms(14), fontFamily: font.medium },
  previewValue: { fontSize: ms(15), fontFamily: font.bold },
  previewTotal: { fontSize: ms(18) },
  stampChips: { flexWrap: 'wrap', gap: 6 },
  stampChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  stampChipText: { fontSize: ms(13), fontFamily: font.semibold },
});
