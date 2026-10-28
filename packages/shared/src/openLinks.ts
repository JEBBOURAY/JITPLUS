/**
 * Opening merchant links (profiles, maps, phone, mail) from the apps.
 * React Native only — import by path, never from the package index:
 *   import { openFirst } from '@jitplus/shared/src/openLinks';
 */
import { Linking, Platform } from 'react-native';

/** Opens the first URL the device can handle (native app first, web fallback next). */
export async function openFirst(urls: readonly string[]): Promise<boolean> {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch { /* try the next url */ }
  }
  return false;
}

export function openDirections(latitude: number, longitude: number, label: string): Promise<boolean> {
  const name = encodeURIComponent(label);
  const native = Platform.select({
    ios: `maps:0,0?q=${name}@${latitude},${longitude}`,
    default: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${name})`,
  });
  return openFirst([native, `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`]);
}
