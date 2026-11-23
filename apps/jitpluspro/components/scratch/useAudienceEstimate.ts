import { useEffect, useState } from 'react';
import type { ScratchAudienceType } from '@jitplus/shared/src/scratch';
import { useScratchAudienceEstimate } from '@/hooks/useScratchHooks';

const DEBOUNCE_MS = 400;

/**
 * How many clients the chosen audience reaches. Waits until the merchant stops
 * typing the threshold, and skips a threshold that is empty or zero.
 */
export function useAudienceEstimate(type: ScratchAudienceType, rawValue: string, enabled: boolean) {
  const value = type === 'ALL_CLIENTS' ? null : parseInt(rawValue, 10) || null;
  const [debounced, setDebounced] = useState<{ type: ScratchAudienceType; value: number | null }>({ type, value });
  useEffect(() => {
    const timer = setTimeout(() => setDebounced({ type, value }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [type, value]);
  const valid = debounced.type === 'ALL_CLIENTS' || (debounced.value != null && debounced.value >= 1);
  return useScratchAudienceEstimate(debounced.type, debounced.value, enabled && valid);
}
