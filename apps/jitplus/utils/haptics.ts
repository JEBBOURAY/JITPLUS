import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/** Re-export style enum for convenience */
export const HapticStyle = Haptics.ImpactFeedbackStyle;

/**
 * Fire a haptic feedback impact — no-op on web.
 * @param style  defaults to `Light`
 */
export function haptic(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light): void {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(style).catch(() => {});
  }
}

/** Very light tick (wheel segments passing the pointer…) — no-op on web. */
export function hapticSelection(): void {
  if (Platform.OS !== 'web') {
    Haptics.selectionAsync().catch(() => {});
  }
}

/** Success notification haptic (card reveal, coupon redeemed…) — no-op on web. */
export function hapticSuccess(): void {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
}
