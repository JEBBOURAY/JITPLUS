import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Lock } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms, fontSize as FS } from '@/utils/responsive';

export default React.memo(function ProLockBadge() {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Text style={styles.badgeText} maxFontSizeMultiplier={1.3} numberOfLines={1}>
          {t('account.proBadge')}
        </Text>
      </View>
      <Lock size={ms(13)} color={theme.textMuted} strokeWidth={2} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: ms(4) },
  badge: {
    backgroundColor: '#7C3AED18',
    borderRadius: ms(6),
    paddingHorizontal: ms(6),
    paddingVertical: ms(2),
  },
  badgeText: { fontSize: FS.xs, color: '#7C3AED', fontWeight: '600' },
});
