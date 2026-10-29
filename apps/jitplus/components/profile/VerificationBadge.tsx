import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { BadgeCheck, ShieldAlert } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { hp, ms, wp } from '@/utils/responsive';

interface VerificationBadgeProps {
  verified: boolean;
  loading?: boolean;
  onVerify?: () => void;
}

function VerificationBadge({ verified, loading, onVerify }: VerificationBadgeProps) {
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const color = verified ? palette.emerald : palette.goldDark;

  return (
    <Pressable
      onPress={verified ? undefined : onVerify}
      disabled={verified || loading}
      hitSlop={8}
      accessibilityRole={verified ? 'text' : 'button'}
      accessibilityLabel={verified ? t('profile.verified') : t('profile.tapToVerify')}
      style={({ pressed }) => [styles.badge, { backgroundColor: `${color}1A` }, pressed && { opacity: 0.7 }]}
    >
      {loading
        ? <ActivityIndicator size="small" color={color} style={styles.spinner} />
        : verified
          ? <BadgeCheck size={ms(12)} color={color} strokeWidth={2.2} />
          : <ShieldAlert size={ms(12)} color={color} strokeWidth={2.2} />}
      <Text style={[styles.text, { color, fontFamily: fonts.semibold }]} numberOfLines={1}>
        {verified ? t('profile.verified') : t('profile.pendingVerification')}
      </Text>
    </Pressable>
  );
}

export default memo(VerificationBadge);

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(4),
    paddingHorizontal: wp(8),
    paddingVertical: hp(3),
    borderRadius: ms(10),
  },
  text: { fontSize: ms(11) },
  spinner: { transform: [{ scale: 0.6 }], width: ms(12), height: ms(12) },
});
