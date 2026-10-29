import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { randomUUID } from '@/utils/crypto';
import { hapticSuccess, safeSelection } from '@/utils/haptics';
import { AlertTriangle } from 'lucide-react-native';

import { useAuthStore } from '@/stores/authStore';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorMessage } from '@/utils/error';
import { ms, radius } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { ActionButton } from '@/components/ui/ActionButton';
import { formatCurrency, DEFAULT_CURRENCY, getIntlLocale } from '@/config/currency';
import { SUCCESS_DISPLAY_MS } from '@/constants/app';
import {
  useClientStatus,
  useRewards,
  useRecordTransaction,
  useLuckyWheelActiveInfo,
  useLuckyWheelClientPrizes,
  type LuckyWheelPendingDraw,
} from '@/hooks/useQueryHooks';
import type { ClientCouponAtTill } from '@jitplus/shared/src/scratch';
import { useClientCouponsAtTill } from '@/hooks/useScratchHooks';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
import { StampClientCard } from '@/components/transaction/StampClientCard';
import { EarnSection } from '@/components/transaction/EarnSection';
import { RewardSelector } from '@/components/transaction/RewardSelector';
import { StampActionBar } from '@/components/transaction/StampActionBar';
import { ClientWinnings } from '@/components/transaction/ClientWinnings';
import { TransactionSuccessModal } from '@/components/transaction/TransactionSuccessModal';
import { cardSurface, cardStyles } from '@/components/transaction/ui';
import { isValidUUID } from '@/utils/validation';
import { cardSlots, DEFAULT_AMOUNT_PER_STAMP, DEFAULT_STAMPS_FOR_REWARD } from '@/utils/stamps';
import {
  computeStampPlan,
  parseAmount,
  sanitizeAmountInput,
  type EarningMode,
} from '@/utils/stampTransaction';
import type { Reward } from '@/types';

// Stable fallbacks so the memoised sections do not re-render on every keystroke.
const NO_REWARDS: Reward[] = [];
const NO_PRIZES: LuckyWheelPendingDraw[] = [];
const NO_COUPONS: ClientCouponAtTill[] = [];
const SKELETON_HEIGHTS = [ms(190), ms(120), ms(150)];

interface SuccessState {
  title: string;
  lines: string[];
}

function haptic(kind: 'success' | 'selection') {
  if (kind === 'success') hapticSuccess();
  else safeSelection();
}

