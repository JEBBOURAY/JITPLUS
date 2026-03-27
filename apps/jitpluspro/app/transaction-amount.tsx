import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  User,
  Gift,
  CheckCircle,
  X,
  TrendingUp,
  Stamp,
} from 'lucide-react-native';

// lottie-react-native is NOT available in Expo Go SDK 51+
let LottieView: typeof import('lottie-react-native').default | null = null;
try {
  LottieView = require('lottie-react-native').default;
} catch {
  // Not available in Expo Go
}

// Reanimated removed — plain View shim for entering animations
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorMessage } from '@/utils/error';
import StampGrid from '@/components/StampGrid';
import { formatCurrency, DEFAULT_CURRENCY } from '@/config/currency';
import { MAX_AMOUNT_DIGITS, SUCCESS_DISPLAY_MS } from '@/constants/app';
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
  const [screenMode, setScreenMode] = useState<'earn' | 'redeem'>('earn');

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

  // Guard: if no clientId go back
  useEffect(() => {
    if (!clientId) {
      Alert.alert(t('common.error'), t('transactionAmount.noClientSelected'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  }, [clientId, router]);

  // ── Stamps mode ──
  const [stampAmount, setStampAmount] = useState('');
  const [stamps, setStamps] = useState(0);

  const isStampsMode = merchant?.loyaltyType === 'STAMPS';
  const isPerVisit = isStampsMode && (merchant?.stampEarningMode || 'PER_VISIT') === 'PER_VISIT';
  const stampsForReward = merchant?.stampsForReward || customerStatus?.stampsForReward || 10;
  const { t } = useLanguage();

  useEffect(() => {
    if (!isStampsMode) calculatePoints();
  }, [amount, merchant]);

  useEffect(() => {
    if (isStampsMode) {
      if (isPerVisit) {
        setStamps(1);
        return;
      }
      const amountNum = parseFloat(stampAmount) || 0;
      if (amountNum === 0 || !merchant) {
        setStamps(0);
        return;
      }
      const rate = merchant.pointsRate || 10;
      setStamps(Math.floor(amountNum / rate));
    }
  }, [stampAmount, merchant, isStampsMode, isPerVisit]);

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
    const currentPoints = customerStatus?.points || 0;
    if (merchant?.accumulationLimit != null && currentPoints >= merchant.accumulationLimit) {
      if (selectedRewardId && selectedReward && currentPoints >= selectedReward.cout) {
        handleRedeemOnly();
        return;
      }
      const unit = isStampsMode ? t('common.stamps') : t('common.points');
      Alert.alert(t('common.error'), t('transaction.accumulationLimitReached', { limit: merchant.accumulationLimit, unit }));
      return;
    }
    const amountNum = parseFloat(amount);
    if (!amountNum || isNaN(amountNum)) {
      Alert.alert(t('common.error'), t('transactionAmount.invalidAmount'));
      return;
    }
    if (points === 0) {
      Alert.alert(t('common.error'), t('transactionAmount.noPointsEarned'));
      return;
    }
    const willRedeem = !!selectedRewardId && !!selectedReward && (customerStatus?.points || 0) + points >= selectedReward.cout;
    const giftLine = willRedeem
      ? `\n\n🎁 Cadeau "${selectedReward!.titre}" offert (${selectedReward!.cout} points déduits).`
      : '';
    Alert.alert(
      t('transaction.confirmTitle'),
      `Montant : ${formatCurrency(amountNum)}\nPoints à gagner : ${points} points${giftLine}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('transaction.validate'), onPress: () => processEarnWithAutoRedeem(amountNum, points, willRedeem) },
      ],
    );
  };

  // ── EARN: Stamps Mode ──
  const handleEarnStamps = () => {
    const currentStamps = customerStatus?.points || 0;
    if (merchant?.accumulationLimit != null && currentStamps >= merchant.accumulationLimit) {
      if (selectedRewardId && selectedReward && currentStamps >= selectedReward.cout) {
        handleRedeemOnly();
        return;
      }
      const unit = isStampsMode ? t('common.stamps') : t('common.points');
      Alert.alert(t('common.error'), t('transaction.accumulationLimitReached', { limit: merchant.accumulationLimit, unit }));
      return;
    }

    if (isPerVisit) {
      // PER_VISIT: 1 stamp per visit, no amount needed
      const afterStamps = currentStamps + 1;
      const willGetReward = afterStamps >= stampsForReward && !!selectedReward;

      Alert.alert(
        t('transaction.confirmTitle'),
        `${t('transaction.stampsToEarn')} : 1 ${t('common.stamps')}\n` +
          (willGetReward
            ? `\n🎉 ${t('transaction.rewardReached')} "${selectedReward!.titre}" (${selectedReward!.cout} ${t('common.stamps')}).`
            : `\n${t('transaction.totalAfter')} : ${afterStamps} / ${stampsForReward} ${t('common.stamps')}`),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('transaction.validate'),
            onPress: () => processEarnWithAutoRedeem(0, 1, willGetReward),
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
    if (stamps === 0) {
      Alert.alert(t('common.error'), t('transaction.noStampsEarned'));
      return;
    }
    const afterStamps = (customerStatus?.points || 0) + stamps;
    const willGetReward = afterStamps >= stampsForReward && !!selectedReward;

    Alert.alert(
      t('transaction.confirmTitle'),
      `${t('transaction.purchaseAmount')} : ${formatCurrency(stampAmountNum)}\n` +
      `${t('transaction.stampsToEarn')} : ${stamps} ${t('common.stamps')}\n` +
        (willGetReward
          ? `\n🎉 Récompense atteinte ! Le cadeau "${selectedReward!.titre}" sera offert automatiquement (${selectedReward!.cout} tampons déduits).`
          : `\n${t('transaction.totalAfter')} : ${afterStamps} / ${stampsForReward} ${t('common.stamps')}`),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('transaction.validate'),
          onPress: () => processEarnWithAutoRedeem(stampAmountNum, stamps, willGetReward),
        },
      ],
    );
  };

  // ── Earn stamps + auto-redeem if threshold is reached ──
  const processEarnWithAutoRedeem = async (
    amount: number,
    earnedStamps: number,
    autoRedeem: boolean,
  ) => {
    try {
      setLoading(true);

      // 1. Enregistrer l'acquisition des tampons
      await recordTransactionMutation.mutateAsync({
        clientId,
        type: 'EARN_POINTS',
        amount,
        points: earnedStamps,
      });

      // 2. Si le seuil est atteint, créer automatiquement la transaction de remise du cadeau
      if (autoRedeem && selectedRewardId && selectedReward) {
        await recordTransactionMutation.mutateAsync({
          clientId,
          type: 'REDEEM_REWARD',
          amount: 0,
          points: selectedReward.cout,
          rewardId: selectedRewardId,
        });
        setTransactionType('REDEEM_REWARD');
      } else {
        setTransactionType('EARN_POINTS');
      }

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

  // ── REDEEM ONLY (cadeau sans achat) ──
  const handleRedeemOnly = () => {
    if (!selectedRewardId || !selectedReward) {
      Alert.alert(t('common.error'), 'Veuillez sélectionner un cadeau à offrir.');
      return;
    }
    const currentPoints = customerStatus?.points || 0;
    if (currentPoints < selectedReward.cout) {
      Alert.alert(t('common.error'), 'Le client n\'a pas assez de points pour ce cadeau.');
      return;
    }
    Alert.alert(
      '🎁 Offrir un cadeau',
      `Cadeau : "${selectedReward.titre}"\n${selectedReward.cout} ${isStampsMode ? 'tampons' : 'points'} déduits du solde du client.`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            try {
              setLoading(true);
              await recordTransactionMutation.mutateAsync({
                clientId,
                type: 'REDEEM_REWARD',
                amount: 0,
                points: selectedReward.cout,
                rewardId: selectedRewardId,
              });
              setTransactionType('REDEEM_REWARD');
              setShowSuccess(true);
              setTimeout(() => {
                setShowSuccess(false);
                router.back();
              }, SUCCESS_DISPLAY_MS);
            } catch (err: unknown) {
              Alert.alert(t('common.error'), getErrorMessage(err, 'Impossible d\'offrir le cadeau.'));
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  // ── Derived ──
  const amountNum = parseFloat(amount || '0') || 0;
  const isValidAmount = amountNum > 0;
  const selectedReward = rewards.find((r) => r.id === selectedRewardId) || null;

  const renderRewardSelector = (redeemOnly = false) => (
    <View style={[styles.rewardSelectorCard, { backgroundColor: theme.bgCard }]}>
      <Text style={[styles.rewardSelectorTitle, { color: theme.text }]}>
        {redeemOnly ? '🎁 Choisir le cadeau à offrir' : t('transaction.chooseGift')}
      </Text>
      <Text style={[styles.rewardSelectorHint, { color: theme.textMuted }]}>
        {redeemOnly
          ? 'Seuls les cadeaux accessibles avec le solde actuel sont disponibles.'
          : 'Sélectionner un cadeau à offrir maintenant (optionnel)'}
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
                    opacity: isAffordable ? 1 : 0.5,
                  },
                ]}
                onPress={() => setSelectedRewardId((prev) => (prev === reward.id ? null : reward.id))}
                disabled={!isAffordable}
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
                {isAffordable ? (
                  <View style={[styles.rewardSelectIndicator, { borderColor: isSelected ? theme.primary : theme.border, backgroundColor: isSelected ? theme.primary : 'transparent' }]} />
                ) : (
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
                {[customerStatus?.prenom, customerStatus?.nom].filter(Boolean).join(' ') || t('transaction.defaultClient')}
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

          {/* ── Mode Tabs ── */}
          <View style={[styles.modeTabs, { backgroundColor: theme.bgCard }]}>
            <TouchableOpacity
              style={[
                styles.modeTab,
                screenMode === 'earn' && { backgroundColor: theme.primary },
              ]}
              onPress={() => { setScreenMode('earn'); setSelectedRewardId(null); }}
            >
              <Text style={[styles.modeTabText, { color: screenMode === 'earn' ? '#fff' : theme.textSecondary }]}>
                {isStampsMode ? '🏷 Achat / Tampons' : '🏷 Achat / Points'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeTab,
                screenMode === 'redeem' && { backgroundColor: theme.primary },
              ]}
              onPress={() => { setScreenMode('redeem'); setSelectedRewardId(null); }}
            >
              <Text style={[styles.modeTabText, { color: screenMode === 'redeem' ? '#fff' : theme.textSecondary }]}>
                🎁 Cadeau
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── REDEEM ONLY MODE ── */}
          {screenMode === 'redeem' ? (
            <View>
              {loadingRewards ? (
                <View style={[styles.rewardSelectorCard, { backgroundColor: theme.bgCard, alignItems: 'center' }]}>
                  <ActivityIndicator color={theme.primary} />
                </View>
              ) : rewards.filter((r) => (customerStatus?.points || 0) >= r.cout).length === 0 ? (
                <View style={[styles.rewardSelectorCard, { backgroundColor: theme.bgCard, alignItems: 'center', gap: 8 }]}>
                  <Gift size={40} color={theme.textMuted} strokeWidth={1.5} />
                  <Text style={[styles.rewardSelectorEmpty, { color: theme.textMuted, textAlign: 'center' }]}>
                    Ce client n'a pas encore assez de points pour un cadeau.
                  </Text>
                  <Text style={[{ color: theme.textMuted, fontSize: 13, textAlign: 'center' }]}>
                    Solde actuel : {customerStatus?.points || 0} {isStampsMode ? 'tampons' : 'points'}
                  </Text>
                </View>
              ) : (
                renderRewardSelector(true)
              )}
            </View>
          ) : (
          /* ═══════════════════════════════════════════ */
          /* ── STAMPS / POINTS EARN MODE ── */
          /* ═══════════════════════════════════════════ */
          isStampsMode ? (
            <View>
              {/* ── Stamp Grid ── */}
              <View style={[styles.stampGridCard, { backgroundColor: theme.bgCard }]}>
                <StampGrid
                  current={customerStatus?.points || 0}
                  total={stampsForReward}
                  size={40}
                />
              </View>

              {/* ── Amount input (Stamps PER_AMOUNT mode only) ── */}
              {!isPerVisit && (
              <View style={[styles.amountInputCard, { backgroundColor: theme.bgCard }]}>
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
                <Stamp size={24} color={stamps > 0 ? theme.success : theme.textMuted} strokeWidth={1.5} />
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

              {renderRewardSelector()}
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
                    : ((isStampsMode ? (isPerVisit ? stamps > 0 : stamps > 0 && parseFloat(stampAmount) > 0) : isValidAmount) && !loading
                        ? theme.primary
                        : theme.border),
              },
            ]}
            onPress={screenMode === 'redeem' ? handleRedeemOnly : (isStampsMode ? handleEarnStamps : handleEarnPoints)}
            disabled={screenMode === 'redeem' ? (!selectedRewardId || loading) : (isStampsMode ? (isPerVisit ? stamps < 1 || loading : !parseFloat(stampAmount) || stamps < 1 || loading) : !isValidAmount || loading)}
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
                  ? `${stamps} tampon${stamps > 1 ? 's' : ''} ajouté${stamps > 1 ? 's' : ''}.`
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
  rewardSelectIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },

  // ── Mode Tabs ──
  modeTabs: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modeTabText: { fontSize: 13, fontWeight: '700' },

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
