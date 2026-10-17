import React, { memo, useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Instagram, Music2, Mail, Facebook, Youtube, Ghost, type LucideIcon } from 'lucide-react-native';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { haptic } from '@/utils/haptics';
import { openFirst, toHandle } from '@/utils/merchantLinks';
import { wp, ms } from '@/utils/responsive';
import type { Merchant } from '@/types';

export interface SocialItem {
  key: string;
  Icon: LucideIcon;
  color: string;
  label: string;
  /** Tried in order: native app first, web next. */
  urls: string[];
}

/** Social profiles and e-mail. WhatsApp and website live in the quick actions. */
export function useSocialItems(merchant: Merchant): SocialItem[] {
  const { t } = useLanguage();
  const theme = useTheme();
  const tiktokColor = theme.mode === 'dark' ? palette.white : palette.gray900;

  return useMemo(() => {
    const links = merchant.socialLinks ?? {};
    const list: SocialItem[] = [];

    const instagram = toHandle(links.instagram, 'instagram.com');
    if (instagram) {
      list.push({
        key: 'instagram', Icon: Instagram, color: '#E1306C', label: t('merchant.openInstagram'),
        urls: [
          `instagram://user?username=${encodeURIComponent(instagram)}`,
          `https://www.instagram.com/${encodeURIComponent(instagram)}`,
        ],
      });
    }
    const tiktok = toHandle(links.tiktok, 'tiktok.com');
    if (tiktok) {
      list.push({ key: 'tiktok', Icon: Music2, color: tiktokColor, label: t('merchant.openTiktok'), urls: [`https://www.tiktok.com/@${encodeURIComponent(tiktok)}`] });
    }
    const facebook = toHandle(links.facebook, 'facebook.com');
    if (facebook) {
      list.push({ key: 'facebook', Icon: Facebook, color: '#1877F2', label: t('merchant.openFacebook'), urls: [`https://www.facebook.com/${encodeURIComponent(facebook)}`] });
    }
    const snapchat = toHandle(links.snapchat, 'snapchat.com');
    if (snapchat) {
      list.push({
        key: 'snapchat', Icon: Ghost, color: '#C9A400', label: t('merchant.openSnapchat'),
        urls: [`https://www.snapchat.com/add/${encodeURIComponent(snapchat.replace(/^add\//, ''))}`],
      });
    }
    const youtube = toHandle(links.youtube, 'youtube.com');
    if (youtube) {
      list.push({ key: 'youtube', Icon: Youtube, color: '#FF0000', label: t('merchant.openYoutube'), urls: [`https://www.youtube.com/@${encodeURIComponent(youtube)}`] });
    }
    const email = merchant.stores?.find((s) => !!s.email)?.email;
    if (email) {
      list.push({ key: 'email', Icon: Mail, color: '#EA4335', label: t('merchant.email'), urls: [`mailto:${email}`] });
    }
    return list;
  }, [merchant.socialLinks, merchant.stores, t, tiktokColor]);
}

function MerchantSocialLinks({ items }: { items: SocialItem[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.row}>
      {items.map(({ key, Icon, color, label, urls }) => (
        <Pressable
          key={key}
          onPress={() => { haptic(); void openFirst(urls); }}
          style={({ pressed }) => [styles.button, { backgroundColor: `${color}14`, opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="link"
          accessibilityLabel={label}
        >
          <Icon size={ms(19)} color={color} strokeWidth={2} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(10) },
  button: { width: ms(44), height: ms(44), borderRadius: ms(14), alignItems: 'center', justifyContent: 'center' },
});

export default memo(MerchantSocialLinks);
