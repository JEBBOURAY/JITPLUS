import { View, Text, StyleSheet } from 'react-native';
import { JitScan } from '@/components/icons';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ActionButton } from '@/components/ui/ActionButton';
import { font, icon } from '@/constants/design';
import { ms, radius } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

/**
 * Fallback — in practice the tabPress listener intercepts and
 * opens the full-screen scanner via /scan-qr.
 */
export default function ScanScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('scanTab.title')}</Text>
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
          <View style={styles.iconCircle}>
            <JitScan size={40} color={palette.charbon} strokeWidth={icon.stroke} />
          </View>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('scanTab.desc')}
          </Text>
          <ActionButton
            label={t('scanTab.openBtn')}
            icon={JitScan}
            size="lg"
            onPress={() => router.push('/scan-qr')}
            style={styles.button}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: font.bold,
    letterSpacing: -0.5,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
  },
  iconCircle: {
    width: ms(88),
    height: ms(88),
    borderRadius: ms(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    backgroundColor: `${palette.charbon}12`,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    fontFamily: font.regular,
  },
  button: {
    paddingHorizontal: 28,
  },
});
