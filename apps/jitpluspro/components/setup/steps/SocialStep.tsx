import { useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthActions } from '@/contexts/AuthContext';
import { useUpdateMerchantProfile } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { hapticSuccess } from '@/utils/haptics';
import { Panel } from '@/components/stores/StoreUi';
import { SocialLinksFields } from '@/components/stores/SocialLinksFields';
import { useSocialDraft } from '@/components/stores/useSocialDraft';
import type { StepProps } from '@/components/setup/stepProps';

/** WhatsApp, Instagram and the other brand links, same fields as "Ma boutique". Saved on "Continuer". */
export function SocialStep({ merchant, registerSave }: StepProps) {
  const { t } = useLanguage();
  const { updateMerchant } = useAuthActions();
  const update = useUpdateMerchantProfile();
  const social = useSocialDraft(merchant.socialLinks);
  const { dirty, invalid, toLinks, reset } = social;

  const save = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    if (invalid.length > 0) {
      Alert.alert(t('common.error'), t('storesHub.socialInvalid'));
      return false;
    }
    try {
      const updated = await update.mutateAsync({ socialLinks: toLinks() });
      updateMerchant(updated);
      reset(updated.socialLinks);
      hapticSuccess();
      return true;
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err));
      return false;
    }
  }, [dirty, invalid.length, toLinks, reset, update, updateMerchant, t]);

  useEffect(() => {
    registerSave(save, dirty);
    return () => registerSave(null);
  }, [save, dirty, registerSave]);

  return (
    <Panel Icon={Share2} title={t('storesHub.socialTitle')} caption={t('setup.social.caption')}>
      <SocialLinksFields draft={social.draft} invalid={social.invalid} onChange={social.setField} />
    </Panel>
  );
}
