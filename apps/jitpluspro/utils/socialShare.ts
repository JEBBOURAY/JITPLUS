/**
 * Direct sharing of a visual to the social apps installed on the phone:
 * Instagram / Facebook stories, feeds and messengers, without the system sheet.
 */
import { Linking, Platform, TurboModuleRegistry } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { META_APP_ID } from '@/constants/app';

type NativeShare = typeof import('react-native-share').default;
type ShareSingleOptions = import('react-native-share').ShareSingleOptions;
type MediaLibrary = typeof import('expo-media-library/legacy');

export type ShareFormat = 'post' | 'story';

export type ShareTargetId =
  | 'instagramStory'
  | 'facebookStory'
  | 'instagram'
  | 'facebook'
  | 'whatsapp'
  | 'whatsappBusiness'
  | 'telegram'
  | 'x';

/** What happens to the caption: sent with the image, left on the clipboard, or unused. */
export type CaptionMode = 'message' | 'clipboard' | 'none';

interface ShareTarget {
  id: ShareTargetId;
  formats: readonly ShareFormat[];
  /** Android package that receives the image. */
  androidPackage: string;
  /** iOS URL scheme. Without one the target is Android only: iOS has no direct image API for it. */
  iosScheme?: string;
  /** Instagram and Facebook ignore pre-filled captions, so theirs goes to the clipboard. */
  caption: CaptionMode;
}

export const SHARE_TARGETS: readonly ShareTarget[] = [
  { id: 'instagramStory', formats: ['story'], androidPackage: 'com.instagram.android', iosScheme: 'instagram-stories', caption: 'none' },
  { id: 'facebookStory', formats: ['story'], androidPackage: 'com.facebook.katana', iosScheme: 'facebook-stories', caption: 'none' },
  { id: 'instagram', formats: ['post'], androidPackage: 'com.instagram.android', caption: 'clipboard' },
  { id: 'facebook', formats: ['post'], androidPackage: 'com.facebook.katana', caption: 'clipboard' },
  { id: 'whatsapp', formats: ['post', 'story'], androidPackage: 'com.whatsapp', caption: 'message' },
  { id: 'whatsappBusiness', formats: ['post', 'story'], androidPackage: 'com.whatsapp.w4b', caption: 'message' },
  { id: 'telegram', formats: ['post'], androidPackage: 'org.telegram.messenger', caption: 'message' },
  { id: 'x', formats: ['post'], androidPackage: 'com.twitter.android', caption: 'message' },
];

const TARGET_BY_ID = Object.fromEntries(SHARE_TARGETS.map((t) => [t.id, t])) as Record<ShareTargetId, ShareTarget>;

export function captionModeOf(id: ShareTargetId): CaptionMode {
  return TARGET_BY_ID[id].caption;
}

/** The installed targets that take this format, in display order. */
export function targetsForFormat(installed: readonly ShareTargetId[], format: ShareFormat): ShareTargetId[] {
  return SHARE_TARGETS.filter((t) => t.formats.includes(format) && installed.includes(t.id)).map((t) => t.id);
}

let nativeShare: NativeShare | null | undefined;
/**
 * react-native-share, or null on a binary built before it was added (an OTA
 * update running on an older build): requiring it throws there.
 */
function getNativeShare(): NativeShare | null {
  if (nativeShare === undefined) {
    // Probe the native side first: a lazy require that throws is still reported
    // as a fatal error by Metro's module guard, whatever the try/catch below.
    if (TurboModuleRegistry.get('RNShare') == null) {
      nativeShare = null;
      return nativeShare;
    }
    try {
      nativeShare = require('react-native-share').default as NativeShare;
    } catch {
      nativeShare = null;
    }
  }
  return nativeShare;
}

/** True when several visuals can be sent in one go. */
export function canShareMany(): boolean {
  return getNativeShare() !== null;
}

