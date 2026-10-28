import { useMutation } from '@tanstack/react-query';
import api from '@/services/api';
import i18n from '@/i18n';
import type { Merchant, MerchantCategory, SocialLinks, OpeningHours } from '@/types';
import { ALLOWED_LOGO_MIMES, MAX_LOGO_SIZE_BYTES } from '@/constants/app';
import { MAX_UPLOAD_SIZE_BYTES, normalizeUploadMimeAndExt, uploadImageNative } from './upload';

export function useUploadMerchantLogo() {
  return useMutation({
    mutationFn: async (asset: { uri: string; mimeType?: string | null; merchantName?: string; fileSize?: number | null }) => {
      const { mime } = normalizeUploadMimeAndExt(asset.uri, asset.mimeType);
      if (!ALLOWED_LOGO_MIMES.has(mime)) {
        throw new Error(i18n.t('upload.unsupportedFileType', { mime }));
      }
      const res = await uploadImageNative({
        uri: asset.uri,
        endpoint: '/merchant/upload-image?type=logo',
        mime,
        maxBytes: MAX_LOGO_SIZE_BYTES,
      });
      return res as { url: string };
    },
  });
}

export function useUploadMerchantCover() {
  return useMutation({
    mutationFn: async (asset: { uri: string; mimeType?: string | null; merchantName?: string; fileSize?: number | null }) => {
      const { mime } = normalizeUploadMimeAndExt(asset.uri, asset.mimeType);
      if (!ALLOWED_LOGO_MIMES.has(mime)) {
        throw new Error(i18n.t('upload.unsupportedFileType', { mime }));
      }
      // Covers are full-frame (16:9) photos, often > 5MB, hence the larger limit.
      const res = await uploadImageNative({
        uri: asset.uri,
        endpoint: '/merchant/upload-image?type=cover',
        mime,
        maxBytes: MAX_UPLOAD_SIZE_BYTES,
      });
      return res as { url: string };
    },
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
    mutationFn: async (asset: { uri: string; mimeType?: string | null; merchantName?: string; fileSize?: number | null }) => {
      const { mime } = normalizeUploadMimeAndExt(asset.uri, asset.mimeType);
      if (!ALLOWED_LOGO_MIMES.has(mime)) {
        throw new Error(i18n.t('upload.unsupportedFileType', { mime }));
      }
      // Gallery photos are picked at full resolution (multi-select, no crop), so they
      // are far larger than the cropped logo/cover.
      const res = await uploadImageNative({
        uri: asset.uri,
        endpoint: '/merchant/upload-image?type=gallery',
        mime,
        maxBytes: MAX_UPLOAD_SIZE_BYTES,
      });
      return res as { url: string; field: string; gallery: string[] };
    },
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
    mutationFn: async (asset: { uri: string; mimeType?: string | null; fileSize?: number | null }) => {
      const { mime } = normalizeUploadMimeAndExt(asset.uri, asset.mimeType);
      if (!ALLOWED_LOGO_MIMES.has(mime)) {
        throw new Error(i18n.t('upload.unsupportedFileType', { mime }));
      }
      const res = await uploadImageNative({
        uri: asset.uri,
        endpoint: '/merchant/upload-image?type=reward',
        mime,
        maxBytes: MAX_UPLOAD_SIZE_BYTES,
      });
      return res as { url: string };
    },
  });
}

export function useUploadMerchantCardBackground() {
  return useMutation({
    mutationFn: async (asset: { uri: string; mimeType?: string | null; fileSize?: number | null }) => {
      const { mime } = normalizeUploadMimeAndExt(asset.uri, asset.mimeType);
      if (!ALLOWED_LOGO_MIMES.has(mime)) {
        throw new Error(i18n.t('upload.unsupportedFileType', { mime }));
      }
      const res = await uploadImageNative({
        uri: asset.uri,
        endpoint: '/merchant/upload-image?type=cardBackground',
        mime,
        maxBytes: MAX_UPLOAD_SIZE_BYTES,
      });
      return res as { url: string };
    },
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
