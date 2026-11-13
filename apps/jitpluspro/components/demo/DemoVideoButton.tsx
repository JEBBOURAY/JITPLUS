import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { Play } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon as iconTokens } from '@/constants/design';
import type { DemoId } from '@/constants/demoVideos';
import { hapticLight } from '@/utils/haptics';
import { DemoVideoModal } from './DemoVideoModal';
import { hideDemoHint, markDemoSeen, recordDemoHintShown, shouldShowDemoHint, showDemoHint } from './DemoHint';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);
/** Lets the page transition settle before the hint appears. */
const HINT_DELAY_MS = 600;

interface Props {
  id: DemoId;
  /** 'pill' (default): play icon + label. 'header': compact play icon + label for a header's right slot (same line as the page title). */
  variant?: 'pill' | 'header';
  /** 'lg': bigger pill for screens where it must stand out (e.g. over the camera). */
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  /** Icon/label color override, e.g. on a coloured hero. */
  color?: string;
  /** Background override, e.g. on a coloured hero. */
  backgroundColor?: string;
  /** Called when the player opens/closes, e.g. to pause a camera behind it. */
  onOpenChange?: (open: boolean) => void;
  /** Shows the "watch the demo" coach mark when the page opens (default true). */
  hint?: boolean;
}

/** "Voir la démo": opens the page's short demo clip in a full-screen player. */
export function DemoVideoButton({ id, variant = 'pill', size = 'md', style, color, backgroundColor, onOpenChange, hint = true }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const [open, setOpen] = useState(false);
  const label = t('demo.watch');
  const fg = color ?? theme.primary;
  const bg = backgroundColor ?? theme.primaryBg;

  const onPress = useCallback(() => {
    hapticLight();
    hideDemoHint(id);
    markDemoSeen(id).catch(() => {});
    setOpen(true);
    onOpenChange?.(true);
  }, [id, onOpenChange]);

  const ref = useRef<View>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const hintRef = useRef({ text: t('demo.hint'), color: backgroundColor ?? theme.primary, isRTL: dir.isRTL });
  hintRef.current = { text: t('demo.hint'), color: backgroundColor ?? theme.primary, isRTL: dir.isRTL };

  // Coach mark: each time the page gains focus (or on mount outside a navigator).
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    if (!hint) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pulse: Animated.CompositeAnimation | undefined;
    const start = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!(await shouldShowDemoHint(id))) return;
        const node = ref.current;
        if (!node || (navigation && !navigation.isFocused())) return;
        node.measureInWindow((x, y, width, height) => {
          if (!width || !height || (navigation && !navigation.isFocused())) return;
          const h = hintRef.current;
          showDemoHint({
            id,
            rect: { x, y, width, height },
            text: h.text,
            color: h.color,
            textColor: '#FFFFFF',
            isRTL: h.isRTL,
            onPress: () => onPressRef.current(),
          });
          recordDemoHintShown(id).catch(() => {});
          AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduce) => {
            if (reduce) return;
            const beat = [
              Animated.timing(scale, { toValue: 1.08, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
              Animated.timing(scale, { toValue: 1, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ];
            pulse = Animated.sequence([...beat, Animated.delay(120), ...beat]);
            pulse.start();
          });
        });
      }, HINT_DELAY_MS);
    };
    const stop = () => {
      clearTimeout(timer);
      pulse?.stop();
      scale.setValue(1);
      hideDemoHint(id);
    };
    if (!navigation) {
      start();
      return stop;
    }
    if (navigation.isFocused()) start();
    const offFocus = navigation.addListener('focus', start);
    const offBlur = navigation.addListener('blur', stop);
    return () => { offFocus(); offBlur(); stop(); };
  }, [hint, id, navigation, scale]);
  const onClose = () => {
    setOpen(false);
    onOpenChange?.(false);
  };

  return (
    <>
      <AnimatedTouchable
        ref={ref}
        onPress={onPress}
        activeOpacity={0.8}
        hitSlop={variant === 'pill' ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          [variant === 'header' ? styles.headerPill : styles.pill, { flexDirection: dir.row, alignSelf: variant === 'header' ? 'center' : dir.alignStart }],
          { backgroundColor: bg },
          size === 'lg' && styles.pillLg,
          style,
          { transform: [{ scale }] },
        ]}
      >
        <Play size={size === 'lg' ? 18 : 13} color={fg} fill={fg} strokeWidth={iconTokens.strokeSmall} />
        <Text style={[styles.label, size === 'lg' && styles.labelLg, { color: fg }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{label}</Text>
      </AnimatedTouchable>
      <DemoVideoModal id={id} visible={open} onClose={onClose} />
    </>
  );
}

/** Header right slot: the labelled demo button followed by the screen's own actions (mirrored in Arabic). */
export function DemoHeaderActions({ id, children }: { id: DemoId; children?: React.ReactNode }) {
  const dir = useDir();
  return (
    <View style={[styles.headerActions, { flexDirection: dir.row }]}>
      <DemoVideoButton id={id} variant="header" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: { alignItems: 'center', gap: 8 },
  pill: {
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  label: { fontFamily: font.semibold, fontSize: 13 },
  pillLg: { minHeight: 52, paddingHorizontal: 26, gap: 10 },
  labelLg: { fontSize: 17, fontFamily: font.semibold },
  headerPill: { alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 999, flexShrink: 0 },
});
