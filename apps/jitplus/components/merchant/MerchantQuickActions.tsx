import { memo, useMemo } from 'react';
import { ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { Navigation, Phone, MessageCircle, Globe, Mail, type LucideIcon } from 'lucide-react-native';
import { getFicheContacts, type FicheContact } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { openDirections, openFirst } from '@jitplus/shared/src/openLinks';
import type { StoreWithDistance } from '@/utils/merchantStores';
import { wp, hp, ms } from '@/utils/responsive';
import type { Merchant } from '@/types';

const CONTACT_UI: Record<FicheContact['key'], { Icon: LucideIcon; labelKey: string }> = {
  directions: { Icon: Navigation, labelKey: 'merchant.directions' },
  call: { Icon: Phone, labelKey: 'merchant.call' },
  whatsapp: { Icon: MessageCircle, labelKey: 'merchant.whatsapp' },
  website: { Icon: Globe, labelKey: 'merchant.website' },
  email: { Icon: Mail, labelKey: 'merchant.email' },
};

function openContact(contact: FicheContact) {
  if (contact.key === 'directions') void openDirections(contact.latitude, contact.longitude, contact.label);
  else void openFirst([contact.url]);
}

interface Props {
  merchant: Merchant;
  /** Sorted nearest first: the first one is used for directions, phone and e-mail. */
  stores: StoreWithDistance[];
}

/** Row of outlined contact buttons, scrolling sideways when they do not fit. */
function MerchantQuickActions({ merchant, stores }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();

  const contacts = useMemo(() => getFicheContacts({
    name: merchant.nomBoutique,
    latitude: merchant.latitude,
    longitude: merchant.longitude,
    socialLinks: merchant.socialLinks,
    stores,
  }), [merchant.nomBoutique, merchant.latitude, merchant.longitude, merchant.socialLinks, stores]);

  if (contacts.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
    >
      {contacts.map((contact) => {
        const { Icon, labelKey } = CONTACT_UI[contact.key];
        const label = t(labelKey);
        return (
          <Pressable
            key={contact.key}
            onPress={() => { haptic(); openContact(contact); }}
            style={({ pressed }) => [
              styles.pill,
              { borderColor: theme.border, backgroundColor: pressed ? theme.bgInput : theme.bg },
            ]}
            accessibilityRole={contact.key === 'directions' ? 'button' : 'link'}
            accessibilityLabel={label}
          >
            <Icon size={ms(16)} color={theme.text} strokeWidth={2} />
            <Text style={[styles.label, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={1}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginTop: hp(16), flexGrow: 0 },
  row: { gap: wp(8), paddingHorizontal: wp(16) },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    height: ms(38), paddingHorizontal: wp(14), borderRadius: 999, borderWidth: 1,
  },
  label: { fontSize: ms(14) },
});

export default memo(MerchantQuickActions);
