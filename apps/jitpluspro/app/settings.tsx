import React, { useState, useEffect, useCallback, useReducer, useMemo } from 'react';
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
import { Save, ArrowLeft, Stamp, HelpCircle, Shield, Lock, Minus, Plus, Clock, ShieldCheck, Crown } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette, type ThemeColors } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import api from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';
import PremiumLockModal from '@/components/PremiumLockModal';
import { RewardManager } from '@/components/settings/RewardManager';
import InfoHint from '@/components/settings/InfoHint';
import LoyaltyGuideSheet from '@/components/settings/LoyaltyGuideSheet';
import LoyaltyCardPreview from '@/components/settings/LoyaltyCardPreview';
import { DEFAULT_CURRENCY } from '@/config/currency';
import { MAX_STAMPS_PER_TX } from '@/constants/app';
import {
  computeStampsForAmount,
  rescaleStamps,
  cardSlots,
  DEFAULT_AMOUNT_PER_STAMP,
  DEFAULT_STAMPS_FOR_REWARD,
  DEFAULT_STAMP_VALIDITY_DAYS,
  MIN_CARD_SLOTS,
  MAX_CARD_SLOTS,
  STAMP_VALIDITY_PRESETS,
} from '@/utils/stamps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Merchant } from '@/types';

const SIM_AMOUNT = 100;

interface Reward {
  id: string;
  titre: string;
  cout: number;
  description?: string;
}

// ── Settings reducer ──
interface SettingsState {
  stampEarningMode: 'PER_VISIT' | 'PER_AMOUNT';
  amountPerStamp: string;
  stampsForReward: number;
  hasValidity: boolean;
  validityDays: number;
  hasAccumulationLimit: boolean;
  accumulationLimit: string;
  saving: boolean;
  rewards: Reward[];
  rewardReloadToken: number;
}

const initialSettingsState: SettingsState = {
  stampEarningMode: 'PER_VISIT',
  amountPerStamp: String(DEFAULT_AMOUNT_PER_STAMP),
  stampsForReward: DEFAULT_STAMPS_FOR_REWARD,
  hasValidity: false,
  validityDays: DEFAULT_STAMP_VALIDITY_DAYS,
  hasAccumulationLimit: false,
  accumulationLimit: '',
  saving: false,
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
        stampEarningMode: m.stampEarningMode || 'PER_VISIT',
        amountPerStamp: String(m.amountPerStamp ?? DEFAULT_AMOUNT_PER_STAMP),
        stampsForReward: m.stampsForReward || DEFAULT_STAMPS_FOR_REWARD,
        hasValidity: m.stampValidityDays != null,
        validityDays: m.stampValidityDays ?? DEFAULT_STAMP_VALIDITY_DAYS,
        hasAccumulationLimit: m.accumulationLimit != null,
        accumulationLimit: m.accumulationLimit?.toString() || '',
      };
    }
    case 'INCREMENT_RELOAD':
      return { ...state, rewardReloadToken: state.rewardReloadToken + 1 };
  }
}

