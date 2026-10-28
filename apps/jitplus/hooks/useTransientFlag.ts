import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Boolean that turns itself off `durationMs` after each `trigger()` (e.g. a
 * "Copied" badge). The pending timer is cleared on unmount and on re-trigger.
 */
export function useTransientFlag(durationMs = 2000): [boolean, () => void] {
  const [flag, setFlag] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const trigger = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFlag(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setFlag(false);
    }, durationMs);
  }, [durationMs]);

  return [flag, trigger];
}
