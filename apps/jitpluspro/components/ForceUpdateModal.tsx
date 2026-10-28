import {
  View,
  Text,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Download, AlertTriangle, Wrench } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, brandGradient, brandGradientFull, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ActionButton } from '@/components/ui/ActionButton';
import { font, icon } from '@/constants/design';
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
      try {
        const canOpen = await Linking.canOpenURL(storeUrl);
        // On some Android emulators 'market://' scheme fails — fallback to web
        if (canOpen) {
          await Linking.openURL(storeUrl);
        } else {
          const webUrl = storeUrl.startsWith('market://')
            ? storeUrl.replace('market://details?id=', 'https://play.google.com/store/apps/details?id=')
            : storeUrl;
          await Linking.openURL(webUrl);
        }
      } catch {
        // Fallback: try web store URL if native linking fails
        try {
          const fallback = Platform.OS === 'android'
            ? storeUrl.replace('market://details?id=', 'https://play.google.com/store/apps/details?id=')
            : storeUrl;
          await Linking.openURL(fallback);
        } catch {
          // Nothing more we can do
        }
      }
    }
    // For maintenance, no CTA action — user must wait
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
          colors={isUpdate ? brandGradient : [palette.violet, palette.charbonDark]}
          style={styles.iconBg}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {isUpdate ? (
            <Download color={palette.white} size={44} strokeWidth={icon.stroke} />
          ) : (
            <Wrench color={palette.white} size={44} strokeWidth={icon.stroke} />
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
              { backgroundColor: palette.cyan + '12', borderColor: palette.cyan + '30' },
            ]}
          >
            <AlertTriangle color={palette.cyan} size={14} strokeWidth={icon.strokeSmall} />
            <Text style={[styles.badgeText, { color: palette.cyan }]}>
              {t('forceUpdate.versionRequired')}
            </Text>
          </View>
        )}

        {isUpdate && (
          <ActionButton
            label={Platform.OS === 'ios' ? t('forceUpdate.ctaIos') : t('forceUpdate.ctaAndroid')}
            icon={Download}
            size="lg"
            onPress={handleCta}
            style={styles.cta}
          />
        )}

        {!isUpdate && (
          <View
            style={[
              styles.maintenanceHint,
              { backgroundColor: palette.cyan + '12', borderColor: palette.cyan + '30' },
            ]}
          >
            <Text style={[styles.maintenanceHintText, { color: palette.cyan }]}>
              {t('forceUpdate.maintenanceRetry')}
            </Text>
          </View>
        )}

        <Text style={[styles.brand, { color: theme.textMuted }]}>
          JitPlus Pro
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
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
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: palette.charbon,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: font.bold,
    textAlign: 'center',
    lineHeight: 32,
  },
  desc: {
    fontSize: 15,
    fontFamily: font.regular,
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
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: {
    fontSize: 13,
    fontFamily: font.medium,
  },
  cta: {
    alignSelf: 'stretch',
    marginTop: 8,
    backgroundColor: palette.violet,
    borderColor: palette.violet,
  },
  maintenanceHint: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
    width: '100%',
  },
  maintenanceHintText: {
    fontSize: 14,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
  brand: {
    fontSize: 13,
    fontFamily: font.regular,
    marginTop: 24,
    opacity: 0.5,
  },
});
