import React, { useMemo } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { Instagram, Music2, Mail, Globe } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { haptic } from '@/utils/haptics';
import { merchantStyles as styles } from './merchantStyles';
import type { Merchant } from '@/types';

interface MerchantSocialLinksProps {
  merchant: Merchant;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function MerchantSocialLinks({ merchant, t }: MerchantSocialLinksProps) {
  const storeEmail = useMemo(() => merchant.stores?.find((s) => !!s.email)?.email, [merchant.stores]);
  const hasLinks = !!storeEmail || !!merchant.socialLinks?.instagram || !!merchant.socialLinks?.tiktok || !!merchant.socialLinks?.website;
  if (!hasLinks) return null;

  return (
    <View style={styles.socialRow}>
      {!!merchant.socialLinks?.instagram && (
        <Pressable
          onPress={async () => {
            haptic();
            const raw = merchant.socialLinks?.instagram ?? '';
            const username = raw.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').trim();
            if (!username) return;
            const appUrl = `instagram://user?username=${encodeURIComponent(username)}`;
            const webUrl = `https://www.instagram.com/${encodeURIComponent(username)}`;
            const canOpen = await Linking.canOpenURL(appUrl);
            Linking.openURL(canOpen ? appUrl : webUrl);
          }}
          style={({ pressed }) => [styles.socialIconBtn, { backgroundColor: '#E1306C12', opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button" accessibilityLabel={t('merchant.openInstagram')}
        >
          <Instagram size={18} color="#E1306C" strokeWidth={2} />
        </Pressable>
      )}

      {!!merchant.socialLinks?.tiktok && (
        <Pressable
          onPress={() => {
            haptic();
            const raw = merchant.socialLinks?.tiktok ?? '';
            const username = raw.replace(/^@/, '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '').replace(/\/.*$/, '').trim();
            if (!username) return;
            Linking.openURL(`https://www.tiktok.com/@${encodeURIComponent(username)}`);
          }}
          style={({ pressed }) => [styles.socialIconBtn, { backgroundColor: `${palette.gray900}08`, opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button" accessibilityLabel={t('merchant.openTiktok')}
        >
          <Music2 size={18} color={palette.gray900} strokeWidth={2} />
        </Pressable>
      )}

      {!!storeEmail && (
        <Pressable
          onPress={async () => {
            haptic();
            const url = `mailto:${storeEmail}`;
            try {
              const canOpen = await Linking.canOpenURL(url);
              if (canOpen) await Linking.openURL(url);
            } catch { /* no mail client available */ }
          }}
          style={({ pressed }) => [styles.socialIconBtn, { backgroundColor: '#EA433512', opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button" accessibilityLabel={t('merchant.email')}
        >
          <Mail size={18} color="#EA4335" strokeWidth={2} />
        </Pressable>
      )}

      {!!merchant.socialLinks?.website && (
        <Pressable
          onPress={() => {
            haptic();
            let url = merchant.socialLinks?.website ?? '';
            if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
            try {
              const parsed = new URL(url);
              if (!['http:', 'https:'].includes(parsed.protocol)) return;
              Linking.openURL(parsed.href);
            } catch { /* invalid URL */ }
          }}
          style={({ pressed }) => [styles.socialIconBtn, { backgroundColor: `${palette.violet}10`, opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="link" accessibilityLabel={t('merchant.website')}
        >
          <Globe size={18} color={palette.violet} strokeWidth={2} />
        </Pressable>
      )}
    </View>
  );
}

export default React.memo(MerchantSocialLinks);
