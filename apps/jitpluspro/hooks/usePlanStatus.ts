import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getPlanStatus } from '@/utils/plan';

/** Refresh expiry checks while open and after returning from the background. */
export function usePlanStatus(source: Parameters<typeof getPlanStatus>[0]) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const interval = setInterval(refresh, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);
  return getPlanStatus(source, now);
}
