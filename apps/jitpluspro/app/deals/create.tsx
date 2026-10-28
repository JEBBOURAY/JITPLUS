import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Globe, ImagePlus, Save, Send, Trash2 } from 'lucide-react-native';
import { JitPin, JitStore } from '@/components/icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import { useStores } from '@/hooks/queries/stores';
import { useCreateDeal, useMerchantDeal, useMerchantDeals, useUpdateDeal, useUploadDealImage } from '@/hooks/queries/deals';
import { getErrorMessage } from '@/utils/error';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import { DEAL_LIMITS, computePercentOff, type DealScope } from '@jitplus/shared/src/deals';
import { addDaysYmd, diffDaysYmd } from '@jitplus/shared/src/scratch';
import { Button, Chip, ChipRow, FieldLabel, Input, Notice, OptionCard, ScreenHeader, Section } from '@/components/scratch/ScratchUI';
import { DateField, formatYmd } from '@/components/scratch/DateField';
import { moroccoToday, moroccoWallTimeToIso } from '@/components/scratch/campaignForm';
import { HelpText, ReviewBlock, ReviewLine, WizardFooter, WizardShell, useGameWizard } from '@/components/games/GameWizard';
import { digitsOnly } from '@/components/games/gameForm';
import DealThumb from '@/components/deals/DealThumb';
import { DealPreviewRow, useDealMerchantLook } from '@/components/deals/DealRows';
import { dealBadgeLabel } from '@/components/deals/dealVisual';
import { useDealErrorAlert } from '@/components/deals/useDealErrorAlert';
import {
  DEAL_DURATION_PRESETS,
  DEAL_TYPE_OPTIONS,
  DEAL_WIZARD_STEPS,
  dealFormReducer,
  dealFormToInput,
  dealFormToPatch,
  formFromDeal,
  initialDealForm,
  parseDecimal,
  previewOffer,
  priceInput,
  validateDealStep,
  withHttps,
  type DealForm,
  type DealWizardStep,
} from '@/components/deals/dealForm';

const SCOPES: readonly DealScope[] = ['LOCAL', 'ONLINE'];

