import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
} from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter, useLocalSearchParams, useNavigation, usePreventRemove } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { randomUUID } from '@/utils/crypto';
import { hapticError, hapticSuccess, safeSelection } from '@/utils/haptics';
import { markNotifPromptWin } from '@/utils/notifPrompt';
import { AlertTriangle } from 'lucide-react-native';

import { useAuthStore } from '@/stores/authStore';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorMessage } from '@/utils/error';
import { ms, radius } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { ActionButton } from '@/components/ui/ActionButton';
import { formatCurrency, getIntlLocale } from '@/config/currency';
import { useCurrency } from '@/hooks/useCurrency';
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
import { useCheckCollectionItems, useTillCollection } from '@/hooks/useCollectionHooks';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
import { DemoVideoButton } from '@/components/demo/DemoVideoButton';
import { StampClientCard } from '@/components/transaction/StampClientCard';
import { EarnSection } from '@/components/transaction/EarnSection';
import { RewardSelector } from '@/components/transaction/RewardSelector';
import { StampActionBar } from '@/components/transaction/StampActionBar';
import { ClientWinnings } from '@/components/transaction/ClientWinnings';
import { CollectionSection } from '@/components/transaction/CollectionSection';
import { TransactionSuccessModal } from '@/components/transaction/TransactionSuccessModal';
import { cardSurface, cardStyles } from '@/components/transaction/ui';
import { isValidUUID } from '@/utils/validation';
import { cardSlots, DEFAULT_AMOUNT_PER_STAMP, DEFAULT_STAMPS_FOR_REWARD } from '@/utils/stamps';
import {
  computeStampPlan,
  parseAmount,
  sanitizeAmountInput,
  type EarningMode,
  type StampPlan,
} from '@/utils/stampTransaction';
import type { Reward } from '@/types';

