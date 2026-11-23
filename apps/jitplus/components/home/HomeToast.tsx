import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/AppText';
import { palette } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/utils/fonts';
import { hp, ms, wp, fontSize, radius } from '@/utils/responsive';

interface Props {
  /** 0 → 1: slides down and fades in. */
  anim: Animated.Value;
  icon: LucideIcon;
  trailingIcon?: LucideIcon;
  text: string;
  /** gold: a reward; violet: a greeting. */
  tone: 'gold' | 'violet';
  /** Tappable toast; without it the toast is announced and lets touches through. */
  onPress?: () => void;
}

/** One-line toast floating under the home header (reward earned, welcome). */
export default function HomeToast({ anim, icon: Icon, trailingIcon: TrailingIcon, text, tone, onPress }: Props) {
  const fonts = useAppFonts();
  const insets = useSafeAreaInsets();

  const body = (
    <View style={[styles.body, tone === 'gold' ? styles.gold : styles.violet]}>
      <View style={styles.icon}>
        <Icon size={ms(15)} color="#fff" strokeWidth={2} />
      </View>
      <Text style={[styles.text, { fontFamily: fonts.bold }]} numberOfLines={1}>{text}</Text>
      {TrailingIcon && <TrailingIcon size={ms(15)} color="#fff" strokeWidth={2} />}
    </View>
  );

  return (
    <Animated.View
      style={[styles.wrap, {
        top: insets.top + hp(8),
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
      }]}
      pointerEvents={onPress ? 'box-none' : 'none'}
      accessibilityLiveRegion={onPress ? undefined : 'polite'}
    >
      {onPress ? <TouchableOpacity activeOpacity={0.9} onPress={onPress}>{body}</TouchableOpacity> : body}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: wp(16), right: wp(16), zIndex: 20 },
  body: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    paddingVertical: hp(10), paddingHorizontal: wp(12), borderRadius: radius.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  icon: {
    width: ms(30), height: ms(30), borderRadius: ms(15),
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  text: { color: '#fff', fontSize: fontSize.sm, flex: 1 },
  gold: { backgroundColor: palette.goldDark },
  violet: { backgroundColor: palette.violetDark },
});
