import React, { useState, useEffect, useCallback, useReducer, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CircleUser,
  Gift,
  CheckCircle,
  X,
  Award,
  Stamp,
  Trophy,
  Info,
  PartyPopper,
  ArrowLeft,
  ShoppingBag,
  Tag,
} from 'lucide-react-native';

// lottie-react-native is NOT available in Expo Go SDK 51+

import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorMessage } from '@/utils/error';
import StampGrid from '@/components/StampGrid';
import { formatCurrency, DEFAULT_CURRENCY, getIntlLocale } from '@/config/currency';
import { MAX_AMOUNT_DIGITS, SUCCESS_DISPLAY_MS } from '@/constants/app';
import { useClientStatus, useRewards, useRecordTransaction, useLuckyWheelActiveInfo } from '@/hooks/useQueryHooks';
import { RewardSelector } from '@/components/transaction/RewardSelector';
import { TransactionSuccessModal } from '@/components/transaction/TransactionSuccessModal';
import { isValidUUID } from '@/utils/validation';

type TransactionType = 'EARN_POINTS' | 'REDEEM_REWARD';

// ── Reducer ──
interface TxState {
  amount: string;
  loading: boolean;
  points: number;
  showSuccess: boolean;
  transactionType: TransactionType;
  selectedRewardId: string | null;
  screenMode: 'earn' | 'redeem';
  stampAmount: string;
  stamps: number;
  /** Authoritative amount credited by the backend (after accumulationLimit cap). */
  actualCredited: number | null;
}

const initialTxState: TxState = {
  amount: '',
  loading: false,
  points: 0,
  showSuccess: false,
  transactionType: 'EARN_POINTS',
  selectedRewardId: null,
  screenMode: 'earn',
  stampAmount: '',
  stamps: 0,
  actualCredited: null,
};

type TxAction =
  | { type: 'SET'; payload: Partial<TxState> }
  | { type: 'RESET_REWARD' };

function txReducer(state: TxState, action: TxAction): TxState {
  switch (action.type) {
    case 'SET':
      return { ...state, ...action.payload };
    case 'RESET_REWARD':
      return { ...state, selectedRewardId: null };
  }
}

