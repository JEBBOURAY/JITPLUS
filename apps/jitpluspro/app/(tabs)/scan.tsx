import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { QrCode } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Fallback — in practice the tabPress listener intercepts and
 * opens the full-screen scanner via /scan-qr.
 */
export default function ScanScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useLanguage();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: theme.primaryBg }]}>
          <QrCode size={52} color={theme.primary} strokeWidth={1.5} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>{t('scanTab.title')}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t('scanTab.desc')}
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primary }]}
          onPress={() => router.push('/scan-qr')}
          activeOpacity={0.8}
        >
          <QrCode size={20} color="#fff" strokeWidth={1.5} />
          <Text style={styles.buttonText}>{t('scanTab.openBtn')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { alignItems: 'center', paddingHorizontal: 40 },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 10,
    elevation: 2,
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
