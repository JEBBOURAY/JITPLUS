import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronDown, ChevronUp, Clock, Pencil, Plus, Save, Send } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuthStore } from '@/stores/authStore';
import { useRewards } from '@/hooks/useQueryHooks';
import {
  useCreateScratchCampaign,
  useScheduleScratchCampaign,
  useScratchAudienceEstimate,
  useScratchCampaign,
  useUnscheduleScratchCampaign,
  useUpdateScratchCampaign,
} from '@/hooks/useScratchHooks';
import { getErrorMessage } from '@/utils/error';
import { resolveImageUrl } from '@/utils/imageUrl';
import { ms } from '@/utils/responsive';
import PremiumLockCard from '@/components/PremiumLockCard';
import MerchantLogo from '@/components/MerchantLogo';
import {
  SCRATCH_AUDIENCE_TYPES,
  SCRATCH_CARD_DESIGNS,
  SCRATCH_LIMITS,
  SCRATCH_SEND_SLOTS,
  addDaysYmd,
  describeCouponConditions,
  expectedRewardCounts,
  formatRewardValue,
  rewardDisplay,
  type ScratchAudienceType,
} from '@jitplus/shared/src/scratch';
import { ScratchCardCover, ScratchCardFace, scratchCardHeight } from '@jitplus/shared/src/scratch/ScratchCardFace';
import { Button, Chip, ChipRow, FieldLabel, Input, Notice, ScreenHeader, Section } from '@/components/scratch/ScratchUI';
import { DateField, formatYmd } from '@/components/scratch/DateField';
import { RewardEditor } from '@/components/scratch/RewardEditor';
import {
  AUDIENCE_DEFAULT_VALUES,
  CAMPAIGN_TEMPLATES,
  DURATION_PRESETS,
  MAIN_AUDIENCE_TYPES,
  MAX_SCHEDULE_DAYS,
  WIZARD_STEPS,
  assuredChance,
  campaignFormReducer,
  couponGapIsShort,
  formFromCampaign,
  formToInput,
  initialCampaignForm,
  isSlotPast,
  isSlotQuiet,
  isSlotTooFar,
  isSlotUnavailable,
  moroccoToday,
  moroccoWallTimeToIso,
  moroccoYmdOf,
  pickSendSlot,
  rewardToInput,
  sendAtIso,
  sendYmdOf,
  templateRewards,
  validateStep,
  type CampaignForm,
  type CampaignTemplate,
  type FormError,
  type RewardForm,
  type RewardLabelFn,
  type WizardStep,
} from '@/components/scratch/campaignForm';

const STEP_TITLES: Record<WizardStep, string> = {
  gift: 'scratch.wizard.stepGift',
  audience: 'scratch.wizard.stepWho',
  review: 'scratch.wizard.stepReview',
};

const TEMPLATE_ICONS: Record<CampaignTemplate, string> = { simple: '🏷️', tiers: '🎁', stamps: '⭐' };

type PreviewSide = 'before' | 'after';

