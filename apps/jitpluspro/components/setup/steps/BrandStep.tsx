import { StyleSheet, View } from 'react-native';
import { Camera } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { Panel } from '@/components/stores/StoreUi';
import { BrandPhotosEditor } from '@/components/stores/BrandPhotosEditor';
import { DonePill } from '@/components/setup/SetupUi';
import type { StepProps } from '@/components/setup/stepProps';

/** Logo and cover photo. Uploads apply immediately, so there is nothing to save on "Continuer". */
export function BrandStep({ merchant }: Pick<StepProps, 'merchant'>) {
  const { t } = useLanguage();
  const dir = useDir();

  return (
    <Panel Icon={Camera} title={t('storesHub.photosTitle')} caption={t('setup.brand.caption')}>
      <BrandPhotosEditor merchant={merchant} />
      <View style={[styles.status, { flexDirection: dir.row }]}>
        <DonePill done={!!merchant.logoUrl} doneLabel={t('setup.brand.logoDone')} todoLabel={t('setup.brand.logoTodo')} />
        <DonePill done={!!merchant.coverUrl} doneLabel={t('setup.brand.coverDone')} todoLabel={t('setup.brand.coverTodo')} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  status: { gap: 8, marginTop: 14, flexWrap: 'wrap' },
});
