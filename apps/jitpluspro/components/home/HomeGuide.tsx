import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import JitPlusGuideSheet from '@/components/home/JitPlusGuideSheet';
import ClientShareSheet from '@/components/home/ClientShareSheet';
import { useGuideSheetStore } from '@/components/home/guideSheetStore';
import { useGuideProgress, type GuideStepId } from '@/components/home/useGuideProgress';
import { useAfterSheetClosed } from '@/components/home/useAfterSheetClosed';
import { useAutoCompleteOnboarding } from '@/components/setup/useAutoCompleteOnboarding';
import { useAuthStore } from '@/stores/authStore';

/**
 * The "Guide de départ" step guide of Accueil, opened by its tool card through
 * `useGuideSheetStore`. Owns the guide progress: it feeds the sheet and the
 * tool card, and marks the onboarding as completed once every step is done.
 */
function HomeGuide() {
  const router = useRouter();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  // False only for an owner whose profile says the onboarding is not finished.
  const onboardingDone = useAuthStore((s) => s.merchant?.onboardingCompleted ?? true);
  const visible = useGuideSheetStore((s) => s.visible);
  const close = useGuideSheetStore((s) => s.close);
  // An owner's progress is tracked even with the sheet closed, for the auto-completion below.
  const progress = useGuideProgress(visible || !isTeamMember);
  // Everything the guide checks is in place: the merchant is set up even if
  // they never reached the wizard's last page (or signed up before it existed).
  useAutoCompleteOnboarding(!isTeamMember && !onboardingDone && progress.ready && progress.allDone);

  // The Accueil tool card shows what is left. Owners only: a team member's
  // steps are not tracked while the sheet is closed.
  const setProgress = useGuideSheetStore((s) => s.setProgress);
  const published = !isTeamMember && progress.ready;
  const { doneCount, total } = progress;
  useEffect(() => {
    setProgress(published ? { done: doneCount, total } : null);
  }, [setProgress, published, doneCount, total]);

  const [shareVisible, setShareVisible] = useState(false);
  const closeShare = useCallback(() => setShareVisible(false), []);
  const afterSheetClosed = useAfterSheetClosed();

  const handleStep = useCallback((id: GuideStepId) => {
    close();
    switch (id) {
      case 'program':
        router.push('/settings');
        break;
      case 'logo':
        router.push('/account');
        break;
      case 'shop':
        router.push({ pathname: '/store-section', params: { section: 'appearance' } });
        break;
      case 'invite':
        afterSheetClosed(() => setShareVisible(true));
        break;
      case 'scan':
      case 'reward':
        router.push('/scan-qr');
        break;
      case 'message':
        router.push('/messages');
        break;
    }
  }, [router, close, afterSheetClosed]);

  const handleDemos = useCallback(() => {
    close();
    router.push('/demo-videos');
  }, [close, router]);

  // The page-by-page wizard is otherwise only opened right after sign-up.
  const handleResumeSetup = useCallback(() => {
    close();
    router.push('/setup');
  }, [close, router]);

  return (
    <>
      <JitPlusGuideSheet
        visible={visible}
        progress={progress}
        onClose={close}
        onStepAction={handleStep}
        onOpenDemos={handleDemos}
        onResumeSetup={!isTeamMember && !onboardingDone ? handleResumeSetup : undefined}
      />
      <ClientShareSheet visible={shareVisible} onClose={closeShare} />
    </>
  );
}

export default React.memo(HomeGuide);
