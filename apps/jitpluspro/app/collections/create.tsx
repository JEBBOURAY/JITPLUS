import { useCallback, useMemo, useReducer, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { View, StyleSheet, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Camera, Play, Plus, Save, X } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLLECTION_LIMITS } from '@jitplus/shared/src/collection';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import { useActivateCollection, useCollection, useCreateCollection, useOtherActiveCollection, useUpdateCollection } from '@/hooks/useCollectionHooks';
import { useUploadCollectionImage } from '@/hooks/useQueryHooks';
import { pickSquareImage } from '@/utils/pickSquareImage';
import { resolveImageUrl } from '@/utils/imageUrl';
import { getErrorMessage } from '@/utils/error';
import { isolate } from '@/utils/bidi';
import { icon } from '@/constants/design';
import { radius } from '@/utils/responsive';
import { Button, Chip, ChipRow, FieldLabel, Input, Notice, OptionCard, Section } from '@/components/scratch/ScratchUI';
import { DateField } from '@/components/scratch/DateField';
import { moroccoToday, moroccoYmdOf } from '@/components/scratch/campaignForm';
import { HelpText, ReviewBlock, ReviewLine, WizardFooter, WizardShell, useGameWizard } from '@/components/games/GameWizard';
import { GameLoadError, GameNoAccess, GameScreenLoading, GameScreenNotice, useBackTo } from '@/components/games/GameScreen';
import { useGamePush } from '@/components/games/useGamePush';
import { CollectionSteps, collectionPushMessage, collectionRuleLines } from '@/components/collection/CollectionUI';
import {
  COLLECTION_STEPS,
  COUPON_DAYS_PRESETS,
  collectionFormReducer,
  filledItems,
  formFromCollection,
  formSignature,
  formToInput,
  initialCollectionForm,
  validateStep,
  type CollectionForm,
  type CollectionStep,
} from '@/components/collection/collectionForm';

const GIFT_PHOTO = 'gift';

