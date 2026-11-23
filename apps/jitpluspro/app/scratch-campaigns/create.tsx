import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { View, StyleSheet, Alert } from 'react-native';
import { Text } from '@/components/AppText';
import { Clock, Layers, Plus, Save, Send, Tag, type LucideIcon } from 'lucide-react-native';
import { JitStamp } from '@/components/icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useDir } from '@/hooks/useDir';
import { useMoney } from '@/hooks/useCurrency';
import { useAuthStore } from '@/stores/authStore';
import { useRewards } from '@/hooks/useQueryHooks';
import {
  useCreateScratchCampaign,
  useScheduleScratchCampaign,
  useScratchCampaign,
  useUnscheduleScratchCampaign,
  useUpdateScratchCampaign,
} from '@/hooks/useScratchHooks';
import { getErrorMessage } from '@/utils/error';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import {
  SCRATCH_AUDIENCE_TYPES,
  SCRATCH_LIMITS,
  SCRATCH_SEND_SLOTS,
  addDaysYmd,
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
  Section,
  useMoreOptions,
} from '@/components/scratch/ScratchUI';
import { DateField, formatYmd } from '@/components/scratch/DateField';
import { RewardEditor } from '@/components/scratch/RewardEditor';
import { ScratchLookStep, type ScratchPreviewChoice } from '@/components/scratch/ScratchLookStep';
import { useAudienceEstimate } from '@/components/scratch/useAudienceEstimate';
import {
  HelpText,
  ReviewBlock,
  ReviewLine,
  WizardFooter,
  WizardShell,
  useGameWizard,
  useWizardTemplate,
} from '@/components/games/GameWizard';
import { GameLoadError, GameNoAccess, GameScreenLoading, GameScreenNotice, useBackTo } from '@/components/games/GameScreen';
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

