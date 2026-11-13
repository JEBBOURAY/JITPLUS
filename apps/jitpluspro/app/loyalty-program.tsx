import { useState, useEffect, useCallback, useReducer, useMemo } from 'react';
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
} from 'react-native';
import { HelpCircle, ChevronRight } from 'lucide-react-native';
import { useShallow } from 'zustand/react/shallow';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, palette, type ThemeColors } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import api from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { useRewards } from '@/hooks/useQueryHooks';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { getErrorMessage } from '@/utils/error';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon as iconTokens } from '@/constants/design';
import { ActionButton } from '@/components/ui/ActionButton';
import { ProBadge } from '@/components/ui/ProBadge';
import PremiumLockModal from '@/components/PremiumLockModal';
import { DemoVideoButton } from '@/components/demo/DemoVideoButton';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
import InfoHint from '@/components/settings/InfoHint';
import LoyaltyGuideSheet from '@/components/settings/LoyaltyGuideSheet';
import { fieldFill } from '@/components/settings/surface';
import { type CurrencyCode } from '@/config/currency';
import { useCurrency } from '@/hooks/useCurrency';
import CurrencyPicker from '@/components/settings/CurrencyPicker';
import { OwnerOnlyNotice, Toast, useDiscardGuard, useToast } from '@/components/stores/StoreUi';
import { hapticSuccess } from '@/utils/haptics';
import { confirmAsync } from '@/utils/confirm';
import { MAX_STAMPS_PER_TX } from '@/constants/app';
import {
  cheapestReward,
  computeStampsForAmount,
  DEFAULT_AMOUNT_PER_STAMP,
  DEFAULT_STAMP_VALIDITY_DAYS,
  STAMP_VALIDITY_PRESETS,
} from '@/utils/stamps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Merchant, Reward } from '@/types';

const EMPTY_REWARDS: Reward[] = [];

const SIM_AMOUNT = 100;
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

interface RulesState {
  stampEarningMode: 'PER_VISIT' | 'PER_AMOUNT';
  amountPerStamp: string;
  hasValidity: boolean;
  validityDays: number;
  hasAccumulationLimit: boolean;
  accumulationLimit: string;
  saving: boolean;
}

/** Saved loyalty rules the draft is reset from. */
type SavedRules = Pick<Merchant, 'stampEarningMode' | 'amountPerStamp' | 'stampValidityDays' | 'accumulationLimit'>;

const initialRulesState: RulesState = {
  stampEarningMode: 'PER_VISIT',
  amountPerStamp: String(DEFAULT_AMOUNT_PER_STAMP),
  hasValidity: false,
  validityDays: DEFAULT_STAMP_VALIDITY_DAYS,
  hasAccumulationLimit: false,
  accumulationLimit: '',
  saving: false,
};

type RulesAction =
  | { type: 'SET'; payload: Partial<RulesState> }
  | { type: 'LOAD_SAVED'; saved: SavedRules };

function rulesReducer(state: RulesState, action: RulesAction): RulesState {
  switch (action.type) {
    case 'SET':
      return { ...state, ...action.payload };
    case 'LOAD_SAVED': {
      const m = action.saved;
      return {
        ...state,
        stampEarningMode: m.stampEarningMode || 'PER_VISIT',
        amountPerStamp: String(m.amountPerStamp ?? DEFAULT_AMOUNT_PER_STAMP),
        hasValidity: m.stampValidityDays != null,
        validityDays: m.stampValidityDays ?? DEFAULT_STAMP_VALIDITY_DAYS,
        hasAccumulationLimit: m.accumulationLimit != null,
        accumulationLimit: m.accumulationLimit?.toString() || '',
      };
    }
  }
}

interface SwitchRowProps {
  theme: ThemeColors;
  label: string;
  caption: string;
  value: boolean;
  /** Free plan: shown dimmed; the tap opens the Pro offer. */
  locked: boolean;
  onPress: () => void;
}