export default function CollectionWizard() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { row } = useDir();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = typeof params.id === 'string' ? params.id : undefined;

  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const { isPremium } = usePlanStatus(merchant);
  const canManage = isPremium && !isTeamMember;

  const today = useMemo(() => moroccoToday(), []);
  const [form, dispatch] = useReducer(collectionFormReducer, undefined, initialCollectionForm);
  const [baseline, setBaseline] = useState(() => formSignature(form));
  const dirty = formSignature(form) !== baseline;
  const [collectionId, setCollectionId] = useState<string | undefined>(editId);

  const sourceQuery = useCollection(editId, canManage);
  const source = sourceQuery.data;
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (source && loadedId !== source.id) {
    const loaded = formFromCollection(source, source.endsAt ? moroccoYmdOf(new Date(source.endsAt)) : '');
    setLoadedId(source.id);
    setBaseline(formSignature(loaded));
    dispatch({ type: 'RESET', form: loaded });
  }

  const createMutation = useCreateCollection();
  const updateMutation = useUpdateCollection();
  const activateMutation = useActivateCollection();
  const otherActive = useOtherActiveCollection(collectionId, canManage);
  const uploadPhoto = useUploadCollectionImage();
  // A photo still uploading would be missing from what is saved.
  const busy = createMutation.isPending || updateMutation.isPending || activateMutation.isPending || uploadPhoto.isPending;
  const push = useGamePush();

  const set = useCallback((patch: Partial<Omit<CollectionForm, 'items'>>) => dispatch({ type: 'SET', patch }), []);

  // `key` of the product being uploaded, or GIFT_PHOTO for the gift.
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const setPhoto = useCallback((key: string, url: string | null) => {
    if (key === GIFT_PHOTO) dispatch({ type: 'SET', patch: { giftImageUrl: url } });
    else dispatch({ type: 'SET_ITEM', key, patch: { imageUrl: url } });
  }, []);
  const pickPhoto = useCallback(async (key: string) => {
    try {
      const image = await pickSquareImage();
      if (!image) return;
      setUploadingKey(key);
      const { url } = await uploadPhoto.mutateAsync(image);
      setPhoto(key, url);
    } catch (e) {
      toast.error(getErrorMessage(e, t('upload.uploadFailed')));
    } finally {
      setUploadingKey(null);
    }
  }, [uploadPhoto, setPhoto, t]);

  /** No photo yet: pick one. Otherwise ask whether to change or remove it. */
  const handlePhoto = useCallback((key: string, current: string | null) => {
    if (!current) return void pickPhoto(key);
    Alert.alert(t('collection.wizard.photoTitle'), undefined, [
      { text: t('collection.wizard.photoReplace'), onPress: () => void pickPhoto(key) },
      { text: t('collection.wizard.photoRemove'), style: 'destructive', onPress: () => setPhoto(key, null) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }, [pickPhoto, setPhoto, t]);

  /** Square photo button (product or gift): camera, spinner while uploading, or the photo. */
  const photoButton = (key: string, url: string | null, a11yLabel: string) => (
    <TouchableOpacity
      onPress={() => handlePhoto(key, url)}
      disabled={uploadingKey !== null}
      style={[styles.photo, { backgroundColor: theme.bgInput, borderColor: theme.border }]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      {uploadingKey === key ? (
        <ActivityIndicator color={theme.primary} />
      ) : url ? (
        <Image source={resolveImageUrl(url)} style={styles.photoImg} contentFit="cover" />
      ) : (
        <Camera size={20} color={theme.textMuted} strokeWidth={icon.stroke} />
      )}
    </TouchableOpacity>
  );

  const leave = useBackTo('/collections');

  const validate = useCallback((s: CollectionStep) => validateStep(form, s, today), [form, today]);
  const wizard = useGameWizard({ steps: COLLECTION_STEPS, validate, dirty, onLeave: leave, i18nPrefix: 'collection.wizard' });
  const { step, stepLabels, goTo, ensureValid, allowLeave } = wizard;

  /** Creates the draft or updates it; returns its id. */
  const save = useCallback(async (): Promise<string> => {
    const input = formToInput(form, t('collection.wizard.defaultName'));
    if (collectionId) {
      await updateMutation.mutateAsync({ id: collectionId, ...input });
      return collectionId;
    }
    const created = await createMutation.mutateAsync(input);
    setCollectionId(created.id);
    return created.id;
  }, [form, collectionId, createMutation, updateMutation, t]);

  const openDetail = useCallback((id: string) => {
    allowLeave();
    router.replace({ pathname: '/collections/[id]', params: { id } });
  }, [allowLeave, router]);

  const handleSave = useCallback(async () => {
    if (busy || !ensureValid()) return;
    try {
      const id = await save();
      setBaseline(formSignature(form));
      // A running collection is saved as is; a draft stays a draft.
      toast.success(t(source?.status === 'ACTIVE' ? 'collection.wizard.changesSaved' : 'collection.wizard.draftSaved'));
      openDetail(id);
    } catch (e) {
      toast.error(getErrorMessage(e, t('common.genericError')));
    }
  }, [busy, ensureValid, save, form, openDetail, source?.status, t]);

  const doLaunch = useCallback(async () => {
    try {
      const id = await save();
      setBaseline(formSignature(form));
      await activateMutation.mutateAsync(id);
      const input = formToInput(form, t('collection.wizard.defaultName'));
      push.offer(t('collection.wizard.launchedTitle'), collectionPushMessage(t, input), () => openDetail(id));
    } catch (e) {
      toast.error(getErrorMessage(e, t('common.genericError')));
    }
  }, [save, form, activateMutation, push, openDetail, t]);

  const handleLaunch = useCallback(() => {
    if (busy || !ensureValid()) return;
    // Say it before the launch is refused, and offer what can be done now.
    if (otherActive) {
      Alert.alert(t('collection.wizard.activeExistsTitle'), t('collection.wizard.activeExistsBody', { name: isolate(otherActive.name) }), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('collection.wizard.saveDraft'), onPress: () => void handleSave() },
      ]);
      return;
    }
    Alert.alert(t('collection.wizard.launchTitle'), t('collection.wizard.launchBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('collection.wizard.launch'), onPress: () => void doLaunch() },
    ]);
  }, [busy, ensureValid, otherActive, handleSave, doLaunch, t]);

  if (shouldWait) return null;

  const title = editId ? t('collection.wizard.titleEdit') : t('collection.wizard.titleCreate');

  if (!canManage) return <GameNoAccess title={title} onBack={leave} ns="collection" isTeamMember={isTeamMember} />;

  if (editId && sourceQuery.isLoading) return <GameScreenLoading />;

  // Without the loaded draft, saving would overwrite it with a blank collection.
  if (editId && !source) {
    return (
      <GameLoadError
        title={title}
        onBack={leave}
        text={t('collection.wizard.loadError')}
        onRetry={() => void sourceQuery.refetch()}
        retrying={sourceQuery.isRefetching}
      />
    );
  }

  // A running collection can be edited (products added, not removed); an ended one cannot.
  const running = source?.status === 'ACTIVE';
  if (source && source.status === 'ENDED') {
    return <GameScreenNotice title={title} onBack={leave} text={t('collection.wizard.notEditable')} />;
  }

  const items = filledItems(form);
  const gift = form.giftLabel.trim();
  const canAdd = form.items.length < COLLECTION_LIMITS.MAX_ITEMS;
  const canRemove = form.items.length > COLLECTION_LIMITS.MIN_ITEMS;
  const rulesLines = collectionRuleLines(t, locale, form);

  const lastFooter = running ? (
    <WizardFooter primary={{ icon: Save, label: t('collection.wizard.saveChanges'), onPress: handleSave, loading: busy }} />
  ) : (
    <WizardFooter
      secondary={{ icon: Save, label: t('collection.wizard.saveDraft'), onPress: handleSave, disabled: busy }}
      primary={{ icon: Play, label: t('collection.wizard.launch'), onPress: handleLaunch, loading: busy }}
    />
  );

  return (
    <WizardShell title={title} wizard={wizard} lastFooter={lastFooter}>
      {step === 'items' && (
        <Section>
          {running ? <Notice text={t('collection.wizard.runningNotice')} /> : null}
          {form.items.map((item, i) => {
            const label = t('collection.wizard.itemLabel', { n: i + 1 });
            return (
              <View key={item.key} style={[styles.itemRow, { flexDirection: row }]}>
                {photoButton(
                  item.key,
                  item.imageUrl,
                  t(item.imageUrl ? 'collection.wizard.photoChange' : 'collection.wizard.photoAdd', { n: i + 1 }),
                )}
                <Input
                  value={item.label}
                  onChangeText={(label) => dispatch({ type: 'SET_ITEM', key: item.key, patch: { label } })}
                  placeholder={i === 0 ? t('collection.wizard.itemPlaceholder') : label}
                  maxLength={COLLECTION_LIMITS.LABEL_MAX}
                  accessibilityLabel={label}
                  style={styles.flex}
                />
                {canRemove && !item.locked && (
                  <TouchableOpacity
                    onPress={() => dispatch({ type: 'REMOVE_ITEM', key: item.key })}
                    style={styles.remove}
                    accessibilityRole="button"
                    accessibilityLabel={t('collection.wizard.removeItem', { n: i + 1 })}
                  >
                    <X size={20} color={theme.textMuted} strokeWidth={icon.stroke} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          {canAdd ? (
            <Button variant="secondary" icon={Plus} label={t('collection.wizard.addItem')} onPress={() => dispatch({ type: 'ADD_ITEM' })} />
          ) : (
            <Notice text={t('collection.wizard.maxItems', { max: COLLECTION_LIMITS.MAX_ITEMS })} />
          )}
          <HelpText text={t('collection.wizard.photoHint')} />
        </Section>
      )}

      {step === 'gift' && (
        <>
          <Section>
            <FieldLabel text={t('collection.wizard.giftLabel')} />
            <View style={[styles.itemRow, { flexDirection: row }]}>
              {photoButton(
                GIFT_PHOTO,
                form.giftImageUrl,
                t(form.giftImageUrl ? 'collection.wizard.giftPhotoChange' : 'collection.wizard.giftPhotoAdd'),
              )}
              <Input
                value={form.giftLabel}
                onChangeText={(giftLabel) => set({ giftLabel })}
                placeholder={t('collection.wizard.giftPlaceholder')}
                maxLength={COLLECTION_LIMITS.GIFT_MAX}
                accessibilityLabel={t('collection.wizard.giftLabel')}
                style={styles.flex}
              />
            </View>
            <HelpText text={t('collection.wizard.giftHelp')} />
          </Section>
          {gift ? (
            <Section title={t('collection.wizard.previewTitle')}>
              <CollectionSteps
                items={items.map((item, i) => ({ key: `${i}-${item.label}`, ...item }))}
                gift={gift}
                giftImageUrl={form.giftImageUrl}
                giftCaption={t('collection.detail.gift')}
              />
            </Section>
          ) : null}
        </>
      )}

      {step === 'rules' && (
        <>
          <Section title={t('collection.wizard.perVisitTitle')}>
            <OptionCard
              title={t('collection.wizard.perVisitMany.title')}
              description={t('collection.wizard.perVisitMany.desc')}
              selected={!form.onePerVisit}
              onPress={() => set({ onePerVisit: false })}
            />
            <OptionCard
              title={t('collection.wizard.perVisitOne.title')}
              description={t('collection.wizard.perVisitOne.desc')}
              selected={form.onePerVisit}
              onPress={() => set({ onePerVisit: true })}
            />
          </Section>

          <Section title={t('collection.wizard.repeatTitle')}>
            <OptionCard
              title={t('collection.wizard.repeatYes.title')}
              description={t('collection.wizard.repeatYes.desc')}
              selected={form.repeatable}
              onPress={() => set({ repeatable: true })}
            />
            <OptionCard
              title={t('collection.wizard.repeatNo.title')}
              description={t('collection.wizard.repeatNo.desc')}
              selected={!form.repeatable}
              onPress={() => set({ repeatable: false })}
            />
          </Section>

          <Section title={t('collection.wizard.giftWhenTitle')}>
            <OptionCard
              title={t('collection.wizard.giftNow.title')}
              description={t('collection.wizard.giftNow.desc')}
              selected={!form.giftNextDay}
              onPress={() => set({ giftNextDay: false })}
            />
            <OptionCard
              title={t('collection.wizard.giftNext.title')}
              description={t('collection.wizard.giftNext.desc')}
              selected={form.giftNextDay}
              onPress={() => set({ giftNextDay: true })}
            />
            <FieldLabel text={t('collection.wizard.validityTitle')} />
            <ChipRow>
              {COUPON_DAYS_PRESETS.map((days) => (
                <Chip
                  key={days}
                  label={t('collection.wizard.validityDays', { count: days })}
                  selected={form.couponValidityDays === days}
                  onPress={() => set({ couponValidityDays: days })}
                />
              ))}
            </ChipRow>
          </Section>

          <Section title={t('collection.wizard.endTitle')}>
            {form.endsOn ? (
              <>
                <DateField label={t('collection.wizard.endDate')} value={form.endsOn} minYmd={today} onChange={(endsOn) => set({ endsOn })} />
                <Button variant="ghost" label={t('collection.wizard.endClear')} onPress={() => set({ endsOn: '' })} />
              </>
            ) : (
              <>
                <HelpText tone="secondary" text={t('collection.wizard.endNone')} />
                <Button variant="secondary" label={t('collection.wizard.endChoose')} onPress={() => set({ endsOn: today })} />
              </>
            )}
          </Section>
        </>
      )}

      {step === 'review' && (
        <>
          <Section title={t('collection.wizard.nameTitle')}>
            <Input
              value={form.name}
              onChangeText={(name) => set({ name })}
              placeholder={t('collection.wizard.namePlaceholder')}
              maxLength={COLLECTION_LIMITS.NAME_MAX}
              accessibilityLabel={t('collection.wizard.nameTitle')}
            />
            <HelpText text={t('collection.wizard.nameHint')} />
          </Section>
          <Section>
            <ReviewBlock label={stepLabels[0]} onEdit={() => goTo(0)}>
              <ReviewLine strong text={t('collection.wizard.summaryItems', { count: items.length })} />
              {items.map((item, i) => <ReviewLine key={`${i}-${item.label}`} text={`${i + 1}. ${item.label}`} />)}
            </ReviewBlock>
            <ReviewBlock label={stepLabels[1]} onEdit={() => goTo(1)}>
              <ReviewLine strong text={t('collection.wizard.summaryGift', { gift })} />
            </ReviewBlock>
            <ReviewBlock label={stepLabels[2]} onEdit={() => goTo(2)} last>
              {rulesLines.map((line) => <ReviewLine key={line} text={line} />)}
            </ReviewBlock>
          </Section>
        </>
      )}
    </WizardShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  itemRow: { alignItems: 'center', gap: 8 },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 48, height: 48, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoImg: { width: 48, height: 48 },
});
