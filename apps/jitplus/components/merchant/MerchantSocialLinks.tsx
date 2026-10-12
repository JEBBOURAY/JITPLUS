import React, { useMemo } from 'react';
import { View, Pressable, Linking } from 'react-native';
import { Instagram, Music2, Mail, Globe, Facebook, Youtube, Ghost, MessageCircle, type LucideIcon } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { haptic } from '@/utils/haptics';
import { merchantStyles as styles } from './merchantStyles';
import { getMerchantAccent } from '@/utils/merchantAccent';
import type { Merchant } from '@/types';

interface MerchantSocialLinksProps {
  merchant: Merchant;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

interface LinkItem {
  key: string;
  Icon: LucideIcon;
  color: string;
  label: string;
  role: 'button' | 'link';
  /** Tried first; the next one is used if the app is not installed. */
  urls: string[];
}

/** Accepts "@user", "user" or a full profile URL and returns the bare handle. */
function toHandle(raw: string | undefined, domain: string): string {
  if (!raw) return '';
  const prefix = new RegExp(`^https?://(www\\.|m\\.)?${domain.replace('.', '\\.')}/@?`, 'i');
  return raw.trim().replace(prefix, '').replace(/^@/, '').replace(/[/?#].*$/, '').trim();
}

function toWebsite(raw: string | undefined): string | null {
  if (!raw) return null;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

async function openFirst(urls: string[]) {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return;
    } catch { /* try the next url */ }
  }
}

function MerchantSocialLinks({ merchant, t }: MerchantSocialLinksProps) {
  const accent = getMerchantAccent(merchant.themeColor);

  const items = useMemo<LinkItem[]>(() => {
    const links = merchant.socialLinks ?? {};
    const list: LinkItem[] = [];
    const add = (item: LinkItem | null) => { if (item) list.push(item); };

    const whatsapp = links.whatsapp?.replace(/[^\d]/g, '');
    add(whatsapp ? {
      key: 'whatsapp', Icon: MessageCircle, color: '#25D366', label: t('merchant.openWhatsapp'), role: 'button',
      urls: [`https://wa.me/${whatsapp}`],
    } : null);

    const instagram = toHandle(links.instagram, 'instagram.com');
    add(instagram ? {
      key: 'instagram', Icon: Instagram, color: '#E1306C', label: t('merchant.openInstagram'), role: 'button',
      urls: [
        `instagram://user?username=${encodeURIComponent(instagram)}`,
        `https://www.instagram.com/${encodeURIComponent(instagram)}`,
      ],
    } : null);

    const tiktok = toHandle(links.tiktok, 'tiktok.com');
    add(tiktok ? {
      key: 'tiktok', Icon: Music2, color: palette.gray900, label: t('merchant.openTiktok'), role: 'button',
      urls: [`https://www.tiktok.com/@${encodeURIComponent(tiktok)}`],
    } : null);

    const facebook = toHandle(links.facebook, 'facebook.com');
    add(facebook ? {
      key: 'facebook', Icon: Facebook, color: '#1877F2', label: t('merchant.openFacebook'), role: 'button',
      urls: [`https://www.facebook.com/${encodeURIComponent(facebook)}`],
    } : null);

    const snapchat = toHandle(links.snapchat, 'snapchat.com');
    add(snapchat ? {
      key: 'snapchat', Icon: Ghost, color: '#C9A400', label: t('merchant.openSnapchat'), role: 'button',
      urls: [`https://www.snapchat.com/add/${encodeURIComponent(snapchat.replace(/^add\//, ''))}`],
    } : null);

    const youtube = toHandle(links.youtube, 'youtube.com');
    add(youtube ? {
      key: 'youtube', Icon: Youtube, color: '#FF0000', label: t('merchant.openYoutube'), role: 'button',
      urls: [`https://www.youtube.com/@${encodeURIComponent(youtube)}`],
    } : null);

    const email = merchant.stores?.find((s) => !!s.email)?.email;
    add(email ? {
      key: 'email', Icon: Mail, color: '#EA4335', label: t('merchant.email'), role: 'button',
      urls: [`mailto:${email}`],
    } : null);

    const website = toWebsite(links.website);
    add(website ? {
      key: 'website', Icon: Globe, color: accent, label: t('merchant.website'), role: 'link',
      urls: [website],
    } : null);

    return list;
  }, [merchant.socialLinks, merchant.stores, accent, t]);

  if (items.length === 0) return null;

  return (
    <View style={styles.socialRow}>
      {items.map(({ key, Icon, color, label, role, urls }) => (
        <Pressable
          key={key}
          onPress={() => { haptic(); void openFirst(urls); }}
          style={({ pressed }) => [styles.socialIconBtn, { backgroundColor: `${color}14`, opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole={role}
          accessibilityLabel={label}
        >
          <Icon size={18} color={color} strokeWidth={2} />
        </Pressable>
      ))}
    </View>
  );
}

export default React.memo(MerchantSocialLinks);