async function isInstalled(share: NativeShare, target: ShareTarget): Promise<boolean> {
  try {
    if (Platform.OS === 'android') return (await share.isPackageInstalled(target.androidPackage)).isInstalled;
    if (Platform.OS === 'ios' && target.iosScheme) return await Linking.canOpenURL(`${target.iosScheme}://`);
  } catch {
    // Not queryable: treated as not installed.
  }
  return false;
}

/** The targets whose app is installed on this phone. */
export async function getInstalledShareTargets(): Promise<ShareTargetId[]> {
  const share = getNativeShare();
  if (!share) return [];
  const flags = await Promise.all(SHARE_TARGETS.map((t) => isInstalled(share, t)));
  return SHARE_TARGETS.filter((_, i) => flags[i]).map((t) => t.id);
}

/**
 * Copies a capture into the app cache under a readable name. On Android the
 * capture may sit in the external cache, which the share file provider cannot serve.
 */
export async function prepareShareFile(uri: string, name: string): Promise<string> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) return uri;
  const dest = `${dir}${name}`;
  if (dest === uri) return uri;
  await FileSystem.deleteAsync(dest, { idempotent: true });
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

/** Opens the target app with the image ready to publish. Throws when the app refuses it. */
export async function shareToTarget(id: ShareTargetId, fileUri: string, caption: string): Promise<void> {
  const share = getNativeShare();
  if (!share) throw new Error('Direct share unavailable');
  const { Social } = share;
  const image = { url: fileUri, type: 'image/png' };
  const story = { appId: META_APP_ID, backgroundImage: fileUri };
  const options: Record<ShareTargetId, Record<string, string>> = {
    instagramStory: { social: Social.INSTAGRAM_STORIES, ...story },
    facebookStory: { social: Social.FACEBOOK_STORIES, ...story },
    instagram: { social: Social.INSTAGRAM, ...image },
    facebook: { social: Social.FACEBOOK, ...image },
    whatsapp: { social: Social.WHATSAPP, ...image, message: caption },
    whatsappBusiness: { social: Social.WHATSAPPBUSINESS, ...image, message: caption },
    telegram: { social: Social.TELEGRAM, ...image, message: caption },
    x: { social: Social.TWITTER, ...image, message: caption },
  };
  // The library types `Social.*` as plain strings, which its own option type rejects.
  await share.shareSingle(options[id] as unknown as ShareSingleOptions);
}

/**
 * System share sheet. Several files go out together when the binary allows it
 * (an Instagram carousel in one go); otherwise only the first one is shared.
 * Returns false when sharing is not available on the device.
 */
export async function shareViaSystemSheet(fileUris: readonly string[], dialogTitle: string): Promise<boolean> {
  const share = getNativeShare();
  if (share && fileUris.length > 1) {
    await share.open({ urls: [...fileUris], type: 'image/png', title: dialogTitle, failOnCancel: false });
    return true;
  }
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(fileUris[0], { mimeType: 'image/png', dialogTitle });
  return true;
}

let mediaLibrary: MediaLibrary | null | undefined;
/** expo-media-library, or null on a binary built before it was added (same probe as above). */
function getMediaLibrary(): MediaLibrary | null {
  if (mediaLibrary === undefined) {
    mediaLibrary = null;
    if (requireOptionalNativeModule('ExpoMediaLibrary') != null) {
      try {
        mediaLibrary = require('expo-media-library/legacy') as MediaLibrary;
      } catch {
        // Stays null.
      }
    }
  }
  return mediaLibrary;
}

/** True when the visuals can be saved to the phone's gallery. */
export function canSaveToGallery(): boolean {
  return getMediaLibrary() !== null;
}

/**
 * Saves the files to the gallery, asking for the add-only permission first.
 * Returns false when the user refuses it.
 */
export async function saveToGallery(fileUris: readonly string[]): Promise<boolean> {
  const library = getMediaLibrary();
  if (!library) throw new Error('Gallery unavailable');
  const { granted } = await library.requestPermissionsAsync(true);
  if (!granted) return false;
  // One after the other: the gallery then keeps the carousel order.
  for (const uri of fileUris) await library.saveToLibraryAsync(uri);
  return true;
}
