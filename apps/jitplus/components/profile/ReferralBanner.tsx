import { memo } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Gift } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { fontSize as FS, hp, ms, radius, wp } from '@/utils/responsive';

const CHEVRON_FLIP = I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined;

function ReferralBanner({ onPress }: { onPress: () => void }) {
  const { t } = useLanguage();
  const fonts = useAppFonts();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('profile.referralBannerTitle')}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
    >
      <LinearGradient
        colors={[palette.violetDark, palette.violet, palette.violetVivid]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.iconWrap}>
          <Gift size={ms(20)} color={palette.goldLight} strokeWidth={2} />
        </View>
        <View style={styles.texts}>
          <Text style={[styles.title, { fontFamily: fonts.semibold }]} numberOfLines={1}>
            {t('profile.referralBannerTitle')}
          </Text>
          <Text style={[styles.desc, { fontFamily: fonts.regular }]} numberOfLines={2}>
            {t('profile.referralBannerDesc')}
          </Text>
        </View>
        <ChevronRight size={ms(18)} color="rgba(255,255,255,0.8)" strokeWidth={2} style={CHEVRON_FLIP} />
      </LinearGradient>
    </Pressable>
  );
}

export default memo(ReferralBanner);

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.xl, overflow: 'hidden', marginBottom: hp(22) },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(12),
    paddingVertical: hp(14),
    paddingHorizontal: wp(14),
  },
  iconWrap: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(12),
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, minWidth: 0 },
  title: { color: '#fff', fontSize: FS.md, textAlign: 'left' },
  desc: { color: 'rgba(255,255,255,0.82)', fontSize: FS.xs, lineHeight: ms(16), marginTop: hp(2), textAlign: 'left' },
});
