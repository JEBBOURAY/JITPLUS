import type { ReactNode } from 'react';
import { ImagePlus } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Merchant } from '@/types';
import { GalleryGrid } from '@/components/stores/FicheControls';
import { CountPill, Panel, ProPill } from '@/components/stores/StoreUi';
import { brandColor } from '@/components/stores/brand';
import { useGalleryEditor } from '@/components/stores/useGalleryEditor';

/**
 * Photo gallery panel of the public page (add, remove, reorder; changes apply
 * immediately). Shared by "Ma boutique" › Services and the setup wizard.
 * `caption` receives the plan so each screen picks its own wording.
 */
export function GalleryPanel({ merchant, caption, children }: {
  merchant: Merchant;
  caption: (isPremium: boolean) => string | undefined;
  /** Rendered under the grid, e.g. a Pro-only note. */
  children?: (isPremium: boolean) => ReactNode;
}) {
  const { t } = useLanguage();
  const accent = brandColor(merchant.themeColor);
  const gallery = useGalleryEditor(merchant);

  return (
    <Panel
      Icon={ImagePlus}
      title={t('storePreview.galleryTitle')}
      caption={caption(gallery.isPremium)}
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
      {children?.(gallery.isPremium)}
    </Panel>
  );
}
