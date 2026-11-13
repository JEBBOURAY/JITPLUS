import { StyleSheet, View } from 'react-native';
import { Instagram, Music2, Facebook, Ghost, Youtube, MessageCircle, Globe, type LucideIcon } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { TextField } from '@/components/stores/StoreUi';
import { SOCIAL_KEYS, type SocialKey } from '@/components/stores/brand';
import type { SocialDraft } from '@/components/stores/useSocialDraft';

const NETWORK_UI: Record<SocialKey, { Icon: LucideIcon; color: string; label: string; placeholder: string; keyboard?: 'phone-pad' | 'url' }> = {
  whatsapp: { Icon: MessageCircle, color: '#25D366', label: 'WhatsApp', placeholder: '+212 6 12 34 56 78', keyboard: 'phone-pad' },
  instagram: { Icon: Instagram, color: '#E1306C', label: 'Instagram', placeholder: '@maboutique' },
  tiktok: { Icon: Music2, color: '#111827', label: 'TikTok', placeholder: '@maboutique' },
  facebook: { Icon: Facebook, color: '#1877F2', label: 'Facebook', placeholder: 'maboutique' },
  snapchat: { Icon: Ghost, color: '#C9A400', label: 'Snapchat', placeholder: 'maboutique' },
  youtube: { Icon: Youtube, color: '#FF0000', label: 'YouTube', placeholder: '@maboutique' },
  website: { Icon: Globe, color: '#7C3AED', label: '', placeholder: 'https://maboutique.ma', keyboard: 'url' },
};

/** One text field per network, with the validation error of a filled field. */
export function SocialLinksFields({ draft, invalid, onChange }: {
  draft: SocialDraft;
  invalid: readonly SocialKey[];
  onChange: (key: SocialKey, value: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <View style={styles.fields}>
      {SOCIAL_KEYS.map((key) => {
        const { Icon, color, label, placeholder, keyboard } = NETWORK_UI[key];
        const showError = invalid.includes(key) && draft[key].trim().length > 0;
        return (
          <TextField
            key={key}
            label={key === 'website' ? t('stores.websiteLabel') : label}
            Icon={Icon}
            iconColor={draft[key].trim() ? color : undefined}
            value={draft[key]}
            onChangeText={(v) => onChange(key, v)}
            placeholder={placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={keyboard ?? 'default'}
            maxLength={200}
            error={showError ? t(key === 'whatsapp' ? 'storesHub.whatsappInvalid' : key === 'website' ? 'stores.invalidWebsite' : 'storesHub.handleInvalid') : null}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 14 },
});
