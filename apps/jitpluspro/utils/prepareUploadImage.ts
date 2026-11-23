import { requireOptionalNativeModule } from 'expo';
import { logWarn } from '@/utils/devLogger';

type Manipulator = typeof import('expo-image-manipulator');

let manipulator: Manipulator | null | undefined;
/**
 * expo-image-manipulator, or null on a binary built before it was added
 * (an OTA update can reach it): importing the JS package there would throw.
 */
function getManipulator(): Manipulator | null {
  if (manipulator === undefined) {
    manipulator = null;
    if (requireOptionalNativeModule('ExpoImageManipulator') != null) {
      try {
        manipulator = require('expo-image-manipulator') as Manipulator;
      } catch {
        // Stays null.
      }
    }
  }
  return manipulator;
}

export interface PickedImage {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string | null;
}

export interface PrepareOptions {
  /** Centre-crop to this ratio (width, height). */
  aspect?: [number, number];
  /** Longest side after resizing, in pixels. */
  maxSide: number;
  /** JPEG quality, 0–1. */
  compress?: number;
}

/**
 * Centre-crops to `aspect` and scales the image down before upload.
 *
 * - iOS ignores the picker's `aspect` (its editor always crops a square), so
 *   covers and card backgrounds are picked uncropped and cut to ratio here.
 * - A 24–48 MP iPhone photo can exceed the 10 MB upload limit even at
 *   quality 0.8; resizing keeps it far below.
 *
 * Falls back to the picked file when the native module is missing or fails,
 * so an upload is never blocked by this step.
 */
export async function prepareUploadImage(
  image: PickedImage,
  { aspect, maxSide, compress = 0.8 }: PrepareOptions,
): Promise<{ uri: string; mimeType?: string | null }> {
  const original = { uri: image.uri, mimeType: image.mimeType };
  const IM = getManipulator();
  const { width, height } = image;
  if (!IM || !width || !height) return original;

  const actions: import('expo-image-manipulator').Action[] = [];
  let w = width;
  let h = height;

  if (aspect) {
    const target = aspect[0] / aspect[1];
    const current = w / h;
    if (Math.abs(current - target) > 0.01) {
      const cropW = current > target ? Math.round(h * target) : w;
      const cropH = current > target ? h : Math.round(w / target);
      actions.push({
        crop: {
          originX: Math.round((w - cropW) / 2),
          originY: Math.round((h - cropH) / 2),
          width: cropW,
          height: cropH,
        },
      });
      w = cropW;
      h = cropH;
    }
  }

  if (Math.max(w, h) > maxSide) {
    actions.push({ resize: w >= h ? { width: maxSide } : { height: maxSide } });
  }

  if (actions.length === 0) return original;

  try {
    const result = await IM.manipulateAsync(image.uri, actions, {
      compress,
      format: IM.SaveFormat.JPEG,
    });
    return { uri: result.uri, mimeType: 'image/jpeg' };
  } catch (err) {
    logWarn('Upload', 'Image preparation failed, uploading the original', err);
    return original;
  }
}
