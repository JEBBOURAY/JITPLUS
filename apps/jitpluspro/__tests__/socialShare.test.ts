import { Platform, TurboModuleRegistry } from 'react-native';
import Share from 'react-native-share';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library/legacy';
import {
  SHARE_TARGETS,
  getInstalledShareTargets,
  prepareShareFile,
  saveToGallery,
  shareToTarget,
  shareViaSystemSheet,
  targetsForFormat,
} from '@/utils/socialShare';
import { META_APP_ID } from '@/constants/app';

jest.mock('react-native-share', () => ({
  __esModule: true,
  default: {
    Social: {
      INSTAGRAM_STORIES: 'instagramstories',
      FACEBOOK_STORIES: 'facebookstories',
      INSTAGRAM: 'instagram',
      FACEBOOK: 'facebook',
      WHATSAPP: 'whatsapp',
      WHATSAPPBUSINESS: 'whatsappbusiness',
      TELEGRAM: 'telegram',
      TWITTER: 'twitter',
    },
    shareSingle: jest.fn().mockResolvedValue({ success: true }),
    open: jest.fn().mockResolvedValue({ success: true }),
    isPackageInstalled: jest.fn(),
  },
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn(() => ({})) }));
jest.mock('expo-media-library/legacy', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

// The native module is present in the binary (the util probes it before requiring).
jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue({} as never);

const share = Share as jest.Mocked<typeof Share>;
const originalOS = Platform.OS;

afterEach(() => {
  jest.clearAllMocks();
  Platform.OS = originalOS;
});

describe('socialShare', () => {
  it('offers stories for the story format and feeds for the post format, in a fixed order', () => {
    const all = SHARE_TARGETS.map((t) => t.id);
    expect(targetsForFormat(all, 'story')).toEqual(['instagramStory', 'facebookStory', 'whatsapp', 'whatsappBusiness']);
    expect(targetsForFormat(all, 'post')).toEqual(['instagram', 'facebook', 'whatsapp', 'whatsappBusiness', 'telegram', 'x']);
    expect(targetsForFormat(['x', 'instagramStory'], 'post')).toEqual(['x']);
  });

  it('only lists the networks installed on an Android phone', async () => {
    Platform.OS = 'android';
    (share.isPackageInstalled as jest.Mock).mockImplementation(async (pkg: string) => ({
      isInstalled: pkg === 'com.instagram.android' || pkg === 'com.whatsapp',
      message: '',
    }));
    expect(await getInstalledShareTargets()).toEqual(['instagramStory', 'instagram', 'whatsapp']);
  });

  it('sends a story with the Meta app id, and a message with its caption', async () => {
    await shareToTarget('instagramStory', 'file:///cache/a.png', 'caption');
    expect(share.shareSingle).toHaveBeenCalledWith({ social: 'instagramstories', appId: META_APP_ID, backgroundImage: 'file:///cache/a.png' });

    await shareToTarget('whatsapp', 'file:///cache/a.png', 'caption');
    expect(share.shareSingle).toHaveBeenLastCalledWith({ social: 'whatsapp', url: 'file:///cache/a.png', type: 'image/png', message: 'caption' });
  });

  it('shares several visuals in one sheet, and a single one through expo-sharing', async () => {
    expect(await shareViaSystemSheet(['a', 'b'], 'title')).toBe(true);
    expect(share.open).toHaveBeenCalledWith(expect.objectContaining({ urls: ['a', 'b'] }));
    expect(Sharing.shareAsync).not.toHaveBeenCalled();

    expect(await shareViaSystemSheet(['a'], 'title')).toBe(true);
    expect(Sharing.shareAsync).toHaveBeenCalledWith('a', { mimeType: 'image/png', dialogTitle: 'title' });
  });

  it('copies the capture into the app cache under a readable name', async () => {
    expect(await prepareShareFile('file:///external/tmp123.png', 'jitplus-story-1.png')).toBe('file:///cache/jitplus-story-1.png');
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: 'file:///external/tmp123.png', to: 'file:///cache/jitplus-story-1.png' });
  });

  it('saves the visuals to the gallery in order, with the add-only permission', async () => {
    await expect(saveToGallery(['file:///a.png', 'file:///b.png'])).resolves.toBe(true);
    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true);
    expect((MediaLibrary.saveToLibraryAsync as jest.Mock).mock.calls).toEqual([['file:///a.png'], ['file:///b.png']]);
  });

  it('saves nothing when the gallery permission is refused', async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
    await expect(saveToGallery(['file:///a.png'])).resolves.toBe(false);
    expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled();
  });
});
