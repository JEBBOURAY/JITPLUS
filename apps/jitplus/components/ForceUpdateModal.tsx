import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Download, Wrench } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, brandGradient, brandGradientFull, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ForceUpdateStatus } from '@/hooks/useForceUpdate';

interface Props {
  status: ForceUpdateStatus;
  storeUrl: string;
}

export default function ForceUpdateModal({ status, storeUrl }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const isUpdate = status === 'update';

  const handleCta = async () => {
    if (isUpdate) {
      const canOpen = await Linking.canOpenURL(storeUrl);
      if (canOpen) {
        await Linking.openURL(storeUrl);
      } else {
        const webUrl = storeUrl.startsWith('market://')
          ? storeUrl.replace('market://details?id=', 'https://play.google.com/store/apps/details?id=')
          : storeUrl;
        await Linking.openURL(webUrl);
      }
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <LinearGradient
        colors={brandGradientFull}
        style={[styles.topStrip, { height: insets.top + 8 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      />

      <View style={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <LinearGradient
          colors={isUpdate ? brandGradient : [palette.violet, palette.gray900]}
          style={styles.iconBg}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {isUpdate ? (
            <Download color={palette.white} size={48} strokeWidth={1.5} />
          ) : (
            <Wrench color={palette.white} size={48} strokeWidth={1.5} />
          )}
        </LinearGradient>

        <Text style={[styles.title, { color: theme.text }]}>
          {isUpdate
            ? t('forceUpdate.updateTitle')
            : t('forceUpdate.maintenanceTitle')}
        </Text>

        <Text style={[styles.desc, { color: theme.textMuted }]}>
          {isUpdate
            ? t('forceUpdate.updateDesc')
            : t('forceUpdate.maintenanceDesc')}
        </Text>

        {!isUpdate && (
          <Text style={[styles.retry, { color: theme.textMuted }]}>
            {t('forceUpdate.maintenanceRetry')}
          </Text>
        )}

        {isUpdate && (
          <TouchableOpacity onPress={handleCta} activeOpacity={0.8}>
            <LinearGradient
              colors={brandGradient}
              style={styles.ctaBtn}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.ctaText}>
                {Platform.OS === 'ios'
                  ? t('forceUpdate.ctaIos')
                  : t('forceUpdate.ctaAndroid')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  topStrip: {
    width: '100%',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconBg: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Lexend_700Bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  desc: {
    fontSize: 15,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  retry: {
    fontSize: 13,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
  ctaBtn: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Lexend_600SemiBold',
    textAlign: 'center',
  },
});
