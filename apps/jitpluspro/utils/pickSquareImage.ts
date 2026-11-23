import { prepareUploadImage } from '@/utils/prepareUploadImage';

/**
 * Lets the merchant pick a photo, cropped square and resized for upload.
 * Resolves to null when the picker is cancelled.
 *
 * No media-library permission: the system picker needs none, and a refusal
 * used to block images for good on iOS.
 */
export async function pickSquareImage(): Promise<{ uri: string; mimeType?: string | null } | null> {
  const ImagePicker = await import('expo-image-picker');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return prepareUploadImage(result.assets[0], { aspect: [1, 1], maxSide: 1200 });
}
