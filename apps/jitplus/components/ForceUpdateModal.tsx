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
import { Download, AlertTriangle, Wrench } from 'lucide-react-native';
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
    if (!isUpdate) return;
    try {
      const canOpen = await Linking.canOpenURL(storeUrl);
      if (canOpen) {
        await Linking.openURL(storeUrl);
      } else {
        const webUrl = storeUrl.startsWith('market://')
          ? storeUrl.replace('market://details?id=', 'https://play.google.com/store/apps/details?id=')
          : storeUrl;
        await Linking.openURL(webUrl);
      }
    } catch {
      try {
        const fallback = Platform.OS === 'android'
          ? storeUrl.replace('market://details?id=', 'https://play.google.com/store/apps/details?id=')
          : storeUrl;
        await Linking.openURL(fallback);
      } catch {
        // Nothing more we can do
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

        {isUpdate && (
          <View
            style={[
              styles.badge,
              { backgroundColor: palette.neonBlue + '12', borderColor: palette.neonBlue + '30' },
            ]}
          >
            <AlertTriangle color={palette.neonBlue} size={14} strokeWidth={1.5} />
            <Text style={[styles.badgeText, { color: palette.neonBlue }]}>
              {t('forceUpdate.versionRequired')}
            </Text>
          </View>
        )}

        {isUpdate && (
          <TouchableOpacity
            style={[styles.ctaWrap, { backgroundColor: palette.violet }]}
            onPress={handleCta}
            activeOpacity={0.85}
          >
            <View style={styles.ctaGradient}>
              <Download color={palette.white} size={20} strokeWidth={1.5} />
              <Text style={styles.ctaText}>
                {Platform.OS === 'ios'
                  ? t('forceUpdate.ctaIos')
                  : t('forceUpdate.ctaAndroid')}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {!isUpdate && (
          <View
            style={[
              styles.maintenanceHint,
              { backgroundColor: palette.neonBlue + '12', borderColor: palette.neonBlue + '30' },
            ]}
          >
            <Text style={[styles.maintenanceHintText, { color: palette.neonBlue }]}>
              {t('forceUpdate.maintenanceRetry')}
            </Text>
          </View>
        )}

        <Text style={[styles.brand, { color: theme.textMuted }]}>
          JitPlus
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    flexDirection: 'column',
  },
  topStrip: {
    width: '100%',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  iconBg: {
    width: 112,
    height: 112,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: palette.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Lexend_700Bold',
    textAlign: 'center',
    lineHeight: 32,
  },
  desc: {
    fontSize: 15,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    lineHeight: 23,
    maxWidth: 320,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 13,
    fontFamily: 'Lexend_500Medium',
  },
  ctaWrap: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    paddingHorizontal: 20,
    gap: 10,
  },
  ctaText: {
    color: palette.white,
    fontSize: 16,
    fontFamily: 'Lexend_600SemiBold',
  },
  maintenanceHint: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
    width: '100%',
  },
  maintenanceHintText: {
    fontSize: 14,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  brand: {
    fontSize: 13,
    fontFamily: 'Lexend_400Regular',
    marginTop: 24,
    opacity: 0.5,
  },
});
