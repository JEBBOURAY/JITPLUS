import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthActions } from '@/contexts/AuthContext';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useUpdateMerchantProfile, useUploadMerchantGalleryImage } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { haptic } from '@/components/stores/StoreUi';
import type { Merchant } from '@/types';

const GALLERY_MAX = 5;

/**
 * Photo gallery of the public page: add (upload), remove and reorder. Every
 * change applies immediately, like any photo upload; the previous order is
 * restored when a save fails. Shared by "Ma boutique" and the setup wizard.
 */
export function useGalleryEditor(merchant: Merchant) {
  const { t } = useLanguage();
  const { updateMerchant } = useAuthActions();
  const update = useUpdateMerchantProfile();
  const uploadGalleryImage = useUploadMerchantGalleryImage();
  const { isPremium } = usePlanStatus(merchant);

  const gallery = useMemo(() => merchant.gallery ?? [], [merchant.gallery]);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);

  const saveGallery = useCallback(async (next: string[], busy?: string) => {
    const prev = gallery;
    updateMerchant({ gallery: next });
    if (busy) setBusyUrl(busy);
    try {
      await update.mutateAsync({ gallery: next });
      haptic();
    } catch (err) {
      updateMerchant({ gallery: prev });
      Alert.alert(t('common.error'), getErrorMessage(err));
    } finally {
      if (busy) setBusyUrl(null);
    }
  }, [gallery, update, updateMerchant, t]);

  const addPhotos = useCallback(async () => {
    if (uploadGalleryImage.isPending) return;
    if (!isPremium) {
      Alert.alert(t('storePreview.galleryTitle'), t('storePreview.galleryProOnly'));
      return;
    }
    const remaining = GALLERY_MAX - gallery.length;
    if (remaining <= 0) {
      Alert.alert(t('storePreview.galleryTitle'), t('storePreview.galleryMaxReached'));
      return;
    }
    try {
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.8,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets?.length) return;
      for (const asset of result.assets.slice(0, remaining)) {
        // The server appends the photo and returns the whole gallery.
        const res = await uploadGalleryImage.mutateAsync({ uri: asset.uri, mimeType: asset.mimeType });
        updateMerchant({ gallery: res.gallery });
      }
      haptic();
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('storePreview.galleryUploadError')));
    }
  }, [uploadGalleryImage, isPremium, gallery.length, updateMerchant, t]);

  const removePhoto = useCallback((url: string) => {
    Alert.alert(t('storePreview.galleryDeleteTitle'), t('storePreview.galleryDeleteMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => saveGallery(gallery.filter((u) => u !== url), url) },
    ]);
  }, [gallery, saveGallery, t]);

  const movePhoto = useCallback((from: number, to: number) => {
    if (to < 0 || to >= gallery.length || from === to) return;
    const next = [...gallery];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    saveGallery(next);
  }, [gallery, saveGallery]);

  return {
    gallery,
    max: GALLERY_MAX,
    busyUrl,
    isUploading: uploadGalleryImage.isPending,
    isMutationPending: update.isPending,
    isPremium,
    addPhotos,
    removePhoto,
    movePhoto,
  };
}
