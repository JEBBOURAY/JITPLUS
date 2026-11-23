import { useLanguage } from '@/contexts/LanguageContext';
import { GalleryPanel } from '@/components/stores/GalleryPanel';
import { Note } from '@/components/setup/SetupUi';
import type { StepProps } from '@/components/setup/stepProps';

/** Photo gallery of the public page. Photos apply immediately; nothing to save on "Continuer". */
export function GalleryStep({ merchant }: Pick<StepProps, 'merchant'>) {
  const { t } = useLanguage();
  return (
    <GalleryPanel merchant={merchant} caption={(isPremium) => (isPremium ? t('setup.gallery.caption') : undefined)}>
      {(isPremium) => (isPremium ? null : <Note>{t('storePreview.galleryProOnly')}</Note>)}
    </GalleryPanel>
  );
}
