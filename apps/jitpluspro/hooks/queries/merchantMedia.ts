import { useMutation } from '@tanstack/react-query';
import api from '@/services/api';
import i18n from '@/i18n';
import type { Merchant, MerchantCategory, SocialLinks, OpeningHours } from '@/types';
import { ALLOWED_LOGO_MIMES, MAX_LOGO_SIZE_BYTES } from '@/constants/app';
import { MAX_UPLOAD_SIZE_BYTES, normalizeUploadMimeAndExt, uploadImageNative } from './upload';

interface ImageAsset {
  uri: string;
  mimeType?: string | null;
  merchantName?: string;
  fileSize?: number | null;
}

type MerchantImageType = 'logo' | 'cover' | 'gallery' | 'reward' | 'cardBackground';

/** Validates the MIME type, then uploads to POST /merchant/upload-image?type=… */
async function uploadMerchantImage(asset: ImageAsset, type: MerchantImageType, maxBytes: number) {
  const { mime } = normalizeUploadMimeAndExt(asset.uri, asset.mimeType);
  if (!ALLOWED_LOGO_MIMES.has(mime)) {
    throw new Error(i18n.t('upload.unsupportedFileType', { mime }));
  }
  return uploadImageNative({ uri: asset.uri, endpoint: `/merchant/upload-image?type=${type}`, mime, maxBytes });
}

export function useUploadMerchantLogo() {
  return useMutation({
    mutationFn: async (asset: ImageAsset) =>
      (await uploadMerchantImage(asset, 'logo', MAX_LOGO_SIZE_BYTES)) as { url: string },
  });
}

export function useUploadMerchantCover() {
  return useMutation({
    // Covers are full-frame (16:9) photos, often > 5MB, hence the larger limit.
    mutationFn: async (asset: ImageAsset) =>
      (await uploadMerchantImage(asset, 'cover', MAX_UPLOAD_SIZE_BYTES)) as { url: string },
  });
}

export function useDeleteMerchantCover() {
  return useMutation({
    mutationFn: async () => {
      // Backend clears the DB reference AND deletes the stored file (orphan cleanup)
      await api.patch('/merchant/profile', { coverUrl: null });
    },
  });
}

export function useUploadMerchantGalleryImage() {
  return useMutation({
    // Gallery photos are picked at full resolution (multi-select, no crop), so they
    // are far larger than the cropped logo/cover.
    mutationFn: async (asset: ImageAsset) =>
      (await uploadMerchantImage(asset, 'gallery', MAX_UPLOAD_SIZE_BYTES)) as { url: string; field: string; gallery: string[] },
  });
}

export function useDeleteMerchantLogo() {
  return useMutation({
    mutationFn: async () => {
      // Backend clears the DB reference AND deletes the stored file (orphan cleanup)
      await api.patch('/merchant/profile', { logoUrl: null });
    },
  });
}

export function useUploadRewardImage() {
  return useMutation({
    mutationFn: async (asset: ImageAsset) =>
      (await uploadMerchantImage(asset, 'reward', MAX_UPLOAD_SIZE_BYTES)) as { url: string },
  });
}

export function useUploadMerchantCardBackground() {
  return useMutation({
    mutationFn: async (asset: ImageAsset) =>
      (await uploadMerchantImage(asset, 'cardBackground', MAX_UPLOAD_SIZE_BYTES)) as { url: string },
  });
}

export function useDeleteMerchantCardBackground() {
  return useMutation({
    mutationFn: async () => {
      await api.delete('/merchant/card-background');
    },
  });
}

export interface MerchantProfilePayload {
  nom?: string;
  categorie?: MerchantCategory;
  description?: string;
  socialLinks?: SocialLinks;
  themeColor?: string | null;
  themeIcon?: string | null;
  secondaryCategories?: MerchantCategory[];
  tagline?: string | null;
  badges?: string[];
  gallery?: string[];
  openingHours?: OpeningHours | null;
  cardBackgroundUrl?: string | null;
  cardBackgroundColor?: string | null;
  cardTextColor?: 'LIGHT' | 'DARK' | null;
}

/** PATCH /merchant/profile. Resolves with the updated profile. */
export function useUpdateMerchantProfile() {
  return useMutation({
    mutationFn: async (payload: MerchantProfilePayload) => {
      const res = await api.patch('/merchant/profile', payload);
      return res.data as Merchant;
    },
  });
}
