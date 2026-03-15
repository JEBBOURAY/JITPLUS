import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/** Re-export style enum for convenience */
export const HapticStyle = Haptics.ImpactFeedbackStyle;
export type HapticStyleType = Haptics.ImpactFeedbackStyle;

/**
 * Fire a haptic feedback impact — no-op on web.
 * @param style  defaults to `Light`
 */
export function haptic(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light): void {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(style);
  }
}
