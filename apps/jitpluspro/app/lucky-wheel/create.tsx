import { useCallback, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Layers, Play, Plus, Save, type LucideIcon } from 'lucide-react-native';
import { JitGift, JitPremium } from '@/components/icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import {
  useCreateLuckyWheelCampaign,
  useLuckyWheelCampaigns,
  useUpdateLuckyWheelCampaign,
  useUpdateLuckyWheelStatus,
} from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import PremiumLockCard from '@/components/PremiumLockCard';
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
import { moroccoToday, moroccoYmdOf } from '@/components/scratch/campaignForm';
import { HelpText, ReviewBlock, ReviewLine, WizardFooter, WizardShell, useGameWizard } from '@/components/games/GameWizard';
import { digitsOnly } from '@/components/games/gameForm';
import { PrizeEditor, claimLabel } from '@/components/luckyWheel/PrizeEditor';
import { WheelPreview } from '@/components/luckyWheel/WheelPreview';
import { WheelSummaryCard } from '@/components/luckyWheel/WheelUI';
import { formatWheelMoney, useWheelPush } from '@/components/luckyWheel/useWheelPush';
import {
  DURATION_PRESETS,
  MIN_SPEND_PRESETS,
  WHEEL_LIMITS,
  WHEEL_STEPS,
  WHEEL_TEMPLATES,
  WIN_RATE_PRESETS,
  durationOf,
  formFromCampaign,
  formSignature,
  formToInput,
  initialWheelForm,
  prizeChances,
  previewSegments,
  simulateSpin,
  templatePrizes,
  templateWinRate,
  validateStep,
  wheelFormReducer,
  winRateOf,
  type WheelForm,
  type WheelPrizeForm,
  type WheelStep,
  type WheelTemplate,
} from '@/components/luckyWheel/wheelForm';
import type { WheelCampaign } from '@/components/luckyWheel/types';

const TEMPLATE_ICONS: Record<WheelTemplate, LucideIcon> = { simple: JitGift, tiers: Layers, jackpot: JitPremium };