function confirmAsync(title: string, message: string, cancel: string, confirm: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirm, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

/** Light elevation used instead of borders for every surface on this screen. */
function surfaceShadow(theme: ThemeColors) {
  return theme.mode === 'dark'
    ? null
    : { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 };
}

function fieldFill(theme: ThemeColors) {
  return theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : theme.bgInput;
}

interface SwitchRowProps {
  theme: ThemeColors;
  label: string;
  caption: string;
  value: boolean;
  locked: boolean;
  icon: React.ReactNode;
  onPress: () => void;
}

function SwitchRow({ theme, label, caption, value, locked, icon, onPress }: SwitchRowProps) {
  const on = value && !locked;
  return (
    <TouchableOpacity
      style={[styles.switchRow, { backgroundColor: on ? theme.primaryBg : fieldFill(theme) }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole={locked ? 'button' : 'switch'}
      accessibilityState={locked ? undefined : { checked: value }}
      accessibilityLabel={label}
      accessibilityHint={locked ? caption : undefined}
    >
      {icon}
      <View style={styles.switchRowText}>
        <Text style={[styles.fieldLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{label}</Text>
        <Text style={[styles.caption, { color: on ? theme.primary : theme.textMuted }]} maxFontSizeMultiplier={1.3}>{caption}</Text>
      </View>
      {locked ? (
        <View style={[styles.lockPill, { backgroundColor: palette.gold + '2E' }]}>
          <Lock size={13} color="#B45309" strokeWidth={2.2} />
        </View>
      ) : (
        <View style={[styles.switchTrack, { backgroundColor: value ? theme.primary : theme.border }]}>
          <View style={[styles.switchKnob, value ? styles.switchKnobOn : styles.switchKnobOff]} />
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { merchant, loading: authLoading, updateMerchant, isTeamMember } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const qc = useQueryClient();

  const [state, dispatch] = useReducer(settingsReducer, initialSettingsState);
  const {
    stampEarningMode, amountPerStamp, stampsForReward, hasValidity, validityDays,
    hasAccumulationLimit, accumulationLimit, saving, rewards, rewardReloadToken,
  } = state;
  const set = useCallback((payload: Partial<SettingsState>) => dispatch({ type: 'SET', payload }), []);

  const [guideVisible, setGuideVisible] = useState(false);
  const [proOfferVisible, setProOfferVisible] = useState(false);
  const openGuide = useCallback(() => setGuideVisible(true), []);
  const closeGuide = useCallback(() => setGuideVisible(false), []);
  const openProOffer = useCallback(() => setProOfferVisible(true), []);
  const closeProOffer = useCallback(() => setProOfferVisible(false), []);
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

  const isPerAmount = stampEarningMode === 'PER_AMOUNT';
  const parsedAmountPerStamp = parseFloat(amountPerStamp.replace(',', '.'));
  const savedSlots = merchant?.stampsForReward || DEFAULT_STAMPS_FOR_REWARD;
  const slotsChanged = stampsForReward !== savedSlots;
  const draftValidity = hasValidity ? validityDays : null;
  const validityChanged = draftValidity !== (merchant?.stampValidityDays ?? null);

  // Reward costs as they will be once the stampsForReward rescale is applied.
  const scaledRewards = useMemo(
    () => rewards.map((r) => ({ ...r, scaled: rescaleStamps(r.cout, savedSlots, stampsForReward) })),
    [rewards, savedSlots, stampsForReward],
  );

  const stampUnit = useCallback(
    (n: number) => (n === 1 ? t('common.stamp') : t('common.stamps')),
    [t],
  );

  // ── Save all loyalty settings ──
  const doSave = useCallback(async (forceCapClients: boolean) => {
    const payload: Record<string, unknown> = {
      stampEarningMode,
      accumulationLimit: hasAccumulationLimit ? (parseInt(accumulationLimit, 10) || null) : null,
    };
    if (isPerAmount) payload.amountPerStamp = parsedAmountPerStamp;
    if (slotsChanged) payload.stampsForReward = stampsForReward;
    if (validityChanged) payload.stampValidityDays = draftValidity;
    if (forceCapClients) payload.forceCapClients = true;

    const res = await api.patch('/merchant/loyalty-settings', payload);
    updateMerchant(res.data);
    // A rescale or a cap changes reward costs and client balances shown
    // elsewhere (home tab, client detail, transaction-amount).
    qc.invalidateQueries({ queryKey: queryKeys.rewards });
    qc.invalidateQueries({ queryKey: ['clients'] });
    qc.invalidateQueries({ queryKey: ['client-status'] });
    qc.invalidateQueries({ queryKey: ['client-detail'] });
    dispatch({ type: 'INCREMENT_RELOAD' });
    Alert.alert(t('common.confirm'), t('settingsPage.saveSuccess'));
  }, [stampEarningMode, isPerAmount, parsedAmountPerStamp, hasAccumulationLimit, accumulationLimit, slotsChanged, stampsForReward, validityChanged, draftValidity, updateMerchant, t, qc]);

  const handleSave = useCallback(async () => {
    if (isPerAmount && (!Number.isFinite(parsedAmountPerStamp) || parsedAmountPerStamp <= 0)) {
      Alert.alert(t('common.error'), t('settingsPage.amountPerStampError'));
      return;
    }

    const limitVal = parseInt(accumulationLimit, 10);
    if (hasAccumulationLimit && (isNaN(limitVal) || limitVal < 1)) {
      Alert.alert(t('common.error'), t('settingsPage.limitError'));
      return;
    }

    const unit = t('common.stamps');
    const cancel = t('common.cancel');
    const ok = t('common.confirm');

    // A limit below a reward cost makes that reward unreachable.
    if (hasAccumulationLimit && scaledRewards.length > 0) {
      const exceeding = scaledRewards.filter((r) => r.scaled > limitVal);
      if (exceeding.length > 0) {
        const names = exceeding.map((r) => `${r.titre} (${r.scaled} ${unit})`).join(', ');
        const proceed = await confirmAsync(
          t('settingsPage.limitBelowRewardsTitle'),
          t('settingsPage.limitBelowRewardsMessage', { rewards: names, limit: limitVal, unit }),
          cancel,
          ok,
        );
        if (!proceed) return;
      }
    }

    set({ saving: true });
    try {
      let forceCap = false;
      const currentLimit = merchant?.accumulationLimit;
      if (hasAccumulationLimit && (currentLimit == null || limitVal < currentLimit)) {
        const affected = await api
          .post('/merchant/loyalty-settings/preview-limit', { limit: limitVal })
          .then((r) => r.data.affectedClients as number)
          .catch(() => 0);
        if (affected > 0) {
          const proceed = await confirmAsync(
            t('settingsPage.limitConfirmTitle'),
            t('settingsPage.limitConfirmMessage', { count: affected, limit: limitVal, unit }),
            cancel,
            ok,
          );
          if (!proceed) return;
          forceCap = true;
        }
      }

      if (slotsChanged) {
        const withStamps = await api
          .get('/merchant/loyalty-settings/preview-slots')
          .then((r) => r.data.clientsWithStamps as number)
          .catch(() => 0);
        if (withStamps > 0) {
          const exFrom = Math.max(1, Math.round(savedSlots / 2));
          const exTo = rescaleStamps(exFrom, savedSlots, stampsForReward, 0);
          const proceed = await confirmAsync(
            t('settingsPage.slotsConfirmTitle'),
            t(withStamps === 1 ? 'settingsPage.slotsConfirmMessage_one' : 'settingsPage.slotsConfirmMessage_other', {
              count: withStamps,
              from: savedSlots,
              to: stampsForReward,
              exFrom,
              exTo,
            }),
            cancel,
            ok,
          );
          if (!proceed) return;
        }
      }

      await doSave(forceCap);
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('settingsPage.saveError')));
    } finally {
      set({ saving: false });
    }
  }, [parsedAmountPerStamp, isPerAmount, hasAccumulationLimit, accumulationLimit, scaledRewards, merchant, slotsChanged, savedSlots, stampsForReward, t, doSave, set]);

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

  const isPremium = merchant.plan === 'PREMIUM';
  const locked = !isPremium;
  const savedAmountPerStamp = String(merchant.amountPerStamp ?? DEFAULT_AMOUNT_PER_STAMP);
  const hasChanges =
    stampEarningMode !== (merchant.stampEarningMode || 'PER_VISIT') ||
    (isPerAmount && amountPerStamp !== savedAmountPerStamp) ||
    slotsChanged ||
    validityChanged ||
    hasAccumulationLimit !== (merchant.accumulationLimit != null) ||
    (hasAccumulationLimit && accumulationLimit !== (merchant.accumulationLimit?.toString() || ''));

  const sim = isPerAmount && parsedAmountPerStamp > 0
    ? computeStampsForAmount(SIM_AMOUNT, parsedAmountPerStamp)
    : { stamps: 0, capped: false };
  const amountLabel = Number.isFinite(parsedAmountPerStamp) && parsedAmountPerStamp > 0
    ? String(parsedAmountPerStamp)
    : String(DEFAULT_AMOUNT_PER_STAMP);
  const ruleText = isPerAmount
    ? t('settingsPage.ruleAmount', { amount: amountLabel, currency: DEFAULT_CURRENCY.symbol })
    : t('settingsPage.simPerVisit');

  const previewTotal = cardSlots(scaledRewards.map((r) => r.scaled), stampsForReward);
  const minSlots = Math.min(MIN_CARD_SLOTS, savedSlots);
  const maxSlots = Math.max(MAX_CARD_SLOTS, savedSlots);
  const validityPresets: number[] = STAMP_VALIDITY_PRESETS.includes(validityDays as (typeof STAMP_VALIDITY_PRESETS)[number])
    ? [...STAMP_VALIDITY_PRESETS]
    : [...STAMP_VALIDITY_PRESETS, validityDays].sort((a, b) => a - b);
  const rescaledPreview = slotsChanged
    ? scaledRewards.filter((r) => r.scaled !== r.cout).slice(0, 2)
    : [];

  const shadow = surfaceShadow(theme);
  const fill = fieldFill(theme);
  const rtlFlip = I18nManager.isRTL ? { transform: [{ scaleX: -1 as number }] } : undefined;
  const guard = (fn: () => void) => () => (locked ? openProOffer() : fn());

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Topbar ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <View style={[styles.iconBtn, { backgroundColor: fill }]}>
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
          <View style={[styles.iconBtn, { backgroundColor: fill }]}>
            <HelpCircle size={20} color={theme.textSecondary} strokeWidth={2} />
          </View>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 60 : 0}
      >
      <ScrollView
        contentContainerStyle={{ paddingTop: 4, paddingBottom: isPremium ? 170 : 60 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Live card preview ── */}
        <LoyaltyCardPreview
          theme={theme}
          t={t}
          merchant={merchant}
          total={previewTotal}
          ruleText={ruleText}
          validityText={hasValidity && !locked ? t('settingsPage.validityPreview', { days: validityDays }) : null}
        />

        {/* ── Panel: Carte de tampons ── */}
        <View style={[styles.panel, { backgroundColor: theme.bgCard }, shadow]}>
          <View style={styles.panelHeader}>
            <View style={[styles.panelIcon, { backgroundColor: theme.primaryBg }]}>
              <Stamp size={17} color={theme.primary} strokeWidth={1.9} />
            </View>
            <Text style={[styles.panelTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
              {t('settingsPage.loyaltyMode')}
            </Text>
            {locked ? (
              <TouchableOpacity
                onPress={openProOffer}
                style={[styles.proPill, { backgroundColor: palette.gold + '2E' }]}
                accessibilityRole="button"
                accessibilityLabel={t('settingsPage.proUnlockCta')}
              >
                <Lock size={11} color="#B45309" strokeWidth={2.4} />
                <Text style={styles.proPillText} maxFontSizeMultiplier={1.2}>{t('settingsPage.proBadge')}</Text>
              </TouchableOpacity>
            ) : (
              <InfoHint text={t('settingsPage.loyaltyModeInfo')} />
            )}
          </View>

          <View style={styles.panelBody}>
            {/* Earning mode */}
            <View>
              <View style={styles.labelRow}>
                <Text style={[styles.fieldLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.stampEarningMode')}
                </Text>
                <InfoHint text={t('settingsPage.stampEarningModeInfo')} />
              </View>
              <View style={[styles.subToggle, { backgroundColor: fill }]}>
                {(['PER_VISIT', 'PER_AMOUNT'] as const).map((mode) => {
                  const active = stampEarningMode === mode;
                  const label = mode === 'PER_VISIT' ? t('settingsPage.perVisit') : t('settingsPage.perAmount');
                  return (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.subToggleBtn, active && [styles.subToggleBtnActive, { backgroundColor: theme.bgCard }]]}
                      onPress={guard(() => set({ stampEarningMode: mode }))}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={label}
                    >
                      <Text style={[styles.subToggleText, { color: active ? theme.primary : theme.textMuted }]} maxFontSizeMultiplier={1.2}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Purchase amount per stamp */}
            {isPerAmount && (
              <View style={styles.fieldBlock}>
                <View style={styles.labelRow}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                    {t('settingsPage.accumulationRate')}
                  </Text>
                  <InfoHint text={t('settingsPage.accumulationRateInfo')} />
                </View>
                <View style={[styles.rateWrap, { backgroundColor: fill }]}>
                  <TextInput
                    style={[styles.rateInput, { color: theme.text }]}
                    value={amountPerStamp}
                    onChangeText={(v) => set({ amountPerStamp: v })}
                    editable={!locked}
                    onPressIn={locked ? openProOffer : undefined}
                    keyboardType="decimal-pad"
                    placeholder="10"
                    placeholderTextColor={theme.textMuted}
                    maxLength={8}
                    maxFontSizeMultiplier={1.2}
                  />
                  <Text style={[styles.rateSuffix, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>
                    {t('settingsPage.stampRateSuffix', { symbol: DEFAULT_CURRENCY.symbol })}
                  </Text>
                </View>
              </View>
            )}

            {/* Simulation */}
            <View style={[styles.simCard, { backgroundColor: theme.primaryBg }]}>
              <View style={[styles.simIcon, { backgroundColor: theme.primary }]}>
                <Stamp size={18} color="#fff" strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.caption, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                  {isPerAmount
                    ? t('settingsPage.simLabel', { amount: SIM_AMOUNT, currency: DEFAULT_CURRENCY.symbol })
                    : t('settingsPage.simLabelVisit')}
                </Text>
                {isPerAmount ? (
                  <Text style={[styles.simValue, { color: theme.text }]} maxFontSizeMultiplier={1.2}>
                    {sim.stamps}{' '}
                    <Text style={[styles.simUnit, { color: theme.primary }]}>
                      {t(sim.stamps === 1 ? 'settingsPage.simStampsEarned_one' : 'settingsPage.simStampsEarned_other')}
                    </Text>
                  </Text>
                ) : (
                  <Text style={[styles.simValue, { color: theme.text }]} maxFontSizeMultiplier={1.2}>
                    {t('settingsPage.simPerVisit')}
                  </Text>
                )}
                {sim.capped && (
                  <Text style={[styles.caption, { color: theme.textMuted, marginTop: 2 }]} maxFontSizeMultiplier={1.3}>
                    {t('transaction.maxStampsPerTxHint', { max: MAX_STAMPS_PER_TX })}
                  </Text>
                )}
              </View>
            </View>

            {/* Card slots */}
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={[styles.fieldLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.cardSlots')}
                </Text>
                <InfoHint text={t('settingsPage.cardSlotsInfo')} />
              </View>
              <View style={[styles.stepper, { backgroundColor: fill }]}>
                <TouchableOpacity
                  style={[styles.stepperBtn, { backgroundColor: theme.bgCard }, shadow]}
                  onPress={guard(() => set({ stampsForReward: Math.max(minSlots, stampsForReward - 1) }))}
                  disabled={!locked && stampsForReward <= minSlots}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('settingsPage.cardSlotsDecrease')}
                >
                  <Minus size={18} color={!locked && stampsForReward <= minSlots ? theme.textMuted : theme.text} strokeWidth={2.2} />
                </TouchableOpacity>
                <View style={styles.stepperValueWrap} accessibilityLiveRegion="polite">
                  <Text style={[styles.stepperValue, { color: theme.text }]} maxFontSizeMultiplier={1.2}>{stampsForReward}</Text>
                  <Text style={[styles.caption, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>{stampUnit(stampsForReward)}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.stepperBtn, { backgroundColor: theme.bgCard }, shadow]}
                  onPress={guard(() => set({ stampsForReward: Math.min(maxSlots, stampsForReward + 1) }))}
                  disabled={!locked && stampsForReward >= maxSlots}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('settingsPage.cardSlotsIncrease')}
                >
                  <Plus size={18} color={!locked && stampsForReward >= maxSlots ? theme.textMuted : theme.text} strokeWidth={2.2} />
                </TouchableOpacity>
              </View>
              {rescaledPreview.length > 0 && (
                <Text style={[styles.caption, styles.fieldHint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.slotsRescaleHint', {
                    rewards: rescaledPreview.map((r) => `${r.titre} ${r.cout} → ${r.scaled}`).join(' · '),
                  })}
                </Text>
              )}
            </View>

            {/* Stamp validity */}
            <View style={styles.fieldBlock}>
              <SwitchRow
                theme={theme}
                label={t('settingsPage.stampValidity')}
                caption={
                  locked
                    ? t('settingsPage.proLockedHint')
                    : hasValidity
                      ? t('settingsPage.validityOn', { days: validityDays })
                      : t('settingsPage.validityOff')
                }
                value={hasValidity}
                locked={locked}
                icon={<Clock size={18} color={hasValidity && !locked ? theme.primary : theme.textMuted} strokeWidth={1.8} />}
                onPress={guard(() => set({ hasValidity: !hasValidity }))}
              />
              {hasValidity && !locked && (
                <>
                  <View style={styles.chipRow}>
                    {validityPresets.map((days) => {
                      const active = days === validityDays;
                      return (
                        <TouchableOpacity
                          key={days}
                          style={[styles.chip, { backgroundColor: active ? theme.primary : fill }]}
                          onPress={() => set({ validityDays: days })}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={t('settingsPage.validityPresetA11y', { days })}
                        >
                          <Text style={[styles.chipText, { color: active ? '#fff' : theme.textSecondary }]} maxFontSizeMultiplier={1.2}>
                            {t('settingsPage.validityDays', { days })}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.hintRow}>
                    <Text style={[styles.caption, { color: theme.textMuted, flex: 1 }]} maxFontSizeMultiplier={1.3}>
                      {t('settingsPage.validityReminderHint')}
                    </Text>
                    <InfoHint text={t('settingsPage.stampValidityInfo')} />
                  </View>
                </>
              )}
            </View>

            {/* Accumulation limit */}
            <View style={styles.fieldBlock}>
              <SwitchRow
                theme={theme}
                label={t('settingsPage.limitToggle')}
                caption={
                  locked
                    ? t('settingsPage.proLockedHint')
                    : hasAccumulationLimit
                      ? t('settingsPage.limitEnabled')
                      : t('settingsPage.limitDisabled')
                }
                value={hasAccumulationLimit}
                locked={locked}
                icon={<ShieldCheck size={18} color={hasAccumulationLimit && !locked ? theme.primary : theme.textMuted} strokeWidth={1.8} />}
                onPress={guard(() =>
                  set(hasAccumulationLimit ? { hasAccumulationLimit: false, accumulationLimit: '' } : { hasAccumulationLimit: true }),
                )}
              />
              {hasAccumulationLimit && !locked && (
                <>
                  <View style={[styles.rateWrap, { backgroundColor: fill, marginTop: 10 }]}>
                    <TextInput
                      style={[styles.rateInput, { color: theme.text }]}
                      value={accumulationLimit}
                      onChangeText={(v) => set({ accumulationLimit: v })}
                      keyboardType="numeric"
                      placeholder={t('settingsPage.limitPlaceholder')}
                      placeholderTextColor={theme.textMuted}
                      maxLength={9}
                      maxFontSizeMultiplier={1.2}
                      accessibilityLabel={t('settingsPage.limitToggle')}
                    />
                    <Text style={[styles.rateSuffix, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>
                      {t('common.stamps')}
                    </Text>
                  </View>
                  <View style={styles.hintRow}>
                    <Text style={[styles.caption, { color: theme.textMuted, flex: 1 }]} maxFontSizeMultiplier={1.3}>
                      {t('settingsPage.limitHint')}
                    </Text>
                    <InfoHint text={t('settingsPage.accumulationLimitInfo')} />
                  </View>
                </>
              )}
            </View>

            {locked && (
              <TouchableOpacity
                style={[styles.unlockBtn, { backgroundColor: palette.charbon }]}
                onPress={openProOffer}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('settingsPage.proUnlockCta')}
              >
                <Crown size={16} color={palette.gold} strokeWidth={2} />
                <Text style={styles.unlockBtnText} maxFontSizeMultiplier={1.2}>{t('settingsPage.proUnlockCta')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Panel: Cadeaux ── */}
        <RewardManager
          theme={theme}
          t={t}
          isPremium={isPremium}
          hasAccumulationLimit={hasAccumulationLimit}
          accumulationLimit={accumulationLimit}
          stampsForReward={savedSlots}
          onRewardsChange={handleRewardsChange}
          reloadToken={rewardReloadToken}
        />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Sticky save bar — loyalty rules only (rewards save on their own) ── */}
      {isPremium && (
        <View
          style={[
            styles.saveBar,
            { backgroundColor: theme.bg, paddingBottom: Math.max(insets.bottom + 12, 20) },
            theme.mode === 'dark' ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderLight } : styles.saveBarShadow,
          ]}
        >
          {hasChanges && (
            <View style={styles.unsavedRow} accessibilityLiveRegion="polite">
              <View style={[styles.unsavedDot, { backgroundColor: theme.warning }]} />
              <Text style={[styles.caption, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
                {t('settingsPage.unsavedChanges')}
              </Text>
            </View>
          )}
          <TouchableOpacity
            onPress={handleSave}
            disabled={!hasChanges || saving}
            activeOpacity={0.85}
            style={[
              styles.saveBtn,
              hasChanges
                ? [styles.saveBtnRaised, { backgroundColor: palette.violet, borderBottomColor: palette.violetDark }]
                : { backgroundColor: fill, borderBottomColor: 'transparent' },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('settingsPage.saveBtn')}
            accessibilityState={{ disabled: !hasChanges || saving, busy: saving }}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Save size={18} color={hasChanges ? '#fff' : theme.textMuted} strokeWidth={2} />
                <Text style={[styles.saveBtnText, { color: hasChanges ? '#fff' : theme.textMuted }]} maxFontSizeMultiplier={1.2}>
                  {t('settingsPage.saveBtn')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <LoyaltyGuideSheet visible={guideVisible} onClose={closeGuide} />
      <PremiumLockModal
        visible={proOfferVisible}
        onClose={closeProOffer}
        titleKey="settingsPage.premiumLoyaltyTitle"
        descKey="settingsPage.premiumLoyaltyDesc"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Typography scale (shared by every block on this screen) ──
  //   header 28/Bold · panel title 15/SemiBold · field label 13.5/Medium
  //   value 15–22/SemiBold–Bold · caption 12/Regular
  fieldLabel: { fontSize: 13.5, fontFamily: 'Lexend_500Medium' },
  caption: { fontSize: 12, lineHeight: 17, fontFamily: 'Lexend_400Regular' },

  // ── Topbar ──
  iconBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, gap: 10 },
  headerTitle: { flex: 1, fontSize: 28, fontFamily: 'Lexend_700Bold', letterSpacing: -0.5 },

  // ── Panel ──
  panel: { marginHorizontal: 16, marginTop: 18, borderRadius: 20 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingTop: 16, paddingHorizontal: 16 },
  panelIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { flex: 1, fontSize: 15, fontFamily: 'Lexend_600SemiBold', letterSpacing: -0.2 },
  panelBody: { padding: 16, paddingTop: 14 },
  proPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 9 },
  proPillText: { fontSize: 11, color: '#B45309', fontFamily: 'Lexend_600SemiBold' },

  // ── Field blocks ──
  fieldBlock: { marginTop: 18 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  fieldHint: { marginTop: 8 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },

  // ── Inputs ──
  rateWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 13, paddingVertical: 13, paddingHorizontal: 14 },
  rateInput: { flex: 1, fontSize: 15, fontFamily: 'Lexend_600SemiBold', padding: 0 },
  rateSuffix: { fontSize: 12, fontFamily: 'Lexend_500Medium' },

  // ── Sub-toggle ──
  subToggle: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3 },
  subToggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 },
  subToggleBtnActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  subToggleText: { fontSize: 12.5, fontFamily: 'Lexend_500Medium' },

  // ── Simulation ──
  simCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, borderRadius: 16, padding: 14 },
  simIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  simValue: { fontSize: 20, fontFamily: 'Lexend_700Bold', letterSpacing: -0.3, marginTop: 1 },
  simUnit: { fontSize: 13, fontFamily: 'Lexend_500Medium' },

  // ── Slots stepper ──
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 6 },
  stepperBtn: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepperValueWrap: { flex: 1, alignItems: 'center' },
  stepperValue: { fontSize: 20, fontFamily: 'Lexend_700Bold', lineHeight: 24 },

  // ── Switch rows ──
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14 },
  switchRowText: { flex: 1, gap: 1 },
  switchTrack: { width: 40, height: 24, borderRadius: 12, padding: 2, justifyContent: 'center' },
  switchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  switchKnobOn: { alignSelf: 'flex-end' },
  switchKnobOff: { alignSelf: 'flex-start' },
  lockPill: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },

  // ── Validity chips ──
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  chipText: { fontSize: 12.5, fontFamily: 'Lexend_500Medium' },

  // ── Free plan CTA ──
  unlockBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, paddingVertical: 13, borderRadius: 14 },
  unlockBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Lexend_600SemiBold' },

  // ── Sticky save bar ──
  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12 },
  saveBarShadow: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 8 },
  unsavedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 10 },
  unsavedDot: { width: 7, height: 7, borderRadius: 4 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 15, borderBottomWidth: 3 },
  saveBtnRaised: { shadowColor: palette.violet, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 4 },
  saveBtnText: { fontSize: 14.5, fontFamily: 'Lexend_600SemiBold' },

  // ── Owner-only guard ──
  ownerOnlyIcon: {
    width: ms(88),
    height: ms(88),
    borderRadius: ms(24),
    backgroundColor: `${palette.violet}18`,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  ownerOnlyTitle: { fontSize: 16, marginTop: 16, fontFamily: 'Lexend_600SemiBold' },
  ownerOnlyMsg: { textAlign: 'center' as const, marginTop: 8, paddingHorizontal: 32, fontFamily: 'Lexend_400Regular' },
  ownerOnlyBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  ownerOnlyBtnText: { color: '#fff', fontFamily: 'Lexend_600SemiBold' },
});
