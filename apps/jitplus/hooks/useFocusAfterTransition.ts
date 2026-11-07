import { useEffect, type RefObject } from 'react';
import type { TextInput } from 'react-native';
import { useNavigation } from 'expo-router';
import type { NativeStackNavigationProp } from 'expo-router/native-stack';

/**
 * Focuses `ref` once the screen's enter animation has finished. `autoFocus`
 * opens the keyboard mid-slide, so the keyboard animation, the keyboard
 * avoiding resize and the screen transition all compete for the same frames.
 */
export function useFocusAfterTransition(ref: RefObject<TextInput | null>): void {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();

  useEffect(
    () => navigation.addListener('transitionEnd', (e) => {
      if (!e.data.closing) ref.current?.focus();
    }),
    [navigation, ref],
  );
}
