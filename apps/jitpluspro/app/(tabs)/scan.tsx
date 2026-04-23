import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { QrCode } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Fallback — in practice the tabPress listener intercepts and
 * opens the full-screen scanner via /scan-qr.
 */
export default function ScanScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Header matching activity style ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('scanTab.title')}</Text>
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
          <View style={[styles.iconCircle, { backgroundColor: `${palette.charbon}12` }]}>
            <QrCode size={ms(36)} color={palette.charbon} strokeWidth={1.5} />
          </View>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('scanTab.desc')}
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={() => router.push('/scan-qr')}
            activeOpacity={0.8}
          >
            <QrCode size={20} color="#fff" strokeWidth={2} />
            <Text style={styles.buttonText}>{t('scanTab.openBtn')}</Text>
          </TouchableOpacity>
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
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  card: {
    borderRadius: 14,
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
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    fontFamily: 'Lexend_400Regular',
    letterSpacing: 0.1,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 10,
  },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_700Bold' },
});
