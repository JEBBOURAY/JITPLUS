import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Android Back closes what is open on this screen (search, sheet, card, a
 * sub-view) instead of leaving the screen. Only while the screen is focused:
 * a screen pushed on top keeps its own Back press.
 */
export function useCloseOnBack(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);

  useFocusEffect(useCallback(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRef.current();
      return true;
    });
    return () => sub.remove();
  }, [open]));
}
