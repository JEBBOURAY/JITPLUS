import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Lock, Crown } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface PremiumLockCardProps {
  descriptionKey: string;
}

export default React.memo(function PremiumLockCard({ descriptionKey }: PremiumLockCardProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Lock size={28} color={theme.primary} strokeWidth={1.5} />
      <Text style={[styles.title, { color: theme.text }]}>{t('messages.premiumFeatureTitle')}</Text>
      <Text style={[styles.desc, { color: theme.textSecondary }]}>
        {t(descriptionKey)}
      </Text>
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: theme.primary }]}
        onPress={() => router.push('/plan')}
        activeOpacity={0.85}
      >
        <Crown size={16} color="#fff" strokeWidth={1.5} />
        <Text style={styles.btnText}>{t('messages.discoverPremium')}</Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  desc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  btnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
