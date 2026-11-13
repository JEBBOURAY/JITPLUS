import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Award, ImagePlus } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthActions } from '@/contexts/AuthContext';
import { useUpdateMerchantProfile } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { MERCHANT_BADGE_CODES, type Merchant, type MerchantBadge } from '@/types';
import { BadgesChips, GalleryGrid } from '@/components/stores/FicheControls';
import { Panel, CountPill, ProPill, SaveBar, SectionScreen, useDiscardGuard, useToast, haptic } from '@/components/stores/StoreUi';
import { brandColor, sameMembers } from '@/components/stores/brand';
import { useGalleryEditor } from '@/components/stores/useGalleryEditor';

const BADGES_MAX = 8;

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
  const accent = brandColor(merchant.themeColor);
  const gallery = useGalleryEditor(merchant);

  const initialBadges = useMemo(() => savedBadges(merchant), [merchant]);
  const [badges, setBadges] = useState<MerchantBadge[]>(initialBadges);
  const dirty = !sameMembers(badges, initialBadges);
  useDiscardGuard(dirty, update.isPending);

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
        right={gallery.isPremium ? <CountPill value={`${gallery.gallery.length}/${gallery.max}`} /> : <ProPill />}
      >
        <GalleryGrid
          items={gallery.gallery}
          max={gallery.max}
          busyUrl={gallery.busyUrl}
          isUploading={gallery.isUploading}
          isMutationPending={gallery.isMutationPending}
          accent={accent}
          onAddPhotos={gallery.addPhotos}
          onRemove={gallery.removePhoto}
          onMove={gallery.movePhoto}
        />
      </Panel>
    </SectionScreen>
  );
}
