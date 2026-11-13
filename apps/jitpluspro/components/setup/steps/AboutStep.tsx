import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { AlignLeft, Quote } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthActions } from '@/contexts/AuthContext';
import { useUpdateMerchantProfile } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { hapticSuccess } from '@/utils/haptics';
import { Panel, TextField } from '@/components/stores/StoreUi';
import type { StepProps } from '@/components/setup/stepProps';

const TAGLINE_MAX = 120;
const DESCRIPTION_MAX = 1000;

/** Tagline and description shown on the public page in the JitPlus app. */
export function AboutStep({ merchant, registerSave }: StepProps) {
  const { t } = useLanguage();
  const { updateMerchant } = useAuthActions();
  const update = useUpdateMerchantProfile();
  const [tagline, setTagline] = useState(merchant.tagline ?? '');
  const [description, setDescription] = useState(merchant.description ?? '');

  const dirty = tagline.trim() !== (merchant.tagline ?? '').trim()
    || description.trim() !== (merchant.description ?? '').trim();

  const save = useCallback(async (): Promise<boolean> => {
    const payload: { tagline?: string | null; description?: string } = {};
    if (tagline.trim() !== (merchant.tagline ?? '').trim()) payload.tagline = tagline.trim() || null;
    if (description.trim() !== (merchant.description ?? '').trim()) payload.description = description.trim();
    if (Object.keys(payload).length === 0) return true;
    try {
      updateMerchant(await update.mutateAsync(payload));
      hapticSuccess();
      return true;
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err));
      return false;
    }
  }, [tagline, description, merchant.tagline, merchant.description, update, updateMerchant, t]);

  useEffect(() => {
    registerSave(save, dirty);
    return () => registerSave(null);
  }, [save, dirty, registerSave]);

  return (
    <Panel Icon={AlignLeft} title={t('storesHub.descriptionTitle')}>
      <View style={styles.fields}>
        <TextField
          label={t('storePreview.taglineTitle')}
          Icon={Quote}
          value={tagline}
          onChangeText={setTagline}
          maxLength={TAGLINE_MAX}
          placeholder={t('storePreview.taglinePlaceholder')}
          counter
          hint={t('storePreview.taglineHint')}
        />
        <TextField
          label={t('storesHub.descriptionLabel')}
          value={description}
          onChangeText={setDescription}
          maxLength={DESCRIPTION_MAX}
          placeholder={t('setup.about.placeholder')}
          multiline
          counter
          hint={t('setup.about.note')}
        />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 16 },
});
