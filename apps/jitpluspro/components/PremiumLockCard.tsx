import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Crown, Sparkles } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface PremiumLockCardProps {
  descriptionKey: string;
  titleKey?: string;
}

export default React.memo(function PremiumLockCard({ descriptionKey, titleKey }: PremiumLockCardProps) {
  const theme = useTheme();
  const { t } = useLanguage();

  return (
    <View style={[styles.wrapper, { borderColor: palette.premiumBorder }]}>
      {/* Dark premium card */}
      <LinearGradient
        colors={[palette.premiumBg, palette.premiumBgMid, palette.premiumBg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        {/* Crown icon with glow */}
        <View style={styles.iconWrap}>
          <LinearGradient
            colors={[palette.violetDark, palette.violet]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconBg}
          >
            <Crown size={26} color={palette.gold} strokeWidth={1.8} />
          </LinearGradient>
        </View>

        {/* PRO badge */}
        <View style={styles.proBadge}>
          <Sparkles size={10} color={palette.gold} strokeWidth={2} />
          <Text style={styles.proBadgeText}>PRO</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>
          {t(titleKey ?? 'messages.premiumFeatureTitle')}
        </Text>

        {/* Description */}
        <Text style={[styles.desc, { color: theme.textSecondary }]}>
          {t(descriptionKey)}
        </Text>
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  container: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 10,
  },
  iconWrap: {
    marginBottom: 2,
  },
  iconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.premiumBorder,
    borderWidth: 1,
    borderColor: palette.premiumBadgeBorder,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  proBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: palette.violetLight,
    letterSpacing: 1,
    fontFamily: 'Lexend_700Bold',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginTop: 2,
    fontFamily: 'Lexend_700Bold',
  },
  desc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  btnWrap: {
    marginTop: 6,
    borderRadius: 14,
    overflow: 'hidden',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 14,
  },
  btnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
});