// Stable fallbacks so the memoised sections do not re-render on every keystroke.
const NO_REWARDS: Reward[] = [];
const NO_PRIZES: LuckyWheelPendingDraw[] = [];
const NO_COUPONS: ClientCouponAtTill[] = [];
const NO_ITEMS: string[] = [];
// Same blocks as the loaded screen: client card, stamps, gifts.
const SKELETON_HEIGHTS = [ms(60), ms(92), ms(190)];

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
  // bookingId / amount / completeBooking: the till was opened from a booking (agenda/[id]).
  const params = useLocalSearchParams<{ clientId: string; scanTicket?: string; bookingId?: string; amount?: string; completeBooking?: string }>();
  const { clientId, scanTicket } = params;
  const validClientId = clientId && isValidUUID(clientId) ? clientId : undefined;
  const bookingId = params.bookingId && isValidUUID(params.bookingId) ? params.bookingId : undefined;
  const merchant = useAuthStore((s) => s.merchant);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, locale } = useLanguage();
  const currency = useCurrency();

  const status = useClientStatus(validClientId, scanTicket);
  const { data: rewardsData, isLoading: loadingRewards } = useRewards();
  const { data: wheelInfo } = useLuckyWheelActiveInfo();
  const { data: clientPrizes = NO_PRIZES } = useLuckyWheelClientPrizes(validClientId);
  const { data: clientCoupons = NO_COUPONS } = useClientCouponsAtTill(validClientId);
  const { data: collection } = useTillCollection(validClientId);
  const recordTransaction = useRecordTransaction();
  const checkCollection = useCheckCollectionItems();

  const mode: EarningMode = merchant?.stampEarningMode === 'PER_AMOUNT' ? 'PER_AMOUNT' : 'PER_VISIT';
  // The price of the booked service, as a start: the merchant corrects it for an extra or a discount.
  const [initialAmount, setInitialAmount] = useState(() => (bookingId && sanitizeAmountInput(params.amount ?? '')) || '');
  const [amount, setAmount] = useState(initialAmount);
  // Sent with the stamps, once: a booking takes one transaction.
  const [visit, setVisit] = useState(() => (bookingId ? { bookingId, completeBooking: params.completeBooking === '1' } : null));
  const [countVisit, setCountVisit] = useState(true);
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);
  const [collectionItems, setCollectionItems] = useState<string[]>(NO_ITEMS);
  const [purchaseRecordedByCoupon, setPurchaseRecordedByCoupon] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  // Set in the same render as the success reset: the leave guard must not come back on
  // while router.back() runs, or it blocks the back it is replaying, forever.
  const [leaving, setLeaving] = useState(false);

  // One key per draft: a retry after a network failure is replayed, never doubled.
  // Initial keys are created lazily: randomUUID() is a native call and this screen re-renders on every keystroke.
  const [initialEarnKey] = useState(randomUUID);
  const [initialRedeemKey] = useState(randomUUID);
  const [initialCollectionKey] = useState(randomUUID);
  const earnKeyRef = useRef(initialEarnKey);
  const redeemKeyRef = useRef(initialRedeemKey);
  const collectionKeyRef = useRef(initialCollectionKey);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What was just validated: the balance refetches behind the success modal, and the bar
  // must not show the next visit's preview ("7 → 2") while the cashier reads "Nouveau solde : 7".
  const [submitted, setSubmitted] = useState<{ plan: StampPlan; stamps: number } | null>(null);
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
  const purchaseMinSpend = wheelInfo?.hasActiveLuckyWheel ? wheelInfo.purchaseMinSpend ?? 0 : 0;
  const { plan, stampsAfterPurchase } = useMemo(() => {
    const input = { mode, currentStamps, amount: amountNum, countVisit, amountPerStamp, accumulationLimit, purchaseMinSpend };
    return {
      plan: computeStampPlan({ ...input, reward: selectedReward }),
      stampsAfterPurchase: computeStampPlan(input).balanceAfter,
    };
  }, [mode, currentStamps, amountNum, countVisit, amountPerStamp, accumulationLimit, purchaseMinSpend, selectedReward]);
  const goal = useMemo(
    () => cardSlots(rewards.map((r) => r.cout), customer?.stampsForReward ?? merchant?.stampsForReward ?? DEFAULT_STAMPS_FOR_REWARD),
    [rewards, customer?.stampsForReward, merchant?.stampsForReward],
  );

  const wheelMinSpend = wheelInfo?.hasActiveLuckyWheel ? wheelInfo.minSpendAmount ?? 0 : 0;
  // Formatted once per locale/value so the memoised sections get stable strings.
  const intlLocale = getIntlLocale(locale);
  const amountPerStampLabel = useMemo(
    () => formatCurrency(amountPerStamp || DEFAULT_AMOUNT_PER_STAMP, currency, intlLocale),
    [amountPerStamp, currency, intlLocale],
  );
  const wheelMinSpendLabel = useMemo(
    () => formatCurrency(wheelMinSpend, currency, intlLocale),
    [wheelMinSpend, currency, intlLocale],
  );
  // An anonymous client has no name to show: "?" says it without extra text.
  const clientName = [customer?.prenom, customer?.nom].filter(Boolean).join(' ') || '?';
  // Only what can be handed over right now: an expired or not-yet-valid coupon is nothing to give.
  const redeemableCoupons = useMemo(() => clientCoupons.filter((c) => c.canRedeem), [clientCoupons]);
  const winningsCount = clientPrizes.length + redeemableCoupons.length;
  const collectionGiftsDue = useMemo(
    () => redeemableCoupons.filter((c) => c.coupon.source === 'COLLECTION').length,
    [redeemableCoupons],
  );
  const isDirty = amount !== initialAmount || selectedRewardId !== null || collectionItems.length > 0;

  const handleAmountChange = useCallback((text: string) => {
    const next = sanitizeAmountInput(text);
    if (next === null) return;
    setAmount(next);
    setPurchaseRecordedByCoupon(false);
    earnKeyRef.current = randomUUID();
  }, []);

  const handleCountVisitChange = useCallback((value: boolean) => {
    haptic('selection');
    setCountVisit(value);
    setPurchaseRecordedByCoupon(false);
    earnKeyRef.current = randomUUID();
  }, []);

  const visitToggle = useMemo(
    () => (mode === 'PER_VISIT' ? { on: countVisit, disabled: plan.atLimit, onChange: handleCountVisitChange } : null),
    [mode, countVisit, plan.atLimit, handleCountVisitChange],
  );

  const handleSelectReward = useCallback((id: string | null) => {
    haptic('selection');
    setSelectedRewardId(id);
    redeemKeyRef.current = randomUUID();
  }, []);

  const onePerVisit = collection?.onePerVisit ?? false;
  const handleToggleCollectionItem = useCallback((itemId: string) => {
    haptic('selection');
    // One a day: a new pick replaces the previous one.
    setCollectionItems((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : onePerVisit ? [itemId] : [...prev, itemId]);
    collectionKeyRef.current = randomUUID();
  }, [onePerVisit]);

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
    setLeaving(true);
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

  // Same guard for the iOS swipe-back (BackHandler is Android-only): it erased
  // the typed amount without asking, or left during the send, so the cashier
  // never saw whether the stamp went through.
  const navigation = useNavigation();
  usePreventRemove(!leaving && (submitting || (isDirty && !success)), ({ data }) => {
    if (leavingRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (submitting) return;
    Alert.alert(t('stampScreen.leaveTitle'), t('stampScreen.leaveMessage'), [
      { text: t('stampScreen.stay'), style: 'cancel' },
      {
        text: t('stampScreen.leaveConfirm'),
        style: 'destructive',
        onPress: () => {
          leavingRef.current = true;
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  const handleSubmit = useCallback(async () => {
    const hasCollection = collectionItems.length > 0;
    if ((plan.kind === 'none' && !hasCollection) || submitting || !validClientId) return;
    const reward = selectedReward;
    type Step = 'earn' | 'redeem' | 'collection';
    const steps: Step[] =
      plan.kind === 'none'
        ? []
        : plan.kind === 'earn'
          ? ['earn']
          : plan.kind === 'redeem'
            ? ['redeem']
            : plan.order === 'redeemFirst'
              ? ['redeem', 'earn']
              : ['earn', 'redeem'];
    // Last: a new client gets their card from the stamp, and collecting needs the card.
    if (hasCollection) steps.push('collection');
    const done = new Set<Step>();
    let collected: Awaited<ReturnType<typeof checkCollection.mutateAsync>> | null = null;
    let credited = 0;
    let welcomeBonus = 0;

    setSubmitted({ plan, stamps: currentStamps });
    setSubmitting(true);
    try {
      for (const step of steps) {
        if (step === 'earn') {
          const tx = await recordTransaction.mutateAsync({
            clientId: validClientId,
            type: plan.purchaseOnly ? 'PURCHASE' : 'EARN_STAMPS',
            amount: amountNum,
            stamps: plan.earnStamps,
            idempotencyKey: earnKeyRef.current,
            scanTicket,
            ...visit,
          });
          credited = typeof tx?.stamps === 'number' ? tx.stamps : plan.creditedStamps;
          welcomeBonus = typeof tx?.welcomeBonus === 'number' ? tx.welcomeBonus : 0;
        } else if (step === 'collection') {
          collected = await checkCollection.mutateAsync({
            clientId: validClientId,
            itemIds: collectionItems,
            idempotencyKey: collectionKeyRef.current,
          });
          setCollectionItems(NO_ITEMS);
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
      // First success = best moment to offer notifications (next home visit).
      markNotifPromptWin().catch(() => {});
      const balance = plan.balanceAfter - plan.creditedStamps + credited + welcomeBonus;
      const lines: string[] = [];
      if (credited > 0) lines.push(t(credited === 1 ? 'stampScreen.successStamps_one' : 'stampScreen.successStamps_other', { count: credited }));
      if (welcomeBonus > 0) lines.push(t('stampScreen.successWelcomeBonus', { count: welcomeBonus }));
      if (done.has('redeem') && reward) lines.push(t('stampScreen.successReward', { title: reward.titre }));
      if (plan.kind !== 'none') lines.push(t('stampScreen.successBalance', { count: balance }));
      if (collected) {
        lines.push(collected.gift
          ? t('collection.till.successGift', { gift: collected.gift.label })
          : t('collection.till.successProgress', { checked: collected.collection.checked, total: collected.collection.total }));
      }
      setSuccess({
        title:
          plan.kind === 'none'
            ? t('collection.till.successOnly')
            : plan.kind === 'earnAndRedeem'
                ? t(plan.purchaseOnly ? 'stampScreen.successPurchaseAndRedeem' : 'stampScreen.successEarnAndRedeem')
              : plan.kind === 'redeem'
                ? t('stampScreen.successRedeem')
                : t(plan.purchaseOnly ? 'stampScreen.successPurchase' : 'stampScreen.successEarn'),
        lines,
      });
      closeTimerRef.current = setTimeout(leave, SUCCESS_DISPLAY_MS);
    } catch (err: unknown) {
      hapticError();
      // Drop what already went through so a retry only sends the rest.
      if (done.has('earn')) {
        setAmount('');
        setInitialAmount('');
        setVisit(null);
        setCountVisit(false);
        earnKeyRef.current = randomUUID();
      }
      if (done.has('redeem')) {
        setSelectedRewardId(null);
        redeemKeyRef.current = randomUUID();
      }
      // Stamps and gift both planned, only one went through: say which.
      const bothPlanned = steps.includes('earn') && steps.includes('redeem');
      const partial = !bothPlanned || done.has('earn') === done.has('redeem')
        ? null
        : done.has('redeem')
          ? t(plan.purchaseOnly ? 'stampScreen.partialRedeemDonePurchase' : 'stampScreen.partialRedeemDone')
          : t(plan.purchaseOnly ? 'stampScreen.partialPurchaseDone' : 'stampScreen.partialEarnDone');
      // Something went through but not the collection: say that part is left too.
      const collectionLeft = hasCollection && !done.has('collection') && done.size > 0 ? t('collection.till.partial') : null;
      Alert.alert(
        t('common.error'),
        [partial, collectionLeft, getErrorMessage(err, t('stampScreen.error'))].filter(Boolean).join('\n\n'),
      );
    } finally {
      setSubmitting(false);
    }
  }, [plan, currentStamps, submitting, validClientId, scanTicket, visit, selectedReward, recordTransaction, checkCollection, collectionItems, amountNum, leave, t]);

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
          stamps={currentStamps}
          goal={goal}
          isBirthday={customer.isBirthday}
        />

        {winningsCount > 0 && (
          <ClientWinnings
            prizes={clientPrizes}
            coupons={redeemableCoupons}
            clientId={validClientId!}
            defaultAmount={amount}
            onCouponRedeemed={handleCouponRedeemed}
          />
        )}

        <EarnSection
          mode={mode}
          amount={amount}
          onAmountChange={handleAmountChange}
          plan={plan}
          amountPerStampLabel={amountPerStampLabel}
          wheelMinSpend={wheelMinSpend}
          wheelMinSpendLabel={wheelMinSpendLabel}
          purchaseMinSpend={purchaseMinSpend}
          accumulationLimit={accumulationLimit}
          purchaseRecordedByCoupon={purchaseRecordedByCoupon}
        />

        {collection && (
          <CollectionSection
            collection={collection}
            selected={collectionItems}
            onToggle={handleToggleCollectionItem}
            giftsDue={collectionGiftsDue}
          />
        )}

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
        <ScreenHeader
          title={t('stampScreen.title')}
          onBack={handleBack}
          right={<DemoVideoButton id="caisse" variant="header" />}
        />
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
            plan={success && submitted ? submitted.plan : plan}
            currentStamps={success && submitted ? submitted.stamps : currentStamps}
            visit={visitToggle}
            collectionCount={collectionItems.length}
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
