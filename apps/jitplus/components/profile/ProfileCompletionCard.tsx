import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Sparkles } from 'lucide-react-native';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { fontSize as FS, hp, ms, radius, wp } from '@/utils/responsive';

interface ProfileCompletionCardProps {
  percent: number;
  missingLabels: string[];
  onPress: () => void;
}

/** Only rendered while the profile is incomplete; a full profile needs no nudge. */
function ProfileCompletionCard({ percent, missingLabels, onPress }: ProfileCompletionCardProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('home.completeProfileTitle')}, ${percent}%`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.bgCard, borderColor: `${palette.gold}40` },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: `${palette.gold}1F` }]}>
          <Sparkles size={ms(16)} color={palette.goldDark} strokeWidth={2} />
        </View>
        <View style={styles.texts}>
          <Text style={[styles.title, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={1}>
            {t('home.completeProfileTitle')}
          </Text>
          <Text style={[styles.hint, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={2}>
            {t('home.completeProfileHint', { fields: missingLabels.join(', ') })}
          </Text>
        </View>
        <View style={[styles.cta, { backgroundColor: palette.gold }]}>
          <Text style={[styles.ctaText, { fontFamily: fonts.semibold }]}>{t('profile.completeCta')}</Text>
        </View>
      </View>
      <View style={styles.progressRow}>
        <View style={[styles.track, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : palette.gray100 }]}>
          <View style={[styles.fill, { width: `${percent}%`, backgroundColor: palette.gold }]} />
        </View>
        <Text style={[styles.percent, { color: palette.goldDark, fontFamily: fonts.bold }]}>{percent}%</Text>
      </View>
    </Pressable>
  );
}

export default memo(ProfileCompletionCard);

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: wp(14),
    marginBottom: hp(14),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  badge: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(11),
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, minWidth: 0 },
  title: { fontSize: FS.md, textAlign: 'left' },
  hint: { fontSize: FS.xs, marginTop: hp(2), lineHeight: ms(16), textAlign: 'left' },
  cta: { paddingHorizontal: wp(12), paddingVertical: hp(7), borderRadius: ms(14) },
  ctaText: { color: '#fff', fontSize: FS.xs },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: wp(10), marginTop: hp(12) },
  track: { flex: 1, height: ms(6), borderRadius: ms(3), overflow: 'hidden' },
  fill: { height: '100%', borderRadius: ms(3) },
  percent: { fontSize: FS.xs, minWidth: ms(34), textAlign: 'right' },
});
