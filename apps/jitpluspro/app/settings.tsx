import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Save,
  Gift,
  Settings as SettingsIcon,
  ArrowLeft,
  Stamp,
  Star,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Pencil,
} from 'lucide-react-native';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { useLanguage } from '@/contexts/LanguageContext';
// Reanimated removed — plain View shim
const Animated = { View } as const;
import { DEFAULT_CURRENCY } from '@/config/currency';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type LoyaltyType = 'POINTS' | 'STAMPS';

interface Reward {
  id: string;
  titre: string;
  cout: number;
  description?: string;
}

export default function SettingsScreen() {
  const { merchant, loading: authLoading, updateMerchant } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  // ── Loyalty settings ──
  const [loyaltyType, setLoyaltyType] = useState<LoyaltyType>('POINTS');
  const [pointsRate, setPointsRate] = useState('10');
  const [conversionRate, setConversionRate] = useState('10');
  const [stampsForReward, setStampsForReward] = useState('10');
  const [hasAccumulationLimit, setHasAccumulationLimit] = useState(false);
  const [accumulationLimit, setAccumulationLimit] = useState('');
  const [saving, setSaving] = useState(false);
  // ── Conversion rule: X points = Y tampons ──
  const [conversionX, setConversionX] = useState('10'); // points side
  const [conversionY, setConversionY] = useState('1');  // stamps side

  // ── Rewards ──
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [savingReward, setSavingReward] = useState(false);
  const [rewardTitle, setRewardTitle] = useState('');
  const [rewardCost, setRewardCost] = useState('');
  const [rewardDescription, setRewardDescription] = useState('');
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);

  useEffect(() => {
    if (!merchant && !authLoading) {
      router.replace('/login');
    } else if (merchant) {
      setLoyaltyType(merchant.loyaltyType || 'POINTS');
      setPointsRate(merchant.pointsRate?.toString() || '10');
      setConversionRate(merchant.conversionRate?.toString() || '10');
      setStampsForReward(merchant.stampsForReward?.toString() || '10');
      setHasAccumulationLimit(merchant.accumulationLimit != null);
      setAccumulationLimit(merchant.accumulationLimit?.toString() || '');
      loadRewards();
    }
  }, [merchant, authLoading]);

  const handleRefresh = useGuardedCallback(async () => {
    if (!merchant) return;
    setLoyaltyType(merchant.loyaltyType || 'POINTS');
    setPointsRate(merchant.pointsRate?.toString() || '10');
    setConversionRate(merchant.conversionRate?.toString() || '10');
    setStampsForReward(merchant.stampsForReward?.toString() || '10');
    setHasAccumulationLimit(merchant.accumulationLimit != null);
    setAccumulationLimit(merchant.accumulationLimit?.toString() || '');
    await loadRewards();
  }, [merchant]);

  const loadRewards = async () => {
    setLoadingRewards(true);
    try {
      const res = await api.get('/rewards');
      setRewards(res.data);
    } catch {
      Alert.alert('Erreur', 'Impossible de charger les cadeaux');
    } finally {
      setLoadingRewards(false);
    }
  };

  // ── Switch loyalty type with confirmation ──
  const handleSwitchLoyaltyType = (newType: LoyaltyType) => {
    if (newType === loyaltyType) return;
    // Just switch the local state — the conversion card below will appear
    setLoyaltyType(newType);
  };

  // ── Save all loyalty settings ──
  const handleSave = async () => {
    const rate = parseFloat(pointsRate);
    const conv = parseFloat(conversionRate);
    const stamps = parseInt(stampsForReward, 10);

    if (loyaltyType === 'POINTS' && (isNaN(rate) || rate <= 0)) {
      Alert.alert('Erreur', 'Le taux de conversion doit être > 0');
      return;
    }
    if (loyaltyType === 'STAMPS') {
      if (isNaN(stamps) || stamps < 1) {
        Alert.alert('Erreur', 'Le nombre de tampons pour un cadeau doit être ≥ 1');
        return;
      }
    }

    const limitVal = parseInt(accumulationLimit, 10);
    if (hasAccumulationLimit && (isNaN(limitVal) || limitVal < 1)) {
      Alert.alert('Erreur', t('settingsPage.limitError'));
      return;
    }

    // Check if setting/lowering the limit would affect existing clients
    if (hasAccumulationLimit && limitVal > 0) {
      const currentLimit = merchant?.accumulationLimit;
      const isNewOrLower = currentLimit == null || limitVal < currentLimit;

      if (isNewOrLower) {
        setSaving(true);
        try {
          const preview = await api.post('/merchant/loyalty-settings/preview-limit', { limit: limitVal });
          const affected = preview.data.affectedClients;
          if (affected > 0) {
            setSaving(false);
            Alert.alert(
              t('settingsPage.limitConfirmTitle'),
              t('settingsPage.limitConfirmMessage', {
                count: affected,
                limit: limitVal,
                unit: loyaltyType === 'STAMPS' ? t('common.stamps') : t('common.points'),
              }),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.confirm'),
                  style: 'destructive',
                  onPress: () => doSave(true),
                },
              ],
            );
            return;
          }
        } catch {
          // If preview fails, proceed without confirmation
        } finally {
          setSaving(false);
        }
      }
    }

    doSave(false);
  };

  const doSave = async (forceCapClients: boolean) => {
    const rate = parseFloat(pointsRate);
    const conv = parseFloat(conversionRate);
    const stamps = parseInt(stampsForReward, 10);
    // Compute actual conversionRate from X/Y ratio when switching
    const loyaltyTypeChanged = loyaltyType !== (merchant?.loyaltyType || 'POINTS');
    const x = parseFloat(conversionX) || 10;
    const y = parseFloat(conversionY) || 1;
    const effectiveConvRate = loyaltyTypeChanged ? (x / y) : (conv || 10);

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        loyaltyType,
        pointsRate: rate || 10,
        conversionRate: effectiveConvRate,
        stampsForReward: stamps || 10,
        accumulationLimit: hasAccumulationLimit ? (parseInt(accumulationLimit, 10) || null) : null,
      };
      if (forceCapClients) {
        payload.forceCapClients = true;
      }

      const res = await api.patch('/merchant/loyalty-settings', payload);
      updateMerchant(res.data);
      await loadRewards();
      Alert.alert('✅ Succès', t('settingsPage.saveSuccess'));
    } catch (err: unknown) {
      Alert.alert('Erreur', getErrorMessage(err, 'Impossible de sauvegarder'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddReward = async () => {
    const cost = parseInt(rewardCost, 10);
    if (!rewardTitle.trim()) {
      Alert.alert('Erreur', 'Le nom du cadeau est requis');
      return;
    }
    if (isNaN(cost) || cost <= 0) {
      Alert.alert('Erreur', 'Le cout doit etre > 0');
      return;
    }

    setSavingReward(true);
    try {
      await api.post('/rewards', {
        titre: rewardTitle.trim(),
        cout: cost,
        description: rewardDescription.trim() || undefined,
      });
      setRewardTitle('');
      setRewardCost('');
      setRewardDescription('');
      loadRewards();
    } catch (err: unknown) {
      Alert.alert('Erreur', getErrorMessage(err, 'Impossible de sauvegarder'));
    } finally {
      setSavingReward(false);
    }
  };

  const handleEditReward = (reward: Reward) => {
    setEditingRewardId(reward.id);
    setRewardTitle(reward.titre);
    setRewardCost(reward.cout.toString());
    setRewardDescription(reward.description || '');
  };

  const handleCancelEdit = () => {
    setEditingRewardId(null);
    setRewardTitle('');
    setRewardCost('');
    setRewardDescription('');
  };

  const handleUpdateReward = async () => {
    if (!editingRewardId) return;
    const cost = parseInt(rewardCost, 10);
    if (!rewardTitle.trim()) {
      Alert.alert('Erreur', 'Le nom du cadeau est requis');
      return;
    }
    if (isNaN(cost) || cost <= 0) {
      Alert.alert('Erreur', 'Le cout doit etre > 0');
      return;
    }

    setSavingReward(true);
    try {
      await api.put(`/rewards/${editingRewardId}`, {
        titre: rewardTitle.trim(),
        cout: cost,
        description: rewardDescription.trim() || undefined,
      });
      setEditingRewardId(null);
      setRewardTitle('');
      setRewardCost('');
      setRewardDescription('');
      loadRewards();
    } catch (err: unknown) {
      Alert.alert('Erreur', getErrorMessage(err, 'Impossible de modifier'));
    } finally {
      setSavingReward(false);
    }
  };

  const handleDeleteReward = (rewardId: string) => {
    Alert.alert('Supprimer ce cadeau ?', 'Cette action est irr\u00e9versible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/rewards/${rewardId}`);
            loadRewards();
          } catch {
            Alert.alert('Erreur', 'Impossible de supprimer');
          }
        },
      },
    ]);
  };

  if (authLoading || !merchant) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const isStamps = loyaltyType === 'STAMPS';
  const hasChanges =
    loyaltyType !== (merchant?.loyaltyType || 'POINTS') ||
    pointsRate !== (merchant?.pointsRate?.toString() || '10') ||
    conversionRate !== (merchant?.conversionRate?.toString() || '10') ||
    stampsForReward !== (merchant?.stampsForReward?.toString() || '10') ||
    hasAccumulationLimit !== (merchant?.accumulationLimit != null) ||
    (hasAccumulationLimit && accumulationLimit !== (merchant?.accumulationLimit?.toString() || ''));

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.bgCard,
            borderBottomColor: theme.borderLight,
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <SettingsIcon size={24} color={theme.primary} strokeWidth={1.5} />
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('settingsPage.title')}</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
          <RefreshCw size={18} color={theme.primary} strokeWidth={1.5} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Section: Mode de fidélité ── */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('settingsPage.loyaltyMode')}</Text>
        <Animated.View
          style={[styles.card, { backgroundColor: theme.bgCard }]}
        >
          <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>
            {t('settingsPage.loyaltyModeHint')}
          </Text>

          {/* ── Segmented Control ── */}
          <View style={[styles.segment, { backgroundColor: theme.bg }]}>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                !isStamps && { backgroundColor: theme.primary },
              ]}
              onPress={() => handleSwitchLoyaltyType('POINTS')}
              activeOpacity={0.8}
            >
              <Star
                size={18}
                color={!isStamps ? '#fff' : theme.textMuted}
                strokeWidth={1.5}
              />
              <Text
                style={[
                  styles.segmentText,
                  { color: !isStamps ? '#fff' : theme.textMuted },
                  !isStamps && styles.segmentTextActive,
                ]}
              >
                {t('settingsPage.modePoints')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentBtn,
                isStamps && { backgroundColor: theme.primary },
              ]}
              onPress={() => handleSwitchLoyaltyType('STAMPS')}
              activeOpacity={0.8}
            >
              <Stamp
                size={18}
                color={isStamps ? '#fff' : theme.textMuted}
                strokeWidth={1.5}
              />
              <Text
                style={[
                  styles.segmentText,
                  { color: isStamps ? '#fff' : theme.textMuted },
                  isStamps && styles.segmentTextActive,
                ]}
              >
                {t('settingsPage.modeStamps')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Mode Change Warning + Conversion Rule ── */}
          {loyaltyType !== (merchant?.loyaltyType || 'POINTS') && (
            <View>
              <Animated.View
                style={[styles.warningBanner, { backgroundColor: theme.warning + '18' }]}
              >
                <AlertTriangle size={16} color={theme.warning} />
                <Text style={[styles.warningText, { color: theme.warning }]}>
                  {t('settingsPage.switchWarning')}
                </Text>
              </Animated.View>

              {/* Conversion rule card */}
              <View style={[styles.conversionRuleCard, { backgroundColor: theme.bg, borderColor: theme.primary + '40' }]}>
                <Text style={[styles.conversionRuleTitle, { color: theme.primary }]}>
                  {t('settingsPage.conversionRuleTitle')}
                </Text>
                <Text style={[styles.conversionRuleHint, { color: theme.textMuted }]}>
                  {loyaltyType === 'STAMPS'
                    ? t('settingsPage.conversionRuleHintToStamps')
                    : t('settingsPage.conversionRuleHintToPoints')}
                </Text>
                <View style={styles.conversionRuleRow}>
                  <TextInput
                    style={[styles.conversionRuleInput, { backgroundColor: theme.bgInput, color: theme.text, borderColor: theme.border }]}
                    value={conversionX}
                    onChangeText={setConversionX}
                    keyboardType="decimal-pad"
                    placeholder="10"
                    placeholderTextColor={theme.textMuted}
                  />
                  <Text style={[styles.conversionRuleUnit, { color: theme.textSecondary }]}>
                    {loyaltyType === 'STAMPS' ? t('settingsPage.conversionRulePts') : t('settingsPage.conversionRuleTmps')}
                  </Text>
                  <Text style={[styles.conversionRuleEquals, { color: theme.textMuted }]}>=</Text>
                  <TextInput
                    style={[styles.conversionRuleInput, { backgroundColor: theme.bgInput, color: theme.text, borderColor: theme.border }]}
                    value={conversionY}
                    onChangeText={setConversionY}
                    keyboardType="decimal-pad"
                    placeholder="1"
                    placeholderTextColor={theme.textMuted}
                  />
                  <Text style={[styles.conversionRuleUnit, { color: theme.textSecondary }]}>
                    {loyaltyType === 'STAMPS' ? t('settingsPage.conversionRuleTmps') : t('settingsPage.conversionRulePts')}
                  </Text>
                </View>
                {/* Live preview */}
                {(() => {
                  const x = parseFloat(conversionX) || 0;
                  const y = parseFloat(conversionY) || 0;
                  if (x <= 0 || y <= 0) return null;
                  const rate = x / y;
                  const exampleIn = 100;
                  const exampleOut = loyaltyType === 'STAMPS'
                    ? Math.max(Math.floor(exampleIn / rate), 0)
                    : Math.round(exampleIn * rate);
                  const fromUnit = loyaltyType === 'STAMPS' ? t('settingsPage.conversionRulePts') : t('settingsPage.conversionRuleTmps');
                  const toUnit = loyaltyType === 'STAMPS' ? t('settingsPage.conversionRuleTmps') : t('settingsPage.conversionRulePts');
                  return (
                    <Text style={[styles.conversionRulePreview, { color: theme.primary }]}>
                      {t('settingsPage.conversionRulePreview', { inVal: exampleIn, fromUnit, outVal: exampleOut, toUnit })}
                    </Text>
                  );
                })()}

                {/* Reward cost conversion preview */}
                {rewards.length > 0 && (() => {
                  const x = parseFloat(conversionX) || 0;
                  const y = parseFloat(conversionY) || 0;
                  if (x <= 0 || y <= 0) return null;
                  const rate = x / y;
                  const oldUnit = loyaltyType === 'STAMPS' ? t('settingsPage.conversionRulePts') : t('settingsPage.conversionRuleTmps');
                  const newUnit = loyaltyType === 'STAMPS' ? t('settingsPage.conversionRuleTmps') : t('settingsPage.conversionRulePts');
                  return (
                    <View style={[styles.rewardConversionPreview, { borderTopColor: theme.border }]}>
                      <Text style={[styles.rewardConversionTitle, { color: theme.text }]}>
                        {t('settingsPage.rewardConversionTitle')}
                      </Text>
                      {rewards.map((r) => {
                        const newCost = loyaltyType === 'STAMPS'
                          ? Math.max(Math.floor(r.cout / rate), 1)
                          : Math.max(Math.round(r.cout * rate), 1);
                        return (
                          <View key={r.id} style={styles.rewardConversionRow}>
                            <Text style={[styles.rewardConversionName, { color: theme.textSecondary }]} numberOfLines={1}>
                              {r.titre}
                            </Text>
                            <Text style={[styles.rewardConversionValues, { color: theme.textMuted }]}>
                              <Text style={{ textDecorationLine: 'line-through' }}>{r.cout} {oldUnit}</Text>
                              {'  →  '}
                              <Text style={{ color: theme.primary, fontWeight: '600' }}>{newCost} {newUnit}</Text>
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}
              </View>
            </View>
          )}

          {/* ── Points Mode Settings ── */}
          {!isStamps && (
            <Animated.View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>
                  {t('settingsPage.conversionRate')}
                </Text>
                <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
                  {t('settingsPage.conversionHint', { rate: pointsRate || '__', currency: DEFAULT_CURRENCY.symbol })}
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.bgInput,
                        color: theme.text,
                        borderColor: theme.border,
                      },
                    ]}
                    value={pointsRate}
                    onChangeText={setPointsRate}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={theme.textMuted}
                  />
                  <Text style={[styles.inputSuffix, { color: theme.textSecondary }]}>
                    {t('settingsPage.pointsSuffix', { symbol: DEFAULT_CURRENCY.symbol })}
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}

          {/* ── Stamps Mode Settings ── */}
          {isStamps && (
            <Animated.View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>
                  {t('settingsPage.stampsConversionRate')}
                </Text>
                <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
                  {t('settingsPage.stampsConversionHint', { rate: pointsRate || '__', currency: DEFAULT_CURRENCY.symbol })}
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.bgInput,
                        color: theme.text,
                        borderColor: theme.border,
                      },
                    ]}
                    value={pointsRate}
                    onChangeText={setPointsRate}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={theme.textMuted}
                  />
                  <Text style={[styles.inputSuffix, { color: theme.textSecondary }]}>
                    {t('settingsPage.stampRateSuffix', { symbol: DEFAULT_CURRENCY.symbol })}
                  </Text>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>
                  {t('settingsPage.stampsForGift')}
                </Text>
                <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
                  {t('settingsPage.stampsForGiftHint', { count: stampsForReward || '__' })}
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.bgInput,
                        color: theme.text,
                        borderColor: theme.border,
                      },
                    ]}
                    value={stampsForReward}
                    onChangeText={setStampsForReward}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={theme.textMuted}
                  />
                  <Text style={[styles.inputSuffix, { color: theme.textSecondary }]}>
                    {t('settingsPage.stampsUnit')}
                  </Text>
                </View>
              </View>

              {/* ── Stamp Preview ── */}
              <View style={[styles.stampPreview, { backgroundColor: theme.bg }]}>
                <Text style={[styles.stampPreviewTitle, { color: theme.text }]}>
                  {t('settingsPage.stampPreviewTitle')}
                </Text>
                <View style={styles.stampGrid}>
                  {Array.from({ length: Math.min(parseInt(stampsForReward, 10) || 10, 20) }).map(
                    (_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.stampCircle,
                          i < 3
                            ? { backgroundColor: theme.primary, borderColor: theme.primary }
                            : { backgroundColor: 'transparent', borderColor: theme.border },
                        ]}
                      >
                        {i < 3 && <Text style={styles.stampCheckmark}>✓</Text>}
                        {i === (parseInt(stampsForReward, 10) || 10) - 1 && i >= 3 && (
                          <Gift size={14} color={theme.warning} />
                        )}
                      </View>
                    ),
                  )}
                </View>
                <Text style={[styles.stampPreviewHint, { color: theme.textMuted }]}>
                  {t('settingsPage.stampPreviewHint', { count: stampsForReward || 10 })}
                </Text>
              </View>
            </Animated.View>
          )}

          {/* ── Accumulation Limit ── */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>
              {t('settingsPage.accumulationLimit')}
            </Text>
            <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
              {t('settingsPage.accumulationLimitHint', { unit: isStamps ? t('common.stamps') : t('common.points') })}
            </Text>

            <TouchableOpacity
              style={[
                styles.limitToggle,
                {
                  backgroundColor: hasAccumulationLimit ? theme.primary + '15' : theme.bg,
                  borderColor: hasAccumulationLimit ? theme.primary : theme.border,
                },
              ]}
              onPress={() => {
                setHasAccumulationLimit(!hasAccumulationLimit);
                if (hasAccumulationLimit) setAccumulationLimit('');
              }}
              activeOpacity={0.8}
            >
              <ShieldCheck
                size={20}
                color={hasAccumulationLimit ? theme.primary : theme.textMuted}
                strokeWidth={1.5}
              />
              <Text
                style={[
                  styles.limitToggleText,
                  { color: hasAccumulationLimit ? theme.primary : theme.textMuted },
                ]}
              >
                {hasAccumulationLimit
                  ? t('settingsPage.limitEnabled')
                  : t('settingsPage.limitDisabled')}
              </Text>
            </TouchableOpacity>

            {hasAccumulationLimit && (
              <View style={[styles.inputRow, { marginTop: 10 }]}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.bgInput,
                      color: theme.text,
                      borderColor: theme.border,
                    },
                  ]}
                  value={accumulationLimit}
                  onChangeText={setAccumulationLimit}
                  keyboardType="numeric"
                  placeholder={t('settingsPage.limitPlaceholder')}
                  placeholderTextColor={theme.textMuted}
                />
                <Text style={[styles.inputSuffix, { color: theme.textSecondary }]}>
                  {isStamps ? t('common.stamps') : t('common.points')}
                </Text>
              </View>
            )}
          </View>

          {/* ── Rewards Management ── */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>{t('settingsPage.gifts')}</Text>
            <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
              {t('settingsPage.giftsHint')}
            </Text>

            <View style={styles.rewardForm}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.bgInput,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
                value={rewardTitle}
                onChangeText={setRewardTitle}
                placeholder={t('settingsPage.giftName')}
                placeholderTextColor={theme.textMuted}
              />
              <View style={styles.inputRow}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.bgInput,
                      color: theme.text,
                      borderColor: theme.border,
                    },
                  ]}
                  value={rewardCost}
                  onChangeText={setRewardCost}
                  keyboardType="numeric"
                  placeholder={t('settingsPage.giftCost')}
                  placeholderTextColor={theme.textMuted}
                />
                <Text style={[styles.inputSuffix, { color: theme.textSecondary }]}>
                  {isStamps ? t('common.stamps') : t('common.points')}
                </Text>
              </View>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.bgInput,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
                value={rewardDescription}
                onChangeText={setRewardDescription}
                placeholder={t('settingsPage.giftDesc')}
                placeholderTextColor={theme.textMuted}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {editingRewardId && (
                  <TouchableOpacity
                    style={[styles.addRewardBtn, { backgroundColor: theme.border, flex: 1 }]}
                    onPress={handleCancelEdit}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.addRewardBtnText, { color: theme.text }]}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.addRewardBtn, { backgroundColor: theme.primary, flex: 1 }]}
                  onPress={editingRewardId ? handleUpdateReward : handleAddReward}
                  disabled={savingReward}
                  activeOpacity={0.8}
                >
                  {savingReward ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.addRewardBtnText}>
                      {editingRewardId ? t('settingsPage.saveGift') : t('settingsPage.addGift')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {loadingRewards ? (
              <View style={[styles.rewardEmpty, { borderColor: theme.border }]}>
                <ActivityIndicator size="small" color={theme.primary} />
              </View>
            ) : rewards.length === 0 ? (
              <View style={[styles.rewardEmpty, { borderColor: theme.border }]}>
                <Text style={[styles.noRewardText, { color: theme.textMuted }]}>
                  {t('settingsPage.noGiftsConfigured')}
                </Text>
              </View>
            ) : (
              <View style={styles.rewardList}>
                {rewards.map((reward) => (
                  <View
                    key={reward.id}
                    style={[
                      styles.rewardRow,
                      { backgroundColor: theme.bg, borderColor: theme.border },
                    ]}
                  >
                    <View style={styles.rewardRowInfo}>
                      <Text style={[styles.rewardRowTitle, { color: theme.text }]}>
                        {reward.titre}
                      </Text>
                      {(() => {
                        const loyaltyTypeChanged = loyaltyType !== (merchant?.loyaltyType || 'POINTS');
                        const x = parseFloat(conversionX) || 10;
                        const y = parseFloat(conversionY) || 1;
                        const rate = x / y;
                        const oldUnit = merchant?.loyaltyType === 'STAMPS' ? t('common.stamps') : t('common.points');
                        const newUnit = isStamps ? t('common.stamps') : t('common.points');

                        if (loyaltyTypeChanged && rate > 0) {
                          const newCost = loyaltyType === 'STAMPS'
                            ? Math.max(Math.floor(reward.cout / rate), 1)
                            : Math.max(Math.round(reward.cout * rate), 1);
                          return (
                            <Text style={[styles.rewardRowMeta, { color: theme.textSecondary }]}>
                              <Text style={{ textDecorationLine: 'line-through', color: theme.textMuted }}>{reward.cout} {oldUnit}</Text>
                              {'  →  '}
                              <Text style={{ color: theme.primary, fontWeight: '600' }}>{newCost} {newUnit}</Text>
                            </Text>
                          );
                        }
                        return (
                          <Text style={[styles.rewardRowMeta, { color: theme.textSecondary }]}>
                            {reward.cout} {newUnit}
                          </Text>
                        );
                      })()}
                      {reward.description ? (
                        <Text style={[styles.rewardRowDesc, { color: theme.textMuted }]}>
                          {reward.description}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.rewardActions}>
                      <TouchableOpacity
                        style={styles.rewardEditBtn}
                        onPress={() => handleEditReward(reward)}
                        activeOpacity={0.7}
                      >
                        <Pencil size={14} color={theme.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rewardDeleteBtn}
                        onPress={() => handleDeleteReward(reward.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.rewardDeleteText, { color: theme.danger }]}>{t('settingsPage.deleteGift')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ── Save Button ──  */}
          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: hasChanges ? theme.primary : theme.border },
            ]}
            onPress={handleSave}
            disabled={saving || !hasChanges}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Save size={20} color={hasChanges ? '#fff' : theme.textMuted} />
                <Text
                  style={[
                    styles.saveBtnText,
                    { color: hasChanges ? '#fff' : theme.textMuted },
                  ]}
                >
                  {t('settingsPage.saveBtn')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: { marginRight: 2 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', flex: 1 },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Sections ──
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 16,
    color: '#1e293b',
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fff',
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLabel: { fontSize: 14, marginBottom: 14, lineHeight: 20, color: '#64748b' },

  // ── Segmented Control ──
  segment: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  segmentText: { fontSize: 14, fontWeight: '600' },
  segmentTextActive: { fontWeight: '700' },

  // ── Warning ──
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    gap: 10,
  },
  warningText: { fontSize: 13, fontWeight: '500', flex: 1, lineHeight: 18 },

  // ── Conversion Rule Card ──
  conversionRuleCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  conversionRuleTitle: { fontSize: 14, fontWeight: '700' },
  conversionRuleHint: { fontSize: 12, lineHeight: 17 },
  conversionRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
  },
  conversionRuleInput: {
    width: 64,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  conversionRuleUnit: { fontSize: 12, fontWeight: '600' },
  conversionRuleEquals: { fontSize: 18, fontWeight: '300', marginHorizontal: 2 },
  conversionRulePreview: { fontSize: 12, fontWeight: '600', fontStyle: 'italic' },

  // ── Reward conversion preview (inside conversion rule card) ──
  rewardConversionPreview: { marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
  rewardConversionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  rewardConversionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  rewardConversionName: { fontSize: 12, flex: 1, marginRight: 8 },
  rewardConversionValues: { fontSize: 12 },

  // ── Fields ──
  fieldGroup: { marginTop: 18 },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 4, color: '#475569' },
  fieldHint: { fontSize: 13, marginBottom: 10, lineHeight: 18, color: '#64748b' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  inputSuffix: { marginLeft: 12, fontSize: 13, fontWeight: '500', color: '#64748b' },

  // ── Rewards ──
  rewardForm: { gap: 10, marginBottom: 12 },
  addRewardBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  addRewardBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  rewardEmpty: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  noRewardText: {
    fontSize: 14,
    textAlign: 'center',
  },
  rewardList: { gap: 8 },
  rewardRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
  },
  rewardRowInfo: { flex: 1 },
  rewardRowTitle: { fontSize: 15, fontWeight: '700' },
  rewardRowMeta: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  rewardRowDesc: { fontSize: 12, marginTop: 6 },
  rewardActions: { justifyContent: 'center', alignItems: 'flex-end', gap: 8 },
  rewardEditBtn: { padding: 6 },
  rewardDeleteBtn: { paddingHorizontal: 8, justifyContent: 'center' },
  rewardDeleteText: { fontSize: 12, fontWeight: '700' },

  // ── Stamp Preview ──
  stampPreview: {
    marginTop: 18,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  stampPreviewTitle: { fontSize: 14, fontWeight: '700', marginBottom: 14 },
  stampGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  stampCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampCheckmark: { color: '#fff', fontSize: 16, fontWeight: '700' },
  stampPreviewHint: { fontSize: 12, marginTop: 12 },

  // ── Accumulation Limit ──
  limitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  limitToggleText: { fontSize: 14, fontWeight: '600' },

  // ── Save ──
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700' },

});
