import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import PremiumLockModal from '@/components/PremiumLockModal';

/**
 * Entry to the statistics screen, a Pro feature: `openStats` opens it, or
 * shows the upgrade sheet on a free account. Render `lockModal` once in the
 * component that calls `openStats`. The caller passes its own plan status so
 * the gate adds no second plan timer to the screen.
 */
export function useStatsGate(isPremium: boolean) {
  const router = useRouter();
  const [locked, setLocked] = useState(false);
  const close = useCallback(() => setLocked(false), []);

  const openStats = useCallback(() => {
    if (isPremium) router.push('/dashboard');
    else setLocked(true);
  }, [isPremium, router]);

  const lockModal = (
    <PremiumLockModal
      visible={locked}
      onClose={close}
      titleKey="account.dashboardLockedTitle"
      descKey="account.dashboardLockedMsg"
    />
  );

  return { openStats, lockModal };
}