export default function ScratchCampaignWizard() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { textAlign } = useDir();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = typeof params.id === 'string' ? params.id : undefined;

  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const { isPremium } = usePlanStatus(merchant);
  const canManage = isPremium && !isTeamMember;

  const { money, symbol: currencySymbol } = useMoney();
  const labelFor = useCallback<RewardLabelFn>((type, value) => formatRewardValue({ type, value, label: '' }, t, money), [t, money]);

  const today = useMemo(() => moroccoToday(), []);
  const [form, dispatch] = useReducer(campaignFormReducer, today, (day: string): CampaignForm => ({
    ...initialCampaignForm(day),
    name: t('scratch.wizard.defaultName', { date: formatYmd(day, locale, false) }),
  }));
  const [campaignId, setCampaignId] = useState<string | undefined>(editId);
  const [dirty, setDirty] = useState(false);
  const audienceOptions = useMoreOptions(!MAIN_AUDIENCE_TYPES.includes(form.audienceType));
  const dateOptions = useMoreOptions(form.durationDays == null);
  const [preview, setPreview] = useState<ScratchPreviewChoice>({ side: 'after', rewardKey: null });
  // Current time for the send slots, refreshed while the wizard stays open.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

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

  const leave = useBackTo('/scratch-campaigns');

  // Amount limits are shown in the merchant's currency.
  const validate = useCallback((s: WizardStep) => {
    const err = validateStep(form, s, today);
    return err && { ...err, params: { ...err.params, currency: currencySymbol } };
  }, [form, today, currencySymbol]);
  const wizard = useGameWizard({
    steps: WIZARD_STEPS,
    validate,
    dirty,
    onLeave: leave,
    i18nPrefix: 'scratch.wizard',
  });
  const { step, index: stepIndex, stepLabels, goTo, ensureValid, allowLeave } = wizard;

  const { data: catalogData } = useRewards(canManage);
  // A fresh [] on each render would re-render every memoised RewardEditor.
  const catalog = useMemo(() => catalogData ?? [], [catalogData]);
  const createMutation = useCreateScratchCampaign();
  const updateMutation = useUpdateScratchCampaign();
  const scheduleMutation = useScheduleScratchCampaign();
  const unscheduleMutation = useUnscheduleScratchCampaign();
  const busy = createMutation.isPending || updateMutation.isPending || scheduleMutation.isPending || unscheduleMutation.isPending;

  const estimate = useAudienceEstimate(form.audienceType, form.audienceValue, canManage && stepIndex >= 1);

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
  const applyTemplateRewards = useCallback((tpl: CampaignTemplate) => {
    const rewards = templateRewards(tpl);
    // Pre-fill the free product with the first catalog reward when there is one.
    const product = rewards.find((r) => r.type === 'FREE_PRODUCT');
    if (product && catalog[0]) {
      product.label = catalog[0].titre.slice(0, SCRATCH_LIMITS.LABEL_MAX);
      product.rewardId = catalog[0].id;
    }
    setDirty(true);
    dispatch({ type: 'SET_REWARDS', rewards });
  }, [catalog]);
  const { template, choose: applyTemplate, markTouched: markRewardsTouched } = useWizardTemplate<CampaignTemplate>({
    initial: editId ? null : 'simple',
    apply: applyTemplateRewards,
    i18nPrefix: 'scratch.wizard',
  });

  const setReward = useCallback((key: string, patch: Partial<RewardForm>) => {
    setDirty(true);
    markRewardsTouched();
    dispatch({ type: 'SET_REWARD', key, patch });
  }, [markRewardsTouched]);
  const removeReward = useCallback((key: string) => {
    setDirty(true);
    markRewardsTouched();
    dispatch({ type: 'REMOVE_REWARD', key });
  }, [markRewardsTouched]);
  const addReward = useCallback(() => {
    setDirty(true);
    markRewardsTouched();
    dispatch({ type: 'ADD_REWARD' });
  }, [markRewardsTouched]);

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
      toast.success(t('scratch.wizard.draftSaved'));
      allowLeave();
      router.replace({ pathname: '/scratch-campaigns/[id]', params: { id } });
    } catch (e) {
      toast.error(getErrorMessage(e, t('common.genericError')));
    }
  }, [busy, ensureValid, saveDraft, isScheduled, unscheduleMutation, allowLeave, router, t]);

  const doSend = useCallback(async () => {
    try {
      const id = await saveDraft();
      setDirty(false);
      await scheduleMutation.mutateAsync({ id, sendAt: sendAtIso(form) });
      toast.success(form.sendMode === 'now' ? t('scratch.wizard.sentSuccess') : t('scratch.wizard.scheduledSuccess'));
      allowLeave();
      router.replace({ pathname: '/scratch-campaigns/[id]', params: { id } });
    } catch (e) {
      toast.error(getErrorMessage(e, t('common.genericError')));
    }
  }, [saveDraft, scheduleMutation, form, allowLeave, router, t]);

  const handleSend = useCallback(() => {
    if (busy || !ensureValid()) return;
    if (estimate.data?.total === 0) return toast.error(t('scratch.wizard.audienceEmpty'));
    const count = estimate.data?.total ?? '…';
    const body = form.sendMode === 'now'
      ? t('scratch.wizard.confirmSendNow', { count })
      : t('scratch.wizard.confirmSchedule', { count, date: `${formatYmd(form.sendDay, locale)} ${form.sendSlot}` });
    Alert.alert(t('scratch.wizard.confirmTitle'), body, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('scratch.wizard.confirmBtn'), onPress: () => void doSend() },
    ]);
  }, [busy, ensureValid, estimate.data?.total, form.sendMode, form.sendDay, form.sendSlot, locale, t, doSend]);

  if (shouldWait) return null;

  const title = editId ? t('scratch.wizard.titleEdit') : t('scratch.wizard.titleCreate');

  if (!canManage) return <GameNoAccess title={title} onBack={leave} ns="scratch" isTeamMember={isTeamMember} />;

  if (editId && loadingExisting) return <GameScreenLoading />;

  // Without the loaded campaign, saving would replace it with an empty form (PUT is a full replacement).
  if (editId && !existing) {
    return (
      <GameLoadError
        title={title}
        onBack={leave}
        text={t('scratch.wizard.loadError')}
        onRetry={() => void refetchExisting()}
        retrying={refetchingExisting}
      />
    );
  }

  if (existing && existing.status !== 'DRAFT' && existing.status !== 'SCHEDULED') {
    return <GameScreenNotice title={title} onBack={leave} text={t('scratch.wizard.notEditable')} />;
  }

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

  const lastFooter = (
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

  return (
    <WizardShell title={title} wizard={wizard} lastFooter={lastFooter}>
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
        <ScratchLookStep form={form} rewardInputs={rewardInputs} set={set} preview={preview} onPreviewChange={setPreview} />
      )}

      {step === 'review' && (
        <>
          <Section>
            <ReviewBlock label={stepLabels[0]} onEdit={() => goTo(0)}>
              {rewardInputs.map((input, i) => (
                <ReviewLine
                  key={form.rewards[i].key}
                  text={`• ${rewardDisplay(input, t, money).headline} · ${t('scratch.wizard.chance', { percent: i === 0 ? assured : input.weight })}${
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
  reach: { borderRadius: 12, padding: 14, gap: 2, minHeight: 56, justifyContent: 'center' },
  reachMain: { fontSize: ms(17), fontFamily: font.semibold },
  timeline: { fontSize: ms(13), lineHeight: ms(20), fontFamily: font.medium },
});
