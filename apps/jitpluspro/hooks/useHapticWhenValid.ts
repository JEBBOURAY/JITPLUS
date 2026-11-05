import { useEffect, useRef } from 'react';
import { hapticLight } from '@/utils/haptics';

/**
 * Light haptic when `valid` goes from false to true: not on mount, not on every
 * render, and not while `mutedRef` is set (e.g. a saved draft filling the form).
 */
export function useHapticWhenValid(valid: boolean, mutedRef?: { current: boolean }) {
  const prev = useRef(valid);
  useEffect(() => {
    if (valid && !prev.current && !mutedRef?.current) hapticLight();
    prev.current = valid;
  }, [valid, mutedRef]);
}