export default function LuckyWheelWizard() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { textAlign } = useDir();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string; copyFrom?: string }>();
  const editId = typeof params.id === 'string' ? params.id : undefined;
  const copyFrom = !editId && typeof params.copyFrom === 'string' ? params.copyFrom : undefined;
  const sourceId = editId ?? copyFrom;

  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const { isPremium } = usePlanStatus(merchant);
  const canManage = isPremium && !isTeamMember;

  const labelOf = useCallback((key: string) => t(`luckyWheel.samplePrize.${key}`), [t]);
  const today = useMemo(() => moroccoToday(), []);
  const [form, dispatch] = useReducer(wheelFormReducer, today, (day: string) =>
    initialWheelForm(day, t('luckyWheel.wizard.defaultName'), labelOf),
  );
  const [baseline, setBaseline] = useState(() => formSignature(form));
  const dirty = useMemo(() => formSignature(form) !== baseline, [form, baseline]);
  const [campaignId, setCampaignId] = useState<string | undefined>(editId);
  const [template, setTemplate] = useState<WheelTemplate | null>(sourceId ? null : 'tiers');
  const prizesTouchedRef = useRef(false);

  // The API has no single-campaign route: the list is small and usually cached.
  const campaignsQuery = useLuckyWheelCampaigns(canManage && !!sourceId);
  const source: WheelCampaign | undefined = sourceId ? campaignsQuery.data?.find((c) => c.id === sourceId) : undefined;
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (source && loadedId !== source.id) {
    const loaded = formFromCampaign(
      source,
      copyFrom ? { copy: { today, name: t('luckyWheel.wizard.copyName', { name: source.name }) } } : {},
    );
    setLoadedId(source.id);
    setBaseline(formSignature(loaded));
    dispatch({ type: 'RESET', form: loaded });
  }
  const editing = editId ? source : undefined;
  const originalStart = editing ? moroccoYmdOf(new Date(editing.startsAt)) : undefined;
  // Moving the start of a wheel clients already play would rewrite its history.
  const startLocked = !!editing && editing.status !== 'DRAFT' && !!originalStart && originalStart <= today;

  const createMutation = useCreateLuckyWheelCampaign();
  const updateMutation = useUpdateLuckyWheelCampaign();
  const statusMutation = useUpdateLuckyWheelStatus();
  const busy = createMutation.isPending || updateMutation.isPending || statusMutation.isPending;
  const push = useWheelPush();

  const { prizes, winRate } = form;
  const lostLabel = t('luckyWheel.preview.lostSlice');
  const segments = useMemo(
    () => previewSegments({ prizes, winRate }, lostLabel, (i) => t('luckyWheel.prize.title', { n: i + 1 })),
    [prizes, winRate, lostLabel, t],
  );
  const chances = useMemo(() => prizeChances({ prizes, winRate }), [prizes, winRate]);
  const legendLabels = useMemo(
    () => prizes.map((p, i) => p.label.trim() || t('luckyWheel.prize.title', { n: i + 1 })),
    [prizes, t],
  );
  const drawResult = useCallback(() => {
    const index = simulateSpin({ prizes, winRate });
    return index == null ? null : prizes[index]?.key ?? null;
  }, [prizes, winRate]);
  const rate = winRateOf(form);
  const minSpend = parseInt(form.minSpend || '0', 10) || 0;
  const rateOptions = useMoreOptions(!(WIN_RATE_PRESETS as readonly number[]).includes(rate));
  const endOptions = useMoreOptions(form.durationDays == null);
  const spendOptions = useMoreOptions(!(MIN_SPEND_PRESETS as readonly number[]).includes(minSpend));

  const set = useCallback((patch: Partial<WheelForm>) => dispatch({ type: 'SET', patch }), []);
  const setPrize = useCallback((key: string, patch: Partial<WheelPrizeForm>) => {
    prizesTouchedRef.current = true;
    dispatch({ type: 'SET_PRIZE', key, patch });
  }, []);
  const removePrize = useCallback((key: string) => {
    prizesTouchedRef.current = true;
    dispatch({ type: 'REMOVE_PRIZE', key });
  }, []);
  const addPrize = useCallback(() => {
    prizesTouchedRef.current = true;
    dispatch({ type: 'ADD_PRIZE' });
  }, []);

  const applyTemplate = useCallback((next: WheelTemplate) => {
    if (next === template) return;
    const apply = () => {
      prizesTouchedRef.current = false;
      setTemplate(next);
      dispatch({ type: 'SET_PRIZES', prizes: templatePrizes(next, labelOf), winRate: templateWinRate(next) });
    };
    if (!prizesTouchedRef.current) return apply();
    Alert.alert(t('luckyWheel.wizard.templateReplaceTitle'), t('luckyWheel.wizard.templateReplaceBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('luckyWheel.wizard.templateReplaceConfirm'), onPress: apply },
    ]);
  }, [template, labelOf, t]);

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/lucky-wheel');
  }, [router]);

  const validate = useCallback(
    (s: WheelStep) => validateStep(form, s, today, originalStart),
    [form, today, originalStart],
  );
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
    steps: WHEEL_STEPS,
    validate,
    dirty,
    onLeave: leave,
    i18nPrefix: 'luckyWheel.wizard',
  });

  /** Creates the campaign (as a draft) or updates it; returns its id. */
  const save = useCallback(async (): Promise<string> => {
    const { startsAt, ...rest } = formToInput(form);
    if (campaignId) {
      // An unchanged start is not sent: the API would reject a start already in the past.
      const payload = form.startsAt === originalStart ? rest : { ...rest, startsAt };
      await updateMutation.mutateAsync({ id: campaignId, ...payload });
      return campaignId;
    }
    const created = await createMutation.mutateAsync({ startsAt, ...rest });
    setCampaignId(created.id);
    return created.id;
  }, [form, campaignId, originalStart, createMutation, updateMutation]);

  const openDetail = useCallback((id: string) => {
    allowLeave();
    router.replace({ pathname: '/lucky-wheel/[id]', params: { id } });
  }, [allowLeave, router]);

  const handleSave = useCallback(async () => {
    if (busy || !ensureValid()) return;
    try {
      const id = await save();
      setBaseline(formSignature(form));
      Alert.alert(editing && editing.status !== 'DRAFT' ? t('luckyWheel.wizard.saved') : t('luckyWheel.wizard.draftSaved'));
      openDetail(id);
    } catch (e) {
      Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError')));
    }
  }, [busy, ensureValid, save, form, editing, openDetail, t]);

  const doLaunch = useCallback(async () => {
    try {
      const id = await save();
      setBaseline(formSignature(form));
      await statusMutation.mutateAsync({ id, status: 'ACTIVE' });
      const input = formToInput(form);
      Alert.alert(t('luckyWheel.wizard.launchedTitle'), t('luckyWheel.wizard.launchedBody'), [
        { text: t('luckyWheel.wizard.later'), style: 'cancel', onPress: () => openDetail(id) },
        {
          text: t('luckyWheel.wizard.notifyNow'),
          onPress: () => push.prompt(input, () => openDetail(id)),
        },
      ], { cancelable: false });
    } catch (e) {
      Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError')));
    }
  }, [save, form, statusMutation, push, openDetail, t]);

  const handleLaunch = useCallback(() => {
    if (busy || !ensureValid()) return;
    const body = form.startsAt <= today
      ? t('luckyWheel.wizard.launchToday')
      : t('luckyWheel.wizard.launchLater', { date: formatYmd(form.startsAt, locale) });
    Alert.alert(t('luckyWheel.wizard.launchTitle'), body, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('luckyWheel.wizard.launch'), onPress: () => void doLaunch() },
    ]);
  }, [busy, ensureValid, form.startsAt, today, locale, t, doLaunch]);

  if (shouldWait) return null;

  const title = editId
    ? t('luckyWheel.wizard.titleEdit')
    : copyFrom ? t('luckyWheel.wizard.titleCopy') : t('luckyWheel.wizard.titleCreate');

  if (!canManage) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={title} onBack={leave} />
        {isTeamMember
          ? <View style={styles.padded}><Notice text={t('luckyWheel.list.ownerOnly')} /></View>
          : <PremiumLockCard titleKey="luckyWheel.list.premiumTitle" descriptionKey="luckyWheel.list.premiumDesc" />}
      </View>
    );
  }

  if (sourceId && campaignsQuery.isLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  // Without the loaded campaign, saving would overwrite it with a blank wheel.
  if (sourceId && !source) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={title} onBack={leave} />
        <View style={[styles.padded, styles.gap]}>
          <Notice tone="danger" text={t('luckyWheel.wizard.loadError')} />
          <Button label={t('common.retry')} onPress={() => void campaignsQuery.refetch()} loading={campaignsQuery.isRefetching} />
        </View>
      </View>
    );
  }

  if (editing?.status === 'ENDED') {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={title} onBack={leave} />
        <View style={styles.padded}><Notice text={t('luckyWheel.wizard.notEditable')} /></View>
      </View>
    );
  }

  const previewSize = Math.min(width - 96, ms(290));
  const rateLine = t('luckyWheel.wizard.winRateValue', { pct: rate });
  const days = Math.max(0, durationOf(form.startsAt, form.endsAt));
  const periodLine = t('luckyWheel.wizard.periodLine', {
    start: formatYmd(form.startsAt, locale, false),
    end: formatYmd(form.endsAt, locale, false),
    days,
  });
  const ticketRule = minSpend > 0
    ? t('luckyWheel.wizard.ticketRuleMin', { amount: formatWheelMoney(minSpend, locale) })
    : t('luckyWheel.wizard.ticketRuleAll');
  const isLive = !!editing && editing.status !== 'DRAFT';
  const wheelName = form.name.trim() || t('luckyWheel.wizard.defaultName');
  const wheelDescription = form.description.trim();

  let footer: ReactNode;
  if (!isLast) {
    footer = (
      <WizardFooter onBack={stepIndex > 0 ? back : undefined} primary={{ label: nextLabel, onPress: next }} />
    );
  } else if (isLive) {
    footer = <WizardFooter primary={{ icon: Save, label: t('luckyWheel.wizard.save'), onPress: handleSave, loading: busy }} />;
  } else {
    footer = (
      <WizardFooter
        secondary={{ icon: Save, label: t('luckyWheel.wizard.saveDraft'), onPress: handleSave, disabled: busy }}
        primary={{ icon: Play, label: t('luckyWheel.wizard.launch'), onPress: handleLaunch, loading: busy }}
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
      {step === 'prizes' && (
        <>
          {!sourceId && (
            <Section title={t('luckyWheel.wizard.templateTitle')}>
              <HelpText text={t('luckyWheel.wizard.templateHint')} />
              {WHEEL_TEMPLATES.map((tpl) => (
                <OptionCard
                  key={tpl}
                  icon={TEMPLATE_ICONS[tpl]}
                  title={t(`luckyWheel.wizard.template.${tpl}.title`)}
                  description={t(`luckyWheel.wizard.template.${tpl}.desc`)}
                  selected={template === tpl}
                  onPress={() => applyTemplate(tpl)}
                />
              ))}
            </Section>
          )}

          <Section title={t('luckyWheel.wizard.prizesTitle')}>
            <HelpText text={t('luckyWheel.wizard.prizesHint')} />
            {prizes.map((p, i) => (
              <PrizeEditor
                key={p.key}
                index={i}
                prize={p}
                chance={chances.perPrize[i] ?? 0}
                canRemove={prizes.length > 1}
                onChange={setPrize}
                onRemove={removePrize}
              />
            ))}
            {prizes.length < WHEEL_LIMITS.MAX_PRIZES ? (
              <Button variant="secondary" icon={Plus} label={t('luckyWheel.wizard.addPrize')} onPress={addPrize} />
            ) : (
              <Notice text={t('luckyWheel.wizard.maxPrizes', { max: WHEEL_LIMITS.MAX_PRIZES })} />
            )}
          </Section>
          {isLive && <Notice text={t('luckyWheel.wizard.editLiveNote')} />}
        </>
      )}

      {step === 'chances' && (
        <Section>
          <Text style={[styles.bigValue, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>{rateLine}</Text>
          <HelpText tone="secondary" center text={t('luckyWheel.wizard.winRateExample', { won: rate, lost: 100 - rate })} />
          <ChipRow>
            {WIN_RATE_PRESETS.map((r) => (
              <Chip
                key={r}
                label={`${r} % · ${t(`luckyWheel.wizard.rate${r}`)}`}
                selected={rate === r}
                onPress={() => {
                  rateOptions.close();
                  set({ winRate: String(r) });
                }}
              />
            ))}
          </ChipRow>
          <MoreOptions open={rateOptions.open} onToggle={rateOptions.toggle} label={t('luckyWheel.wizard.winRateCustom')}>
            <Input
              value={form.winRate}
              onChangeText={(v) => set({ winRate: digitsOnly(v) })}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="40"
              accessibilityLabel={t('luckyWheel.wizard.winRateCustom')}
            />
          </MoreOptions>
          <WheelSummaryCard
            segments={segments}
            labels={legendLabels}
            perPrize={chances.perPrize}
            lostPct={chances.lostPct}
            caption={t('luckyWheel.wizard.chancesCaption')}
          />
          <HelpText text={t('luckyWheel.wizard.winRateTip')} />
        </Section>
      )}

      {step === 'timing' && (
        <>
          <Section title={t('luckyWheel.wizard.durationTitle')}>
            <ChipRow>
              {DURATION_PRESETS.map((d) => (
                <Chip
                  key={d}
                  label={t(`luckyWheel.wizard.duration${d}`)}
                  selected={form.durationDays === d}
                  onPress={() => {
                    endOptions.close();
                    set({ durationDays: d });
                  }}
                />
              ))}
            </ChipRow>
            <DateField
              label={t('luckyWheel.wizard.startDate')}
              value={form.startsAt}
              minYmd={originalStart && originalStart < today ? originalStart : today}
              disabled={startLocked}
              onChange={(startsAt) => set({ startsAt })}
            />
            {startLocked && <HelpText text={t('luckyWheel.wizard.startLocked')} />}
            <Text style={[styles.timeline, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>{periodLine}</Text>
            <MoreOptions open={endOptions.open} onToggle={endOptions.toggle} label={t('luckyWheel.wizard.customEnd')}>
              <DateField
                label={t('luckyWheel.wizard.endDate')}
                value={form.endsAt}
                minYmd={form.startsAt > today ? form.startsAt : today}
                onChange={(endsAt) => set({ endsAt })}
              />
            </MoreOptions>
          </Section>

          <Section title={t('luckyWheel.wizard.conditionTitle')}>
            <HelpText tone="secondary" text={ticketRule} />
            <ChipRow>
              {MIN_SPEND_PRESETS.map((amount) => (
                <Chip
                  key={amount}
                  label={amount === 0 ? t('luckyWheel.wizard.minSpendNone') : formatWheelMoney(amount, locale)}
                  selected={minSpend === amount}
                  onPress={() => {
                    spendOptions.close();
                    set({ minSpend: String(amount) });
                  }}
                />
              ))}
            </ChipRow>
            <MoreOptions open={spendOptions.open} onToggle={spendOptions.toggle} label={t('luckyWheel.wizard.minSpendCustom')}>
              <FieldLabel text={t('luckyWheel.wizard.minSpendLabel')} />
              <Input
                value={form.minSpend}
                onChangeText={(v) => set({ minSpend: digitsOnly(v) })}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="0"
                accessibilityLabel={t('luckyWheel.wizard.minSpendLabel')}
              />
            </MoreOptions>
          </Section>
        </>
      )}

      {step === 'look' && (
        <>
          <Section title={t('luckyWheel.wizard.nameTitle')}>
            <FieldLabel text={t('luckyWheel.wizard.name')} hint={t('luckyWheel.wizard.nameHint')} />
            <Input
              value={form.name}
              onChangeText={(name) => set({ name })}
              placeholder={t('luckyWheel.wizard.namePlaceholder')}
              maxLength={WHEEL_LIMITS.NAME_MAX}
              accessibilityLabel={t('luckyWheel.wizard.name')}
            />
            <FieldLabel text={t('luckyWheel.wizard.description')} hint={t('luckyWheel.wizard.descriptionHint')} />
            <Input
              value={form.description}
              onChangeText={(description) => set({ description })}
              placeholder={t('luckyWheel.wizard.descriptionPlaceholder')}
              maxLength={WHEEL_LIMITS.DESCRIPTION_MAX}
              multiline
              accessibilityLabel={t('luckyWheel.wizard.description')}
            />
          </Section>

          <Section title={t('luckyWheel.wizard.previewTitle')}>
            <HelpText text={t('luckyWheel.wizard.previewHint')} />
            <WheelPreview
              size={previewSize}
              segments={segments}
              drawResult={drawResult}
              name={wheelName}
              description={wheelDescription}
            />
          </Section>
        </>
      )}

      {step === 'review' && (
        <>
          <Section>
            <ReviewBlock label={stepLabels[0]} onEdit={() => goTo(0)}>
              {prizes.map((p, i) => (
                <ReviewLine
                  key={p.key}
                  text={`• ${t('luckyWheel.wizard.summaryPrize', {
                    prize: p.label.trim(),
                    pct: chances.perPrize[i] ?? 0,
                    stock: p.totalStock,
                    claim: claimLabel(p.claimWindowHours, t),
                  })}`}
                />
              ))}
            </ReviewBlock>
            <ReviewBlock label={stepLabels[1]} onEdit={() => goTo(1)}>
              <ReviewLine strong text={rateLine} />
            </ReviewBlock>
            <ReviewBlock label={stepLabels[2]} onEdit={() => goTo(2)}>
              <ReviewLine text={periodLine} />
              <ReviewLine text={ticketRule} />
            </ReviewBlock>
            <ReviewBlock label={stepLabels[3]} onEdit={() => goTo(3)} last>
              <ReviewLine strong text={wheelName} />
              {wheelDescription ? <ReviewLine text={wheelDescription} /> : null}
            </ReviewBlock>
          </Section>
          {isLive && <Notice text={t('luckyWheel.wizard.editLiveNote')} />}
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
  bigValue: { fontSize: ms(22), fontFamily: font.bold, textAlign: 'center' },
  timeline: { fontSize: ms(13), lineHeight: ms(20), fontFamily: font.medium },
});
