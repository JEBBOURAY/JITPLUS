import { memo, useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Instagram, Music2, Facebook, Youtube, Ghost, type LucideIcon } from 'lucide-react-native';
import { getSocialProfiles, type SocialNetwork } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { haptic } from '@/utils/haptics';
import { openFirst } from '@jitplus/shared/src/openLinks';
import { wp, ms } from '@/utils/responsive';
import type { Merchant } from '@/types';

const NETWORK_UI: Record<SocialNetwork, { Icon: LucideIcon; labelKey: string }> = {
  instagram: { Icon: Instagram, labelKey: 'merchant.openInstagram' },
  tiktok: { Icon: Music2, labelKey: 'merchant.openTiktok' },
  facebook: { Icon: Facebook, labelKey: 'merchant.openFacebook' },
  snapchat: { Icon: Ghost, labelKey: 'merchant.openSnapchat' },
  youtube: { Icon: Youtube, labelKey: 'merchant.openYoutube' },
};

export function useSocialProfiles(merchant: Merchant) {
  return useMemo(() => getSocialProfiles(merchant.socialLinks), [merchant.socialLinks]);
}

/** Social profiles. WhatsApp, website and e-mail live in the quick actions. */
function MerchantSocialLinks({ profiles }: { profiles: ReturnType<typeof getSocialProfiles> }) {
  const { t } = useLanguage();
  const theme = useTheme();
  if (profiles.length === 0) return null;
  return (
    <View style={styles.row}>
      {profiles.map(({ network, handle, urls }) => {
        const { Icon, labelKey } = NETWORK_UI[network];
        return (
          <Pressable
            key={network}
            onPress={() => { haptic(); void openFirst(urls); }}
            style={({ pressed }) => [styles.button, { borderColor: theme.border, backgroundColor: pressed ? theme.bgInput : theme.bg }]}
            accessibilityRole="link"
            accessibilityLabel={`${t(labelKey)} @${handle}`}
          >
            <Icon size={ms(20)} color={theme.text} strokeWidth={1.8} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(10) },
  button: { width: ms(44), height: ms(44), borderRadius: ms(22), borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

export default memo(MerchantSocialLinks);
