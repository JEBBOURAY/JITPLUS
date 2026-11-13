import { useEffect, useRef } from 'react';
import { completeOnboarding } from '@/hooks/queries/onboarding';

/**
 * Marks the onboarding as completed on the server as soon as `enabled` is
 * true, once. Used when the merchant's data proves the setup is done without
 * them having finished the wizard (older accounts, wizard skipped).
 */
export function useAutoCompleteOnboarding(enabled: boolean) {
  const fired = useRef(false);
  useEffect(() => {
    if (!enabled || fired.current) return;
    fired.current = true;
    completeOnboarding().catch(() => { fired.current = false; });
  }, [enabled]);
}