function SwitchRow({ theme, label, caption, value, locked, onPress }: SwitchRowProps) {
  const on = value && !locked;
  const { isRTL, row, textAlign } = useDir();
  return (
    <TouchableOpacity
      style={[styles.switchRow, { flexDirection: row, backgroundColor: on ? theme.primaryBg : fieldFill(theme) }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole={locked ? 'button' : 'switch'}
      accessibilityState={locked ? undefined : { checked: value }}
      accessibilityLabel={label}
      accessibilityHint={caption}
    >
      <View style={styles.switchRowText}>
        <Text style={[styles.fieldLabel, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>{label}</Text>
        <Text style={[styles.caption, { color: on ? theme.primary : theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>{caption}</Text>
      </View>
      <View style={[styles.switchTrack, locked && styles.dimmed, { backgroundColor: on ? theme.primary : theme.border }]}>
        <View style={[styles.switchKnob, on !== isRTL ? styles.switchKnobEnd : styles.switchKnobStart]} />
      </View>
    </TouchableOpacity>
  );
}

/**
 * Loyalty programme rules: how a stamp is earned, the currency, and the two
 * optional rules (expiry, accumulation limit). Gifts have their own screen.
 */
export default function LoyaltyProgramScreen() {
  const shouldWait = useRequireAuth();
  const { merchant, updateMerchant, isTeamMember } = useAuth();
  const { isPremium } = usePlanStatus(merchant);
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { row, textAlign, flip } = useDir();
  const qc = useQueryClient();

  // Seeded from the store so the first frame is not seen as an unsaved draft.
  const [state, dispatch] = useReducer(rulesReducer, undefined, () => {
    const m = useAuthStore.getState().merchant;
    return m ? rulesReducer(initialRulesState, { type: 'LOAD_SAVED', saved: m }) : initialRulesState;
  });
  const { stampEarningMode, amountPerStamp, hasValidity, validityDays, hasAccumulationLimit, accumulationLimit, saving } = state;
  const set = useCallback((payload: Partial<RulesState>) => dispatch({ type: 'SET', payload }), []);

  // Currency is open to every plan and saved as soon as it is picked.
  const currency = useCurrency();
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [currencyVisible, setCurrencyVisible] = useState(false);
  const openCurrency = useCallback(() => setCurrencyVisible(true), []);
  const closeCurrency = useCallback(() => setCurrencyVisible(false), []);
  const handleCurrencyChange = useCallback(async (code: CurrencyCode) => {
    setSavingCurrency(true);
    try {
      const res = await api.patch('/merchant/currency', { currency: code });
      updateMerchant(res.data);
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('settingsPage.saveError')));
    } finally {
      setSavingCurrency(false);
    }
  }, [updateMerchant, t]);

  const [guideVisible, setGuideVisible] = useState(false);
  const [proOfferVisible, setProOfferVisible] = useState(false);
  const openGuide = useCallback(() => setGuideVisible(true), []);
  const closeGuide = useCallback(() => setGuideVisible(false), []);
  const openProOffer = useCallback(() => setProOfferVisible(true), []);
  const closeProOffer = useCallback(() => setProOfferVisible(false), []);

  // Shared query with the gifts screen: drives the summary and the limit check.
  const { data: rewards = EMPTY_REWARDS } = useRewards(!!merchant && !isTeamMember);
  const mainReward = useMemo(() => cheapestReward(rewards), [rewards]);

  // Only the loyalty rules reset the draft: an unrelated profile update
  // (currency, logo…) must not wipe unsaved edits.
  const saved = useAuthStore(useShallow((s): SavedRules | null => (s.merchant ? {
    stampEarningMode: s.merchant.stampEarningMode,
    amountPerStamp: s.merchant.amountPerStamp,
    stampValidityDays: s.merchant.stampValidityDays,
    accumulationLimit: s.merchant.accumulationLimit,
  } : null)));

  useEffect(() => {
    if (saved) dispatch({ type: 'LOAD_SAVED', saved });
  }, [saved]);

  const isPerAmount = stampEarningMode === 'PER_AMOUNT';
  const parsedAmountPerStamp = parseFloat(amountPerStamp.replace(',', '.'));
  const limitVal = parseInt(accumulationLimit, 10);
  const draftValidity = hasValidity ? validityDays : null;
  const validityChanged = draftValidity !== (saved?.stampValidityDays ?? null);

  // The rules are Pro only (the server refuses them on the free plan).
  const hasChanges = isPremium && !!saved && (
    stampEarningMode !== (saved.stampEarningMode || 'PER_VISIT') ||
    (isPerAmount && parsedAmountPerStamp !== Number(saved.amountPerStamp ?? DEFAULT_AMOUNT_PER_STAMP)) ||
    validityChanged ||
    hasAccumulationLimit !== (saved.accumulationLimit != null) ||
    (hasAccumulationLimit && (limitVal || null) !== (saved.accumulationLimit ?? null))
  );
  useDiscardGuard(hasChanges, saving);

  const resetDraft = useCallback(() => {
    if (saved) dispatch({ type: 'LOAD_SAVED', saved });
  }, [saved]);

  const toast = useToast();
  const showToast = toast.show;

  const handleSave = useCallback(async () => {
    if (isPerAmount && (!Number.isFinite(parsedAmountPerStamp) || parsedAmountPerStamp <= 0)) {
      Alert.alert(t('common.error'), t('settingsPage.amountPerStampError'));
      return;
    }
    if (hasAccumulationLimit && (isNaN(limitVal) || limitVal < 1)) {
      Alert.alert(t('common.error'), t('settingsPage.limitError'));
      return;
    }

    const unit = t('common.stamps');
    const cancel = t('common.cancel');
    const ok = t('common.confirm');

    // A limit below a gift cost makes that gift unreachable.
    if (hasAccumulationLimit) {
      const exceeding = rewards.filter((r) => r.cout > limitVal);
      if (exceeding.length > 0) {
        const names = exceeding.map((r) => `${r.titre} (${r.cout} ${unit})`).join(', ');
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
      const currentLimit = saved?.accumulationLimit;
      if (hasAccumulationLimit && (currentLimit == null || limitVal < currentLimit)) {
        const affected = await api
          .post('/merchant/loyalty-settings/preview-limit', { limit: limitVal })
          .then((r) => r.data.affectedClients as number)
          .catch(() => 0);
        if (affected > 0) {
          const proceed = await confirmAsync(
            t('settingsPage.limitConfirmTitle'),
            t(affected === 1 ? 'settingsPage.limitConfirmMessage_one' : 'settingsPage.limitConfirmMessage_other', { count: affected, limit: limitVal, unit }),
            cancel,
            ok,
          );
          if (!proceed) return;
          forceCap = true;
        }
      }

      const payload: Record<string, unknown> = {
        stampEarningMode,
        accumulationLimit: hasAccumulationLimit ? limitVal : null,
      };
      if (isPerAmount) payload.amountPerStamp = parsedAmountPerStamp;
      if (validityChanged) payload.stampValidityDays = draftValidity;
      if (forceCap) payload.forceCapClients = true;
      const res = await api.patch('/merchant/loyalty-settings', payload);
      updateMerchant(res.data);

      // A cap changes client balances shown elsewhere (home tab, client detail, transaction-amount).
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client-status'] });
      qc.invalidateQueries({ queryKey: ['client-detail'] });
      hapticSuccess();
      showToast(t('settingsPage.saveSuccess'));
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('settingsPage.saveError')));
    } finally {
      set({ saving: false });
    }
  }, [
    isPerAmount, parsedAmountPerStamp, hasAccumulationLimit, limitVal, rewards, saved, stampEarningMode,
    validityChanged, draftValidity, updateMerchant, qc, showToast, set, t,
  ]);

  if (shouldWait) return null;

  if (isTeamMember) return <OwnerOnlyNotice />;

  if (!merchant) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const locked = !isPremium;
  const showSaveBar = hasChanges || saving;
  const card = { backgroundColor: theme.bgCard, borderColor: theme.border };
  const fill = fieldFill(theme);
  const guard = (fn: () => void) => () => (locked ? openProOffer() : fn());
  const stampUnit = (n: number) => (n === 1 ? t('common.stamp') : t('common.stamps'));

  const sim = isPerAmount && parsedAmountPerStamp > 0
    ? computeStampsForAmount(SIM_AMOUNT, parsedAmountPerStamp)
    : { stamps: 0, capped: false };
  const amountLabel = Number.isFinite(parsedAmountPerStamp) && parsedAmountPerStamp > 0 ? String(parsedAmountPerStamp) : '…';
  const ruleLine = isPerAmount
    ? t('settingsPage.ruleAmount', { amount: amountLabel, currency: currency.symbol })
    : t('settingsPage.simPerVisit');
  const giftLine = mainReward
    ? t('settingsPage.recapGift', { count: `${mainReward.cout} ${stampUnit(mainReward.cout)}`, title: mainReward.titre })
    : null;
  const validityPresets: number[] = STAMP_VALIDITY_PRESETS.includes(validityDays as (typeof STAMP_VALIDITY_PRESETS)[number])
    ? [...STAMP_VALIDITY_PRESETS]
    : [...STAMP_VALIDITY_PRESETS, validityDays].sort((a, b) => a - b);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader
        title={t('settingsPage.hubProgramTitle')}
        right={
          <>
            <DemoVideoButton id="carte" variant="header" />
            <TouchableOpacity onPress={openGuide} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel={t('settingsPage.helpButton')}>
              <View style={[styles.iconBtn, { backgroundColor: fill }]}>
                <HelpCircle size={20} color={theme.textSecondary} strokeWidth={iconTokens.stroke} />
              </View>
            </TouchableOpacity>
          </>
        }
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 60 : 0}
      >
      <ScrollView
        contentContainerStyle={{ paddingTop: 4, paddingHorizontal: 16, paddingBottom: showSaveBar ? 130 : Math.max(insets.bottom + 24, 40) }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* The whole card in two lines; the gift line opens the gifts screen. */}
        <View style={styles.summary}>
          <Text style={[styles.caption, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('settingsPage.summaryLabel')}
          </Text>
          <Text style={[styles.hero, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.2} accessibilityLiveRegion="polite">
            {ruleLine}
          </Text>
          {giftLine && (
            <TouchableOpacity
              style={[styles.giftLink, { flexDirection: row }]}
              onPress={() => router.push('/rewards')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={giftLine}
              accessibilityHint={t('settingsPage.giftsSection')}
            >
              <Text style={[styles.hero, styles.shrink, { color: theme.primary, textAlign }]} maxFontSizeMultiplier={1.2}>{giftLine}</Text>
              <ChevronRight size={20} color={theme.primary} strokeWidth={iconTokens.stroke} style={flip} />
            </TouchableOpacity>
          )}
        </View>

        {/* How a stamp is earned */}
        <View style={[styles.card, card]}>
          <View style={[styles.cardHeader, { flexDirection: row }]}>
            <Text style={[styles.cardTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
              {t('settingsPage.step1Title')}
            </Text>
            {locked && <ProBadge locked />}
          </View>
          <View style={[styles.choiceRow, { flexDirection: row }]}>
            {(['PER_VISIT', 'PER_AMOUNT'] as const).map((mode) => {
              const active = stampEarningMode === mode;
              const label = mode === 'PER_VISIT' ? t('settingsPage.modeVisitShort') : t('settingsPage.modeAmountShort');
              return (
                <TouchableOpacity
                  key={mode}
                  style={[styles.choiceBtn, { backgroundColor: active ? theme.primary : fill }]}
                  onPress={guard(() => set({ stampEarningMode: mode }))}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                >
                  <Text style={[styles.choiceText, { color: active ? '#fff' : theme.textSecondary }]} numberOfLines={2} maxFontSizeMultiplier={1.2}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {isPerAmount && (
            <>
              <View style={[styles.inlineRow, { flexDirection: row }]}>
                <Text style={[styles.inlineLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.amountPrefix')}
                </Text>
                <TextInput
                  style={[styles.numberInput, { backgroundColor: fill, color: theme.text }]}
                  value={amountPerStamp}
                  onChangeText={(v) => set({ amountPerStamp: v })}
                  editable={!locked}
                  onPressIn={locked ? openProOffer : undefined}
                  keyboardType="decimal-pad"
                  placeholder="10"
                  placeholderTextColor={theme.textMuted}
                  maxLength={8}
                  maxFontSizeMultiplier={1.2}
                  accessibilityLabel={t('settingsPage.accumulationRate')}
                />
                <Text style={[styles.inlineLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>{currency.symbol}</Text>
              </View>
              <Text style={[styles.caption, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
                {t('settingsPage.simLabel', { amount: SIM_AMOUNT, currency: currency.symbol })}
                {' : '}
                {sim.stamps} {t(sim.stamps === 1 ? 'settingsPage.simStampsEarned_one' : 'settingsPage.simStampsEarned_other')}
                {sim.capped ? `. ${t('transaction.maxStampsPerTxHint', { max: MAX_STAMPS_PER_TX })}` : ''}
              </Text>
            </>
          )}
        </View>

        {/* Currency */}
        <View style={[styles.card, card]}>
          <Text style={[styles.cardTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
            {t('settingsPage.step3Title')}
          </Text>
          <TouchableOpacity
            style={[styles.currencyBtn, { flexDirection: row, backgroundColor: fill }]}
            onPress={openCurrency}
            disabled={savingCurrency}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('settingsPage.currencyLabel')}
            accessibilityValue={{ text: `${currency.name} (${currency.symbol})` }}
          >
            <Text style={[styles.currencyName, { color: theme.text, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {currency.name} ({currency.symbol})
            </Text>
            {savingCurrency ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={[styles.linkText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>{t('settingsPage.changeBtn')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Optional rules */}
        <View style={[styles.card, card]}>
          <View style={[styles.cardHeader, { flexDirection: row }]}>
            <Text style={[styles.cardTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
              {t('settingsPage.optionsTitle')}
            </Text>
            {locked && <ProBadge locked />}
          </View>

          <SwitchRow
            theme={theme}
            label={t('settingsPage.stampValidity')}
            caption={hasValidity && !locked ? t('settingsPage.validityOn', { days: validityDays }) : t('settingsPage.validityOff')}
            value={hasValidity}
            locked={locked}
            onPress={guard(() => set({ hasValidity: !hasValidity }))}
          />
          {hasValidity && !locked && (
            <>
              <View style={[styles.chipRow, { flexDirection: row }]}>
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
              <View style={[styles.hintRow, { flexDirection: row }]}>
                <Text style={[styles.caption, styles.grow, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.validityReminderHint')}
                </Text>
                <InfoHint text={t('settingsPage.stampValidityInfo')} />
              </View>
            </>
          )}

          <SwitchRow
            theme={theme}
            label={t('settingsPage.limitToggle')}
            caption={hasAccumulationLimit && !locked ? t('settingsPage.limitHint') : t('settingsPage.limitDisabled')}
            value={hasAccumulationLimit}
            locked={locked}
            onPress={guard(() =>
              set(hasAccumulationLimit ? { hasAccumulationLimit: false, accumulationLimit: '' } : { hasAccumulationLimit: true }),
            )}
          />
          {hasAccumulationLimit && !locked && (
            <View style={[styles.limitWrap, { flexDirection: row, backgroundColor: fill }]}>
              <TextInput
                style={[styles.limitInput, { color: theme.text, textAlign }]}
                value={accumulationLimit}
                onChangeText={(v) => set({ accumulationLimit: v.replace(/[^0-9]/g, '') })}
                keyboardType="number-pad"
                placeholder={t('settingsPage.limitPlaceholder')}
                placeholderTextColor={theme.textMuted}
                maxLength={7}
                maxFontSizeMultiplier={1.2}
                accessibilityLabel={t('settingsPage.limitToggle')}
              />
              <Text style={[styles.caption, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>
                {t('common.stamps')}
              </Text>
            </View>
          )}
        </View>

        {locked && (
          <ActionButton label={t('settingsPage.proUnlockCta')} onPress={openProOffer} style={styles.unlockBtn} />
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {showSaveBar ? (
        <View
          style={[
            styles.saveBar,
            { flexDirection: row, backgroundColor: theme.bg, paddingBottom: Math.max(insets.bottom + 12, 20) },
            theme.mode === 'dark' ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderLight } : styles.saveBarShadow,
          ]}
        >
          <TouchableOpacity
            onPress={resetDraft}
            disabled={saving}
            activeOpacity={0.8}
            style={[styles.saveBtn, styles.cancelBtn, { backgroundColor: fill }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            accessibilityState={{ disabled: saving }}
          >
            <Text style={[styles.saveBtnText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.2}>
              {t('common.cancel')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
            style={[styles.saveBtn, styles.grow, { backgroundColor: theme.primary }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.save')}
            accessibilityState={{ disabled: saving, busy: saving }}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.saveBtnText, { color: '#fff' }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {t('common.save')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
      <Toast message={toast.message} bottom={showSaveBar ? 110 : Math.max(insets.bottom + 16, 24)} />

      <CurrencyPicker
        theme={theme}
        t={t}
        value={currency}
        visible={currencyVisible}
        onSelect={handleCurrencyChange}
        onClose={closeCurrency}
      />
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
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  dimmed: { opacity: 0.5 },

  fieldLabel: { fontSize: 14, fontFamily: font.medium },
  caption: { fontSize: 12, lineHeight: 17, fontFamily: font.regular },
  iconBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  summary: { paddingHorizontal: 4, paddingTop: 6, paddingBottom: 4, gap: 2 },
  hero: { fontSize: 22, lineHeight: 30, fontFamily: font.semibold, letterSpacing: -0.4 },
  giftLink: { alignItems: 'center', gap: 4, minHeight: 44 },

  // Same bordered card as the "Mes outils" cards of Accueil.
  card: { marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  cardHeader: { alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: 15, fontFamily: font.semibold, letterSpacing: -0.2 },

  choiceRow: { gap: 8 },
  choiceBtn: { flex: 1, minHeight: 48, borderRadius: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  choiceText: { fontSize: 14, fontFamily: font.semibold, textAlign: 'center' },

  inlineRow: { alignItems: 'center', gap: 10 },
  inlineLabel: { fontSize: 14, fontFamily: font.regular },
  numberInput: { width: 84, height: 48, borderRadius: 12, textAlign: 'center', fontSize: 16, fontFamily: font.semibold, padding: 0 },
  linkText: { fontSize: 14, fontFamily: font.semibold },

  currencyBtn: { alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 14, borderRadius: 12 },
  currencyName: { flex: 1, fontSize: 15, fontFamily: font.medium },

  switchRow: { alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12 },
  switchRowText: { flex: 1, gap: 1 },
  switchTrack: { width: 40, height: 24, borderRadius: 999, padding: 2, justifyContent: 'center' },
  switchKnob: { width: 20, height: 20, borderRadius: 999, backgroundColor: '#fff' },
  switchKnobEnd: { alignSelf: 'flex-end' },
  switchKnobStart: { alignSelf: 'flex-start' },

  chipRow: { flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
  chipText: { fontSize: 13, fontFamily: font.medium },
  hintRow: { alignItems: 'center', gap: 8 },

  limitWrap: { alignItems: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14 },
  limitInput: { flex: 1, fontSize: 15, fontFamily: font.semibold, padding: 0 },

  unlockBtn: { marginTop: 18, backgroundColor: palette.charbon, borderColor: palette.charbon },

  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 10, paddingHorizontal: 20, paddingTop: 12 },
  saveBarShadow: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 8 },
  saveBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 12 },
  cancelBtn: { paddingHorizontal: 20 },
  saveBtnText: { fontSize: 15, fontFamily: font.semibold },
});
