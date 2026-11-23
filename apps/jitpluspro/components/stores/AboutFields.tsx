import { StyleSheet, View } from 'react-native';
import { Quote } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import type { MerchantProfilePayload } from '@/hooks/useQueryHooks';
import type { Merchant } from '@/types';
import { TextField } from '@/components/stores/StoreUi';

const TAGLINE_MAX = 120;
const DESCRIPTION_MAX = 1000;

/** Tagline and description fields that changed against the saved merchant (trimmed; empty tagline clears it). */
export function aboutChanges(
  merchant: Pick<Merchant, 'tagline' | 'description'>,
  tagline: string,
  description: string,
): Pick<MerchantProfilePayload, 'tagline' | 'description'> {
  const out: Pick<MerchantProfilePayload, 'tagline' | 'description'> = {};
  if (tagline.trim() !== (merchant.tagline ?? '').trim()) out.tagline = tagline.trim() || null;
  if (description.trim() !== (merchant.description ?? '').trim()) out.description = description.trim();
  return out;
}

/** Tagline + description inputs of the public page. Shared by the shop editor and the setup wizard. */
export function AboutFields({
  tagline, onChangeTagline, description, onChangeDescription, descriptionPlaceholder, descriptionHint,
}: {
  tagline: string;
  onChangeTagline: (v: string) => void;
  description: string;
  onChangeDescription: (v: string) => void;
  descriptionPlaceholder: string;
  descriptionHint: string;
}) {
  const { t } = useLanguage();
  return (
    <View style={styles.fields}>
      <TextField
        label={t('storePreview.taglineTitle')}
        Icon={Quote}
        value={tagline}
        onChangeText={onChangeTagline}
        maxLength={TAGLINE_MAX}
        placeholder={t('storePreview.taglinePlaceholder')}
        counter
        hint={t('storePreview.taglineHint')}
      />
      <TextField
        label={t('storesHub.descriptionLabel')}
        value={description}
        onChangeText={onChangeDescription}
        maxLength={DESCRIPTION_MAX}
        placeholder={descriptionPlaceholder}
        multiline
        counter
        hint={descriptionHint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 16 },
});
