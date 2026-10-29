import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

function feedback(run: () => Promise<void>): void {
  if (Platform.OS === 'web') return;
  try {
    // Feedback is optional on devices without a haptic engine.
    void run().catch(() => undefined);
  } catch {
    // Some native implementations throw before returning a promise.
  }
}

export function safeImpact(style: Haptics.ImpactFeedbackStyle): void {
  feedback(() => Haptics.impactAsync(style));
}

export function safeNotification(type: Haptics.NotificationFeedbackType): void {
  feedback(() => Haptics.notificationAsync(type));
}

export function safeSelection(): void {
  feedback(() => Haptics.selectionAsync());
}

export const hapticLight = () => safeImpact(Haptics.ImpactFeedbackStyle.Light);
export const hapticSuccess = () => safeNotification(Haptics.NotificationFeedbackType.Success);
