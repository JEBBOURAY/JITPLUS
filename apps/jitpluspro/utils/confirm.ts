import { Alert } from 'react-native';

/** Two-button confirmation as a promise: resolves true on confirm, false on cancel. */
export function confirmAsync(title: string, message: string, cancel: string, confirm: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirm, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}
