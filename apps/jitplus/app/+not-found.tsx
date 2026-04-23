import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Home } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ms, hp } from '@/utils/responsive';

export default function NotFoundScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.code, { color: theme.textMuted }]}>404</Text>
      <Text style={[styles.title, { color: theme.text }]}>{t('errors.pageNotFound')}</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        {t('errors.pageNotFoundBody')}
      </Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.primary }]}
        onPress={() => router.replace('/(tabs)')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('common.home')}
      >
        <Home size={18} color="#fff" strokeWidth={2} />
        <Text style={styles.buttonText}>{t('common.home')}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  code: { fontSize: ms(72), fontFamily: 'Lexend_700Bold', marginBottom: hp(8) },
  title: { fontSize: ms(20), fontFamily: 'Lexend_600SemiBold', marginBottom: hp(8), textAlign: 'center' },
  body: { fontSize: ms(14), fontFamily: 'Lexend_400Regular', textAlign: 'center', marginBottom: hp(32), lineHeight: ms(20) },
  button: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  buttonText: { color: '#fff', fontSize: ms(15), fontFamily: 'Lexend_600SemiBold' },
});
