import { useCallback, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/** Scroll offset past which the screen header shows its "scrolled" border. */
const SCROLLED_THRESHOLD = 4;

/**
 * State for ScreenHeader's `isScrolled`: true once the list has left the top.
 * Re-renders only when the flag flips, not on every scroll event.
 */
export function useScrolledHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrolled = e.nativeEvent.contentOffset.y > SCROLLED_THRESHOLD;
    setIsScrolled((prev) => (prev === scrolled ? prev : scrolled));
  }, []);
  return { isScrolled, onScroll };
}
