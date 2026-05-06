import React, { useState, useEffect, useCallback, useReducer } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  I18nManager,
} from 'react-native';
import { Save, Settings as SettingsIcon, ArrowLeft, Stamp, Star, AlertTriangle, ShieldCheck, ChevronDown, ChevronUp, Shield } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';
import PremiumLockCard from '@/components/PremiumLockCard';
import { RewardManager } from '@/components/settings/RewardManager';
import { DEFAULT_CURRENCY } from '@/config/currency';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Merchant } from '@/types';

type LoyaltyType = 'POINTS' | 'STAMPS';

interface Reward {
  id: string;
  titre: string;
  cout: number;
  description?: string;
}

// â”€â”€ Settings reducer â”€â”€
interface SettingsState {
  loyaltyType: LoyaltyType;
  stampEarningMode: 'PER_VISIT' | 'PER_AMOUNT';
  pointsRate: string;
  conversionRate: string;
  stampsForReward: string;
  hasAccumulationLimit: boolean;
  accumulationLimit: string;
  saving: boolean;
  conversionX: string;
  conversionY: string;
  rewards: Reward[];
  rewardReloadToken: number;
}

const initialSettingsState: SettingsState = {
  loyaltyType: 'POINTS',
  stampEarningMode: 'PER_VISIT',
  pointsRate: '10',
  conversionRate: '10',
  stampsForReward: '10',
  hasAccumulationLimit: false,
  accumulationLimit: '',
  saving: false,
  conversionX: '10',
  conversionY: '1',
  rewards: [],
  rewardReloadToken: 0,
};

type SettingsAction =
  | { type: 'SET'; payload: Partial<SettingsState> }
  | { type: 'LOAD_FROM_MERCHANT'; merchant: Merchant }
  | { type: 'INCREMENT_RELOAD' };

function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'SET':
      return { ...state, ...action.payload };
    case 'LOAD_FROM_MERCHANT': {
      const m = action.merchant;
      return {
        ...state,
        loyaltyType: m.loyaltyType || 'POINTS',
        stampEarningMode: m.stampEarningMode || 'PER_VISIT',
        pointsRate: m.pointsRate?.toString() || '10',
        conversionRate: m.conversionRate?.toString() || '10',
        stampsForReward: m.stampsForReward?.toString() || '10',
        hasAccumulationLimit: m.accumulationLimit != null,
        accumulationLimit: m.accumulationLimit?.toString() || '',
      };
    }
    case 'INCREMENT_RELOAD':
      return { ...state, rewardReloadToken: state.rewardReloadToken + 1 };
  }
}