export default function TransactionAmountScreen() {
  const shouldWait = useRequireAuth();
  const router = useRouter();
  const { clientId, scanTicket } = useLocalSearchParams<{ clientId: string; scanTicket?: string }>();
  const validClientId = clientId && isValidUUID(clientId) ? clientId : undefined;
  const merchant = useAuthStore((s) => s.merchant);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, locale } = useLanguage();

  const status = useClientStatus(validClientId, true, scanTicket);
  const { data: rewardsData, isLoading: loadingRewards } = useRewards();
  const { data: wheelInfo } = useLuckyWheelActiveInfo();
  const { data: clientPrizes = NO_PRIZES, isLoading: loadingPrizes } = useLuckyWheelClientPrizes(validClientId);
  const { data: clientCoupons = NO_COUPONS, isLoading: loadingCoupons } = useClientCouponsAtTill(validClientId);
  const recordTransaction = useRecordTransaction();

  const mode: EarningMode = merchant?.stampEarningMode === 'PER_AMOUNT' ? 'PER_AMOUNT' : 'PER_VISIT';
  const [amount, setAmount] = useState('');
  const [countVisit, setCountVisit] = useState(true);
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);
  const [purchaseRecordedByCoupon, setPurchaseRecordedByCoupon] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  // One key per draft: a retry after a network failure is replayed, never doubled.
  // Initial keys are created lazily: randomUUID() is a native call and this screen re-renders on every keystroke.
  const [initialEarnKey] = useState(randomUUID);
  const [initialRedeemKey] = useState(randomUUID);
  const earnKeyRef = useRef(initialEarnKey);
  const redeemKeyRef = useRef(initialRedeemKey);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leavingRef = useRef(false);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!validClientId) {
      Alert.alert(t('common.error'), t('transactionAmount.noClientSelected'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per client id
  }, [validClientId]);

  const customer = status.data;
  const currentStamps = customer?.stamps ?? 0;
  const rewards = rewardsData ?? NO_REWARDS;
  const selectedReward = useMemo(
    () => rewards.find((r) => r.id === selectedRewardId) ?? null,
    [rewards, selectedRewardId],
  );
  const amountNum = parseAmount(amount);
  const amountPerStamp = merchant?.amountPerStamp;
  const accumulationLimit = merchant?.accumulationLimit;
  const { plan, stampsAfterPurchase } = useMemo(() => {
    const input = { mode, currentStamps, amount: amountNum, countVisit, amountPerStamp, accumulationLimit };
    return {
      plan: computeStampPlan({ ...input, reward: selectedReward }),
      stampsAfterPurchase: computeStampPlan(input).balanceAfter,
    };
  }, [mode, currentStamps, amountNum, countVisit, amountPerStamp, accumulationLimit, selectedReward]);
  const goal = useMemo(
    () => cardSlots(rewards.map((r) => r.cout), customer?.stampsForReward ?? merchant?.stampsForReward ?? DEFAULT_STAMPS_FOR_REWARD),
    [rewards, customer?.stampsForReward, merchant?.stampsForReward],
  );

  const wheelMinSpend = wheelInfo?.hasActiveLuckyWheel ? wheelInfo.minSpendAmount ?? 0 : 0;
  // Formatted once per locale/value so the memoised sections get stable strings.
  const intlLocale = getIntlLocale(locale);
  const amountPerStampLabel = useMemo(
    () => formatCurrency(amountPerStamp || DEFAULT_AMOUNT_PER_STAMP, DEFAULT_CURRENCY, intlLocale),
    [amountPerStamp, intlLocale],
  );
  const wheelMinSpendLabel = useMemo(
    () => formatCurrency(wheelMinSpend, DEFAULT_CURRENCY, intlLocale),
    [wheelMinSpend, intlLocale],
  );
  const clientName =
    [customer?.prenom, customer?.nom].filter(Boolean).join(' ') || t('transaction.defaultClient');
  const winningsCount = clientPrizes.length + clientCoupons.length;
  const isDirty = amount !== '' || selectedRewardId !== null;

  const handleAmountChange = useCallback((text: string) => {
    const next = sanitizeAmountInput(text);
    if (next === null) return;
    setAmount(next);
    setPurchaseRecordedByCoupon(false);
    earnKeyRef.current = randomUUID();
  }, []);

  const handleCountVisitChange = useCallback((value: boolean) => {
    setCountVisit(value);
    setPurchaseRecordedByCoupon(false);
    earnKeyRef.current = randomUUID();
  }, []);

  const handleSelectReward = useCallback((id: string | null) => {
    haptic('selection');
    setSelectedRewardId(id);
    redeemKeyRef.current = randomUUID();
  }, []);

  const handleCouponRedeemed = useCallback((purchaseAmount: number) => {
    // A coupon redeemed with a ticket amount already credited this purchase.
    if (purchaseAmount <= 0) return;
    setAmount('');
    setCountVisit(false);
    setPurchaseRecordedByCoupon(true);
    earnKeyRef.current = randomUUID();
  }, []);

  const leave = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setSuccess(null);
    router.back();
  }, [router]);

  const handleBack = useCallback(() => {
    if (submitting) return true;
    if (!isDirty || success) {
      leave();
      return true;
    }
    Alert.alert(t('stampScreen.leaveTitle'), t('stampScreen.leaveMessage'), [
      { text: t('stampScreen.stay'), style: 'cancel' },
      { text: t('stampScreen.leaveConfirm'), style: 'destructive', onPress: leave },
    ]);
    return true;
  }, [submitting, isDirty, success, leave, t]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [handleBack]);

  const handleSubmit = useCallback(async () => {
    if (plan.kind === 'none' || submitting || !validClientId) return;
    const reward = selectedReward;
    const steps: ('earn' | 'redeem')[] =
      plan.kind === 'earn'
        ? ['earn']
        : plan.kind === 'redeem'
          ? ['redeem']
          : plan.order === 'redeemFirst'
            ? ['redeem', 'earn']
            : ['earn', 'redeem'];
    const done = new Set<'earn' | 'redeem'>();
    let credited = 0;

    setSubmitting(true);
    try {
      for (const step of steps) {
        if (step === 'earn') {
          const tx = await recordTransaction.mutateAsync({
            clientId: validClientId,
            type: 'EARN_STAMPS',
            amount: amountNum,
            stamps: plan.earnStamps,
            idempotencyKey: earnKeyRef.current,
            scanTicket,
          });
          credited = typeof tx?.stamps === 'number' ? tx.stamps : plan.creditedStamps;
        } else if (reward) {
          await recordTransaction.mutateAsync({
            clientId: validClientId,
            type: 'REDEEM_REWARD',
            amount: 0,
            stamps: reward.cout,
            rewardId: reward.id,
            idempotencyKey: redeemKeyRef.current,
            scanTicket,
          });
        }
        done.add(step);
      }

      haptic('success');
      const balance = plan.balanceAfter - plan.creditedStamps + credited;
      const lines: string[] = [];
      if (credited > 0) lines.push(t(credited === 1 ? 'stampScreen.successStamps_one' : 'stampScreen.successStamps_other', { count: credited }));
      if (done.has('redeem') && reward) lines.push(t('stampScreen.successReward', { title: reward.titre }));
      lines.push(t('stampScreen.successBalance', { count: balance }));
      setSuccess({
        title:
          plan.kind === 'earnAndRedeem'
            ? t('stampScreen.successEarnAndRedeem')
            : plan.kind === 'redeem'
              ? t('stampScreen.successRedeem')
              : t('stampScreen.successEarn'),
        lines,
      });
      closeTimerRef.current = setTimeout(leave, SUCCESS_DISPLAY_MS);
    } catch (err: unknown) {
      // Drop what already went through so a retry only sends the rest.
      if (done.has('earn')) {
        setAmount('');
        setCountVisit(false);
        earnKeyRef.current = randomUUID();
      }
      if (done.has('redeem')) {
        setSelectedRewardId(null);
        redeemKeyRef.current = randomUUID();
      }
      const partial = done.has('redeem')
        ? t('stampScreen.partialRedeemDone')
        : done.has('earn')
          ? t('stampScreen.partialEarnDone')
          : null;
      Alert.alert(
        t('common.error'),
        [partial, getErrorMessage(err, t('stampScreen.error'))].filter(Boolean).join('\n\n'),
      );
    } finally {
      setSubmitting(false);
    }
  }, [plan, submitting, validClientId, scanTicket, selectedReward, recordTransaction, amountNum, leave, t]);

  if (shouldWait) return null;

  const renderBody = () => {
    if (status.isLoading) {
      return (
        <View style={styles.skeletonWrap}>
          {SKELETON_HEIGHTS.map((height, i) => (
            <View key={i} style={[styles.skeleton, { height, backgroundColor: theme.bgSkeleton }]} />
          ))}
        </View>
      );
    }
    if (status.isError || !customer) {
      return (
        <View style={[cardStyles.card, cardSurface(theme), styles.errorCard]}>
          <AlertTriangle size={ms(28)} color={theme.danger} strokeWidth={icon.stroke} />
          <Text style={[styles.errorText, { color: theme.text }]}>{t('stampScreen.loadError')}</Text>
          <ActionButton label={t('common.retry')} onPress={() => status.refetch()} />
        </View>
      );
    }
    return (
      <>
        <StampClientCard
          name={clientName}
          prenom={customer.prenom}
          nom={customer.nom}
          stamps={currentStamps}
          pendingStamps={plan.kind === 'earn' ? plan.creditedStamps : 0}
          goal={goal}
          isBirthday={customer.isBirthday}
        />

        {(winningsCount > 0 || loadingPrizes || loadingCoupons) && (
          <ClientWinnings
            prizes={clientPrizes}
            coupons={clientCoupons}
            loading={loadingPrizes || loadingCoupons}
            clientId={validClientId!}
            defaultAmount={amount}
            onCouponRedeemed={handleCouponRedeemed}
          />
        )}

        <EarnSection
          mode={mode}
          amount={amount}
          onAmountChange={handleAmountChange}
          countVisit={countVisit}
          onCountVisitChange={handleCountVisitChange}
          plan={plan}
          amountPerStampLabel={amountPerStampLabel}
          wheelMinSpend={wheelMinSpend}
          wheelMinSpendLabel={wheelMinSpendLabel}
          accumulationLimit={accumulationLimit}
          purchaseRecordedByCoupon={purchaseRecordedByCoupon}
        />

        <RewardSelector
          rewards={rewards}
          loading={loadingRewards}
          selectedRewardId={selectedRewardId}
          onSelect={handleSelectReward}
          currentStamps={currentStamps}
          stampsAfterPurchase={stampsAfterPurchase}
        />
      </>
    );
  };

  return (
    <>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScreenHeader title={t('stampScreen.title')} onBack={handleBack} />
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {renderBody()}
        </ScrollView>
        {customer && (
          <StampActionBar
            plan={plan}
            currentStamps={currentStamps}
            rewardTitle={selectedReward?.titre ?? null}
            loading={submitting}
            bottomInset={insets.bottom}
            onSubmit={handleSubmit}
          />
        )}
      </KeyboardAvoidingView>

      <TransactionSuccessModal
        visible={!!success}
        title={success?.title ?? ''}
        lines={success?.lines ?? []}
        hint={t('stampScreen.tapToClose')}
        onClose={leave}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { paddingTop: 4, paddingBottom: 28 },
  skeletonWrap: { gap: 14, paddingTop: 8 },
  skeleton: { marginHorizontal: 16, borderRadius: radius.lg },
  errorCard: { marginTop: 24, padding: 24, alignItems: 'center', gap: 12 },
  errorText: { fontSize: ms(15), textAlign: 'center', fontFamily: font.medium },
});
