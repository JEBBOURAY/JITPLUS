import { ImagePlus } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { GalleryGrid } from '@/components/stores/FicheControls';
import { CountPill, Panel, ProPill } from '@/components/stores/StoreUi';
import { brandColor } from '@/components/stores/brand';
import { useGalleryEditor } from '@/components/stores/useGalleryEditor';
import { Note } from '@/components/setup/SetupUi';
import type { StepProps } from '@/components/setup/stepProps';

/** Photo gallery of the public page. Photos apply immediately; nothing to save on "Continuer". */
export function GalleryStep({ merchant }: Pick<StepProps, 'merchant'>) {
  const { t } = useLanguage();
  const accent = brandColor(merchant.themeColor);
  const gallery = useGalleryEditor(merchant);

  return (
    <Panel
      Icon={ImagePlus}
      title={t('storePreview.galleryTitle')}
      caption={gallery.isPremium ? t('setup.gallery.caption') : undefined}
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
      {gallery.isPremium ? null : <Note>{t('storePreview.galleryProOnly')}</Note>}
    </Panel>
  );
}
