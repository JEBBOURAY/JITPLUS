import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Clock, Layers, Plus, Save, Send, Tag, type LucideIcon } from 'lucide-react-native';
import { JitStamp } from '@/components/icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useDir } from '@/hooks/useDir';
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
import { font } from '@/constants/design';
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
import {
  Button,
  Chip,
  ChipRow,
  FieldLabel,
  Input,
  MoreOptions,
  Notice,
  OptionCard,
  ScreenHeader,
  Section,
  useMoreOptions,
} from '@/components/scratch/ScratchUI';
import { DateField, formatYmd } from '@/components/scratch/DateField';
import { RewardEditor } from '@/components/scratch/RewardEditor';
import { ScratchPreview } from '@/components/scratch/ScratchPreview';
import { HelpText, ReviewBlock, ReviewLine, WizardFooter, WizardShell, useGameWizard } from '@/components/games/GameWizard';
import { digitsOnly } from '@/components/games/gameForm';
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
  type RewardForm,
  type RewardLabelFn,
  type WizardStep,
} from '@/components/scratch/campaignForm';

const TEMPLATE_ICONS: Record<CampaignTemplate, LucideIcon> = { simple: Tag, tiers: Layers, stamps: JitStamp };

type PreviewSide = 'before' | 'after';

export default function ScratchCampaignWizard() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { row, textAlign } = useDir();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = typeof params.id === 'string' ? params.id : undefined;

  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const { isPremium } = usePlanStatus(merchant);

  const labelFor = useCallback<RewardLabelFn>((type, value) => formatRewardValue({ type, value, label: '' }, t), [t]);

  const today = useMemo(() => moroccoToday(), []);
  const [form, dispatch] = useReducer(campaignFormReducer, today, (day: string): CampaignForm => ({
    ...initialCampaignForm(day),
    name: t('scratch.wizard.defaultName', { date: formatYmd(day, locale, false) }),
  }));
  const [campaignId, setCampaignId] = useState<string | undefined>(editId);
  const [dirty, setDirty] = useState(false);
  const [template, setTemplate] = useState<CampaignTemplate | null>(editId ? null : 'simple');
  const rewardsTouchedRef = useRef(false);
  const audienceOptions = useMoreOptions(!MAIN_AUDIENCE_TYPES.includes(form.audienceType));
  const dateOptions = useMoreOptions(form.durationDays == null);
  const [previewSide, setPreviewSide] = useState<PreviewSide>('after');
  const [previewRewardKey, setPreviewRewardKey] = useState<string | null>(null);

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

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/scratch-campaigns');
  }, [router]);

  const validate = useCallback((s: WizardStep) => validateStep(form, s, today), [form, today]);
  const {
    step,
    index: stepIndex,
    isLast,
    stepLabels,
    heading,
    hint,
    nextLabel,
    scrollRef,
    goTo,
    next,
    back,
    ensureValid,
    allowLeave,
  } = useGameWizard({
    steps: WIZARD_STEPS,
    validate,
    dirty,
    onLeave: leave,
    i18nPrefix: 'scratch.wizard',
  });

  const { data: catalogData } = useRewards(isPremium && !isTeamMember);
  // A fresh [] on each render would re-render every memoised RewardEditor.
  const catalog = useMemo(() => catalogData ?? [], [catalogData]);
  const createMutation = useCreateScratchCampaign();
  const updateMutation = useUpdateScratchCampaign();
  const scheduleMutation = useScheduleScratchCampaign();
  const unscheduleMutation = useUnscheduleScratchCampaign();
  const busy = createMutation.isPending || updateMutation.isPending || scheduleMutation.isPending || unscheduleMutation.isPending;

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
  const addReward = useCallback(() => {
    setDirty(true);
    rewardsTouchedRef.current = true;
    dispatch({ type: 'ADD_REWARD' });
  }, []);

  const applyTemplate = useCallback((nextTemplate: CampaignTemplate) => {
    const apply = () => {
      const rewards = templateRewards(nextTemplate);
      // Pre-fill the free product with the first catalog reward when there is one.
      const product = rewards.find((r) => r.type === 'FREE_PRODUCT');
      if (product && catalog[0]) {
        product.label = catalog[0].titre.slice(0, SCRATCH_LIMITS.LABEL_MAX);
        product.rewardId = catalog[0].id;
      }
      rewardsTouchedRef.current = false;
      setTemplate(nextTemplate);
      setDirty(true);
      dispatch({ type: 'SET_REWARDS', rewards });
    };
    if (nextTemplate === template) return;
    if (!rewardsTouchedRef.current) return apply();
    Alert.alert(t('scratch.wizard.templateReplaceTitle'), t('scratch.wizard.templateReplaceBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('scratch.wizard.templateReplaceConfirm'), onPress: apply },
    ]);
  }, [catalog, template, t]);

  const selectAudience = useCallback((type: ScratchAudienceType) => {
    set({ audienceType: type, audienceValue: type === 'ALL_CLIENTS' ? form.audienceValue : AUDIENCE_DEFAULT_VALUES[type] });
  }, [set, form.audienceValue]);

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
      allowLeave();
      router.replace({ pathname: '/scratch-campaigns/[id]', params: { id } });
    } catch (e) {
      Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError')));
    }
  }, [busy, ensureValid, saveDraft, isScheduled, unscheduleMutation, allowLeave, router, t]);

  const doSend = useCallback(async () => {
    try {
      const id = await saveDraft();
      setDirty(false);
      await scheduleMutation.mutateAsync({ id, sendAt: sendAtIso(form) });
      Alert.alert(form.sendMode === 'now' ? t('scratch.wizard.sentSuccess') : t('scratch.wizard.scheduledSuccess'));
      allowLeave();
      router.replace({ pathname: '/scratch-campaigns/[id]', params: { id } });
    } catch (e) {
      Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError')));
    }
  }, [saveDraft, scheduleMutation, form, allowLeave, router, t]);

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
        <View style={[styles.padded, styles.gap]}>
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

  const previewWidth = Math.min(width - 96, 360);
  const nowMs = Date.now();
  const sendYmd = sendYmdOf(form, today);
  const message = form.message.trim();
  const campaignName = form.name.trim();
  const audienceDescription = (type: ScratchAudienceType) =>
    t(`scratch.wizard.audienceDesc.${type}`, { value: type === form.audienceType ? form.audienceValue : AUDIENCE_DEFAULT_VALUES[type] });
  const timingLine = t('scratch.wizard.durationSummary', {
    card: formatYmd(form.cardExpiresOn, locale, false),
    coupon: formatYmd(form.couponExpiresOn, locale, false),
  });
  const sendLine = form.sendMode === 'now'
    ? t('scratch.wizard.summarySendNow')
    : t('scratch.wizard.summarySendLater', { date: formatYmd(form.sendDay, locale), slot: form.sendSlot });
  const reachLine = estimate.data ? t('scratch.wizard.reach', { count: estimate.data.total }) : t('scratch.wizard.estimateLoading');

  let footer: ReactNode;
  if (!isLast) {
    footer = (
      <WizardFooter onBack={stepIndex > 0 ? back : undefined} primary={{ label: nextLabel, onPress: next }} />
    );
  } else {
    footer = (
      <WizardFooter
        secondary={{
          icon: Save,
          label: isScheduled ? t('scratch.wizard.unscheduleSave') : t('scratch.wizard.saveDraft'),
          onPress: handleSaveDraft,
          disabled: busy,
        }}
        primary={{
          icon: form.sendMode === 'now' ? Send : Clock,
          label: form.sendMode === 'now' ? t('scratch.wizard.sendBtn') : t('scratch.wizard.scheduleBtn'),
          onPress: handleSend,
          loading: busy,
          disabled: estimate.data?.total === 0,
        }}
      />
    );
  }

  return (
    <WizardShell
      title={title}
      onBack={back}
      stepLabels={stepLabels}
      index={stepIndex}
      heading={heading}
      hint={hint}
      scrollRef={scrollRef}
      footer={footer}
    >
      {step === 'gift' && (
        <>
          {!editId && (
            <Section title={t('scratch.wizard.templateTitle')}>
              <HelpText text={t('scratch.wizard.templateHint')} />
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

          <Section title={t('scratch.wizard.rewardsTitle')}>
            <HelpText text={t('scratch.wizard.rewardsHint')} />
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
              <Button variant="secondary" icon={Plus} label={t('scratch.wizard.addReward')} onPress={addReward} />
            )}
          </Section>
        </>
      )}

      {step === 'audience' && (
        <Section>
          {MAIN_AUDIENCE_TYPES.map((type) => (
            <OptionCard
              key={type}
              title={t(`scratch.wizard.audienceType.${type}`)}
              description={audienceDescription(type)}
              selected={form.audienceType === type}
              onPress={() => selectAudience(type)}
            />
          ))}

          <MoreOptions open={audienceOptions.open} onToggle={audienceOptions.toggle} label={t('scratch.wizard.audienceMore')}>
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
                  onChangeText={(v) => set({ audienceValue: digitsOnly(v) })}
                  keyboardType="number-pad"
                  maxLength={4}
                  accessibilityLabel={form.audienceType === 'MIN_STAMPS' ? t('scratch.wizard.audienceStamps') : t('scratch.wizard.audienceDays')}
                />
              </>
            )}
          </MoreOptions>

          <View style={[styles.reach, { backgroundColor: theme.bgInput }]} accessibilityLiveRegion="polite">
            {estimate.isFetching && !estimate.data ? (
              <HelpText text={t('scratch.wizard.estimateLoading')} />
            ) : estimate.data ? (
              <>
                <Text style={[styles.reachMain, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>{reachLine}</Text>
                <HelpText tone="secondary" text={t('scratch.wizard.reachPush', { count: estimate.data.reachableByPush })} />
              </>
            ) : null}
          </View>
          {estimate.data?.total === 0 && <Notice tone="warning" text={t('scratch.wizard.audienceEmpty')} />}
          {!!estimate.data?.withoutApp && (
            <Notice text={t('scratch.wizard.withoutApp', { count: estimate.data.withoutApp, date: formatYmd(form.cardExpiresOn, locale, false) })} />
          )}
        </Section>
      )}

      {step === 'sending' && (
        <>
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
            <MoreOptions open={dateOptions.open} onToggle={dateOptions.toggle} label={t('scratch.wizard.customDates')}>
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

      {step === 'look' && (
        <>
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
                      <View style={[styles.designDot, { backgroundColor: d.gradient[1] }]} />
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

            <ScratchPreview
              designId={form.designId}
              width={previewWidth}
              merchantName={merchantName}
              logoUrl={logoUrl}
              side={previewSide}
              rewardText={previewDisplay?.headline}
              rewardDetail={previewDisplay?.detail}
              footer={campaignName || t('scratch.card.offeredBy', { merchant: merchantName })}
              message={message}
              expiresLabel={t('scratch.card.expiresOn', { date: formatYmd(form.cardExpiresOn, locale, false) })}
            />
            {previewSide === 'after' && (
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
            {!merchant?.logoUrl && <Notice tone="warning" text={t('scratch.wizard.previewNoLogo')} />}
          </Section>

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
            <HelpText text={t('scratch.wizard.previewPushHint')} />
          </Section>
        </>
      )}

      {step === 'review' && (
        <>
          <Section>
            <ReviewBlock label={stepLabels[0]} onEdit={() => goTo(0)}>
              {rewardInputs.map((input, i) => (
                <ReviewLine
                  key={form.rewards[i].key}
                  text={`• ${rewardDisplay(input, t).headline} · ${t('scratch.wizard.chance', { percent: i === 0 ? assured : input.weight })}${
                    estimate.data?.total ? ` · ${t('scratch.wizard.expectedCount', { count: expected[i]?.expected ?? 0 })}` : ''
                  }`}
                />
              ))}
            </ReviewBlock>
            <ReviewBlock label={stepLabels[1]} onEdit={() => goTo(1)}>
              <ReviewLine strong text={reachLine} />
              <ReviewLine text={`${t(`scratch.wizard.audienceType.${form.audienceType}`)} · ${audienceDescription(form.audienceType)}`} />
            </ReviewBlock>
            <ReviewBlock label={stepLabels[2]} onEdit={() => goTo(2)}>
              <ReviewLine strong text={sendLine} />
              <ReviewLine text={timingLine} />
            </ReviewBlock>
            <ReviewBlock label={stepLabels[3]} onEdit={() => goTo(3)} last>
              <ReviewLine strong text={campaignName} />
              {message ? <ReviewLine text={`« ${message} »`} /> : null}
            </ReviewBlock>
          </Section>

          {expected.some((e) => e.stockShort) && <Notice tone="warning" text={t('scratch.wizard.stockShort')} />}
          {estimate.data?.total === 0 && <Notice tone="danger" text={t('scratch.wizard.audienceEmpty')} />}
          {isScheduled && <Notice text={t('scratch.wizard.scheduledEditNote')} />}
        </>
      )}
    </WizardShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  padded: { padding: 16 },
  gap: { gap: 12 },
  flex: { flex: 1 },
  reach: { borderRadius: 12, padding: 14, gap: 2, minHeight: 56, justifyContent: 'center' },
  reachMain: { fontSize: ms(17), fontFamily: font.semibold },
  timeline: { fontSize: ms(13), lineHeight: ms(20), fontFamily: font.medium },
  designRow: { flexWrap: 'wrap', gap: 10 },
  designSwatch: { width: 56, borderWidth: 2, borderRadius: 12, padding: 3 },
  designInner: { width: '100%', height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  designDot: { width: 16, height: 16, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  push: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10, alignItems: 'flex-start' },
  pushLogo: { width: 38, height: 38, borderRadius: 8 },
  pushApp: { fontSize: ms(11), fontFamily: font.medium, marginBottom: 2 },
  pushTitle: { fontSize: ms(14), fontFamily: font.semibold, lineHeight: ms(19) },
  pushBody: { fontSize: ms(13), fontFamily: font.regular, lineHeight: ms(18), marginTop: 2 },
  conditionsBox: { alignSelf: 'stretch', borderRadius: 12, borderWidth: 1, padding: 12, gap: 3 },
  conditionsTitle: { fontSize: ms(12), fontFamily: font.semibold, marginBottom: 2 },
  conditionLine: { fontSize: ms(13), fontFamily: font.regular, lineHeight: ms(18) },
});