export default function TransactionAmountScreen() {
  const shouldWait = useRequireAuth();
  const router = useRouter();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { merchant } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [state, dispatch] = useReducer(txReducer, initialTxState);
  const { amount, loading, points, showSuccess, transactionType, selectedRewardId, screenMode, stampAmount, stamps, actualCredited } = state;
  const set = useCallback((payload: Partial<TxState>) => dispatch({ type: 'SET', payload }), []);
  const setSelectedRewardId = useCallback((id: string | null) => set({ selectedRewardId: id }), [set]);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup success timer on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // ── React Query hooks ──
  const {
    data: customerStatus,
    isLoading: loadingCustomer,
  } = useClientStatus(clientId);

  // ── Birthday popup ──
  const [showBirthdayPopup, setShowBirthdayPopup] = useState(false);
  useEffect(() => {
    if (customerStatus?.isBirthday) {
      setShowBirthdayPopup(true);
    }
  }, [customerStatus?.isBirthday]);

  const {
    data: rewardsList,
    isLoading: loadingRewards,
  } = useRewards();

  const rewards = rewardsList ?? [];
  const selectedReward = rewards.find((r) => r.id === selectedRewardId) || null;
  const recordTransactionMutation = useRecordTransaction();

  // ── LuckyWheel active info (for minSpendAmount on PER_VISIT) ──
  const { data: luckyWheelInfo } = useLuckyWheelActiveInfo();
  const luckyWheelMinSpend = luckyWheelInfo?.minSpendAmount ?? 0;
  const [luckyWheelAmount, setLuckyWheelAmount] = useState('');

  // Guard: if no clientId or invalid UUID go back
  useEffect(() => {
    if (!clientId || !isValidUUID(clientId)) {
      Alert.alert(t('common.error'), t('transactionAmount.noClientSelected'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  }, [clientId, router]);

  // ── Stamps mode ──
  const isStampsMode = merchant?.loyaltyType === 'STAMPS';
  const isPerVisit = isStampsMode && (merchant?.stampEarningMode || 'PER_VISIT') === 'PER_VISIT';
  const hasLuckyWheelSpendReq = isPerVisit && luckyWheelMinSpend > 0;
  const targetReward = selectedReward || rewards[0];
  const stampsForReward = targetReward?.cout || 10;
  const { t, locale } = useLanguage();

  const calculatePoints = useCallback(() => {
    const amountNum = parseFloat(amount) || 0;
    if (amountNum === 0 || !merchant) {
      set({ points: 0 });
      return;
    }
    const pointsRate = merchant.pointsRate || 10;
    if (!Number.isFinite(pointsRate) || pointsRate <= 0) {
      set({ points: 0 });
      return;
    }
    set({ points: Math.floor(amountNum / pointsRate) });
  }, [amount, merchant]);

  useEffect(() => {
    if (!isStampsMode) calculatePoints();
  }, [calculatePoints, isStampsMode]);

  useEffect(() => {
    if (isStampsMode) {
      if (isPerVisit) {
        set({ stamps: 1 });
        return;
      }
      const amountNum = parseFloat(stampAmount) || 0;
      if (amountNum === 0 || !merchant) {
        set({ stamps: 0 });
        return;
      }
      const rate = merchant.pointsRate || 10;
      if (!Number.isFinite(rate) || rate <= 0) {
        set({ stamps: 0 });
        return;
      }
      set({ stamps: Math.floor(amountNum / rate) });
    }
  }, [stampAmount, merchant, isStampsMode, isPerVisit]);

  // ── Amount input handler (Points mode) ──
  const handleAmountChange = useCallback((text: string) => {
    // Explicitly reject negative input before normalizing characters.
    if (text.trim().startsWith('-')) return;
    // Allow only valid decimal numbers
    const cleaned = text.replace(/[^0-9.]/g, '');
    // Prevent multiple dots
    const parts = cleaned.split('.');
    let formatted = parts[0] || '';
    if (parts.length > 1) formatted += '.' + (parts[1]?.slice(0, 2) || '');
    if (formatted.length <= MAX_AMOUNT_DIGITS) set({ amount: formatted });
  }, [set]);

  // ── Stamp amount input handler ──
  const handleStampAmountChange = useCallback((text: string) => {
    // Explicitly reject negative input before normalizing characters.
    if (text.trim().startsWith('-')) return;
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    let formatted = parts[0] || '';
    if (parts.length > 1) formatted += '.' + (parts[1]?.slice(0, 2) || '');
    if (formatted.length <= MAX_AMOUNT_DIGITS) set({ stampAmount: formatted });
  }, [set]);

  // ── REDEEM ONLY (cadeau sans achat) ──
  const handleRedeemOnly = useCallback(() => {
    if (!selectedRewardId || !selectedReward) {
      Alert.alert(t('common.error'), t('transactionAmount.selectReward'));
      return;
    }
    const currentPoints = customerStatus?.points || 0;
    if (currentPoints < selectedReward.cout) {
      Alert.alert(t('common.error'), t('transactionAmount.notEnoughPoints'));
      return;
    }
    Alert.alert(
      t('transactionAmount.redeemTitle'),
      t('transactionAmount.redeemConfirm', {
        title: selectedReward.titre,
        cost: selectedReward.cout,
        unit: isStampsMode ? t('common.stamps') : t('common.points'),
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            try {
              set({ loading: true });
              const tx = await recordTransactionMutation.mutateAsync({
                clientId,
                type: 'REDEEM_REWARD',
                amount: 0,
                points: selectedReward.cout,
                rewardId: selectedRewardId,
              });
              set({
                transactionType: 'REDEEM_REWARD',
                showSuccess: true,
                actualCredited: typeof tx?.points === 'number' ? tx.points : null,
              });
              successTimerRef.current = setTimeout(() => {
                successTimerRef.current = null;
                set({ showSuccess: false });
                router.back();
              }, SUCCESS_DISPLAY_MS);
            } catch (err: unknown) {
              Alert.alert(t('common.error'), getErrorMessage(err, t('transactionAmount.redeemError')));
            } finally {
              set({ loading: false });
            }
          },
        },
      ],
    );
  }, [selectedRewardId, selectedReward, customerStatus?.points, isStampsMode, recordTransactionMutation, clientId, router, set, t]);

  // ── Shared accumulation limit check ──
  const checkAccumulationLimit = useCallback((pointsToAdd: number): number | false => {
    const currentPoints = customerStatus?.points || 0;
    if (merchant?.accumulationLimit != null && currentPoints >= merchant.accumulationLimit) {
      if (selectedRewardId && selectedReward && currentPoints >= selectedReward.cout) {
        handleRedeemOnly();
        return false;
      }
      const unit = isStampsMode ? t('common.stamps') : t('common.points');
      Alert.alert(t('common.error'), t('transaction.accumulationLimitReached', { limit: merchant.accumulationLimit, unit }));
      return false;
    }
    
    if (merchant?.accumulationLimit != null && currentPoints + pointsToAdd > merchant.accumulationLimit) {
      return merchant.accumulationLimit - currentPoints;
    }
    
    return pointsToAdd;
  }, [customerStatus?.points, merchant?.accumulationLimit, selectedRewardId, selectedReward, isStampsMode, handleRedeemOnly, t]);

  // ── EARN: Points Mode ──
  const handleEarnPoints = useCallback(() => {
    const actualPoints = checkAccumulationLimit(points);
    if (actualPoints === false) return;
    
    const amountNum = parseFloat(amount);
    if (!amountNum || isNaN(amountNum)) {
      Alert.alert(t('common.error'), t('transactionAmount.invalidAmount'));
      return;
    }
    if (actualPoints === 0) {
      Alert.alert(t('common.error'), t('transactionAmount.noPointsEarned'));
      return;
    }
    
    const willRedeem = !!selectedRewardId && !!selectedReward && (customerStatus?.points || 0) + actualPoints >= selectedReward.cout;
    const giftLine = willRedeem
      ? t('transactionAmount.giftOffered', { title: selectedReward!.titre, cost: selectedReward!.cout })
      : '';
      
    // Si la limite tronque les points, afficher un avertissement
    const limitWarning = actualPoints < points 
      ? `\n${t('transaction.accumulationWarning', { count: actualPoints })}\n` : '';

    Alert.alert(
      t('transaction.confirmTitle'),
      `${limitWarning}${t('transactionAmount.confirmEarnPoints', { amount: formatCurrency(amountNum, DEFAULT_CURRENCY, getIntlLocale(locale)), points: actualPoints, giftLine })}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        // On envoie le montant "points" brut au back-end car c'est lui qui gère la troncature exacte 
        // par rapport au montant d'achat pour valider la transaction.
        { text: t('transaction.validate'), onPress: () => processEarnWithAutoRedeem(amountNum, points, willRedeem) },
      ],
    );
  }, [checkAccumulationLimit, amount, points, selectedRewardId, selectedReward, customerStatus?.points, locale, t]);

  // ── EARN: Stamps Mode ──
  const handleEarnStamps = useCallback(() => {
    let earnedStamps = isPerVisit ? 1 : stamps;
    const actualStamps = checkAccumulationLimit(earnedStamps);
    if (actualStamps === false) return;

    if (actualStamps === 0) {
      Alert.alert(t('common.error'), t('transaction.noStampsEarned'));
      return;
    }

    if (isPerVisit) {
      // PER_VISIT: 1 stamp per visit, no amount needed (unless luckyWheel minSpendAmount)
      const afterStamps = (customerStatus?.points || 0) + actualStamps;
      const willGetReward = afterStamps >= stampsForReward && !!selectedReward;
      const luckyWheelAmountNum = parseFloat(luckyWheelAmount) || 0;
      
      const limitWarning = actualStamps < earnedStamps
        ? `\n${t('transaction.accumulationWarning', { count: actualStamps })}\n` : '';

      Alert.alert(
        t('transaction.confirmTitle'),
        `${limitWarning}${t('transaction.stampsToEarn')} : ${actualStamps} ${t('common.stamps')}\n` +
          (willGetReward
            ? `\n${t('transaction.rewardReached')} "${selectedReward!.titre}" (${selectedReward!.cout} ${t('common.stamps')}).`
            : `\n${t('transaction.totalAfter')} : ${afterStamps} / ${stampsForReward} ${t('common.stamps')}`),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('transaction.validate'),
            onPress: () => processEarnWithAutoRedeem(luckyWheelAmountNum, earnedStamps, willGetReward),
          },
        ],
      );
      return;
    }

    const stampAmountNum = parseFloat(stampAmount) || 0;
    if (stampAmountNum === 0) {
      Alert.alert(t('common.error'), t('transaction.enterAmountError'));
      return;
    }
    
    const afterStamps = (customerStatus?.points || 0) + actualStamps;
    const willGetReward = afterStamps >= stampsForReward && !!selectedReward;
    
    const limitWarning = actualStamps < earnedStamps
      ? `${t('transaction.accumulationWarningStamps', { count: actualStamps })}\n\n` : '';

    Alert.alert(
      t('transaction.confirmTitle'),
      `${limitWarning}${t('transaction.purchaseAmount')} : ${formatCurrency(stampAmountNum, DEFAULT_CURRENCY, getIntlLocale(locale))}\n` +
      `${t('transaction.stampsToEarn')} : ${actualStamps} ${t('common.stamps')}\n` +
        (willGetReward
          ? t('transactionAmount.confirmEarnStampsReward', { title: selectedReward!.titre, cost: selectedReward!.cout })
          : `\n${t('transaction.totalAfter')} : ${afterStamps} / ${stampsForReward} ${t('common.stamps')}`),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('transaction.validate'),
          onPress: () => processEarnWithAutoRedeem(stampAmountNum, earnedStamps, willGetReward),
        },
      ],
    );
  }, [checkAccumulationLimit, isPerVisit, customerStatus?.points, stampsForReward, selectedReward, stampAmount, stamps, luckyWheelAmount, locale, t]);

  // ── Earn stamps + auto-redeem if threshold is reached ──
  const processEarnWithAutoRedeem = async (
    amount: number,
    earnedStamps: number,
    autoRedeem: boolean,
  ) => {
    try {
      set({ loading: true });

      // 1. Enregistrer l'acquisition des tampons
      const earnTx = await recordTransactionMutation.mutateAsync({
        clientId,
        type: 'EARN_POINTS',
        amount,
        points: earnedStamps,
      });
      const actualEarned = typeof earnTx?.points === 'number' ? earnTx.points : earnedStamps;

      // 2. Si le seuil est atteint, créer automatiquement la transaction de remise du cadeau
      if (autoRedeem && selectedRewardId && selectedReward) {
        await recordTransactionMutation.mutateAsync({
          clientId,
          type: 'REDEEM_REWARD',
          amount: 0,
          points: selectedReward.cout,
          rewardId: selectedRewardId,
        });
        set({ transactionType: 'REDEEM_REWARD', actualCredited: selectedReward.cout });
      } else {
        set({ transactionType: 'EARN_POINTS', actualCredited: actualEarned });
      }

      set({ showSuccess: true });
      successTimerRef.current = setTimeout(() => {
        successTimerRef.current = null;
        set({ showSuccess: false });
        router.back();
      }, SUCCESS_DISPLAY_MS);
    } catch (err: unknown) {
      Alert.alert(
        t('common.error'),
        getErrorMessage(err, t('transactionAmount.transactionError')),
      );
    } finally {
      set({ loading: false });
    }
  };

  const handleCancel = () => {
    Alert.alert(t('transaction.cancelTitle'), t('transaction.cancelConfirm'), [
      { text: t('transaction.cancelNo'), style: 'cancel' },
      { text: t('transaction.cancelYes'), onPress: () => router.back() },
    ]);
  };

  // ── Derived ──
  const amountNum = parseFloat(amount || '0') || 0;
  const isValidAmount = amountNum > 0;

  if (shouldWait) return null;

  if (loadingCustomer) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { backgroundColor: theme.bg, paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={handleCancel} disabled={loading}>
            <ArrowLeft size={22} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {isStampsMode ? t('transaction.titleStamps') : t('transaction.title')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* ── Client Card ── */}
          <View style={[styles.clientCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <View style={[styles.clientIconContainer, { backgroundColor: `${palette.charbon}12` }]}>
              <CircleUser size={ms(24)} color={palette.charbon} strokeWidth={1.5} />
            </View>
            <View style={styles.clientInfo}>
              <Text style={[styles.clientLabel, { color: theme.textMuted }]}>{t('transaction.clientLabel')}</Text>
              <Text style={[styles.clientName, { color: theme.text }]}>
                {[customerStatus?.prenom, customerStatus?.nom].filter(Boolean).join(' ') || t('transaction.defaultClient')}
              </Text>
            </View>
            <View style={[styles.pointsBadge, { backgroundColor: theme.success + '14' }]}>
              {isStampsMode ? (
                <Stamp size={ms(16)} color={theme.success} strokeWidth={1.5} />
              ) : (
                <Gift size={ms(16)} color={theme.success} strokeWidth={1.5} />
              )}
              <Text style={[styles.pointsText, { color: theme.success }]}>
                {customerStatus?.points || 0} {isStampsMode ? t('common.stamps') : t('common.points')}
              </Text>
            </View>
          </View>

          {/* ── Mode Tabs ── */}
          <View style={[styles.modeTabs, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <TouchableOpacity
              style={[
                styles.modeTab,
                screenMode === 'earn' && { backgroundColor: theme.primary },
              ]}
              onPress={() => set({ screenMode: 'earn', selectedRewardId: null })}
            >
              <ShoppingBag size={ms(14)} color={screenMode === 'earn' ? '#fff' : theme.textSecondary} strokeWidth={1.5} />
              <Text style={[styles.modeTabText, { color: screenMode === 'earn' ? '#fff' : theme.textSecondary }]}>
                {isStampsMode ? t('transactionAmount.tabEarnStamps') : t('transactionAmount.tabEarnPoints')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeTab,
                screenMode === 'redeem' && { backgroundColor: theme.primary },
              ]}
              onPress={() => set({ screenMode: 'redeem', selectedRewardId: null })}
            >
              <Gift size={ms(14)} color={screenMode === 'redeem' ? '#fff' : theme.textSecondary} strokeWidth={1.5} />
              <Text style={[styles.modeTabText, { color: screenMode === 'redeem' ? '#fff' : theme.textSecondary }]}>
                {t('transactionAmount.tabRedeem')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── REDEEM ONLY MODE ── */}
          {screenMode === 'redeem' ? (
            <View>
              {loadingRewards ? (
                <View style={[styles.rewardSelectorCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, alignItems: 'center' }]}>
                  <ActivityIndicator color={theme.primary} />
                </View>
              ) : rewards.filter((r) => (customerStatus?.points || 0) >= r.cout).length === 0 ? (
                <View style={[styles.rewardSelectorCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, alignItems: 'center', gap: 8 }]}>
                  <Gift size={ms(36)} color={palette.charbon} strokeWidth={1.5} />
                  <Text style={[styles.rewardSelectorEmpty, { color: theme.textMuted, textAlign: 'center' }]}>
                    {t('transactionAmount.notEnoughForReward')}
                  </Text>
                  <Text style={[{ color: theme.textMuted, fontSize: 13, textAlign: 'center' }]}>
                    {t('transactionAmount.currentBalance', { balance: customerStatus?.points || 0, unit: isStampsMode ? t('common.stamps') : t('common.points') })}
                  </Text>
                </View>
              ) : (
                <RewardSelector
                  theme={theme}
                  t={t}
                  rewards={rewards}
                  loadingRewards={loadingRewards}
                  selectedRewardId={selectedRewardId}
                  setSelectedRewardId={setSelectedRewardId}
                  customerPoints={customerStatus?.points || 0}
                  isStampsMode={isStampsMode}
                  redeemOnly
                />
              )}
            </View>
          ) : (
          /* ═══════════════════════════════════════════ */
          /* ── STAMPS / POINTS EARN MODE ── */
          /* ═══════════════════════════════════════════ */
          isStampsMode ? (
            <View>
              {/* ── Stamp Grid ── */}
              <View style={[styles.stampGridCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                <StampGrid
                  current={customerStatus?.points || 0}
                  total={stampsForReward}
                  size={40}
                />
              </View>

              {/* ── Amount input (Stamps PER_AMOUNT mode only) ── */}
              {!isPerVisit && (
              <View style={[styles.amountInputCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>
                  {t('transaction.purchaseAmount')}
                </Text>
                <TextInput
                  style={[styles.amountInput, { color: theme.text, borderColor: theme.border }]}
                  value={stampAmount}
                  onChangeText={handleStampAmountChange}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={theme.textMuted}
                  maxLength={MAX_AMOUNT_DIGITS}
                  returnKeyType="done"
                  autoFocus
                />
                <Text style={[styles.amountInputCurrency, { color: theme.textMuted }]}>
                  {DEFAULT_CURRENCY.symbol}
                </Text>
              </View>
              )}

              {/* ── LuckyWheel min spend info + amount input (PER_VISIT only) ── */}
              {hasLuckyWheelSpendReq && (
                <>
                  <View style={[styles.luckyWheelBanner, { backgroundColor: theme.warning + '14', borderColor: theme.warning + '40' }]}>
                    <View style={styles.luckyWheelBannerRow}>
                      <Trophy size={ms(16)} color={theme.warning} strokeWidth={1.5} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.luckyWheelBannerTitle, { color: theme.text }]}>
                          {t('transactionAmount.luckyWheelActiveTitle')}
                        </Text>
                        <Text style={[styles.luckyWheelBannerText, { color: theme.textSecondary }]}>
                          {t('transactionAmount.luckyWheelMinSpendMsg', { amount: luckyWheelMinSpend })}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={[styles.amountInputCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                    <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>
                      {t('transactionAmount.luckyWheelAmountLabel')}
                    </Text>
                    <TextInput
                      style={[styles.amountInput, { color: theme.text, borderColor: (parseFloat(luckyWheelAmount) || 0) >= luckyWheelMinSpend ? theme.success : theme.border }]}
                      value={luckyWheelAmount}
                      onChangeText={(text) => {
                        const cleaned = text.replace(/[^0-9.]/g, '');
                        const parts = cleaned.split('.');
                        let formatted = parts[0] || '';
                        if (parts.length > 1) formatted += '.' + (parts[1]?.slice(0, 2) || '');
                        if (formatted.length <= MAX_AMOUNT_DIGITS) setLuckyWheelAmount(formatted);
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={theme.textMuted}
                      maxLength={MAX_AMOUNT_DIGITS}
                      returnKeyType="done"
                    />
                    <Text style={[styles.amountInputCurrency, { color: theme.textMuted }]}>
                      {DEFAULT_CURRENCY.symbol}
                    </Text>
                  </View>
                  {(parseFloat(luckyWheelAmount) || 0) > 0 && (parseFloat(luckyWheelAmount) || 0) < luckyWheelMinSpend && (
                    <View style={{ marginHorizontal: 20, marginTop: 4 }}>
                      <Text style={{ color: theme.warning, fontSize: 12, fontFamily: 'Lexend_400Regular' }}>
                        {t('transactionAmount.luckyWheelBelowMin', { amount: luckyWheelMinSpend })}
                      </Text>
                    </View>
                  )}
                  {(parseFloat(luckyWheelAmount) || 0) >= luckyWheelMinSpend && (
                    <View style={{ marginHorizontal: 20, marginTop: 4 }}>
                      <Text style={{ color: theme.success, fontSize: 12, fontFamily: 'Lexend_400Regular' }}>
                        {t('transactionAmount.luckyWheelEligible')}
                      </Text>
                    </View>
                  )}
                </>
              )}

              {/* ── Stamps preview ── */}
              <TouchableOpacity
                style={[
                  styles.calculateButton,
                  {
                    backgroundColor: stamps > 0 ? theme.success + '14' : theme.bgCard,
                    borderColor: stamps > 0 ? theme.success : 'transparent',
                    borderWidth: stamps > 0 ? 2 : 0,
                  },
                ]}
                disabled
              >
                <Stamp size={ms(20)} color={stamps > 0 ? theme.success : palette.charbon} strokeWidth={1.5} />
                <Text
                  style={[
                    styles.calculateButtonText,
                    { color: stamps > 0 ? theme.success : theme.textMuted },
                  ]}
                >
                  {isPerVisit
                    ? `${t('transaction.earn')} 1 ${t('common.stamps')} (${t('transaction.perVisitLabel')})`
                    : stamps > 0 ? `${t('transaction.earn')} ${stamps} ${t('common.stamps')}` : t('transaction.enterAmount')}
                </Text>
              </TouchableOpacity>

              <RewardSelector
                theme={theme}
                t={t}
                rewards={rewards}
                loadingRewards={loadingRewards}
                selectedRewardId={selectedRewardId}
                setSelectedRewardId={setSelectedRewardId}
                customerPoints={customerStatus?.points || 0}
                isStampsMode={isStampsMode}
              />
            </View>
          ) : (
            /* ═══════════════════════════════════════════ */
            /* ── POINTS MODE ── */
            /* ═══════════════════════════════════════════ */
            <>
              {/* Amount input */}
              <View style={[styles.amountInputCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>
                  {t('transaction.purchaseAmount')}
                </Text>
                <TextInput
                  style={[styles.amountInput, { color: theme.text, borderColor: theme.border }]}
                  value={amount}
                  onChangeText={handleAmountChange}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={theme.textMuted}
                  maxLength={MAX_AMOUNT_DIGITS}
                  returnKeyType="done"
                  autoFocus
                />
                <Text style={[styles.amountInputCurrency, { color: theme.textMuted }]}>
                  {DEFAULT_CURRENCY.symbol}
                </Text>
              </View>

              {/* Points preview */}
              <TouchableOpacity
                style={[
                  styles.calculateButton,
                  {
                    backgroundColor: points > 0 ? theme.success + '14' : theme.bgCard,
                    borderColor: points > 0 ? theme.success : 'transparent',
                    borderWidth: points > 0 ? 2 : 0,
                  },
                ]}
                disabled
              >
                <Award size={ms(20)} color={points > 0 ? theme.success : palette.charbon} strokeWidth={1.5} />
                <Text
                  style={[
                    styles.calculateButtonText,
                    { color: points > 0 ? theme.success : theme.textMuted },
                  ]}
                >
                  {points > 0 ? t('transactionAmount.earnPointsPreview', { count: points }) : t('transactionAmount.enterAmountHint')}
                </Text>
              </TouchableOpacity>

              <RewardSelector
                theme={theme}
                t={t}
                rewards={rewards}
                loadingRewards={loadingRewards}
                selectedRewardId={selectedRewardId}
                setSelectedRewardId={setSelectedRewardId}
                customerPoints={customerStatus?.points || 0}
                isStampsMode={isStampsMode}
              />
            </>
          )
          )}
        </ScrollView>

        {/* ── Bottom actions ── */}
        <View style={[styles.actionsContainer, { borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
            onPress={handleCancel}
            disabled={loading}
          >
            <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.validateButton,
              {
                backgroundColor:
                  screenMode === 'redeem'
                    ? (!!selectedRewardId && !loading ? theme.primary : theme.border)
                    : ((isStampsMode ? (isPerVisit ? stamps > 0 && (!hasLuckyWheelSpendReq || (parseFloat(luckyWheelAmount) || 0) > 0) : stamps > 0 && parseFloat(stampAmount) > 0) : isValidAmount) && !loading
                        ? theme.primary
                        : theme.border),
              },
            ]}
            onPress={screenMode === 'redeem' ? handleRedeemOnly : (isStampsMode ? handleEarnStamps : handleEarnPoints)}
            disabled={screenMode === 'redeem' ? (!selectedRewardId || loading) : (isStampsMode ? (isPerVisit ? stamps < 1 || loading || (hasLuckyWheelSpendReq && !((parseFloat(luckyWheelAmount) || 0) > 0)) : !parseFloat(stampAmount) || stamps < 1 || loading) : !isValidAmount || loading)}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <CheckCircle size={ms(16)} color="#fff" strokeWidth={1.5} />
                <Text style={styles.validateButtonText}>{t('transaction.validate')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <TransactionSuccessModal
        visible={showSuccess}
        theme={theme}
        t={t}
        transactionType={transactionType}
        isStampsMode={isStampsMode}
        stamps={actualCredited ?? stamps}
        points={actualCredited ?? points}
      />

      {/* ── Birthday Popup ── */}
      <Modal visible={showBirthdayPopup} transparent animationType="fade">
        <View style={styles.birthdayOverlay}>
          <View style={[styles.birthdayCard, { backgroundColor: theme.bgCard }]}>
            <View style={[styles.birthdayCakeContainer, { backgroundColor: theme.warning + '20' }]}>
              <PartyPopper size={ms(40)} color={theme.warning} strokeWidth={1.5} />
            </View>
            <Text style={[styles.birthdayTitle, { color: theme.text }]}>
              {t('transaction.birthdayTitle')}
            </Text>
            <Text style={[styles.birthdayMessage, { color: theme.textMuted }]}>
              {t('transaction.birthdayMessage', {
                name: [customerStatus?.prenom, customerStatus?.nom].filter(Boolean).join(' ') || t('transaction.defaultClient'),
              })}
            </Text>
            <TouchableOpacity
              style={[styles.birthdayButton, { backgroundColor: theme.primary }]}
              onPress={() => setShowBirthdayPopup(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.birthdayButtonText}>{t('transaction.birthdayDismiss')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16, fontFamily: 'Lexend_400Regular' },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 24,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
  },
  content: { flex: 1 },

  // ── Client Card ──
  clientCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  clientIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  clientInfo: { flex: 1 },
  clientLabel: { fontSize: 12, fontWeight: '500', marginBottom: 2, fontFamily: 'Lexend_500Medium' },
  clientName: { fontSize: 18, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  pointsText: { fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },

  // ── Stamp Grid Card ──
  stampGridCard: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },

  // ── Stamp Counter ──
  stampCounterCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  stampCounterLabel: { fontSize: 14, fontWeight: '600', marginBottom: 18, fontFamily: 'Lexend_600SemiBold' },
  stampCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  stampCounterBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampCountDisplay: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    gap: 2,
  },
  stampCountValue: { fontSize: 24, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  quickStampsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 18,
  },
  quickStampBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  quickStampText: { fontSize: 15, fontWeight: '700', fontFamily: 'Lexend_700Bold' },

  // ── Amount Input ──
  amountInputCard: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  amountLabel: { fontSize: 14, fontWeight: '500', marginBottom: 10, fontFamily: 'Lexend_500Medium' },
  amountInput: {
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
    borderBottomWidth: 2,
    paddingVertical: 8,
    width: '80%',
    letterSpacing: 1,
    fontFamily: 'Lexend_700Bold',
  },
  amountInputCurrency: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    fontFamily: 'Lexend_600SemiBold',
  },

  // ── Calculate / Points preview ──
  calculateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 15,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  calculateButtonText: { fontSize: 16, fontWeight: '700', fontFamily: 'Lexend_700Bold' },

  // ── Mode Tabs ──
  modeTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeTabText: { fontSize: 13, fontWeight: '700', fontFamily: 'Lexend_700Bold' },

  // ── Reward Selector ──
  rewardSelectorCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 22,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rewardSelectorEmpty: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    fontFamily: 'Lexend_500Medium',
  },

  // ── Actions ──
  actionsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 15,
    marginBottom: 10,
    gap: 15,
    borderTopWidth: 0,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelButtonText: { fontSize: 16, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  validateButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  validateButtonText: { fontSize: 16, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_700Bold' },

  // ── LuckyWheel Banner ──
  luckyWheelBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  luckyWheelBannerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  luckyWheelBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    marginBottom: 2,
  },
  luckyWheelBannerText: {
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
    lineHeight: 17,
  },

  // ── Birthday Popup ──
  birthdayOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  birthdayCard: {
    width: '100%',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  birthdayCakeContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  birthdayTitle: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  birthdayMessage: {
    fontSize: 15,
    fontFamily: 'Lexend_400Regular',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  birthdayButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  birthdayButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Lexend_700Bold',
  },
});