/** Big tappable choice with a title and a one-line explanation. */
function OptionCard({ title, description, icon, selected, onPress }: {
  title: string;
  description: string;
  icon?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { isRTL } = useLanguage();
  const textAlign = isRTL ? 'right' : 'left';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${description}`}
      style={[
        styles.option,
        {
          flexDirection: isRTL ? 'row-reverse' : 'row',
          borderColor: selected ? theme.primary : theme.borderLight,
          backgroundColor: selected ? theme.primaryBg : theme.bgElevated,
        },
      ]}
    >
      {icon ? <Text style={styles.optionIcon}>{icon}</Text> : null}
      <View style={styles.flex}>
        <Text style={[styles.optionTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>{title}</Text>
        <Text style={[styles.optionDesc, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>{description}</Text>
      </View>
      <View style={[styles.radio, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : 'transparent' }]}>
        {selected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
      </View>
    </TouchableOpacity>
  );
}

/** Collapsed-by-default block for the settings most merchants never need. */
function MoreOptions({ open, onToggle, label, children }: {
  open: boolean;
  onToggle: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const { isRTL } = useLanguage();
  return (
    <>
      <TouchableOpacity
        onPress={onToggle}
        style={[styles.moreToggle, { borderTopColor: theme.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.moreText, { color: theme.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        {open ? <ChevronUp size={18} color={theme.textMuted} /> : <ChevronDown size={18} color={theme.textMuted} />}
      </TouchableOpacity>
      {open && <View style={styles.moreBody}>{children}</View>}
    </>
  );
}

export default function ScratchCampaignWizard() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale, isRTL } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = typeof params.id === 'string' ? params.id : undefined;

  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const isPremium = merchant?.plan === 'PREMIUM';

  const labelFor = useCallback<RewardLabelFn>((type, value) => formatRewardValue({ type, value, label: '' }, t), [t]);

  const today = useMemo(() => moroccoToday(), []);
  const [form, dispatch] = useReducer(campaignFormReducer, today, (day: string): CampaignForm => ({
    ...initialCampaignForm(day),
    name: t('scratch.wizard.defaultName', { date: formatYmd(day, locale, false) }),
  }));
  const [stepIndex, setStepIndex] = useState(0);
  const [campaignId, setCampaignId] = useState<string | undefined>(editId);
  const [dirty, setDirty] = useState(false);
  const [template, setTemplate] = useState<CampaignTemplate | null>(editId ? null : 'simple');
  const rewardsTouchedRef = useRef(false);
  const [showAudienceOptions, setShowAudienceOptions] = useState(false);
  const [showDateOptions, setShowDateOptions] = useState(false);
  const [previewSide, setPreviewSide] = useState<PreviewSide>('after');
  const [previewRewardKey, setPreviewRewardKey] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const step = WIZARD_STEPS[stepIndex];
  const isLast = stepIndex === WIZARD_STEPS.length - 1;

  const {
    data: existing,
    isLoading: loadingExisting,
    isRefetching: refetchingExisting,
    refetch: refetchExisting,
  } = useScratchCampaign(editId);
  const loadedRef = useRef(false);
  useEffect(() => {
    if (existing && !loadedRef.current) {
      loadedRef.current = true;
      dispatch({ type: 'RESET', form: formFromCampaign(existing, today, labelFor) });
    }
  }, [existing, today, labelFor]);
  const isScheduled = existing?.status === 'SCHEDULED';

  const { data: catalog = [] } = useRewards(isPremium && !isTeamMember);
  const createMutation = useCreateScratchCampaign();
  const updateMutation = useUpdateScratchCampaign();
  const scheduleMutation = useScheduleScratchCampaign();
  const unscheduleMutation = useUnscheduleScratchCampaign();
  const busy = createMutation.isPending || updateMutation.isPending || scheduleMutation.isPending || unscheduleMutation.isPending;

  // ── Audience estimate (debounced) ──
  const audienceValue = form.audienceType === 'ALL_CLIENTS' ? null : parseInt(form.audienceValue, 10) || null;
  const [debouncedAudience, setDebouncedAudience] = useState<{ type: ScratchAudienceType; value: number | null }>({
    type: form.audienceType,
    value: audienceValue,
  });
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAudience({ type: form.audienceType, value: audienceValue }), 400);
    return () => clearTimeout(timer);
  }, [form.audienceType, audienceValue]);
  const audienceValid = debouncedAudience.type === 'ALL_CLIENTS' || (debouncedAudience.value != null && debouncedAudience.value >= 1);
  const estimate = useScratchAudienceEstimate(
    debouncedAudience.type,
    debouncedAudience.value,
    isPremium && !isTeamMember && audienceValid && stepIndex >= 1,
  );

  const assured = assuredChance(form.rewards);
  const rewardInputs = useMemo(() => form.rewards.map((r) => rewardToInput(r, labelFor)), [form.rewards, labelFor]);
  const expected = useMemo(
    () => expectedRewardCounts(estimate.data?.total ?? 0, rewardInputs),
    [estimate.data?.total, rewardInputs],
  );

  const set = useCallback((patch: Partial<CampaignForm>) => {
    setDirty(true);
    dispatch({ type: 'SET', patch, today });
  }, [today]);
  const setReward = useCallback((key: string, patch: Partial<RewardForm>) => {
    setDirty(true);
    rewardsTouchedRef.current = true;
    dispatch({ type: 'SET_REWARD', key, patch });
  }, []);
  const removeReward = useCallback((key: string) => {
    setDirty(true);
    rewardsTouchedRef.current = true;
    dispatch({ type: 'REMOVE_REWARD', key });
  }, []);

  const applyTemplate = useCallback((next: CampaignTemplate) => {
    const apply = () => {
      const rewards = templateRewards(next);
      // Pre-fill the free product with the first catalog reward when there is one.
      const product = rewards.find((r) => r.type === 'FREE_PRODUCT');
      if (product && catalog[0]) {
        product.label = catalog[0].titre.slice(0, SCRATCH_LIMITS.LABEL_MAX);
        product.rewardId = catalog[0].id;
      }
      rewardsTouchedRef.current = false;
      setTemplate(next);
      setDirty(true);
      dispatch({ type: 'SET_REWARDS', rewards });
    };
    if (next === template) return;
    if (!rewardsTouchedRef.current) return apply();
    Alert.alert(t('scratch.wizard.templateReplaceTitle'), t('scratch.wizard.templateReplaceBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('scratch.wizard.templateReplaceConfirm'), onPress: apply },
    ]);
  }, [catalog, template, t]);

  const selectAudience = useCallback((type: ScratchAudienceType) => {
    set({ audienceType: type, audienceValue: type === 'ALL_CLIENTS' ? form.audienceValue : AUDIENCE_DEFAULT_VALUES[type] });
  }, [set, form.audienceValue]);

  const showError = useCallback((err: FormError) => Alert.alert(t('common.error'), t(err.key, err.params)), [t]);

  const goToStep = useCallback((index: number) => {
    setStepIndex(Math.max(0, Math.min(index, WIZARD_STEPS.length - 1)));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const goNext = useCallback(() => {
    const err = validateStep(form, step, today);
    if (err) return showError(err);
    goToStep(stepIndex + 1);
  }, [form, step, today, stepIndex, showError, goToStep]);

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/scratch-campaigns');
  }, [router]);

  const handleBack = useCallback(() => {
    if (stepIndex > 0) {
      goToStep(stepIndex - 1);
      return;
    }
    if (!dirty) return leave();
    Alert.alert(t('scratch.wizard.discardTitle'), t('scratch.wizard.discardMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('scratch.wizard.discardConfirm'), style: 'destructive', onPress: leave },
    ]);
  }, [stepIndex, dirty, leave, goToStep, t]);

  // Android back button follows the wizard steps instead of leaving silently.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  /** Shows the first invalid step and its error; returns true when the form is valid. */
  const ensureValid = useCallback(() => {
    for (const [index, s] of WIZARD_STEPS.entries()) {
      const err = validateStep(form, s, today);
      if (err) {
        goToStep(index);
        showError(err);
        return false;
      }
    }
    return true;
  }, [form, today, goToStep, showError]);

  /** Creates or replaces the campaign; returns its id. */
  const saveDraft = useCallback(async (): Promise<string> => {
    const payload = formToInput(form, labelFor);
    if (campaignId) {
      await updateMutation.mutateAsync({ id: campaignId, payload });
      return campaignId;
    }
    const created = await createMutation.mutateAsync(payload);
    setCampaignId(created.id);
    return created.id;
  }, [form, labelFor, campaignId, createMutation, updateMutation]);

  const handleSaveDraft = useCallback(async () => {
    if (busy || !ensureValid()) return;
    try {
      const id = await saveDraft();
      // Saving a scheduled campaign as a draft must cancel its sending.
      if (isScheduled) await unscheduleMutation.mutateAsync(id);
      setDirty(false);
      Alert.alert(t('scratch.wizard.draftSaved'));
      router.replace({ pathname: '/scratch-campaigns/[id]', params: { id } });
    } catch (e) {
      Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError')));
    }
  }, [busy, ensureValid, saveDraft, isScheduled, unscheduleMutation, router, t]);

  const doSend = useCallback(async () => {
    try {
      const id = await saveDraft();
      setDirty(false);
      await scheduleMutation.mutateAsync({ id, sendAt: sendAtIso(form) });
      Alert.alert(form.sendMode === 'now' ? t('scratch.wizard.sentSuccess') : t('scratch.wizard.scheduledSuccess'));
      router.replace({ pathname: '/scratch-campaigns/[id]', params: { id } });
    } catch (e) {
      Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError')));
    }
  }, [saveDraft, scheduleMutation, form, router, t]);

  const handleSend = useCallback(() => {
    if (busy || !ensureValid()) return;
    if (estimate.data?.total === 0) return Alert.alert(t('common.error'), t('scratch.wizard.audienceEmpty'));
    const count = estimate.data?.total ?? '…';
    const body = form.sendMode === 'now'
      ? t('scratch.wizard.confirmSendNow', { count })
      : t('scratch.wizard.confirmSchedule', { count, date: `${formatYmd(form.sendDay, locale)} ${form.sendSlot}` });
    Alert.alert(t('scratch.wizard.confirmTitle'), body, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('scratch.wizard.confirmBtn'), onPress: () => void doSend() },
    ]);
  }, [busy, ensureValid, estimate.data?.total, form.sendMode, form.sendDay, form.sendSlot, locale, t, doSend]);

  // ── Preview data (same rules as the JitPlus card screen) ──
  const merchantName = merchant?.nom ?? '';
  const logoUrl = merchant?.logoUrl ? resolveImageUrl(merchant.logoUrl) : null;
  const previewIndex = Math.max(0, form.rewards.findIndex((r) => r.key === previewRewardKey));
  const previewInput = rewardInputs[previewIndex];
  const previewDisplay = useMemo(() => (previewInput ? rewardDisplay(previewInput, t) : null), [previewInput, t]);
  const previewConditions = useMemo(() => {
    if (!previewInput) return [];
    const lines = describeCouponConditions(
      {
        conditions: {
          minPurchaseAmount: previewInput.minPurchaseAmount,
          allowedWeekdays: previewInput.allowedWeekdays,
          allowedFromMin: previewInput.allowedFromMin,
          allowedToMin: previewInput.allowedToMin,
        },
        expiresAt: moroccoWallTimeToIso(form.couponExpiresOn, '23:59'),
      },
      t,
      (iso) => formatYmd(moroccoYmdOf(new Date(iso)), locale, false),
    );
    if (previewInput.minDelayHours === 24 || previewInput.minDelayHours === 48) {
      lines.unshift(t(`scratch.wizard.previewDelay${previewInput.minDelayHours}`));
    }
    return lines;
  }, [previewInput, form.couponExpiresOn, t, locale]);

  if (shouldWait) return null;

  const title = editId ? t('scratch.wizard.titleEdit') : t('scratch.wizard.titleCreate');

  if (!isPremium || isTeamMember) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={title} onBack={leave} />
        {isTeamMember
          ? <View style={styles.padded}><Notice text={t('scratch.list.ownerOnly')} /></View>
          : <PremiumLockCard titleKey="scratch.list.premiumTitle" descriptionKey="scratch.list.premiumDesc" />}
      </View>
    );
  }

  if (editId && loadingExisting) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  // Without the loaded campaign, saving would replace it with an empty form (PUT is a full replacement).
  if (editId && !existing) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={title} onBack={leave} />
        <View style={[styles.padded, styles.errorWrap]}>
          <Notice tone="danger" text={t('scratch.wizard.loadError')} />
          <Button label={t('common.retry')} onPress={() => void refetchExisting()} loading={refetchingExisting} />
        </View>
      </View>
    );
  }

  if (existing && existing.status !== 'DRAFT' && existing.status !== 'SCHEDULED') {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={title} onBack={leave} />
        <View style={styles.padded}><Notice text={t('scratch.wizard.notEditable')} /></View>
      </View>
    );
  }

  const textAlign = isRTL ? 'right' : 'left';
  const row = isRTL ? 'row-reverse' : 'row';
  const previewWidth = Math.min(width - 64, 360);
  const nowMs = Date.now();
  const sendYmd = sendYmdOf(form, today);
  const message = form.message.trim();
  const campaignName = form.name.trim();
  const audienceOptionsOpen = showAudienceOptions || !MAIN_AUDIENCE_TYPES.includes(form.audienceType);
  const dateOptionsOpen = showDateOptions || form.durationDays == null;
  const audienceDescription = (type: ScratchAudienceType) =>
    t(`scratch.wizard.audienceDesc.${type}`, { value: type === form.audienceType ? form.audienceValue : AUDIENCE_DEFAULT_VALUES[type] });
  const timingLine = t('scratch.wizard.durationSummary', {
    card: formatYmd(form.cardExpiresOn, locale, false),
    coupon: formatYmd(form.couponExpiresOn, locale, false),
  });
  const sendLine = form.sendMode === 'now'
    ? t('scratch.wizard.summarySendNow')
    : t('scratch.wizard.summarySendLater', { date: formatYmd(form.sendDay, locale), slot: form.sendSlot });

  const editLink = (index: number) => (
    <TouchableOpacity
      onPress={() => goToStep(index)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('scratch.wizard.edit')}
      style={[styles.editLink, { flexDirection: row }]}
    >
      <Pencil size={14} color={theme.primary} />
      <Text style={[styles.editLinkText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>{t('scratch.wizard.edit')}</Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={title} onBack={handleBack} />

      <View style={[styles.stepper, { flexDirection: row }]}>
        {WIZARD_STEPS.map((s, i) => {
          const done = i < stepIndex;
          const current = i === stepIndex;
          return (
            <TouchableOpacity
              key={s}
              onPress={() => (i < stepIndex ? goToStep(i) : undefined)}
              disabled={i >= stepIndex}
              accessibilityRole="button"
              accessibilityState={{ selected: current, disabled: i >= stepIndex }}
              style={styles.stepItem}
            >
              <View
                style={[
                  styles.stepDot,
                  { backgroundColor: done || current ? theme.primary : theme.bgInput, borderColor: current ? theme.primary : 'transparent' },
                ]}
              >
                {done
                  ? <Check size={13} color="#FFFFFF" strokeWidth={3} />
                  : <Text style={[styles.stepNum, { color: current ? '#FFFFFF' : theme.textMuted }]}>{i + 1}</Text>}
              </View>
              <Text
                style={[styles.stepName, { color: current ? theme.text : theme.textMuted }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
              >
                {t(STEP_TITLES[s])}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 'gift' && (
          <>
            {!editId && (
              <Section title={t('scratch.wizard.templateTitle')}>
                <Text style={[styles.muted, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>
                  {t('scratch.wizard.templateHint')}
                </Text>
                {CAMPAIGN_TEMPLATES.map((tpl) => (
                  <OptionCard
                    key={tpl}
                    icon={TEMPLATE_ICONS[tpl]}
                    title={t(`scratch.wizard.template.${tpl}.title`)}
                    description={t(`scratch.wizard.template.${tpl}.desc`)}
                    selected={template === tpl}
                    onPress={() => applyTemplate(tpl)}
                  />
                ))}
              </Section>
            )}

            <Text style={[styles.blockTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
              {t('scratch.wizard.rewardsTitle')}
            </Text>
            <Text style={[styles.muted, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>
              {t('scratch.wizard.rewardsHint')}
            </Text>
            {form.rewards.map((r, i) => (
              <RewardEditor
                key={r.key}
                index={i}
                reward={r}
                assuredChance={assured}
                canRemove={form.rewards.length > 1}
                catalog={catalog}
                onChange={setReward}
                onRemove={removeReward}
              />
            ))}
            {form.rewards.length > 1 && assured < 1 && <Notice tone="danger" text={t('scratch.wizard.chancesTooHigh')} />}
            {form.rewards.length < SCRATCH_LIMITS.MAX_REWARDS && (
              <Button
                variant="secondary"
                icon={Plus}
                label={t('scratch.wizard.addReward')}
                onPress={() => {
                  setDirty(true);
                  rewardsTouchedRef.current = true;
                  dispatch({ type: 'ADD_REWARD' });
                }}
              />
            )}
          </>
        )}

        {step === 'audience' && (
          <>
            <Section title={t('scratch.wizard.audience')}>
              {MAIN_AUDIENCE_TYPES.map((type) => (
                <OptionCard
                  key={type}
                  title={t(`scratch.wizard.audienceType.${type}`)}
                  description={audienceDescription(type)}
                  selected={form.audienceType === type}
                  onPress={() => selectAudience(type)}
                />
              ))}

              <View style={[styles.reach, { backgroundColor: theme.bgInput }]}>
                {estimate.isFetching && !estimate.data ? (
                  <Text style={[styles.muted, { color: theme.textMuted, textAlign }]}>{t('scratch.wizard.estimateLoading')}</Text>
                ) : estimate.data ? (
                  <>
                    <Text style={[styles.reachMain, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
                      {t('scratch.wizard.reach', { count: estimate.data.total })}
                    </Text>
                    <Text style={[styles.muted, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
                      {t('scratch.wizard.reachPush', { count: estimate.data.reachableByPush })}
                    </Text>
                  </>
                ) : null}
              </View>
              {estimate.data?.total === 0 && <Notice tone="warning" text={t('scratch.wizard.audienceEmpty')} />}
              {!!estimate.data?.withoutApp && (
                <Notice text={t('scratch.wizard.withoutApp', { count: estimate.data.withoutApp, date: formatYmd(form.cardExpiresOn, locale, false) })} />
              )}

              <MoreOptions
                open={audienceOptionsOpen}
                onToggle={() => setShowAudienceOptions((v) => !v)}
                label={t('scratch.wizard.audienceMore')}
              >
                <ChipRow>
                  {SCRATCH_AUDIENCE_TYPES.filter((type) => !MAIN_AUDIENCE_TYPES.includes(type)).map((type) => (
                    <Chip
                      key={type}
                      label={t(`scratch.wizard.audienceType.${type}`)}
                      selected={form.audienceType === type}
                      onPress={() => selectAudience(type)}
                    />
                  ))}
                </ChipRow>
                {form.audienceType !== 'ALL_CLIENTS' && (
                  <>
                    <FieldLabel text={form.audienceType === 'MIN_STAMPS' ? t('scratch.wizard.audienceStamps') : t('scratch.wizard.audienceDays')} />
                    <Input
                      value={form.audienceValue}
                      onChangeText={(v) => set({ audienceValue: v.replace(/[^0-9]/g, '') })}
                      keyboardType="number-pad"
                      maxLength={4}
                      accessibilityLabel={form.audienceType === 'MIN_STAMPS' ? t('scratch.wizard.audienceStamps') : t('scratch.wizard.audienceDays')}
                    />
                  </>
                )}
              </MoreOptions>
            </Section>

            <Section title={t('scratch.wizard.sendWhen')}>
              <ChipRow>
                <Chip label={t('scratch.wizard.sendNow')} selected={form.sendMode === 'now'} onPress={() => set({ sendMode: 'now' })} />
                <Chip
                  label={t('scratch.wizard.sendLater')}
                  selected={form.sendMode === 'later'}
                  onPress={() => set({ sendMode: 'later', sendSlot: pickSendSlot(form.sendDay, form.sendSlot) })}
                />
              </ChipRow>
              {form.sendMode === 'later' && (
                <>
                  <DateField
                    label={t('scratch.wizard.sendDay')}
                    value={form.sendDay}
                    minYmd={today}
                    maxYmd={addDaysYmd(today, MAX_SCHEDULE_DAYS)}
                    onChange={(sendDay) => set({ sendDay, sendSlot: pickSendSlot(sendDay, form.sendSlot) })}
                  />
                  <FieldLabel text={t('scratch.wizard.sendSlot')} />
                  <ChipRow>
                    {SCRATCH_SEND_SLOTS.map((slot) => (
                      <Chip
                        key={slot}
                        label={slot}
                        selected={form.sendSlot === slot}
                        disabled={isSlotUnavailable(form.sendDay, slot, nowMs)}
                        onPress={() => set({ sendSlot: slot })}
                      />
                    ))}
                  </ChipRow>
                  {isSlotPast(form.sendDay, form.sendSlot, nowMs) && <Notice tone="warning" text={t('scratch.wizard.slotPast')} />}
                  {isSlotQuiet(form.sendDay, form.sendSlot) && <Notice tone="warning" text={t('scratch.wizard.slotQuiet')} />}
                  {isSlotTooFar(form.sendDay, form.sendSlot, nowMs) && (
                    <Notice tone="warning" text={t('scratch.wizard.slotTooFar', { days: MAX_SCHEDULE_DAYS })} />
                  )}
                </>
              )}
            </Section>

            <Section title={t('scratch.wizard.durationTitle')}>
              <ChipRow>
                {DURATION_PRESETS.map((days) => (
                  <Chip
                    key={days}
                    label={t(`scratch.wizard.duration${days}`)}
                    selected={form.durationDays === days}
                    onPress={() => set({ durationDays: days })}
                  />
                ))}
              </ChipRow>
              <Text style={[styles.timeline, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
                {timingLine}
              </Text>
              <MoreOptions
                open={dateOptionsOpen}
                onToggle={() => setShowDateOptions((v) => !v)}
                label={t('scratch.wizard.customDates')}
              >
                <DateField
                  label={t('scratch.wizard.cardDeadline')}
                  value={form.cardExpiresOn}
                  minYmd={addDaysYmd(sendYmd, 1)}
                  maxYmd={addDaysYmd(sendYmd, SCRATCH_LIMITS.MAX_CARD_DAYS)}
                  onChange={(cardExpiresOn) => set({ cardExpiresOn, durationDays: null })}
                />
                <DateField
                  label={t('scratch.wizard.couponDeadline')}
                  value={form.couponExpiresOn}
                  minYmd={addDaysYmd(form.cardExpiresOn, SCRATCH_LIMITS.MIN_COUPON_AFTER_CARD_DAYS)}
                  maxYmd={addDaysYmd(sendYmd, SCRATCH_LIMITS.MAX_COUPON_DAYS)}
                  onChange={(couponExpiresOn) => set({ couponExpiresOn, durationDays: null })}
                />
                {couponGapIsShort(form) && <Notice tone="warning" text={t('scratch.wizard.gapWarning')} />}
              </MoreOptions>
            </Section>
          </>
        )}

        {step === 'review' && (
          <>
            {/* 1. The card, with its theme */}
            <Section title={t('scratch.wizard.previewCard')}>
              <View style={[styles.designRow, { flexDirection: row }]}>
                {SCRATCH_CARD_DESIGNS.map((d) => {
                  const selected = d.id === form.designId;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      onPress={() => set({ designId: d.id })}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={t(d.nameKey)}
                      style={[styles.designSwatch, { borderColor: selected ? theme.primary : 'transparent' }]}
                    >
                      <LinearGradient colors={[d.gradient[0], d.gradient[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.designInner}>
                        <Text style={styles.designMotif}>{d.motif}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <ChipRow>
                <Chip label={t('scratch.wizard.previewBefore')} selected={previewSide === 'before'} onPress={() => setPreviewSide('before')} />
                <Chip label={t('scratch.wizard.previewAfter')} selected={previewSide === 'after'} onPress={() => setPreviewSide('after')} />
              </ChipRow>
              {previewSide === 'after' && form.rewards.length > 1 && (
                <ChipRow>
                  {rewardInputs.map((input, i) => (
                    <Chip
                      key={form.rewards[i].key}
                      label={rewardDisplay(input, t).headline || t('scratch.wizard.rewardN', { n: i + 1 })}
                      selected={previewIndex === i}
                      onPress={() => setPreviewRewardKey(form.rewards[i].key)}
                    />
                  ))}
                </ChipRow>
              )}

              <View style={styles.previewWrap}>
                {message ? (
                  <Text style={[styles.previewMessage, { color: theme.textSecondary }]} numberOfLines={4} maxFontSizeMultiplier={1.3}>
                    « {message} »
                  </Text>
                ) : null}
                <View style={{ width: previewWidth, height: scratchCardHeight(previewWidth) }}>
                  <ScratchCardFace
                    designId={form.designId}
                    width={previewWidth}
                    merchantName={merchantName}
                    logoUrl={logoUrl}
                    caption={previewSide === 'before' ? t('scratch.card.alwaysWin') : t('scratch.card.youWon')}
                    rewardText={previewDisplay?.headline}
                    rewardDetail={previewDisplay?.detail}
                    footer={campaignName || t('scratch.card.offeredBy', { merchant: merchantName })}
                    isRTL={isRTL}
                  />
                  {previewSide === 'before' && (
                    <ScratchCardCover designId={form.designId} width={previewWidth} label={t('scratch.card.scratchHere')} />
                  )}
                </View>
                {previewSide === 'before' ? (
                  <Text style={[styles.muted, styles.centerText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                    {t('scratch.card.expiresOn', { date: formatYmd(form.cardExpiresOn, locale, false) })}
                  </Text>
                ) : (
                  <View style={[styles.conditionsBox, { backgroundColor: theme.bgInput, borderColor: theme.borderLight }]}>
                    <Text style={[styles.conditionsTitle, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
                      {t('scratch.wizard.previewConditions')}
                    </Text>
                    {previewConditions.map((line, i) => (
                      <Text key={i} style={[styles.conditionLine, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.3}>
                        • {line}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
              {!merchant?.logoUrl && <Notice tone="warning" text={t('scratch.wizard.previewNoLogo')} />}
            </Section>

            {/* 2. Name and message (pre-filled, optional to change) */}
            <Section title={t('scratch.wizard.nameTitle')}>
              <FieldLabel text={t('scratch.wizard.name')} hint={t('scratch.wizard.nameHint')} />
              <Input
                value={form.name}
                onChangeText={(name) => set({ name })}
                placeholder={t('scratch.wizard.namePlaceholder')}
                maxLength={SCRATCH_LIMITS.NAME_MAX}
                accessibilityLabel={t('scratch.wizard.name')}
              />
              <FieldLabel text={t('scratch.wizard.message')} hint={t('scratch.wizard.messageHint')} />
              <Input
                value={form.message}
                onChangeText={(msg) => set({ message: msg })}
                placeholder={t('scratch.wizard.messagePlaceholder')}
                maxLength={SCRATCH_LIMITS.MESSAGE_MAX}
                multiline
                accessibilityLabel={t('scratch.wizard.message')}
              />
            </Section>

            {/* 3. Notification as received by the customer */}
            <Section title={t('scratch.wizard.previewPush')}>
              <View style={[styles.push, { backgroundColor: theme.bgElevated, borderColor: theme.borderLight, flexDirection: row }]}>
                <MerchantLogo logoUrl={merchant?.logoUrl} style={styles.pushLogo} />
                <View style={styles.flex}>
                  <Text style={[styles.pushApp, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.2}>
                    {t('scratch.wizard.previewPushApp')}
                  </Text>
                  <Text style={[styles.pushTitle, { color: theme.text, textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                    {t('scratch.wizard.pushTitle', { merchant: merchantName })}
                  </Text>
                  <Text style={[styles.pushBody, { color: theme.textSecondary, textAlign }]} numberOfLines={3} maxFontSizeMultiplier={1.3}>
                    {message ? t('scratch.wizard.pushBody', { message }) : t('scratch.wizard.pushBodyDefault')}
                  </Text>
                </View>
              </View>
              <Text style={[styles.muted, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>
                {t('scratch.wizard.previewPushHint')}
              </Text>
            </Section>

            {/* 4. Summary, each block links back to its step */}
            <Section title={t('scratch.wizard.summary')}>
              <View style={[styles.summaryBlock, { borderBottomColor: theme.borderLight }]}>
                <View style={[styles.summaryHead, { flexDirection: row }]}>
                  <Text style={[styles.summaryLabel, { color: theme.textMuted, textAlign }]}>{t('scratch.wizard.stepGift')}</Text>
                  {editLink(0)}
                </View>
                {rewardInputs.map((input, i) => (
                  <Text key={form.rewards[i].key} style={[styles.summaryLine, { color: theme.textSecondary, textAlign }]} numberOfLines={2}>
                    • {rewardDisplay(input, t).headline} · {t('scratch.wizard.chance', { percent: i === 0 ? assured : input.weight })}
                    {estimate.data?.total ? ` · ${t('scratch.wizard.expectedCount', { count: expected[i]?.expected ?? 0 })}` : ''}
                  </Text>
                ))}
              </View>

              <View style={styles.summaryBlockLast}>
                <View style={[styles.summaryHead, { flexDirection: row }]}>
                  <Text style={[styles.summaryLabel, { color: theme.textMuted, textAlign }]}>{t('scratch.wizard.stepWho')}</Text>
                  {editLink(1)}
                </View>
                <Text style={[styles.summaryMain, { color: theme.text, textAlign }]}>
                  {estimate.data ? t('scratch.wizard.reach', { count: estimate.data.total }) : t('scratch.wizard.estimateLoading')}
                </Text>
                <Text style={[styles.summaryLine, { color: theme.textSecondary, textAlign }]}>
                  {t(`scratch.wizard.audienceType.${form.audienceType}`)} · {audienceDescription(form.audienceType)}
                </Text>
                <Text style={[styles.summaryLine, { color: theme.textSecondary, textAlign }]}>{sendLine}</Text>
                <Text style={[styles.summaryLine, { color: theme.textSecondary, textAlign }]}>{timingLine}</Text>
              </View>
            </Section>

            {expected.some((e) => e.stockShort) && <Notice tone="warning" text={t('scratch.wizard.stockShort')} />}
            {estimate.data?.total === 0 && <Notice tone="danger" text={t('scratch.wizard.audienceEmpty')} />}
            {isScheduled && <Notice text={t('scratch.wizard.scheduledEditNote')} />}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: theme.bg, borderTopColor: theme.borderLight }]}>
        {isLast ? (
          <View style={[styles.footerRow, { flexDirection: row }]}>
            <Button
              variant="secondary"
              icon={Save}
              label={isScheduled ? t('scratch.wizard.unscheduleSave') : t('scratch.wizard.saveDraft')}
              onPress={handleSaveDraft}
              disabled={busy}
              style={styles.flex}
            />
            <Button
              icon={form.sendMode === 'now' ? Send : Clock}
              label={form.sendMode === 'now' ? t('scratch.wizard.sendBtn') : t('scratch.wizard.scheduleBtn')}
              onPress={handleSend}
              loading={busy}
              disabled={estimate.data?.total === 0}
              style={styles.flex}
            />
          </View>
        ) : (
          <View style={[styles.footerRow, { flexDirection: row }]}>
            {stepIndex > 0 && <Button variant="secondary" label={t('scratch.wizard.back')} onPress={handleBack} style={styles.flex} />}
            <Button
              label={stepIndex === WIZARD_STEPS.length - 2 ? t('scratch.wizard.toPreview') : t('scratch.wizard.next')}
              onPress={goNext}
              style={styles.flex}
            />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  padded: { padding: 16 },
  errorWrap: { gap: 12 },
  flex: { flex: 1 },
  stepper: { paddingHorizontal: 16, paddingBottom: 10, gap: 6 },
  stepItem: { flex: 1, alignItems: 'center', gap: 4 },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  stepNum: { fontSize: ms(12), fontFamily: 'Lexend_600SemiBold' },
  stepName: { fontSize: ms(11.5), fontFamily: 'Lexend_500Medium' },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 14 },
  blockTitle: { fontSize: ms(16), fontFamily: 'Lexend_600SemiBold', marginTop: 4 },
  option: { alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 14 },
  optionIcon: { fontSize: 24 },
  optionTitle: { fontSize: ms(14.5), fontFamily: 'Lexend_600SemiBold' },
  optionDesc: { fontSize: ms(12.5), fontFamily: 'Lexend_400Regular', lineHeight: ms(18), marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  reach: { borderRadius: 14, padding: 14, gap: 2, minHeight: 56, justifyContent: 'center' },
  reachMain: { fontSize: ms(17), fontFamily: 'Lexend_600SemiBold' },
  moreToggle: { alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, minHeight: 44 },
  moreText: { flex: 1, fontSize: ms(13.5), fontFamily: 'Lexend_500Medium' },
  moreBody: { gap: 10 },
  designRow: { flexWrap: 'wrap', gap: 10 },
  designSwatch: { width: 56, borderWidth: 2, borderRadius: 14, padding: 3 },
  designInner: { width: '100%', height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  designMotif: { color: '#FFFFFF', fontSize: 18 },
  previewWrap: { alignItems: 'center', gap: 10 },
  previewMessage: { fontSize: ms(13.5), fontFamily: 'Lexend_400Regular', fontStyle: 'italic', textAlign: 'center', lineHeight: ms(20) },
  muted: { fontSize: ms(12), fontFamily: 'Lexend_400Regular', lineHeight: ms(18) },
  timeline: { fontSize: ms(13), lineHeight: ms(20), fontFamily: 'Lexend_500Medium' },
  push: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10, alignItems: 'flex-start' },
  pushLogo: { width: 38, height: 38, borderRadius: 10 },
  pushApp: { fontSize: ms(11), fontFamily: 'Lexend_500Medium', marginBottom: 2 },
  pushTitle: { fontSize: ms(13.5), fontFamily: 'Lexend_600SemiBold', lineHeight: ms(19) },
  pushBody: { fontSize: ms(12.5), fontFamily: 'Lexend_400Regular', lineHeight: ms(18), marginTop: 2 },
  conditionsBox: { alignSelf: 'stretch', borderRadius: 12, borderWidth: 1, padding: 12, gap: 3 },
  conditionsTitle: { fontSize: ms(11), fontFamily: 'Lexend_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  conditionLine: { fontSize: ms(12.5), fontFamily: 'Lexend_400Regular', lineHeight: ms(18) },
  summaryBlock: { gap: 4, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  summaryBlockLast: { gap: 4 },
  summaryHead: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  summaryLabel: { flexShrink: 1, fontSize: ms(11.5), fontFamily: 'Lexend_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryMain: { fontSize: ms(14.5), fontFamily: 'Lexend_600SemiBold', lineHeight: ms(20) },
  summaryLine: { fontSize: ms(13), fontFamily: 'Lexend_400Regular', lineHeight: ms(19) },
  editLink: { alignItems: 'center', gap: 4, minHeight: 32 },
  editLinkText: { fontSize: ms(12.5), fontFamily: 'Lexend_600SemiBold' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footerRow: { gap: 10 },
});
