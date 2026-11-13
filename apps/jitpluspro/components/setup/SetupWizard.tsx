import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCompleteOnboarding } from '@/hooks/useQueryHooks';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import { getErrorMessage } from '@/utils/error';
import { hapticSuccess } from '@/utils/haptics';
import type { Merchant } from '@/types';
import { SetupShell } from '@/components/setup/SetupShell';
import { Button } from '@/components/scratch/ScratchUI';
import { SETUP_STEPS, SKIPPABLE_STEPS, isSetupStep, setupStepKey, type SetupStepId } from '@/components/setup/setupSteps';
import type { SaveHandler } from '@/components/setup/stepProps';
import { BrandStep } from '@/components/setup/steps/BrandStep';
import { CardStep } from '@/components/setup/steps/CardStep';
import { RewardStep } from '@/components/setup/steps/RewardStep';
import { AboutStep } from '@/components/setup/steps/AboutStep';
import { SocialStep } from '@/components/setup/steps/SocialStep';
import { GalleryStep } from '@/components/setup/steps/GalleryStep';
import { DoneStep } from '@/components/setup/steps/DoneStep';

interface Props {
  merchant: Merchant;
  /** Page asked in the URL (`/setup?step=social`); otherwise the saved one, else the first page. */
  initialStep: SetupStepId | null;
}

/**
 * Page-by-page setup opened right after sign-up (and resumable from the
 * Accueil until it is finished): one topic per page, the controls of the
 * matching screen, "Continuer" saves, "Passer" moves on. The last page marks
 * the onboarding as completed on the server.
 */
export default function SetupWizard({ merchant, initialStep }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const storageKey = `${ASYNC_STORAGE_KEYS.SETUP_STEP}:${merchant.id}`;
  const [index, setIndex] = useState<number | null>(initialStep ? SETUP_STEPS.indexOf(initialStep) : null);
  const [busy, setBusy] = useState(false);
  const saveRef = useRef<SaveHandler | null>(null);
  const dirtyRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const complete = useCompleteOnboarding();

  // Resume where the merchant stopped, recap included ("Terminer" forgets the page).
  useEffect(() => {
    if (index !== null) return;
    let alive = true;
    AsyncStorage.getItem(storageKey)
      .then((saved) => {
        if (!alive) return;
        setIndex(isSetupStep(saved) ? SETUP_STEPS.indexOf(saved) : 0);
      })
      .catch(() => { if (alive) setIndex(0); });
    return () => { alive = false; };
  }, [index, storageKey]);

  const registerSave = useCallback((fn: SaveHandler | null, dirty = false) => {
    saveRef.current = fn;
    dirtyRef.current = fn !== null && dirty;
  }, []);

  const goTo = useCallback((i: number) => {
    const next = Math.max(0, Math.min(i, SETUP_STEPS.length - 1));
    saveRef.current = null;
    dirtyRef.current = false;
    setIndex(next);
    AsyncStorage.setItem(storageKey, SETUP_STEPS[next]).catch(() => {});
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [storageKey]);

  const goToStep = useCallback((step: SetupStepId) => goTo(SETUP_STEPS.indexOf(step)), [goTo]);

  const exit = useCallback(() => router.replace('/(tabs)'), [router]);

  const current = index ?? 0;

  /** Saves the page, then moves with `go`; stays on the page when the save fails. */
  const saveThen = useCallback(async (go: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = saveRef.current ? await saveRef.current() : true;
      if (ok) go();
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const next = useCallback(() => saveThen(() => goTo(current + 1)), [saveThen, goTo, current]);

  // Leaving a page without "Continuer" drops what was typed: ask first.
  const leave = useCallback((go: () => void) => {
    // A save is in flight: moving now would be overridden when it resolves.
    if (busy) return;
    if (!dirtyRef.current) {
      go();
      return;
    }
    Alert.alert(t('setup.unsaved.title'), t('setup.unsaved.message'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('setup.unsaved.discard'), style: 'destructive', onPress: go },
      { text: t('common.save'), onPress: () => { void saveThen(go); } },
    ]);
  }, [busy, saveThen, t]);

  const skip = useCallback(() => leave(() => goTo(current + 1)), [leave, goTo, current]);

  const back = useCallback(() => leave(() => {
    if (current > 0) goTo(current - 1);
    else exit();
  }), [leave, current, goTo, exit]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  }, [back]);

  const finish = useCallback(async () => {
    try {
      await complete.mutateAsync();
      hapticSuccess();
      // Forget the resume point. The Accueil plays the intro clip once the
      // onboarding is marked completed (see app/(tabs)/index.tsx).
      await AsyncStorage.removeItem(storageKey).catch(() => {});
      exit();
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('setup.done.error')));
    }
  }, [complete, storageKey, exit, t]);

  if (index === null) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  const step = SETUP_STEPS[index];

  const footer = step === 'done' ? (
    <Button label={t('setup.done.finish')} onPress={() => { void finish(); }} loading={complete.isPending} />
  ) : (
    <Button label={t('setup.continue')} onPress={() => { void next(); }} loading={busy} />
  );

  let body: React.ReactNode;
  switch (step) {
    case 'brand': body = <BrandStep merchant={merchant} />; break;
    case 'card': body = <CardStep merchant={merchant} registerSave={registerSave} />; break;
    case 'reward': body = <RewardStep merchant={merchant} registerSave={registerSave} />; break;
    case 'about': body = <AboutStep merchant={merchant} registerSave={registerSave} />; break;
    case 'social': body = <SocialStep merchant={merchant} registerSave={registerSave} />; break;
    case 'gallery': body = <GalleryStep merchant={merchant} />; break;
    case 'done': body = <DoneStep merchant={merchant} goTo={goToStep} />; break;
  }

  return (
    <SetupShell
      index={index}
      total={SETUP_STEPS.length}
      label={t(setupStepKey(step, 'label'))}
      heading={t(setupStepKey(step, 'title'))}
      hint={t(setupStepKey(step, 'hint'))}
      onBack={back}
      onSkip={SKIPPABLE_STEPS.has(step) ? skip : undefined}
      scrollRef={scrollRef}
      footer={footer}
    >
      {/* Remount the page's local state when the step changes. */}
      <View key={step}>{body}</View>
    </SetupShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
