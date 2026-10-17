import React, { memo, useMemo } from 'react';
import { View, Pressable, StyleSheet, Animated, I18nManager, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, Share2, MoreHorizontal, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { wp, hp, ms } from '@/utils/responsive';
import { HERO_HEIGHT } from './MerchantHero';

const BUTTON_SIZE = ms(40);

interface Props {
  title: string;
  scrollY: Animated.Value;
  onBack: () => void;
  onShare: () => void;
  onMore: () => void;
}

/** Floating actions over the cover that turn into a solid title bar once the hero scrolls away. */
function MerchantStickyHeader({ title, scrollY, onBack, onShare, onMore }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const insets = useSafeAreaInsets();

  const barOpacity = useMemo(() => {
    const end = HERO_HEIGHT - insets.top - BUTTON_SIZE;
    return scrollY.interpolate({ inputRange: [end - hp(50), end], outputRange: [0, 1], extrapolate: 'clamp' });
  }, [scrollY, insets.top]);

  const buttonBg = theme.mode === 'dark' ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.94)';

  const renderButton = (Icon: LucideIcon, label: string, onPress: () => void) => (
    <Pressable
      onPress={() => { haptic(); onPress(); }}
      style={({ pressed }) => [styles.button, { backgroundColor: buttonBg, opacity: pressed ? 0.75 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
    >
      <Icon size={ms(19)} color={theme.text} strokeWidth={2.2} />
    </Pressable>
  );

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + hp(4) }]} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.bar, { backgroundColor: theme.bgCard, borderBottomColor: theme.border, opacity: barOpacity }]}
      />
      <View style={styles.row} pointerEvents="box-none">
        {renderButton(I18nManager.isRTL ? ArrowRight : ArrowLeft, t('common.back'), onBack)}
        <Animated.Text
          style={[styles.title, { color: theme.text, fontFamily: fonts.bold, opacity: barOpacity }]}
          numberOfLines={1}
        >
          {title}
        </Animated.Text>
        {renderButton(Share2, t('merchant.share'), onShare)}
        {renderButton(MoreHorizontal, t('merchant.more'), onMore)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: hp(8) },
  bar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: wp(10), paddingHorizontal: wp(16) },
  title: { flex: 1, fontSize: ms(16), textAlign: 'center' },
  button: {
    width: BUTTON_SIZE, height: BUTTON_SIZE, borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
});

export default memo(MerchantStickyHeader);
