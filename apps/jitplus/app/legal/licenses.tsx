import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ms } from '@/utils/responsive';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

type License = { name: string; version?: string; license: string; url: string };

// Principales dépendances open-source utilisées par JitPlus. Liste maintenue
// manuellement pour l'écran « Licences ». Les copyrights et textes complets
// sont disponibles via les liens GitHub ci-dessous.
const LICENSES: License[] = [
  { name: 'React Native', license: 'MIT', url: 'https://github.com/facebook/react-native' },
  { name: 'React', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'Expo SDK', license: 'MIT', url: 'https://github.com/expo/expo' },
  { name: 'expo-router', license: 'MIT', url: 'https://github.com/expo/expo' },
  { name: '@react-navigation/native', license: 'MIT', url: 'https://github.com/react-navigation/react-navigation' },
  { name: '@tanstack/react-query', license: 'MIT', url: 'https://github.com/TanStack/query' },
  { name: 'axios', license: 'MIT', url: 'https://github.com/axios/axios' },
  { name: 'i18n-js', license: 'MIT', url: 'https://github.com/fnando/i18n' },
  { name: 'zustand', license: 'MIT', url: 'https://github.com/pmndrs/zustand' },
  { name: 'lucide-react-native', license: 'ISC', url: 'https://github.com/lucide-icons/lucide' },
  { name: 'react-native-maps', license: 'MIT', url: 'https://github.com/react-native-maps/react-native-maps' },
  { name: 'react-native-reanimated', license: 'MIT', url: 'https://github.com/software-mansion/react-native-reanimated' },
  { name: 'react-native-safe-area-context', license: 'MIT', url: 'https://github.com/th3rdwave/react-native-safe-area-context' },
  { name: 'react-native-screens', license: 'MIT', url: 'https://github.com/software-mansion/react-native-screens' },
  { name: 'react-native-svg', license: 'MIT', url: 'https://github.com/software-mansion/react-native-svg' },
  { name: 'react-native-qrcode-svg', license: 'MIT', url: 'https://github.com/awesomejerry/react-native-qrcode-svg' },
  { name: 'react-native-view-shot', license: 'MIT', url: 'https://github.com/gre/react-native-view-shot' },
  { name: 'socket.io-client', license: 'MIT', url: 'https://github.com/socketio/socket.io-client' },
  { name: 'supercluster', license: 'ISC', url: 'https://github.com/mapbox/supercluster' },
  { name: '@react-native-async-storage/async-storage', license: 'MIT', url: 'https://github.com/react-native-async-storage/async-storage' },
  { name: '@react-native-community/netinfo', license: 'MIT', url: 'https://github.com/react-native-netinfo/react-native-netinfo' },
  { name: '@react-native-google-signin/google-signin', license: 'MIT', url: 'https://github.com/react-native-google-signin/google-signin' },
  { name: '@sentry/react-native', license: 'MIT', url: 'https://github.com/getsentry/sentry-react-native' },
  { name: '@expo-google-fonts/cairo', license: 'MIT', url: 'https://github.com/expo/google-fonts' },
  { name: '@expo-google-fonts/lexend', license: 'MIT', url: 'https://github.com/expo/google-fonts' },
];

export default function LicensesScreen() {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={ms(22)} color={theme.text} strokeWidth={2} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('legal.licensesHeader')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.section, { backgroundColor: `${theme.primary}10` }]}>
          <Text style={[styles.body, { color: theme.textMuted }]}>{t('legal.licensesIntro')}</Text>
        </View>

        {LICENSES.map((lib) => (
          <TouchableOpacity
            key={lib.name}
            onPress={() => Linking.openURL(lib.url).catch(() => {})}
            activeOpacity={0.7}
            style={[styles.item, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.libName, { color: theme.text }]}>{lib.name}</Text>
              <Text style={[styles.libUrl, { color: theme.textMuted }]}>{lib.url}</Text>
            </View>
            <View style={[styles.licenseBadge, { backgroundColor: `${theme.primary}15` }]}>
              <Text style={[styles.licenseText, { color: theme.primary }]}>{lib.license}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <Text style={[styles.footer, { color: theme.textMuted }]}>{t('legal.licensesFooter')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: ms(40), alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: ms(16), fontWeight: '700' },
  content: { padding: 16, gap: 8 },
  section: { borderRadius: 14, padding: 16, marginBottom: 8 },
  body: { fontSize: ms(13), lineHeight: ms(20) },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  libName: { fontSize: ms(13), fontWeight: '600' },
  libUrl: { fontSize: ms(11), marginTop: 2 },
  licenseBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  licenseText: { fontSize: ms(11), fontWeight: '700' },
  footer: { fontSize: ms(11), textAlign: 'center', marginTop: 16, marginBottom: 32 },
});
