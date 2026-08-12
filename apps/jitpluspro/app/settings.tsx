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
import { Save, Settings as SettingsIcon, ArrowLeft, Stamp, Star, AlertTriangle, ShieldCheck, ArrowRight, HelpCircle, Shield } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette, brandGradient } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import api from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';
import PremiumLockCard from '@/components/PremiumLockCard';
import { RewardManager } from '@/components/settings/RewardManager';
import InfoHint from '@/components/settings/InfoHint';
import LoyaltyGuideSheet from '@/components/settings/LoyaltyGuideSheet';
import { DEFAULT_CURRENCY } from '@/config/currency';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Merchant } from '@/types';

const SIM_AMOUNT = 1000;

type LoyaltyType = 'POINTS' | 'STAMPS';

interface Reward {
  id: string;
  titre: string;
  cout: number;
  description?: string;
}

// â”€â”€ Settings reducer â”€â”€
interface SettingsState {
  loyaltyType: LoyaltyType | null;
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
  loyaltyType: null,
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
        loyaltyType: m.loyaltyType ?? null,
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
  const qc = useQueryClient();

  const [state, dispatch] = useReducer(settingsReducer, initialSettingsState);
  const { loyaltyType, stampEarningMode, pointsRate, conversionRate, stampsForReward, hasAccumulationLimit, accumulationLimit, saving, conversionX, conversionY, rewards, rewardReloadToken } = state;
  const set = useCallback((payload: Partial<SettingsState>) => dispatch({ type: 'SET', payload }), []);

  const [guideVisible, setGuideVisible] = useState(false);
  const openGuide = useCallback(() => setGuideVisible(true), []);
  const closeGuide = useCallback(() => setGuideVisible(false), []);
  const handleRewardsChange = useCallback((updatedRewards: Reward[]) => {
    set({ rewards: updatedRewards });
  }, [set]);