export default function DealWizard() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { row, textAlign } = useDir();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = typeof params.id === 'string' ? params.id : undefined;

  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const canManage = !isTeamMember;

  const today = useMemo(() => moroccoToday(), []);
  const [form, dispatch] = useReducer(dealFormReducer, today, initialDealForm);
  const [dirty, setDirty] = useState(false);

  const {
    data: existing,
    isLoading: loadingExisting,
    isRefetching: refetchingExisting,
    refetch: refetchExisting,
  } = useMerchantDeal(editId);
  const loadedRef = useRef(false);
  useEffect(() => {
    if (existing && !loadedRef.current) {
      loadedRef.current = true;
      dispatch({ type: 'RESET', form: formFromDeal(existing) });
    }
  }, [existing]);
  // A live deal keeps its first day; only its last day can move.
  const started = existing?.displayStatus === 'LIVE';

  const { data: listData } = useMerchantDeals(!shouldWait && canManage);
  const limits = listData?.limits;
  const { data: storesData } = useStores(!shouldWait && canManage);
  const stores = useMemo(() => (storesData ?? []).filter((s) => s.isActive !== false), [storesData]);

  // "shop.ma" typed without a scheme is validated and sent as "https://shop.ma".
  const normalized = useMemo<DealForm>(() => ({ ...form, linkUrl: withHttps(form.linkUrl) }), [form]);

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/deals');
  }, [router]);

  const validate = useCallback((s: DealWizardStep) => validateDealStep(normalized, s, today, started), [normalized, today, started]);
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
    steps: DEAL_WIZARD_STEPS,
    validate,
    dirty,
    onLeave: leave,
    i18nPrefix: 'deals.wizard',
  });

  const createMutation = useCreateDeal();
  const updateMutation = useUpdateDeal();
  const uploadMutation = useUploadDealImage();
  const busy = createMutation.isPending || updateMutation.isPending;

  const set = useCallback((patch: Partial<DealForm>) => {
    setDirty(true);
    dispatch({ type: 'SET', patch });
  }, []);

  const fail = useCallback((e: unknown) => Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError'))), [t]);

  const pickPhoto = useCallback(async () => {
    if (uploadMutation.isPending) return;
    try {
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const { url } = await uploadMutation.mutateAsync({ uri: asset.uri, mimeType: asset.mimeType });
      set({ imageUrl: url });
    } catch (e) {
      fail(e);
    }
  }, [uploadMutation, set, fail]);

  const goStores = useCallback(() => router.push('/stores'), [router]);
  const showSaveError = useDealErrorAlert({ beforeNavigate: allowLeave, onSeeDeals: leave });

  const handleSubmit = useCallback(async () => {
    if (busy || !ensureValid()) return;
    try {
      if (editId) {
        await updateMutation.mutateAsync({ id: editId, payload: dealFormToPatch(normalized, started) });
        setDirty(false);
        allowLeave();
        Alert.alert(t('deals.wizard.saved'));
        leave();
        return;
      }
      const created = await createMutation.mutateAsync(dealFormToInput(normalized));
      setDirty(false);
      allowLeave();
      Alert.alert(created.displayStatus === 'SCHEDULED' ? t('deals.wizard.scheduledSuccess') : t('deals.wizard.published'));
      router.replace({ pathname: '/deals/[id]', params: { id: created.id } });
    } catch (e) {
      showSaveError(e);
    }
  }, [busy, ensureValid, editId, updateMutation, normalized, started, allowLeave, t, leave, createMutation, router, showSaveError]);

  const offer = useMemo(() => previewOffer(normalized), [normalized]);
  const look = useDealMerchantLook();

  if (shouldWait) return null;

  const title = editId ? t('deals.wizard.titleEdit') : t('deals.wizard.titleCreate');

  if (!canManage) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={title} onBack={leave} />
        <View style={styles.padded}><Notice text={t('deals.list.ownerOnly')} /></View>
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

  if (editId && !existing) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={title} onBack={leave} />
        <View style={[styles.padded, styles.gap]}>
          <Notice tone="danger" text={t('deals.wizard.loadError')} />
          <Button label={t('common.retry')} onPress={() => void refetchExisting()} loading={refetchingExisting} />
        </View>
      </View>
    );
  }

  if (existing && existing.displayStatus !== 'LIVE' && existing.displayStatus !== 'SCHEDULED') {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={title} onBack={leave} />
        <View style={styles.padded}><Notice text={t('deals.wizard.notEditable')} /></View>
      </View>
    );
  }

  const day = (ymd: string) => formatYmd(ymd, locale, false);
  const datesSummary = t('deals.wizard.datesSummary', { start: day(form.startsOn), end: day(form.endsOn) });
  const badge = dealBadgeLabel(offer, t);
  const length = diffDaysYmd(form.startsOn, form.endsOn);
  const local = form.scope === 'LOCAL';
  const showStores = local && stores.length > 1;
  const someUnlocated = stores.some((s) => s.latitude == null || s.longitude == null);
  const dropPercent = form.type === 'PRICE_DROP' ? computePercentOff(parseDecimal(form.originalPrice), parseDecimal(form.dealPrice)) : null;
  const link = normalized.linkUrl.trim();

  const toggleStore = (id: string) => {
    if (form.allStores) return set({ allStores: false, storeIds: [id] });
    const storeIds = form.storeIds.includes(id) ? form.storeIds.filter((s) => s !== id) : [...form.storeIds, id];
    set({ storeIds });
  };

  const storesLine = !local
    ? t('deals.scope.ONLINE')
    : form.allStores
      ? t('deals.wizard.reviewAllStores')
      : t('deals.wizard.reviewSomeStores', { count: form.storeIds.length });

  let footer: ReactNode;
  if (!isLast) {
    footer = <WizardFooter onBack={stepIndex > 0 ? back : undefined} primary={{ label: nextLabel, onPress: next }} />;
  } else {
    footer = (
      <WizardFooter
        onBack={back}
        primary={{
          icon: editId ? Save : Send,
          label: editId ? t('deals.wizard.save') : t('deals.wizard.publish'),
          onPress: handleSubmit,
          loading: busy,
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
      {step === 'offer' && (
        <>
          <Section title={t('deals.wizard.whereTitle')}>
            {(editId ? SCOPES.filter((s) => s === form.scope) : SCOPES).map((scope) => (
              <OptionCard
                key={scope}
                icon={scope === 'ONLINE' ? Globe : JitStore}
                title={t(`deals.scope.${scope}`)}
                description={t(`deals.scopeDesc.${scope}`)}
                selected={form.scope === scope}
                onPress={() => {
                  if (!editId && scope !== form.scope) set({ scope });
                }}
              />
            ))}
            {editId ? <HelpText text={t('deals.wizard.scopeLocked')} /> : null}
            {!editId && local && limits && !limits.hasLocatedStore && (
              <>
                <Notice tone="warning" text={t('deals.list.needsLocation')} />
                <Button variant="secondary" icon={JitPin} label={t('deals.list.addLocation')} onPress={goStores} />
              </>
            )}
          </Section>

          <Section title={t('deals.wizard.typeTitle')}>
            <ChipRow>
              {DEAL_TYPE_OPTIONS.map((type) => (
                <Chip key={type} label={t(`deals.type.${type}`)} selected={form.type === type} onPress={() => set({ type })} />
              ))}
            </ChipRow>

            {form.type === 'PERCENT_OFF' && (
              <>
                <FieldLabel text={t('deals.wizard.percent')} />
                <Input
                  value={form.percentOff}
                  onChangeText={(v) => set({ percentOff: digitsOnly(v) })}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="20"
                  accessibilityLabel={t('deals.wizard.percent')}
                />
              </>
            )}

            {form.type === 'PRICE_DROP' && (
              <>
                <View style={[styles.pair, { flexDirection: row }]}>
                  <View style={styles.flex}>
                    <FieldLabel text={t('deals.wizard.originalPrice')} />
                    <Input
                      value={form.originalPrice}
                      onChangeText={(v) => set({ originalPrice: priceInput(v) })}
                      keyboardType="decimal-pad"
                      maxLength={10}
                      accessibilityLabel={t('deals.wizard.originalPrice')}
                    />
                  </View>
                  <View style={styles.flex}>
                    <FieldLabel text={t('deals.wizard.dealPrice')} />
                    <Input
                      value={form.dealPrice}
                      onChangeText={(v) => set({ dealPrice: priceInput(v) })}
                      keyboardType="decimal-pad"
                      maxLength={10}
                      accessibilityLabel={t('deals.wizard.dealPrice')}
                    />
                  </View>
                </View>
                {dropPercent != null && <HelpText tone="secondary" text={t('deals.wizard.computedPercent', { value: dropPercent })} />}
              </>
            )}

            {form.type === 'BUY_X_GET_Y' && (
              <View style={[styles.pair, { flexDirection: row }]}>
                <View style={styles.flex}>
                  <FieldLabel text={t('deals.wizard.buyQty')} />
                  <Input
                    value={form.buyQty}
                    onChangeText={(v) => set({ buyQty: digitsOnly(v) })}
                    keyboardType="number-pad"
                    maxLength={2}
                    accessibilityLabel={t('deals.wizard.buyQty')}
                  />
                </View>
                <View style={styles.flex}>
                  <FieldLabel text={t('deals.wizard.freeQty')} />
                  <Input
                    value={form.freeQty}
                    onChangeText={(v) => set({ freeQty: digitsOnly(v) })}
                    keyboardType="number-pad"
                    maxLength={2}
                    accessibilityLabel={t('deals.wizard.freeQty')}
                  />
                </View>
              </View>
            )}

            {form.type === 'FREE_ITEM' && (
              <>
                <FieldLabel text={t('deals.wizard.itemValue')} hint={t('deals.wizard.optional')} />
                <Input
                  value={form.originalPrice}
                  onChangeText={(v) => set({ originalPrice: priceInput(v) })}
                  keyboardType="decimal-pad"
                  maxLength={10}
                  accessibilityLabel={t('deals.wizard.itemValue')}
                />
              </>
            )}

            {form.type === 'OTHER' && <HelpText text={t('deals.wizard.otherHint')} />}
          </Section>

          <Section title={t('deals.wizard.textTitle')}>
            <FieldLabel text={t('deals.wizard.titleLabel')} />
            <Input
              value={form.title}
              onChangeText={(v) => set({ title: v })}
              placeholder={t('deals.wizard.titlePlaceholder')}
              maxLength={DEAL_LIMITS.TITLE_MAX}
              accessibilityLabel={t('deals.wizard.titleLabel')}
            />
            <Counter count={form.title.length} max={DEAL_LIMITS.TITLE_MAX} />
            <FieldLabel text={t('deals.wizard.description')} hint={t('deals.wizard.optional')} />
            <Input
              value={form.description}
              onChangeText={(v) => set({ description: v })}
              placeholder={t('deals.wizard.descriptionPlaceholder')}
              maxLength={DEAL_LIMITS.DESCRIPTION_MAX}
              multiline
              accessibilityLabel={t('deals.wizard.description')}
            />
            <Counter count={form.description.length} max={DEAL_LIMITS.DESCRIPTION_MAX} />
            <FieldLabel text={t('deals.wizard.conditions')} hint={t('deals.wizard.optional')} />
            <Input
              value={form.conditions}
              onChangeText={(v) => set({ conditions: v })}
              placeholder={t('deals.wizard.conditionsPlaceholder')}
              maxLength={DEAL_LIMITS.CONDITIONS_MAX}
              multiline
              accessibilityLabel={t('deals.wizard.conditions')}
            />
            <Counter count={form.conditions.length} max={DEAL_LIMITS.CONDITIONS_MAX} />
          </Section>
        </>
      )}

      {step === 'visual' && (
        <>
          <Section title={t('deals.wizard.photoTitle')}>
            <HelpText text={t('deals.wizard.photoHint')} />
            <View style={[styles.photoRow, { flexDirection: row }]}>
              <DealThumb
                imageUrl={form.imageUrl}
                coverUrl={look.coverUrl}
                themeColor={look.themeColor}
                category={look.categorie}
                badge={badge}
                width={ms(112)}
                radius={16}
              />
              <View style={[styles.flex, styles.gap]}>
                <Button
                  variant="secondary"
                  icon={ImagePlus}
                  label={form.imageUrl ? t('deals.wizard.changePhoto') : t('deals.wizard.addPhoto')}
                  onPress={pickPhoto}
                  loading={uploadMutation.isPending}
                />
                {form.imageUrl ? (
                  <Button variant="ghost" icon={Trash2} label={t('deals.wizard.removePhoto')} onPress={() => set({ imageUrl: null })} />
                ) : null}
              </View>
            </View>
          </Section>

          <Section title={t('deals.wizard.linkTitle')}>
            <FieldLabel
              text={t('deals.wizard.linkTitle')}
              hint={local ? t('deals.wizard.linkOptionalHint') : t('deals.wizard.linkRequiredHint')}
            />
            <Input
              value={form.linkUrl}
              onChangeText={(v) => set({ linkUrl: v })}
              onBlur={() => {
                if (form.linkUrl !== normalized.linkUrl) set({ linkUrl: normalized.linkUrl });
              }}
              placeholder={t('deals.wizard.linkPlaceholder')}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={DEAL_LIMITS.LINK_MAX}
              accessibilityLabel={t('deals.wizard.linkTitle')}
            />
          </Section>

          {showStores && (
            <Section title={t('deals.wizard.storesTitle')}>
              <ChipRow>
                <Chip label={t('deals.wizard.allStores')} selected={form.allStores} onPress={() => set({ allStores: true })} />
                {stores.map((store) => {
                  const located = store.latitude != null && store.longitude != null;
                  return (
                    <Chip
                      key={store.id}
                      label={located ? store.nom : t('deals.wizard.noPosition', { name: store.nom })}
                      selected={!form.allStores && form.storeIds.includes(store.id)}
                      onPress={() => toggleStore(store.id)}
                    />
                  );
                })}
              </ChipRow>
              {someUnlocated && <HelpText text={t('deals.wizard.storesHint')} />}
            </Section>
          )}
        </>
      )}

      {step === 'dates' && (
        <>
          {started && <Notice text={t('deals.wizard.startedNote')} />}
          <Section>
            <DateField
              label={t('deals.wizard.startLabel')}
              value={form.startsOn}
              minYmd={today}
              maxYmd={addDaysYmd(today, DEAL_LIMITS.MAX_SCHEDULE_DAYS)}
              onChange={(startsOn) => set({ startsOn })}
              disabled={started}
            />
            <DateField
              label={t('deals.wizard.endLabel')}
              value={form.endsOn}
              minYmd={started || form.startsOn < today ? today : form.startsOn}
              maxYmd={addDaysYmd(started ? today : form.startsOn, DEAL_LIMITS.MAX_DURATION_DAYS)}
              onChange={(endsOn) => set({ endsOn })}
            />
            <Text style={[styles.summary, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
              {datesSummary}
            </Text>
            <HelpText text={t('deals.wizard.endsAtNight')} />
          </Section>

          {!started && (
            <Section title={t('deals.wizard.durationTitle')}>
              <ChipRow>
                {DEAL_DURATION_PRESETS.map((days) => (
                  <Chip
                    key={days}
                    label={t('deals.wizard.durationChip', { count: days })}
                    selected={length === days}
                    onPress={() => set({ endsOn: addDaysYmd(form.startsOn, days) })}
                  />
                ))}
              </ChipRow>
            </Section>
          )}
        </>
      )}

      {step === 'review' && (
        <>
          <Section title={t('deals.wizard.previewTitle')}>
            <HelpText text={t('deals.wizard.previewHint')} />
            <View style={[styles.previewFrame, { backgroundColor: theme.bg, borderColor: theme.borderLight }]}>
              <DealPreviewRow
                title={normalized.title.trim()}
                offer={offer}
                scope={form.scope}
                imageUrl={form.imageUrl}
                endsAt={moroccoWallTimeToIso(form.endsOn, '23:59')}
                merchant={look}
              />
            </View>
          </Section>

          <Section>
            <ReviewBlock label={stepLabels[0]} onEdit={() => goTo(0)}>
              <ReviewLine strong text={normalized.title.trim()} />
              <ReviewLine text={`${t(`deals.scope.${form.scope}`)} · ${t(`deals.type.${form.type}`)}${badge ? ` · ${badge}` : ''}`} />
              {normalized.description.trim() ? <ReviewLine text={normalized.description.trim()} /> : null}
              {normalized.conditions.trim() ? <ReviewLine text={normalized.conditions.trim()} /> : null}
            </ReviewBlock>
            <ReviewBlock label={stepLabels[1]} onEdit={() => goTo(1)}>
              <ReviewLine text={form.imageUrl ? t('deals.wizard.reviewPhoto') : t('deals.wizard.reviewNoPhoto')} />
              <ReviewLine text={link || t('deals.wizard.reviewNoLink')} />
              <ReviewLine text={storesLine} />
            </ReviewBlock>
            <ReviewBlock label={stepLabels[2]} onEdit={() => goTo(2)} last>
              <ReviewLine strong text={datesSummary} />
            </ReviewBlock>
          </Section>

          {started && <Notice text={t('deals.wizard.startedNote')} />}
          {!editId && (
            <Notice
              text={t('deals.wizard.freeNote', {
                maxActive: limits?.maxActive ?? DEAL_LIMITS.MAX_ACTIVE,
                maxPerDay: limits?.maxPerDay ?? DEAL_LIMITS.MAX_CREATED_PER_DAY,
              })}
            />
          )}
        </>
      )}
    </WizardShell>
  );
}

function Counter({ count, max }: { count: number; max: number }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { isRTL } = useDir();
  return (
    <Text
      style={[styles.counter, { color: count >= max ? theme.warning : theme.textMuted, textAlign: isRTL ? 'left' : 'right' }]}
      maxFontSizeMultiplier={1.2}
    >
      {t('deals.wizard.counter', { count, max })}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  padded: { padding: 16 },
  gap: { gap: 10 },
  flex: { flex: 1 },
  pair: { gap: 10 },
  photoRow: { gap: 14, alignItems: 'center' },
  summary: { fontSize: ms(14), lineHeight: ms(20), fontFamily: font.medium },
  counter: { fontSize: ms(11), fontFamily: font.regular, marginTop: -6 },
  previewFrame: { borderRadius: 16, borderWidth: 1, padding: 8 },
});