export default function SettingsScreen() {
  const { merchant, loading: authLoading, updateMerchant, isTeamMember } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [state, dispatch] = useReducer(settingsReducer, initialSettingsState);
  const { loyaltyType, stampEarningMode, pointsRate, conversionRate, stampsForReward, hasAccumulationLimit, accumulationLimit, saving, conversionX, conversionY, rewards, rewardReloadToken } = state;
  const set = useCallback((payload: Partial<SettingsState>) => dispatch({ type: 'SET', payload }), []);

  const [loyaltyExpanded, setLoyaltyExpanded] = useState(false);
  const [giftsExpanded, setGiftsExpanded] = useState(false);
  const handleRewardsChange = useCallback((updatedRewards: Reward[]) => {
    set({ rewards: updatedRewards });
  }, [set]);
  const handleToggleGifts = useCallback(() => {
    setGiftsExpanded(v => !v);
  }, []);

  useEffect(() => {
    if (!merchant && !authLoading) {
      router.replace('/login');
    } else if (merchant) {
      dispatch({ type: 'LOAD_FROM_MERCHANT', merchant });
    }
  }, [merchant, authLoading]);


  // â”€â”€ Switch loyalty type with confirmation â”€â”€
  const handleSwitchLoyaltyType = (newType: LoyaltyType) => {
    if (newType === loyaltyType) return;
    // Just switch the local state â€” the conversion card below will appear
    set({ loyaltyType: newType });
  };

  // â”€â”€ Save all loyalty settings â”€â”€
  const doSave = useCallback(async (forceCapClients: boolean) => {
    const rate = parseFloat(pointsRate);
    const conv = parseFloat(conversionRate);
    const stamps = parseInt(stampsForReward, 10);
    const loyaltyTypeChanged = loyaltyType !== (merchant?.loyaltyType || 'POINTS');
    const x = parseFloat(conversionX) || 10;
    const y = parseFloat(conversionY) || 1;
    if (loyaltyType === 'POINTS' && (!Number.isFinite(rate) || rate <= 0)) {
      Alert.alert(t('common.error'), t('settingsPage.conversionRateError'));
      return;
    }
    if (loyaltyTypeChanged && (!Number.isFinite(x) || !Number.isFinite(y) || y <= 0)) {
      Alert.alert(t('common.error'), t('settingsPage.conversionRateError'));
      return;
    }
    const effectiveConvRate = loyaltyTypeChanged ? (y > 0 ? x / y : 1) : (conv || 10);

    set({ saving: true });
    try {
      const payload: Record<string, unknown> = {
        loyaltyType,
        stampEarningMode,
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
      if (res.data.conversionRate != null) {
        set({ conversionRate: String(res.data.conversionRate) });
      }
      dispatch({ type: 'INCREMENT_RELOAD' });
      Alert.alert(t('common.confirm'), t('settingsPage.saveSuccess'));
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('settingsPage.saveError')));
    } finally {
      set({ saving: false });
    }
  }, [loyaltyType, stampEarningMode, pointsRate, conversionRate, stampsForReward, conversionX, conversionY, hasAccumulationLimit, accumulationLimit, merchant, updateMerchant, t]);

  const handleSave = useCallback(async () => {
    const rate = parseFloat(pointsRate);
    const stamps = parseInt(stampsForReward, 10);

    if (loyaltyType === 'POINTS' && (isNaN(rate) || rate <= 0)) {
      Alert.alert(t('common.error'), t('settingsPage.conversionRateError'));
      return;
    }
    if (loyaltyType === 'STAMPS') {
      if (isNaN(stamps) || stamps < 1) {
        Alert.alert(t('common.error'), t('settingsPage.stampsForRewardError'));
        return;
      }
    }

    const limitVal = parseInt(accumulationLimit, 10);
    if (hasAccumulationLimit && (isNaN(limitVal) || limitVal < 1)) {
      Alert.alert(t('common.error'), t('settingsPage.limitError'));
      return;
    }

    // Check if the new limit is lower than any existing reward cost
    if (hasAccumulationLimit && !isNaN(limitVal) && rewards.length > 0) {
      const exceeding = rewards.filter((r) => r.cout > limitVal);
      if (exceeding.length > 0) {
        const unit = loyaltyType === 'STAMPS' ? t('common.stamps') : t('common.points');
        const names = exceeding.map((r) => `${r.titre} (${r.cout} ${unit})`).join(', ');
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            t('settingsPage.limitBelowRewardsTitle'),
            t('settingsPage.limitBelowRewardsMessage', { rewards: names, limit: limitVal, unit }),
            [
              { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
              { text: t('common.confirm'), style: 'destructive', onPress: () => resolve(true) },
            ],
            { cancelable: false },
          );
        });
        if (!proceed) return;
      }
    }

    // Check if setting/lowering the limit would affect existing clients
    if (hasAccumulationLimit && limitVal > 0) {
      const currentLimit = merchant?.accumulationLimit;
      const isNewOrLower = currentLimit == null || limitVal < currentLimit;

      if (isNewOrLower) {
        set({ saving: true });
        try {
          const preview = await api.post('/merchant/loyalty-settings/preview-limit', { limit: limitVal });
          const affected = preview.data.affectedClients;
          if (affected > 0) {
            set({ saving: false });
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
          set({ saving: false });
        }
      }
    }

    doSave(false);
  }, [pointsRate, stampsForReward, loyaltyType, hasAccumulationLimit, accumulationLimit, rewards, merchant, t, doSave]);

  if (isTeamMember) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <View style={styles.ownerOnlyIcon}>
          <Shield size={ms(36)} color={palette.violet} strokeWidth={1.5} />
        </View>
        <Text style={[styles.ownerOnlyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">{t('common.ownerOnly')}</Text>
        <Text style={[styles.ownerOnlyMsg, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>{t('common.ownerOnlyMsg')}</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.ownerOnlyBtn, { backgroundColor: theme.primary }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Text style={styles.ownerOnlyBtnText} maxFontSizeMultiplier={1.3}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (authLoading || !merchant) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const isStamps = loyaltyType === 'STAMPS';
  const isPremium = merchant?.plan === 'PREMIUM';
  const hasChanges =
    loyaltyType !== (merchant?.loyaltyType || 'POINTS') ||
    stampEarningMode !== (merchant?.stampEarningMode || 'PER_VISIT') ||
    pointsRate !== (merchant?.pointsRate?.toString() || '10') ||
    conversionRate !== (merchant?.conversionRate?.toString() || '10') ||
    stampsForReward !== (merchant?.stampsForReward?.toString() || '10') ||
    hasAccumulationLimit !== (merchant?.accumulationLimit != null) ||
    (hasAccumulationLimit && accumulationLimit !== (merchant?.accumulationLimit?.toString() || ''));

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Simple header — matches activity style ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft
            size={22}
            color={theme.text}
            style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: theme.text }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          accessibilityRole="header"
        >
          {t('settingsPage.title')}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 60 : 0}
      >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Guide text ── */}
        <View style={[styles.guideContainer, { backgroundColor: theme.primaryBg || (theme.primary + '10'), borderLeftColor: theme.primary }]}>
          <Text style={[styles.guideText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
            {t('settingsPage.guideText')}
          </Text>
        </View>

        {/* ── Section: Mode de fidélité ── */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setLoyaltyExpanded(v => !v)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('settingsPage.loyaltyMode')}
          accessibilityState={{ expanded: loyaltyExpanded }}
        >
          <View style={styles.sectionHeaderContent}>
            <View style={styles.sectionHeaderIcon}>
              <SettingsIcon size={ms(16)} color={palette.violet} strokeWidth={2} />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">{t('settingsPage.loyaltyMode')}</Text>
          </View>
          {loyaltyExpanded
            ? <ChevronUp size={20} color={theme.textMuted} />
            : <ChevronDown size={20} color={theme.textMuted} />}
        </TouchableOpacity>
        {loyaltyExpanded && <View
          style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
        >
          {!isPremium ? (
            <PremiumLockCard titleKey="settingsPage.premiumLoyaltyTitle" descriptionKey="settingsPage.premiumLoyaltyDesc" />
          ) : (<>
          <Text style={[styles.cardLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
            {t('settingsPage.loyaltyModeHint')}
          </Text>

          {/* â”€â”€ Segmented Control â”€â”€ */}
          <View style={[styles.segment, { backgroundColor: theme.bg }]}>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                !isStamps && { backgroundColor: theme.primary },
              ]}
              onPress={() => handleSwitchLoyaltyType('POINTS')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: !isStamps }}
              accessibilityLabel={t('settingsPage.modePoints')}
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
                maxFontSizeMultiplier={1.3}
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
              accessibilityRole="button"
              accessibilityState={{ selected: isStamps }}
              accessibilityLabel={t('settingsPage.modeStamps')}
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
                maxFontSizeMultiplier={1.3}
              >
                {t('settingsPage.modeStamps')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* â”€â”€ Mode Change Warning + Conversion Rule â”€â”€ */}
          {loyaltyType !== (merchant?.loyaltyType || 'POINTS') && (
            <View>
              <View
                style={[styles.warningBanner, { backgroundColor: theme.warning + '18' }]}
              >
                <AlertTriangle size={16} color={theme.warning} />
                <Text style={[styles.warningText, { color: theme.warning }]} maxFontSizeMultiplier={1.4}>
                  {t('settingsPage.switchWarning')}
                </Text>
              </View>

              {/* Conversion rule card */}
              <View style={[styles.conversionRuleCard, { backgroundColor: theme.bg, borderColor: theme.primary + '40' }]}>
                <Text style={[styles.conversionRuleTitle, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.conversionRuleTitle')}
                </Text>
                <Text style={[styles.conversionRuleHint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
                  {loyaltyType === 'STAMPS'
                    ? t('settingsPage.conversionRuleHintToStamps')
                    : t('settingsPage.conversionRuleHintToPoints')}
                </Text>
                <View style={styles.conversionRuleRow}>
                  <TextInput
                    style={[styles.conversionRuleInput, { backgroundColor: theme.bgInput, color: theme.text, borderColor: theme.border }]}
                    value={conversionX}
                    onChangeText={(v) => set({ conversionX: v })}
                    keyboardType="decimal-pad"
                    placeholder="10"
                    placeholderTextColor={theme.textMuted}
                    maxLength={6}
                    maxFontSizeMultiplier={1.3}
                  />
                  <Text style={[styles.conversionRuleUnit, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
                    {loyaltyType === 'STAMPS' ? t('settingsPage.conversionRulePts') : t('settingsPage.conversionRuleTmps')}
                  </Text>
                  <Text style={[styles.conversionRuleEquals, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>=</Text>
                  <TextInput
                    style={[styles.conversionRuleInput, { backgroundColor: theme.bgInput, color: theme.text, borderColor: theme.border }]}
                    value={conversionY}
                    onChangeText={(v) => set({ conversionY: v })}
                    keyboardType="decimal-pad"
                    placeholder="1"
                    placeholderTextColor={theme.textMuted}
                    maxLength={6}
                    maxFontSizeMultiplier={1.3}
                  />
                  <Text style={[styles.conversionRuleUnit, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
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
                    <Text style={[styles.conversionRulePreview, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>
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
                      <Text style={[styles.rewardConversionTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                        {t('settingsPage.rewardConversionTitle')}
                      </Text>
                      {rewards.map((r) => {
                        const newCost = loyaltyType === 'STAMPS'
                          ? Math.max(Math.floor(r.cout / rate), 1)
                          : Math.max(Math.round(r.cout * rate), 1);
                        return (
                          <View key={r.id} style={styles.rewardConversionRow}>
                            <Text style={[styles.rewardConversionName, { color: theme.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                              {r.titre}
                            </Text>
                            <Text style={[styles.rewardConversionValues, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                              <Text style={styles.conversionOldCost}>{r.cout} {oldUnit}</Text>
                              {'  ->  '}
                              <Text style={[styles.conversionNewCost, { color: theme.primary }]}>{newCost} {newUnit}</Text>
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

          {/* â”€â”€ Points Mode Settings â”€â”€ */}
          {!isStamps && (
            <View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.conversionRate')}
                </Text>
                <Text style={[styles.fieldHint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
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
                    onChangeText={(v) => set({ pointsRate: v })}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={theme.textMuted}
                    maxLength={8}
                    maxFontSizeMultiplier={1.3}
                  />
                  <Text style={[styles.inputSuffix, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
                    {t('settingsPage.pointsSuffix', { symbol: DEFAULT_CURRENCY.symbol })}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Points preview */}
          {!isStamps && (
            <View style={[styles.stampPreview, { backgroundColor: theme.bg }]}>
              <Text style={[styles.stampPreviewTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                {t('settingsPage.pointsPreviewTitle')}
              </Text>
              <View style={[styles.pointsPreviewCard, { backgroundColor: theme.primary + '15' }]}>
                <View style={[styles.pointsPreviewIcon, { backgroundColor: theme.primary }]}>
                  <Star size={24} color="#fff" fill="#fff" />
                </View>
                <View style={styles.pointsPreviewBody}>
                  <Text style={[styles.pointsPreviewClient, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>{t('settingsPage.simulatedClient')}</Text>
                  <Text style={[styles.pointsPreviewValue, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                    {pointsRate || 10} <Text style={[styles.pointsPreviewUnit, { color: theme.textMuted }]}>Pts</Text>
                  </Text>
                </View>
              </View>
              <Text style={[styles.stampPreviewHint, styles.pointsPreviewHint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
                {t('settingsPage.pointsPreviewHint', { count: pointsRate || 10 })}
              </Text>
            </View>
          )}

          {/* Stamps mode settings */}
          {isStamps && (
            <View>
              {/* â”€â”€ Stamp Earning Mode â”€â”€ */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.stampEarningMode')}
                </Text>
                <Text style={[styles.fieldHint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
                  {t('settingsPage.stampEarningModeHint')}
                </Text>
                <View style={[styles.segment, { backgroundColor: theme.bg, marginTop: 8 }]}>
                  <TouchableOpacity
                    style={[
                      styles.segmentBtn,
                      stampEarningMode === 'PER_VISIT' && { backgroundColor: theme.primary },
                    ]}
                    onPress={() => set({ stampEarningMode: 'PER_VISIT' })}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: stampEarningMode === 'PER_VISIT' }}
                    accessibilityLabel={t('settingsPage.perVisit')}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        { color: stampEarningMode === 'PER_VISIT' ? '#fff' : theme.textMuted },
                        stampEarningMode === 'PER_VISIT' && styles.segmentTextActive,
                      ]}
                      maxFontSizeMultiplier={1.3}
                    >
                      {t('settingsPage.perVisit')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segmentBtn,
                      stampEarningMode === 'PER_AMOUNT' && { backgroundColor: theme.primary },
                    ]}
                    onPress={() => set({ stampEarningMode: 'PER_AMOUNT' })}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: stampEarningMode === 'PER_AMOUNT' }}
                    accessibilityLabel={t('settingsPage.perAmount')}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        { color: stampEarningMode === 'PER_AMOUNT' ? '#fff' : theme.textMuted },
                        stampEarningMode === 'PER_AMOUNT' && styles.segmentTextActive,
                      ]}
                      maxFontSizeMultiplier={1.3}
                    >
                      {t('settingsPage.perAmount')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* â”€â”€ Stamps conversion rate (only for PER_AMOUNT) â”€â”€ */}
              {stampEarningMode === 'PER_AMOUNT' && (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.stampsConversionRate')}
                </Text>
                <Text style={[styles.fieldHint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
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
                    onChangeText={(v) => set({ pointsRate: v })}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={theme.textMuted}
                    maxLength={8}
                    maxFontSizeMultiplier={1.3}
                  />
                  <Text style={[styles.inputSuffix, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
                    {t('settingsPage.stampRateSuffix', { symbol: DEFAULT_CURRENCY.symbol })}
                  </Text>
                </View>
              </View>
              )}
            </View>
          )}

          {/* â”€â”€ Accumulation Limit â”€â”€ */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
              {t('settingsPage.accumulationLimit')}
            </Text>
            <Text style={[styles.fieldHint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
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
                set({ hasAccumulationLimit: !hasAccumulationLimit });
                if (hasAccumulationLimit) set({ accumulationLimit: '' });
              }}
              activeOpacity={0.8}
              accessibilityRole="switch"
              accessibilityState={{ checked: hasAccumulationLimit }}
              accessibilityLabel={t('settingsPage.accumulationLimit')}
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
                maxFontSizeMultiplier={1.3}
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
                  onChangeText={(v) => set({ accumulationLimit: v })}
                  keyboardType="numeric"
                  placeholder={t('settingsPage.limitPlaceholder')}
                  placeholderTextColor={theme.textMuted}
                  maxLength={9}
                  maxFontSizeMultiplier={1.3}
                />
                <Text style={[styles.inputSuffix, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
                  {isStamps ? t('common.stamps') : t('common.points')}
                </Text>
              </View>
            )}
          </View>

          {/* â”€â”€ Save Button (loyalty settings) â”€â”€  */}
          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: hasChanges ? theme.primary : theme.border },
            ]}
            onPress={handleSave}
            disabled={saving || !hasChanges}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('settingsPage.saveBtn')}
            accessibilityState={{ disabled: saving || !hasChanges, busy: saving }}
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
                  maxFontSizeMultiplier={1.3}
                >
                  {t('settingsPage.saveBtn')}
                </Text>
              </>
            )}
          </TouchableOpacity>
          </>)}
        </View>}

        {/* ── Section: Cadeaux ── */}
        <RewardManager
          theme={theme}
          t={t}
          isStamps={isStamps}
          isPremium={isPremium}
          loyaltyType={loyaltyType}
          merchant={merchant}
          conversionX={conversionX}
          conversionY={conversionY}
          hasAccumulationLimit={hasAccumulationLimit}
          accumulationLimit={accumulationLimit}
          onRewardsChange={handleRewardsChange}
          reloadToken={rewardReloadToken}
          expanded={giftsExpanded}
          onToggleExpanded={handleToggleGifts}
        />

      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header — aligned with plan.tsx
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
  },
  backBtn: { marginRight: 2 },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
    flex: 1,
  },


  // Sections
  guideContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderLeftWidth: 3,
  },
  guideText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Lexend_400Regular',
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.2,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardLabel: { fontSize: 14, marginBottom: 14, lineHeight: 20, fontFamily: 'Lexend_400Regular' },

  // â”€â”€ Segmented Control â”€â”€
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
  segmentText: { fontSize: 14, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  segmentTextActive: { fontWeight: '700', fontFamily: 'Lexend_700Bold' },

  // â”€â”€ Warning â”€â”€
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    gap: 10,
  },
  warningText: { fontSize: 13, fontWeight: '500', flex: 1, lineHeight: 18, fontFamily: 'Lexend_500Medium' },

  // â”€â”€ Conversion Rule Card â”€â”€
  conversionRuleCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  conversionRuleTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  conversionRuleHint: { fontSize: 12, lineHeight: 17, fontFamily: 'Lexend_400Regular' },
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
    fontFamily: 'Lexend_700Bold',
  },
  conversionRuleUnit: { fontSize: 12, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  conversionRuleEquals: { fontSize: 18, fontWeight: '300', marginHorizontal: 2, fontFamily: 'Lexend_400Regular' },
  conversionRulePreview: { fontSize: 12, fontWeight: '600', fontStyle: 'italic', fontFamily: 'Lexend_500Medium' },

  // â”€â”€ Reward conversion preview (inside conversion rule card) â”€â”€
  rewardConversionPreview: { marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
  rewardConversionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 6, fontFamily: 'Lexend_600SemiBold' },
  rewardConversionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  rewardConversionName: { fontSize: 12, flex: 1, marginRight: 8, fontFamily: 'Lexend_400Regular' },
  rewardConversionValues: { fontSize: 12, fontFamily: 'Lexend_500Medium' },
  conversionOldCost: { textDecorationLine: 'line-through' as const },
  conversionNewCost: { fontWeight: '600' as const },

  // â”€â”€ Fields â”€â”€
  fieldGroup: { marginTop: 18 },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 4, fontFamily: 'Lexend_600SemiBold' },
  fieldHint: { fontSize: 13, marginBottom: 10, lineHeight: 18, fontFamily: 'Lexend_400Regular' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Lexend_500Medium',
  },
  inputSuffix: { marginLeft: 12, fontSize: 13, fontWeight: '500', fontFamily: 'Lexend_500Medium' },

  // â”€â”€ Stamp Preview â”€â”€
  stampPreview: {
    marginTop: 18,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  stampPreviewTitle: { fontSize: 14, fontWeight: '700', marginBottom: 14, fontFamily: 'Lexend_700Bold' },
  stampGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  stampCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampCheckmark: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  stampPreviewHint: { fontSize: 12, marginTop: 12, fontFamily: 'Lexend_400Regular' },
  pointsPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    width: '100%',
    gap: 16,
  },
  pointsPreviewIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointsPreviewBody: {
    flex: 1,
  },
  pointsPreviewClient: {
    fontSize: 13,
    marginBottom: 4,
    fontFamily: 'Lexend_400Regular',
  },
  pointsPreviewValue: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'Lexend_700Bold',
  },
  pointsPreviewUnit: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },
  pointsPreviewHint: {
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },

  // â”€â”€ Accumulation Limit â”€â”€
  limitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  limitToggleText: { fontSize: 14, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // â”€â”€ Save â”€â”€
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', fontFamily: 'Lexend_700Bold' },

  // Owner-only guard
  ownerOnlyIcon: {
    width: ms(88),
    height: ms(88),
    borderRadius: ms(24),
    backgroundColor: `${palette.violet}18`,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  ownerOnlyTitle: {
    fontWeight: '600' as const,
    fontSize: 16,
    marginTop: 16,
    fontFamily: 'Lexend_600SemiBold',
  },
  ownerOnlyMsg: {
    textAlign: 'center' as const,
    marginTop: 8,
    paddingHorizontal: 32,
    fontFamily: 'Lexend_400Regular',
  },
  ownerOnlyBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  ownerOnlyBtnText: {
    color: '#fff',
    fontWeight: '600' as const,
    fontFamily: 'Lexend_600SemiBold',
  },

  // Section header content
  sectionHeaderContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    flex: 1,
  },
  sectionHeaderIcon: {
    width: ms(32),
    height: ms(32),
    borderRadius: ms(10),
    backgroundColor: `${palette.violet}18`,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
});