  useEffect(() => {
    if (!merchant && !authLoading) {
      router.replace('/login');
    } else if (merchant) {
      dispatch({ type: 'LOAD_FROM_MERCHANT', merchant });
    }
  }, [merchant, authLoading, router]);


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
    // First-time selection (no saved program yet) is NOT a conversion.
    const loyaltyTypeChanged = !!merchant?.loyaltyType && loyaltyType !== merchant.loyaltyType;
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
      // Backend may rescale reward.cout and balances on type/stamps switch.
      // Refresh React Query caches so transaction-amount, FichePreviewModal,
      // home tab, etc. show the new values instead of pre-switch stale data.
      qc.invalidateQueries({ queryKey: queryKeys.rewards });
      qc.invalidateQueries({ queryKey: queryKeys.profile });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client-status'] });
      qc.invalidateQueries({ queryKey: ['client-detail'] });
      dispatch({ type: 'INCREMENT_RELOAD' });
      Alert.alert(t('common.confirm'), t('settingsPage.saveSuccess'));
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('settingsPage.saveError')));
    } finally {
      set({ saving: false });
    }
  }, [loyaltyType, stampEarningMode, pointsRate, conversionRate, stampsForReward, conversionX, conversionY, hasAccumulationLimit, accumulationLimit, merchant, updateMerchant, t, qc, set]);

  const performSave = useCallback(async () => {
    const rate = parseFloat(pointsRate);
    const stamps = parseInt(stampsForReward, 10);

    if (!loyaltyType) {
      Alert.alert(t('common.error'), t('settingsPage.chooseProgramError'));
      return;
    }

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
  }, [pointsRate, stampsForReward, loyaltyType, hasAccumulationLimit, accumulationLimit, rewards, merchant, t, doSave, set]);

  // A mode change converts every client's balance — confirm before saving (§6/§10).
  const handleSave = useCallback(() => {
    const modeChanged = !!merchant?.loyaltyType && loyaltyType !== merchant.loyaltyType;
    if (modeChanged) {
      Alert.alert(
        t('settingsPage.switchSaveConfirmTitle'),
        t('settingsPage.switchSaveConfirmMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.confirm'), style: 'destructive', onPress: () => { void performSave(); } },
        ],
      );
      return;
    }
    void performSave();
  }, [merchant, loyaltyType, performSave, t]);

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
  const isPoints = loyaltyType === 'POINTS';
  const savedLoyaltyType = merchant?.loyaltyType ?? null;
  const isPremium = merchant?.plan === 'PREMIUM';
  const hasChanges =
    loyaltyType !== savedLoyaltyType ||
    stampEarningMode !== (merchant?.stampEarningMode || 'PER_VISIT') ||
    pointsRate !== (merchant?.pointsRate?.toString() || '10') ||
    conversionRate !== (merchant?.conversionRate?.toString() || '10') ||
    stampsForReward !== (merchant?.stampsForReward?.toString() || '10') ||
    hasAccumulationLimit !== (merchant?.accumulationLimit != null) ||
    (hasAccumulationLimit && accumulationLimit !== (merchant?.accumulationLimit?.toString() || ''));

  // The migration rule (§6) appears whenever the UI mode differs from the mode
  // currently saved server-side (merchant.loyaltyType) — both directions.
  const modeChanged = !!savedLoyaltyType && loyaltyType !== savedLoyaltyType;
  const showRateField = isPoints || (isStamps && stampEarningMode === 'PER_AMOUNT');
  const rateNum = parseFloat(pointsRate) || 0;
  const simEarned = isStamps
    ? (stampEarningMode === 'PER_VISIT' ? 1 : (rateNum > 0 ? Math.round(SIM_AMOUNT / rateNum) : 0))
    : (rateNum > 0 ? Math.round(SIM_AMOUNT / rateNum) : 0);
  const rateSuffix = isStamps
    ? t('settingsPage.stampRateSuffix', { symbol: DEFAULT_CURRENCY.symbol })
    : t('settingsPage.pointsSuffix', { symbol: DEFAULT_CURRENCY.symbol });
  const unitLabel = isStamps ? t('common.stamps') : t('common.points');
  const rtlFlip = I18nManager.isRTL ? { transform: [{ scaleX: -1 as number }] } : undefined;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Topbar (§1) ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <View style={[styles.iconBtn, { backgroundColor: theme.bgInput }]}>
            <ArrowLeft size={20} color={theme.text} style={rtlFlip} />
          </View>
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: theme.text }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          accessibilityRole="header"
        >
          {t('settingsPage.title')}
        </Text>
        <TouchableOpacity
          onPress={openGuide}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('settingsPage.helpButton')}
        >
          <View style={[styles.iconBtn, { backgroundColor: theme.primary + '17' }]}>
            <HelpCircle size={20} color={theme.primary} strokeWidth={2} />
          </View>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 60 : 0}
      >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Contextual banner (§2) — scan stays blocked until configured ── */}
        <View style={[styles.contextBanner, { backgroundColor: theme.primary + '0D', borderColor: theme.primary + '26' }]}>
          <View style={[styles.contextIcon, { backgroundColor: theme.primary }]}>
            <ShieldCheck size={16} color="#fff" strokeWidth={2} />
          </View>
          <Text style={[styles.contextText, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
            {t('settingsPage.contextBanner')}
          </Text>
          <InfoHint text={t('settingsPage.contextBannerInfo')} />
        </View>

        {/* ── Panel: Mode de fidélité (§1/§2) ── */}
        <View style={[styles.panel, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
          <View style={[styles.panelHeader, { borderBottomColor: theme.borderLight }]}>
            <View style={[styles.panelIcon, { backgroundColor: theme.primary + '17' }]}>
              <SettingsIcon size={16} color={theme.primary} strokeWidth={1.8} />
            </View>
            <Text style={[styles.panelTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
              {t('settingsPage.loyaltyMode')}
            </Text>
            <InfoHint text={t('settingsPage.loyaltyModeInfo')} />
          </View>

          {!isPremium ? (
            <PremiumLockCard titleKey="settingsPage.premiumLoyaltyTitle" descriptionKey="settingsPage.premiumLoyaltyDesc" />
          ) : (
          <View style={styles.panelBody}>
            {/* Mode choice cards (§2) */}
            <View style={styles.modeChoiceRow}>
              <TouchableOpacity
                style={[styles.modeChoice, { borderColor: isPoints ? theme.primary : theme.borderLight, backgroundColor: isPoints ? theme.primary + '0D' : 'transparent' }]}
                onPress={() => handleSwitchLoyaltyType('POINTS')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: isPoints }}
                accessibilityLabel={t('settingsPage.modePoints')}
              >
                {isPoints ? (
                  <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modeChoiceIcon}>
                    <Star size={18} color="#fff" strokeWidth={2} />
                  </LinearGradient>
                ) : (
                  <View style={[styles.modeChoiceIcon, { backgroundColor: theme.bgInput }]}>
                    <Star size={18} color={theme.textMuted} strokeWidth={2} />
                  </View>
                )}
                <Text style={[styles.modeChoiceTitle, { color: theme.text }]} maxFontSizeMultiplier={1.2}>{t('settingsPage.modePoints')}</Text>
                <Text style={[styles.modeChoiceSub, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2} numberOfLines={2}>{t('settingsPage.modePointsSub')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeChoice, { borderColor: isStamps ? theme.primary : theme.borderLight, backgroundColor: isStamps ? theme.primary + '0D' : 'transparent' }]}
                onPress={() => handleSwitchLoyaltyType('STAMPS')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: isStamps }}
                accessibilityLabel={t('settingsPage.modeStamps')}
              >
                {isStamps ? (
                  <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modeChoiceIcon}>
                    <Stamp size={18} color="#fff" strokeWidth={2} />
                  </LinearGradient>
                ) : (
                  <View style={[styles.modeChoiceIcon, { backgroundColor: theme.bgInput }]}>
                    <Stamp size={18} color={theme.textMuted} strokeWidth={2} />
                  </View>
                )}
                <Text style={[styles.modeChoiceTitle, { color: theme.text }]} maxFontSizeMultiplier={1.2}>{t('settingsPage.modeStamps')}</Text>
                <Text style={[styles.modeChoiceSub, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2} numberOfLines={2}>{t('settingsPage.modeStampsSub')}</Text>
              </TouchableOpacity>
            </View>

            {/* No program chosen yet — prompt the merchant to pick one */}
            {!loyaltyType && (
              <View style={[styles.inlineBanner, { backgroundColor: theme.primary + '14' }]}>
                <AlertTriangle size={15} color={theme.primary} strokeWidth={2} />
                <Text style={[styles.inlineBannerText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.chooseProgramHint')}
                </Text>
              </View>
            )}

            {/* Mode change → bidirectional migration rule (§6) */}
            {modeChanged && (
              <View style={styles.migrationBlock}>
                <View style={[styles.warnBanner, { backgroundColor: theme.warning + '14', borderColor: theme.warning + '3D' }]}>
                  <AlertTriangle size={15} color={theme.warning} strokeWidth={2} />
                  <Text style={[styles.warnBannerText, { color: theme.warning }]} maxFontSizeMultiplier={1.3}>
                    {t('settingsPage.switchWarning')}
                  </Text>
                  <InfoHint text={t('settingsPage.migrationInfo')} variant="amber" />
                </View>
                <Text style={[styles.fieldLabelSm, { color: theme.text, marginBottom: 8 }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.conversionRuleTitle')}
                </Text>
                <View style={styles.migrationRow}>
                  <View style={[styles.rateWrap, styles.migrationInput, { backgroundColor: theme.bgInput }]}>
                    <TextInput
                      style={[styles.rateInput, { color: theme.text }]}
                      value={conversionX}
                      onChangeText={(v) => set({ conversionX: v })}
                      keyboardType="decimal-pad"
                      placeholder="10"
                      placeholderTextColor={theme.textMuted}
                      maxLength={6}
                      maxFontSizeMultiplier={1.2}
                    />
                    <Text style={[styles.rateSuffix, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>
                      {loyaltyType === 'STAMPS' ? t('settingsPage.conversionRulePts') : t('settingsPage.conversionRuleTmps')}
                    </Text>
                  </View>
                  <ArrowRight size={16} color={theme.textMuted} strokeWidth={2.5} style={rtlFlip} />
                  <View style={[styles.rateWrap, styles.migrationInput, { backgroundColor: theme.bgInput }]}>
                    <TextInput
                      style={[styles.rateInput, { color: theme.text }]}
                      value={conversionY}
                      onChangeText={(v) => set({ conversionY: v })}
                      keyboardType="decimal-pad"
                      placeholder="1"
                      placeholderTextColor={theme.textMuted}
                      maxLength={6}
                      maxFontSizeMultiplier={1.2}
                    />
                    <Text style={[styles.rateSuffix, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>
                      {loyaltyType === 'STAMPS' ? t('settingsPage.conversionRuleTmps') : t('settingsPage.conversionRulePts')}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Stamps attribution sub-toggle (§3) */}
            {isStamps && (
              <View style={styles.fieldBlock}>
                <View style={styles.labelRow}>
                  <Text style={[styles.fieldLabelSm, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                    {t('settingsPage.stampEarningMode')}
                  </Text>
                  <InfoHint text={t('settingsPage.stampEarningModeInfo')} />
                </View>
                <View style={[styles.subToggle, { backgroundColor: theme.bgInput }]}>
                  <TouchableOpacity
                    style={[styles.subToggleBtn, stampEarningMode === 'PER_VISIT' && [styles.subToggleBtnActive, { backgroundColor: theme.bgCard }]]}
                    onPress={() => set({ stampEarningMode: 'PER_VISIT' })}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: stampEarningMode === 'PER_VISIT' }}
                    accessibilityLabel={t('settingsPage.perVisit')}
                  >
                    <Text style={[styles.subToggleText, { color: stampEarningMode === 'PER_VISIT' ? theme.primary : theme.textSecondary }]} maxFontSizeMultiplier={1.2}>
                      {t('settingsPage.perVisit')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.subToggleBtn, stampEarningMode === 'PER_AMOUNT' && [styles.subToggleBtnActive, { backgroundColor: theme.bgCard }]]}
                    onPress={() => set({ stampEarningMode: 'PER_AMOUNT' })}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: stampEarningMode === 'PER_AMOUNT' }}
                    accessibilityLabel={t('settingsPage.perAmount')}
                  >
                    <Text style={[styles.subToggleText, { color: stampEarningMode === 'PER_AMOUNT' ? theme.primary : theme.textSecondary }]} maxFontSizeMultiplier={1.2}>
                      {t('settingsPage.perAmount')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Single accumulation rate (§3) */}
            {showRateField && (
              <View style={styles.fieldBlock}>
                <View style={styles.labelRow}>
                  <Text style={[styles.fieldLabelSm, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                    {t('settingsPage.accumulationRate')}
                  </Text>
                  <InfoHint text={t('settingsPage.accumulationRateInfo')} />
                </View>
                <View style={[styles.rateWrap, { backgroundColor: theme.bgInput }]}>
                  <TextInput
                    style={[styles.rateInput, { color: theme.text }]}
                    value={pointsRate}
                    onChangeText={(v) => set({ pointsRate: v })}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={theme.textMuted}
                    maxLength={8}
                    maxFontSizeMultiplier={1.2}
                  />
                  <Text style={[styles.rateSuffix, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>
                    {rateSuffix}
                  </Text>
                </View>
              </View>
            )}

            {/* Live simulation (§4) */}
            {!!loyaltyType && (
              <LinearGradient
                colors={theme.mode === 'dark' ? ['rgba(167,139,250,0.12)', 'rgba(31,41,55,0.14)'] : ['rgba(124,58,237,0.06)', 'rgba(31,41,55,0.03)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.simCard, { borderColor: theme.primary + '1F' }]}
              >
                <View style={styles.simTop}>
                  <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.simIcon}>
                    {isStamps ? <Stamp size={19} color="#fff" strokeWidth={2} /> : <Star size={19} color="#fff" strokeWidth={2} />}
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.simLabel, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                      {t('settingsPage.simLabel', { amount: SIM_AMOUNT, currency: DEFAULT_CURRENCY.symbol })}
                    </Text>
                    <Text style={[styles.simValue, { color: theme.text }]} maxFontSizeMultiplier={1.2}>
                      {simEarned} <Text style={[styles.simUnit, { color: theme.primary }]}>{isStamps ? t('settingsPage.simStampsEarned') : t('settingsPage.simPointsEarned')}</Text>
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            )}

            {/* Accumulation limit (§5) — Pro feature */}
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={[styles.fieldLabelSm, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.accumulationLimit')}
                </Text>
                <View style={styles.proBadge}>
                  <Text style={styles.proBadgeText} maxFontSizeMultiplier={1.2}>{t('settingsPage.proBadge')}</Text>
                </View>
                <InfoHint text={t('settingsPage.accumulationLimitInfo')} />
              </View>
              <TouchableOpacity
                style={[
                  styles.limitRow,
                  {
                    backgroundColor: hasAccumulationLimit ? theme.primary + '12' : theme.bgInput,
                    borderColor: hasAccumulationLimit ? theme.primary + '40' : 'transparent',
                  },
                ]}
                onPress={() => {
                  const next = !hasAccumulationLimit;
                  set(next ? { hasAccumulationLimit: true } : { hasAccumulationLimit: false, accumulationLimit: '' });
                }}
                activeOpacity={0.8}
                accessibilityRole="switch"
                accessibilityState={{ checked: hasAccumulationLimit }}
                accessibilityLabel={t('settingsPage.accumulationLimit')}
              >
                <ShieldCheck size={18} color={hasAccumulationLimit ? theme.primary : theme.textMuted} strokeWidth={1.8} />
                <Text style={[styles.limitRowText, { color: hasAccumulationLimit ? theme.primary : theme.textSecondary }]} maxFontSizeMultiplier={1.2}>
                  {hasAccumulationLimit ? t('settingsPage.limitEnabled') : t('settingsPage.limitDisabled')}
                </Text>
                <View style={[styles.switchTrack, { backgroundColor: hasAccumulationLimit ? theme.primary : theme.border }]}>
                  <View style={[styles.switchKnob, hasAccumulationLimit ? styles.switchKnobOn : styles.switchKnobOff]} />
                </View>
              </TouchableOpacity>

              {hasAccumulationLimit && (
                <View style={[styles.rateWrap, { backgroundColor: theme.bgInput, marginTop: 10 }]}>
                  <TextInput
                    style={[styles.rateInput, { color: theme.text }]}
                    value={accumulationLimit}
                    onChangeText={(v) => set({ accumulationLimit: v })}
                    keyboardType="numeric"
                    placeholder={t('settingsPage.limitPlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    maxLength={9}
                    maxFontSizeMultiplier={1.2}
                  />
                  <Text style={[styles.rateSuffix, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>
                    {unitLabel}
                  </Text>
                </View>
              )}
            </View>
          </View>
          )}
        </View>

        {/* ── Panel: Cadeaux (§9) ── */}
        <RewardManager
          theme={theme}
          t={t}
          isStamps={isStamps}
          isPremium={isPremium}
          loyaltyType={loyaltyType ?? 'POINTS'}
          merchant={merchant}
          conversionX={conversionX}
          conversionY={conversionY}
          hasAccumulationLimit={hasAccumulationLimit}
          accumulationLimit={accumulationLimit}
          onRewardsChange={handleRewardsChange}
          reloadToken={rewardReloadToken}
        />

      </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Sticky save bar (§10) — loyalty settings only ── */}
      {isPremium && (
        <View style={[styles.saveBar, { backgroundColor: theme.bg, borderTopColor: theme.borderLight, paddingBottom: Math.max(insets.bottom + 12, 20) }]}>
          {hasChanges ? (
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('settingsPage.saveBtn')}
              accessibilityState={{ disabled: saving, busy: saving }}
            >
              <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtnGrad}>
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Save size={19} color="#fff" strokeWidth={2} />
                    <Text style={styles.saveBtnTextOn} maxFontSizeMultiplier={1.2}>{t('settingsPage.saveBtn')}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={[styles.saveBtnGrad, { backgroundColor: theme.bgInput }]}>
              <Save size={19} color={theme.textMuted} strokeWidth={2} />
              <Text style={[styles.saveBtnTextOn, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>{t('settingsPage.saveBtn')}</Text>
            </View>
          )}
        </View>
      )}

      <LoyaltyGuideSheet visible={guideVisible} onClose={closeGuide} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Topbar ──
  iconBtn: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  // ── Contextual banner (§2) ──
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  contextIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  contextText: { flex: 1, fontSize: 13, fontWeight: '700', fontFamily: 'Lexend_700Bold' },

  // ── Panel ──
  panel: {
    marginHorizontal: 16,
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  panelIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { flex: 1, fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold', letterSpacing: -0.2 },
  panelBody: { padding: 16 },

  // ── Mode choice cards (§2) ──
  modeChoiceRow: { flexDirection: 'row', gap: 10 },
  modeChoice: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    minHeight: 108,
  },
  modeChoiceIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  modeChoiceTitle: { fontSize: 13, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  modeChoiceSub: { fontSize: 11, marginTop: 3, textAlign: 'center', fontFamily: 'Lexend_400Regular', lineHeight: 15 },

  // ── Inline / warning banners ──
  inlineBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12 },
  inlineBannerText: { flex: 1, fontSize: 12.5, fontWeight: '600', fontFamily: 'Lexend_600SemiBold', lineHeight: 17 },

  // ── Migration rule (§6) ──
  migrationBlock: { marginTop: 16 },
  warnBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  warnBannerText: { flex: 1, fontSize: 12.5, fontWeight: '600', fontFamily: 'Lexend_600SemiBold', lineHeight: 17 },
  migrationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  migrationInput: { flex: 1 },

  // ── Field blocks ──
  fieldBlock: { marginTop: 16 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  fieldLabelSm: { fontSize: 13, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // ── Rate input ──
  rateWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 13, paddingVertical: 13, paddingHorizontal: 14 },
  rateInput: { flex: 1, fontSize: 15, fontWeight: '700', fontFamily: 'Lexend_700Bold', padding: 0 },
  rateSuffix: { fontSize: 12, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // ── Sub-toggle ──
  subToggle: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3 },
  subToggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  subToggleBtnActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  subToggleText: { fontSize: 12, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // ── Simulation card (§4) ──
  simCard: { marginTop: 16, borderRadius: 16, borderWidth: 1, padding: 16 },
  simTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  simIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  simLabel: { fontSize: 11.5, fontWeight: '500', fontFamily: 'Lexend_500Medium' },
  simValue: { fontSize: 22, fontWeight: '700', fontFamily: 'Lexend_700Bold', letterSpacing: -0.4, marginTop: 1 },
  simUnit: { fontSize: 13, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // ── Pro badge ──
  proBadge: { backgroundColor: 'rgba(252,211,77,0.16)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 },
  proBadgeText: { fontSize: 9, fontWeight: '700', color: '#B45309', letterSpacing: 0.2, fontFamily: 'Lexend_700Bold' },

  // ── Accumulation limit toggle ──
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1 },
  limitRowText: { flex: 1, fontSize: 13, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  switchTrack: { width: 40, height: 24, borderRadius: 12, padding: 2, justifyContent: 'center' },
  switchKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },
  switchKnobOn: { alignSelf: 'flex-end' },
  switchKnobOff: { alignSelf: 'flex-start' },

  // ── Sticky save bar (§10) ──
  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 15 },
  saveBtnTextOn: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },

  // Header — aligned with plan.tsx
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
    flex: 1,
  },

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
});
