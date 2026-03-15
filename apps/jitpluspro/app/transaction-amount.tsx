import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  User,
  Gift,
  CheckCircle,
  X,
  TrendingUp,
  Award,
  Stamp,
  Plus,
  Minus,
} from 'lucide-react-native';

// lottie-react-native is NOT available in Expo Go SDK 51+
let LottieView: any = null;
try {
  LottieView = require('lottie-react-native').default;
} catch {
  // Not available in Expo Go
}

// Reanimated removed — plain View shim for entering animations
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorMessage } from '@/utils/error';
import StampGrid from '@/components/StampGrid';
import { formatCurrency, DEFAULT_CURRENCY } from '@/config/currency';
import { MAX_AMOUNT_DIGITS, MAX_STAMPS_PER_TX, SUCCESS_DISPLAY_MS } from '@/constants/app';
import { useClientStatus, useRewards, useRecordTransaction } from '@/hooks/useQueryHooks';

type TransactionType = 'EARN_POINTS' | 'REDEEM_REWARD';

export default function TransactionAmountScreen() {
  const router = useRouter();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { merchant } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [points, setPoints] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [transactionType, setTransactionType] = useState<TransactionType>('EARN_POINTS');
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);

  // ── React Query hooks ──
  const {
    data: customerStatus,
    isLoading: loadingCustomer,
  } = useClientStatus(clientId);

  const {
    data: rewardsList,
    isLoading: loadingRewards,
  } = useRewards();

  const rewards = rewardsList ?? [];
  const recordTransactionMutation = useRecordTransaction();

  // Auto-select first reward when rewards load
  useEffect(() => {
    if (rewards.length > 0) {
      const sorted = [...rewards].sort((a, b) => a.cout - b.cout);
      setSelectedRewardId((current) => {
        const exists = rewards.some((r) => r.id === current);
        return current && exists ? current : sorted[0].id;
      });
    }
  }, [rewards]);

  // Guard: if no clientId go back
  useEffect(() => {
    if (!clientId) {
      Alert.alert('Erreur', 'Aucun client sélectionné.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  }, [clientId, router]);

  // ── Stamps mode ──
  const [stampCount, setStampCount] = useState(1);
  const [stampAmount, setStampAmount] = useState('');
  const stampScale = useRef(new Animated.Value(1)).current;
  const stampAnimStyle = {
    transform: [{ scale: stampScale }],
  };

  const isStampsMode = merchant?.loyaltyType === 'STAMPS';
  const stampsForReward = merchant?.stampsForReward || customerStatus?.stampsForReward || 10;
  const { t } = useLanguage();

  useEffect(() => {
    if (!isStampsMode) calculatePoints();
  }, [amount, merchant]);

  const calculatePoints = () => {
    const amountNum = parseFloat(amount) || 0;
    if (amountNum === 0 || !merchant) {
      setPoints(0);
      return;
    }
    const pointsRate = merchant.pointsRate || 10;
    setPoints(Math.floor(amountNum / pointsRate));
  };

  // ── Amount input handler (Points mode) ──
  const handleAmountChange = (text: string) => {
    // Allow only valid decimal numbers
    const cleaned = text.replace(/[^0-9.]/g, '');
    // Prevent multiple dots
    const parts = cleaned.split('.');
    let formatted = parts[0] || '';
    if (parts.length > 1) formatted += '.' + (parts[1]?.slice(0, 2) || '');
    if (formatted.length <= MAX_AMOUNT_DIGITS) setAmount(formatted);
  };

  // ── Stamp counter handlers ──
  const incrementStamps = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.spring(stampScale, { toValue: 1.15, useNativeDriver: true, speed: 50, bounciness: 8 }).start(() => {
      Animated.spring(stampScale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();
    });
    setStampCount((c) => Math.min(c + 1, MAX_STAMPS_PER_TX));
  };
  const decrementStamps = () => {
    if (stampCount <= 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStampCount((c) => Math.max(c - 1, 1));
  };

  // ── Stamp amount input handler ──
  const handleStampAmountChange = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    let formatted = parts[0] || '';
    if (parts.length > 1) formatted += '.' + (parts[1]?.slice(0, 2) || '');
    if (formatted.length <= MAX_AMOUNT_DIGITS) setStampAmount(formatted);
  };

  // ── EARN: Points Mode ──
  const handleEarnPoints = () => {
    const amountNum = parseFloat(amount);
    if (!amountNum || isNaN(amountNum)) {
      Alert.alert(t('common.error'), 'Veuillez entrer un montant valide.');
      return;
    }
    if (points === 0) {
      Alert.alert(t('common.error'), 'Aucun point ne sera gagné avec ce montant.');
      return;
    }
    Alert.alert(
      t('transaction.confirmTitle'),
      `Montant : ${formatCurrency(amountNum)}\nPoints à gagner : ${points} points`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('transaction.validate'), onPress: () => processTransaction('EARN_POINTS', amountNum, points) },
      ],
    );
  };

  // ── EARN: Stamps Mode ──
  const handleEarnStamps = () => {
    if (stampCount < 1) return;
    const stampAmountNum = parseFloat(stampAmount) || 0;
    if (stampAmountNum === 0) {
      Alert.alert(t('common.error'), 'Veuillez entrer le montant dépensé.');
      return;
    }
    const afterStamps = (customerStatus?.points || 0) + stampCount;
    const willGetReward = afterStamps >= stampsForReward;

    Alert.alert(
      t('transaction.confirmTitle'),
      `Montant dépensé : ${formatCurrency(stampAmountNum)}\n` +
      `Tampons à ajouter : ${stampCount} tampon${stampCount > 1 ? 's' : ''}\n` +
        (willGetReward
          ? `\n🎉 Le client atteindra ${afterStamps} / ${stampsForReward} tampons et obtiendra un cadeau !`
          : `\nTotal après : ${afterStamps} / ${stampsForReward} tampons.`),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('transaction.validate'),
          onPress: () => processTransaction('EARN_POINTS', stampAmountNum, stampCount),
        },
      ],
    );
  };

  // ── REDEEM ──
  const handleRedeemReward = () => {
    if (!customerStatus) {
      Alert.alert(t('common.error'), "Le client n'est pas chargé.");
      return;
    }

    if (rewards.length === 0) {
      Alert.alert(t('common.error'), t('transaction.noGifts'));
      return;
    }

    const selectedReward = rewards.find((r) => r.id === selectedRewardId) || rewards[0];
    if (!selectedReward) {
      Alert.alert(t('common.error'), 'Veuillez sélectionner un cadeau.');
      return;
    }

    if (customerStatus.points < selectedReward.cout) {
      Alert.alert(t('common.error'), "Le client n'a pas assez pour ce cadeau.");
      return;
    }

    const cost = selectedReward.cout;
    Alert.alert(
      t('transaction.redeemTitle'),
      isStampsMode
        ? `${cost} tampons seront déduits du compte client.`
        : `${cost} points seront déduits du compte client.`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: () => processTransaction('REDEEM_REWARD', 0, cost, selectedReward.id),
        },
      ],
    );
  };

  const processTransaction = async (
    type: TransactionType,
    transactionAmount: number,
    transactionPoints: number,
    rewardId?: string,
  ) => {
    try {
      setLoading(true);

      await recordTransactionMutation.mutateAsync({
        clientId,
        type,
        amount: transactionAmount,
        points: transactionPoints,
        rewardId: rewardId || undefined,
      });

      setTransactionType(type);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        router.back();
      }, SUCCESS_DISPLAY_MS);
    } catch (err: unknown) {
      Alert.alert(
        t('common.error'),
        getErrorMessage(err, 'Impossible de valider la transaction.'),
      );
    } finally {
      setLoading(false);
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
  const selectedReward = rewards.find((r) => r.id === selectedRewardId) || null;
  const rewardCost = selectedReward?.cout || null;
  const hasEnoughForReward =
    customerStatus && rewardCost !== null
      ? customerStatus.points >= rewardCost
      : false;

  const renderRewardSelector = () => (
    <View style={[styles.rewardSelectorCard, { backgroundColor: theme.bgCard }]}>
      <Text style={[styles.rewardSelectorTitle, { color: theme.text }]}>
        {t('transaction.chooseGift')}
      </Text>
      <Text style={[styles.rewardSelectorHint, { color: theme.textMuted }]}>
        {isStampsMode ? t('transaction.costInStamps') : t('transaction.costInPoints')}
      </Text>

      {loadingRewards ? (
        <View style={styles.rewardSelectorLoading}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      ) : rewards.length === 0 ? (
        <Text style={[styles.rewardSelectorEmpty, { color: theme.textMuted }]}>
          {t('transaction.noGifts')}
        </Text>
      ) : (
        <View style={styles.rewardSelectorList}>
          {rewards.map((reward) => {
            const isSelected = reward.id === selectedRewardId;
            const isAffordable = (customerStatus?.points || 0) >= reward.cout;
            return (
              <TouchableOpacity
                key={reward.id}
                style={[
                  styles.rewardSelectorRow,
                  {
                    borderColor: isSelected ? theme.primary : theme.border,
                    backgroundColor: isSelected ? theme.primaryBg : theme.bg,
                    opacity: isAffordable ? 1 : 0.6,
                  },
                ]}
                onPress={() => setSelectedRewardId(reward.id)}
                activeOpacity={0.7}
              >
                <View style={styles.rewardSelectorInfo}>
                  <Text style={[styles.rewardSelectorName, { color: theme.text }]}>
                    {reward.titre}
                  </Text>
                  <Text style={[styles.rewardSelectorMeta, { color: theme.textSecondary }]}>
                    {reward.cout} {isStampsMode ? t('common.stamps') : t('common.points')}
                  </Text>
                </View>
                {!isAffordable && (
                  <Text style={[styles.rewardSelectorBadge, { color: theme.danger }]}>
                    {t('transaction.insufficient')}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );

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
        <View style={[styles.header, { backgroundColor: theme.bgHeader, paddingTop: insets.top + 10 }]}>
          <TouchableOpacity style={styles.closeButton} onPress={handleCancel} disabled={loading}>
            <X size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isStampsMode ? t('transaction.titleStamps') : t('transaction.title')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* ── Client Card ── */}
          <View style={[styles.clientCard, { backgroundColor: theme.bgCard }]}>
            <View style={[styles.clientIconContainer, { backgroundColor: theme.primaryBg }]}>
              <User size={32} color={theme.primary} strokeWidth={1.5} />
            </View>
            <View style={styles.clientInfo}>
              <Text style={[styles.clientLabel, { color: theme.textMuted }]}>{t('transaction.clientLabel')}</Text>
              <Text style={[styles.clientName, { color: theme.text }]}>
                {customerStatus?.nom || t('transaction.defaultClient')}
              </Text>
            </View>
            <View style={[styles.pointsBadge, { backgroundColor: theme.success + '14' }]}>
              {isStampsMode ? (
                <Stamp size={18} color={theme.success} strokeWidth={1.5} />
              ) : (
                <Gift size={18} color={theme.success} strokeWidth={1.5} />
              )}
              <Text style={[styles.pointsText, { color: theme.success }]}>
                {customerStatus?.points || 0} {isStampsMode ? t('common.stamps') : t('common.points')}
              </Text>
            </View>
          </View>

          {/* ═══════════════════════════════════════════ */}
          {/* ── STAMPS MODE ── */}
          {/* ═══════════════════════════════════════════ */}
          {isStampsMode ? (
            <View>
              {/* ── Stamp Grid ── */}
              <View style={[styles.stampGridCard, { backgroundColor: theme.bgCard }]}>
                <StampGrid
                  current={customerStatus?.points || 0}
                  total={stampsForReward}
                  size={40}
                />
              </View>

              {/* ── Stamp Counter ── */}
              <View style={[styles.stampCounterCard, { backgroundColor: theme.bgCard }]}>
                <Text style={[styles.stampCounterLabel, { color: theme.textSecondary }]}>
                  {t('transaction.stampCountLabel')}
                </Text>
                <View style={styles.stampCounterRow}>
                  <TouchableOpacity
                    style={[
                      styles.stampCounterBtn,
                      {
                        backgroundColor: stampCount > 1 ? theme.danger + '14' : theme.border,
                      },
                    ]}
                    onPress={decrementStamps}
                    disabled={stampCount <= 1}
                    activeOpacity={0.7}
                  >
                    <Minus
                      size={24}
                      color={stampCount > 1 ? theme.danger : theme.textMuted}
                      strokeWidth={1.5}
                    />
                  </TouchableOpacity>

                  <Animated.View style={stampAnimStyle}>
                    <View style={[styles.stampCountDisplay, { borderColor: theme.primary }]}>
                      <Stamp size={28} color={theme.primary} strokeWidth={1.5} />
                      <Text style={[styles.stampCountValue, { color: theme.text }]}>
                        {stampCount}
                      </Text>
                    </View>
                  </Animated.View>

                  <TouchableOpacity
                    style={[styles.stampCounterBtn, { backgroundColor: theme.primary + '14' }]}
                    onPress={incrementStamps}
                    activeOpacity={0.7}
                  >
                    <Plus size={24} color={theme.primary} strokeWidth={1.5} />
                  </TouchableOpacity>
                </View>

                {/* Quick stamps buttons */}
                <View style={styles.quickStampsRow}>
                  {[1, 2, 3, 5].map((n) => (
                    <TouchableOpacity
                      key={n}
                      style={[
                        styles.quickStampBtn,
                        {
                          backgroundColor: stampCount === n ? theme.primary : theme.bg,
                          borderColor: stampCount === n ? theme.primary : theme.border,
                        },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setStampCount(n);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.quickStampText,
                          { color: stampCount === n ? '#fff' : theme.textSecondary },
                        ]}
                      >
                        +{n}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* ── Montant dépensé (Stamps mode) ── */}
              <View style={[styles.amountInputCard, { backgroundColor: theme.bgCard }]}>
                <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>
                  Montant dépensé
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
                />
                <Text style={[styles.amountInputCurrency, { color: theme.textMuted }]}>
                  {DEFAULT_CURRENCY.symbol}
                </Text>
              </View>

              {renderRewardSelector()}

              {/* ── Reward button (stamps) ── */}
              {customerStatus && hasEnoughForReward && (
                <TouchableOpacity
                  style={[styles.rewardButton, { backgroundColor: theme.warning }]}
                  onPress={handleRedeemReward}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Award size={24} color="#fff" strokeWidth={1.5} />
                  <View style={styles.rewardButtonContent}>
                  <Text style={styles.rewardButtonTitle}>{t('transaction.giftAvailable')}</Text>
                  <Text style={styles.rewardButtonSubtitle}>
                    {t('transaction.offerGift')} ({rewardCost || stampsForReward} {t('common.stamps')})
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* ═══════════════════════════════════════════ */
            /* ── POINTS MODE ── */
            /* ═══════════════════════════════════════════ */
            <>
              {/* Amount input */}
              <View style={[styles.amountInputCard, { backgroundColor: theme.bgCard }]}>
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
                <TrendingUp size={24} color={points > 0 ? theme.success : theme.textMuted} />
                <Text
                  style={[
                    styles.calculateButtonText,
                    { color: points > 0 ? theme.success : theme.textMuted },
                  ]}
                >
                  {points > 0 ? `Gagner ${points} points` : 'Entrez un montant'}
                </Text>
              </TouchableOpacity>

              {renderRewardSelector()}

              {/* Redeem (points mode) */}
              {customerStatus && hasEnoughForReward && (
                <TouchableOpacity
                  style={[styles.rewardButton, { backgroundColor: theme.warning }]}
                  onPress={handleRedeemReward}
                  disabled={loading}
                >
                  <Award size={24} color="#fff" strokeWidth={1.5} />
                  <View style={styles.rewardButtonContent}>
                  <Text style={styles.rewardButtonTitle}>{t('transaction.giftAvailable')}</Text>
                  <Text style={styles.rewardButtonSubtitle}>
                    {t('transaction.offerGift')} ({rewardCost || customerStatus.rewardThreshold} {t('common.points')})
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </>
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
                  (isStampsMode ? stampCount > 0 && parseFloat(stampAmount) > 0 : isValidAmount) && !loading
                    ? theme.primary
                    : theme.border,
              },
            ]}
            onPress={isStampsMode ? handleEarnStamps : handleEarnPoints}
            disabled={isStampsMode ? !parseFloat(stampAmount) || stampCount < 1 || loading : !isValidAmount || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <CheckCircle size={20} color="#fff" strokeWidth={1.5} />
                <Text style={styles.validateButtonText}>{t('transaction.validate')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Success Modal ── */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.successModal}>
          <View style={[styles.successContent, { backgroundColor: theme.bgCard }]}>
            {LottieView ? (
              <LottieView
                source={require('@/assets/animations/success.json')}
                autoPlay
                loop={false}
                style={styles.successAnimation}
              />
            ) : (
              <View style={[styles.successAnimation, { alignItems: 'center', justifyContent: 'center' }]}>
                <CheckCircle size={64} color={theme.success} />
              </View>
            )}
            <Text style={[styles.successTitle, { color: theme.success }]}>
              {transactionType === 'EARN_POINTS'
                ? isStampsMode
                  ? '✓ Tampons ajoutés !'
                  : '✓ Transaction validée !'
                : '🎉 Cadeau offert !'}
            </Text>
            <Text style={[styles.successMessage, { color: theme.textSecondary }]}>
              {transactionType === 'EARN_POINTS'
                ? isStampsMode
                  ? `${stampCount} tampon${stampCount > 1 ? 's' : ''} ajouté${stampCount > 1 ? 's' : ''}.`
                  : `${points} points ont été attribués au client.`
                : 'La récompense a été offerte au client.'}
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16 },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  closeButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  content: { flex: 1 },

  // ── Client Card ──
  clientCard: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
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
  clientLabel: { fontSize: 12, fontWeight: '500', marginBottom: 2 },
  clientName: { fontSize: 18, fontWeight: '700' },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  pointsText: { fontSize: 14, fontWeight: '700' },

  // ── Stamp Grid Card ──
  stampGridCard: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },

  // ── Stamp Counter ──
  stampCounterCard: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  stampCounterLabel: { fontSize: 14, fontWeight: '600', marginBottom: 18 },
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
  stampCountValue: { fontSize: 24, fontWeight: '700' },
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
  quickStampText: { fontSize: 15, fontWeight: '700' },

  // ── Amount Input ──
  amountInputCard: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
  },
  amountLabel: { fontSize: 14, fontWeight: '500', marginBottom: 10 },
  amountInput: {
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
    borderBottomWidth: 2,
    paddingVertical: 8,
    width: '80%',
    letterSpacing: 1,
  },
  amountInputCurrency: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },

  // ── Calculate / Points preview ──
  calculateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 15,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  calculateButtonText: { fontSize: 16, fontWeight: '700' },

  // ── Reward Selector ──
  rewardSelectorCard: {
    marginHorizontal: 20,
    marginTop: 15,
    borderRadius: 14,
    padding: 16,
  },
  rewardSelectorTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  rewardSelectorHint: { fontSize: 12, marginBottom: 12 },
  rewardSelectorLoading: { paddingVertical: 8, alignItems: 'center' },
  rewardSelectorEmpty: { fontSize: 13 },
  rewardSelectorList: { gap: 8 },
  rewardSelectorRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rewardSelectorInfo: { flex: 1, paddingRight: 12 },
  rewardSelectorName: { fontSize: 14, fontWeight: '700' },
  rewardSelectorMeta: { fontSize: 12, marginTop: 4 },
  rewardSelectorBadge: { fontSize: 12, fontWeight: '700' },

  // ── Reward ──
  rewardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 15,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    elevation: 3,
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  rewardButtonContent: { flex: 1 },
  rewardButtonTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
  rewardButtonSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.9)' },

  // ── Actions ──
  actionsContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 15,
    marginBottom: 10,
    gap: 15,
    borderTopWidth: 0,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  cancelButtonText: { fontSize: 16, fontWeight: '700' },
  validateButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  validateButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // ── Success ──
  successModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successContent: {
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    maxWidth: 320,
    width: '85%',
  },
  successAnimation: { width: 150, height: 150 },
  successTitle: { fontSize: 22, fontWeight: '700', marginTop: 16, marginBottom: 10 },
  successMessage: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
});
