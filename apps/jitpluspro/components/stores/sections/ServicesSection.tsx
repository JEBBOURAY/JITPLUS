import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Award, ImagePlus } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useAuthActions } from '@/contexts/AuthContext';
import { useUpdateMerchantProfile, useUploadMerchantGalleryImage } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { MERCHANT_BADGE_CODES, type Merchant, type MerchantBadge } from '@/types';
import { BadgesChips, GalleryGrid } from '@/components/stores/FicheControls';
import { Panel, CountPill, ProPill, SaveBar, SectionScreen, useDiscardGuard, useToast, haptic } from '@/components/stores/StoreUi';
import { brandColor, sameMembers } from '@/components/stores/brand';

const BADGES_MAX = 8;
const GALLERY_MAX = 5;

function savedBadges(m: Merchant): MerchantBadge[] {
  return (m.badges ?? []).filter((b): b is MerchantBadge => (MERCHANT_BADGE_CODES as readonly string[]).includes(b));
}

/**
 * Services (badges) and photo gallery. Badges are saved with the Save
 * button; gallery changes apply immediately, like any photo upload.
 */
export default function ServicesSection({ merchant }: { merchant: Merchant }) {
  const { t } = useLanguage();
  const { updateMerchant } = useAuthActions();
  const toast = useToast();
  const update = useUpdateMerchantProfile();
  const uploadGalleryImage = useUploadMerchantGalleryImage();
  const accent = brandColor(merchant.themeColor);
  const { isPremium } = usePlanStatus(merchant);

  const initialBadges = useMemo(() => savedBadges(merchant), [merchant]);
  const [badges, setBadges] = useState<MerchantBadge[]>(initialBadges);
  const dirty = !sameMembers(badges, initialBadges);
  useDiscardGuard(dirty, update.isPending);

  const gallery = useMemo(() => merchant.gallery ?? [], [merchant.gallery]);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);

  const toggleBadge = useCallback((code: MerchantBadge) => {
    haptic();
    setBadges((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      return prev.length >= BADGES_MAX ? prev : [...prev, code];
    });
  }, []);

  const showToast = toast.show;
  const saveBadges = useCallback(async () => {
    try {
      updateMerchant(await update.mutateAsync({ badges }));
      haptic();
      showToast(t('storePreview.savedToast'));
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err));
    }
  }, [badges, update, updateMerchant, showToast, t]);

  // The gallery is applied optimistically; the previous order is restored on failure.
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
        const res = await uploadGalleryImage.mutateAsync({ uri: asset.uri, mimeType: asset.mimeType, merchantName: merchant.nom, fileSize: asset.fileSize });
        updateMerchant({ gallery: res.gallery });
      }
      haptic();
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('storePreview.galleryUploadError')));
    }
  }, [uploadGalleryImage, isPremium, gallery.length, merchant.nom, updateMerchant, t]);

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


  return (
    <SectionScreen
      title={t('storesHub.servicesTitle')}
      caption={t('storesHub.servicesCaption')}
      toast={toast.message}
      footer={<SaveBar dirty={dirty} saving={update.isPending && dirty} onSave={saveBadges} />}
    >
      <Panel
        Icon={Award}
        title={t('storePreview.badgesTitle')}
        caption={t('storePreview.badgesHint', { max: BADGES_MAX })}
        right={<CountPill value={`${badges.length}/${BADGES_MAX}`} />}
      >
        <BadgesChips selected={badges} max={BADGES_MAX} accent={accent} onToggle={toggleBadge} />
      </Panel>

      <Panel
        Icon={ImagePlus}
        title={t('storePreview.galleryTitle')}
        caption={t('storePreview.galleryHint')}
        right={isPremium ? <CountPill value={`${gallery.length}/${GALLERY_MAX}`} /> : <ProPill />}
      >
        <GalleryGrid
          items={gallery}
          max={GALLERY_MAX}
          busyUrl={busyUrl}
          isUploading={uploadGalleryImage.isPending}
          isMutationPending={update.isPending}
          accent={accent}
          onAddPhotos={addPhotos}
          onRemove={removePhoto}
          onMove={movePhoto}
        />
      </Panel>
    </SectionScreen>
  );
}
