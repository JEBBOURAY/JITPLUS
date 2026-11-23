import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { AlignLeft } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthActions } from '@/contexts/AuthContext';
import { useUpdateMerchantProfile } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { hapticSuccess } from '@/utils/haptics';
import { Panel } from '@/components/stores/StoreUi';
import { AboutFields, aboutChanges } from '@/components/stores/AboutFields';
import type { StepProps } from '@/components/setup/stepProps';

/** Tagline and description shown on the public page in the JitPlus app. */
export function AboutStep({ merchant, registerSave }: StepProps) {
  const { t } = useLanguage();
  const { updateMerchant } = useAuthActions();
  const update = useUpdateMerchantProfile();
  const [tagline, setTagline] = useState(merchant.tagline ?? '');
  const [description, setDescription] = useState(merchant.description ?? '');

  const payload = useMemo(
    () => aboutChanges(merchant, tagline, description),
    [merchant, tagline, description],
  );
  const dirty = Object.keys(payload).length > 0;

  const save = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    try {
      updateMerchant(await update.mutateAsync(payload));
      hapticSuccess();
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err));
      return false;
    }
  }, [payload, dirty, update, updateMerchant]);

  useEffect(() => {
    registerSave(save, dirty);
    return () => registerSave(null);
  }, [save, dirty, registerSave]);

  return (
    <Panel Icon={AlignLeft} title={t('storesHub.descriptionTitle')}>
      <AboutFields
        tagline={tagline}
        onChangeTagline={setTagline}
        description={description}
        onChangeDescription={setDescription}
        descriptionPlaceholder={t('setup.about.placeholder')}
        descriptionHint={t('setup.about.note')}
      />
    </Panel>
  );
}
