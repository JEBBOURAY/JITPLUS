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
  Platform,
} from 'react-native';
import { Save, Gift, Check, Settings as SettingsIcon, ArrowLeft, Stamp, Star, AlertTriangle, RefreshCw, ShieldCheck, ChevronDown, ChevronUp, Shield } from 'lucide-react-native';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, brandGradient } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { useLanguage } from '@/contexts/LanguageContext';
import PremiumLockCard from '@/components/PremiumLockCard';
import PremiumLockModal from '@/components/PremiumLockModal';
import { RewardManager } from '@/components/settings/RewardManager';
import { DEFAULT_CURRENCY } from '@/config/currency';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
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

  const [premiumModal, setPremiumModal] = useState<{ visible: boolean; titleKey: string; descKey: string }>({ visible: false, titleKey: '', descKey: '' });
  const [loyaltyExpanded, setLoyaltyExpanded] = useState(false);
  const [giftsExpanded, setGiftsExpanded] = useState(false);

  useEffect(() => {
    if (!merchant && !authLoading) {
      router.replace('/login');
    } else if (merchant) {
      dispatch({ type: 'LOAD_FROM_MERCHANT', merchant });
    }
  }, [merchant, authLoading]);

  const handleRefresh = useGuardedCallback(async () => {
    if (!merchant) return;
    dispatch({ type: 'LOAD_FROM_MERCHANT', merchant });
  }, [merchant]);

  // â”€â”€ Switch loyalty type with confirmation â”€â”€
  const handleSwitchLoyaltyType = (newType: LoyaltyType) => {
    if (newType === loyaltyType) return;
    // Just switch the local state â€” the conversion card below will appear
    set({ loyaltyType: newType });
  };

  // â”€â”€ Save all loyalty settings â”€â”€
  const handleSave = useCallback(async () => {
    const rate = parseFloat(pointsRate);
    const conv = parseFloat(conversionRate);
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
        const unit = isStamps ? t('common.stamps') : t('common.points');
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
  }, [pointsRate, conversionRate, stampsForReward, loyaltyType, hasAccumulationLimit, accumulationLimit, rewards, merchant, t]);

  const doSave = useCallback(async (forceCapClients: boolean) => {
    const rate = parseFloat(pointsRate);
    const conv = parseFloat(conversionRate);
    const stamps = parseInt(stampsForReward, 10);
    // Compute actual conversionRate from X/Y ratio when switching
    const loyaltyTypeChanged = loyaltyType !== (merchant?.loyaltyType || 'POINTS');
    const x = parseFloat(conversionX) || 10;
    const y = parseFloat(conversionY) || 1;
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
      // Sync local state with server response to prevent stale values on next edit
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

  if (isTeamMember) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Shield size={48} color={theme.textMuted} strokeWidth={1.5} />
        <Text style={{ color: theme.text, fontWeight: '600', fontSize: 16, marginTop: 16, fontFamily: 'Lexend_600SemiBold' }}>{t('common.ownerOnly')}</Text>
        <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 8, paddingHorizontal: 32, fontFamily: 'Lexend_400Regular' }}>{t('common.ownerOnlyMsg')}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: theme.primary, borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '600', fontFamily: 'Lexend_600SemiBold' }}>{t('common.back')}</Text>
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
      {/* ── Glassmorphism Header ── */}
      <View collapsable={false}>
        <LinearGradient
          colors={[...brandGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 40 : 20}
            tint={theme.mode === 'dark' ? 'dark' : 'default'}
            style={[styles.headerBlur, { paddingTop: insets.top + 16 }]}
          >
            <View style={styles.glassOverlay} />
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                <ArrowLeft size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{t('settingsPage.title')}</Text>
              <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
                <RefreshCw size={18} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
              </TouchableOpacity>
            </View>
          </BlurView>
        </LinearGradient>
        <LinearGradient
          colors={['rgba(124,58,237,0.3)', 'transparent']}
          style={styles.headerFade}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Guide text ── */}
        <View style={[styles.guideContainer, { backgroundColor: theme.primaryBg || (theme.primary + '10'), borderLeftColor: theme.primary }]}>
          <Text style={[styles.guideText, { color: theme.textSecondary }]}>
            {t('settingsPage.guideText')}
          </Text>
        </View>

        {/* ── Section: Mode de fidélité ── */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setLoyaltyExpanded(v => !v)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <SettingsIcon size={20} color={theme.primary} strokeWidth={1.5} />
            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 0, marginBottom: 0, marginHorizontal: 0 }]}>{t('settingsPage.loyaltyMode')}</Text>
          </View>
          {loyaltyExpanded
            ? <ChevronUp size={20} color={theme.textMuted} />
            : <ChevronDown size={20} color={theme.textMuted} />}
        </TouchableOpacity>
        {loyaltyExpanded && <View
          style={[styles.card, { backgroundColor: theme.bgCard }]}
        >
          {!isPremium ? (
            <PremiumLockCard titleKey="settingsPage.premiumLoyaltyTitle" descriptionKey="settingsPage.premiumLoyaltyDesc" />
          ) : (<>
          <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>
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

          {/* â”€â”€ Mode Change Warning + Conversion Rule â”€â”€ */}
          {loyaltyType !== (merchant?.loyaltyType || 'POINTS') && (
            <View>
              <View
                style={[styles.warningBanner, { backgroundColor: theme.warning + '18' }]}
              >
                <AlertTriangle size={16} color={theme.warning} />
                <Text style={[styles.warningText, { color: theme.warning }]}>
                  {t('settingsPage.switchWarning')}
                </Text>
              </View>

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
                    onChangeText={(v) => set({ conversionX: v })}
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
                    onChangeText={(v) => set({ conversionY: v })}
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
                              {'  â†’  '}
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

          {/* â”€â”€ Points Mode Settings â”€â”€ */}
          {!isStamps && (
            <View>
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
                    onChangeText={(v) => set({ pointsRate: v })}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={theme.textMuted}
                  />
                  <Text style={[styles.inputSuffix, { color: theme.textSecondary }]}>
                    {t('settingsPage.pointsSuffix', { symbol: DEFAULT_CURRENCY.symbol })}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* â”€â”€ Points Preview -->\n          {!isStamps && (\n            <View style={[styles.stampPreview, { backgroundColor: theme.bg }]}>\n              <Text style={[styles.stampPreviewTitle, { color: theme.text }]}>\n                {t('settingsPage.pointsPreviewTitle')}\n              </Text>\n              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.primary + '15', padding: 16, borderRadius: 16, width: '100%', gap: 16 }}>\n                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>\n                  <Star size={24} color='#fff' fill='#fff' />\n                </View>\n                <View style={{ flex: 1 }}>\n                  <Text style={{ fontSize: 13, color: theme.textMuted, marginBottom: 4 }}>{t('settingsPage.simulatedClient')}</Text>\n                  <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text }}>{pointsRate || 10} <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textMuted }}>Pts</Text></Text>\n                </View>\n              </View>\n              <Text style={[styles.stampPreviewHint, { color: theme.textMuted, textAlign: 'center', marginTop: 16, lineHeight: 18 }]}>\n                {t('settingsPage.pointsPreviewHint', { count: pointsRate || 10 })}\n              </Text>\n            </View>\n          )}\n\n          {/* ── Stamps Mode Settings â”€â”€ */}
          {isStamps && (
            <View>
              {/* â”€â”€ Stamp Earning Mode â”€â”€ */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>
                  {t('settingsPage.stampEarningMode')}
                </Text>
                <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
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
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        { color: stampEarningMode === 'PER_VISIT' ? '#fff' : theme.textMuted },
                        stampEarningMode === 'PER_VISIT' && styles.segmentTextActive,
                      ]}
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
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        { color: stampEarningMode === 'PER_AMOUNT' ? '#fff' : theme.textMuted },
                        stampEarningMode === 'PER_AMOUNT' && styles.segmentTextActive,
                      ]}
                    >
                      {t('settingsPage.perAmount')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* â”€â”€ Stamps conversion rate (only for PER_AMOUNT) â”€â”€ */}
              {stampEarningMode === 'PER_AMOUNT' && (
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
                    onChangeText={(v) => set({ pointsRate: v })}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={theme.textMuted}
                  />
                  <Text style={[styles.inputSuffix, { color: theme.textSecondary }]}>
                    {t('settingsPage.stampRateSuffix', { symbol: DEFAULT_CURRENCY.symbol })}
                  </Text>
                </View>
              </View>
              )}
            </View>
          )}

          {/* â”€â”€ Accumulation Limit â”€â”€ */}
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
                set({ hasAccumulationLimit: !hasAccumulationLimit });
                if (hasAccumulationLimit) set({ accumulationLimit: '' });
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
                  onChangeText={(v) => set({ accumulationLimit: v })}
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

          {/* â”€â”€ Save Button (loyalty settings) â”€â”€  */}
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
          onRewardsChange={(r) => set({ rewards: r })}
          reloadToken={rewardReloadToken}
          expanded={giftsExpanded}
          onToggleExpanded={() => setGiftsExpanded(v => !v)}
        />

      </ScrollView>
      <PremiumLockModal
        visible={premiumModal.visible}
        onClose={() => setPremiumModal(prev => ({ ...prev, visible: false }))}
        titleKey={premiumModal.titleKey}
        descKey={premiumModal.descKey}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Header — glassmorphism ──
  headerGradient: { overflow: 'hidden' },
  headerBlur: { overflow: 'hidden' },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 20,
    paddingHorizontal: 24,
    gap: 10,
  },
  backBtn: { marginRight: 2 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', flex: 1, fontFamily: 'Lexend_700Bold', letterSpacing: -0.3 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerFade: { height: 4 },

  // ── Sections ──
  guideContainer: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
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
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 16,
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.3,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
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

});
