import React, { memo, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Navigation, Phone, MessageCircle, Globe, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { getMerchantAccent } from '@/utils/merchantAccent';
import { callPhone, openDirections, openFirst, toWebsite, toWhatsappUrl } from '@/utils/merchantLinks';
import { hasCoords, type StoreWithDistance } from '@/utils/merchantStores';
import { wp, hp, ms } from '@/utils/responsive';
import type { Merchant } from '@/types';

interface Action {
  key: string;
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
}

interface Props {
  merchant: Merchant;
  /** Nearest store, used for directions and phone. */
  store: StoreWithDistance | null;
}

/** One-tap contact row: directions, call, WhatsApp, website. */
function MerchantQuickActions({ merchant, store }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const accent = getMerchantAccent(merchant.themeColor);

  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [];
    const target = store && hasCoords(store) ? store : hasCoords(merchant) ? merchant : null;
    if (target) {
      const label = store?.nom || merchant.nomBoutique;
      list.push({ key: 'directions', label: t('merchant.directions'), Icon: Navigation, onPress: () => { void openDirections(target.latitude, target.longitude, label); } });
    }
    const phone = store?.telephone || merchant.stores?.find((s) => !!s.telephone)?.telephone;
    if (phone) list.push({ key: 'call', label: t('merchant.call'), Icon: Phone, onPress: () => { void callPhone(phone); } });
    const whatsapp = toWhatsappUrl(merchant.socialLinks?.whatsapp);
    if (whatsapp) list.push({ key: 'whatsapp', label: t('merchant.whatsapp'), Icon: MessageCircle, onPress: () => { void openFirst([whatsapp]); } });
    const website = toWebsite(merchant.socialLinks?.website);
    if (website) list.push({ key: 'website', label: t('merchant.website'), Icon: Globe, onPress: () => { void openFirst([website]); } });
    return list;
  }, [merchant, store, t]);

  if (actions.length === 0) return null;

  return (
    <View style={styles.row}>
      {actions.map(({ key, label, Icon, onPress }) => (
        <Pressable
          key={key}
          onPress={() => { haptic(); onPress(); }}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <View style={[styles.iconWrap, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Icon size={ms(20)} color={accent} strokeWidth={2} />
          </View>
          <Text style={[styles.label, { color: theme.textSecondary, fontFamily: fonts.medium }]} numberOfLines={1}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: wp(8), paddingHorizontal: wp(16), marginTop: hp(18) },
  action: { flex: 1, maxWidth: wp(88), alignItems: 'center', gap: hp(6) },
  iconWrap: {
    width: ms(52), height: ms(52), borderRadius: ms(18), borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: ms(12) },
});

export default memo(MerchantQuickActions);
