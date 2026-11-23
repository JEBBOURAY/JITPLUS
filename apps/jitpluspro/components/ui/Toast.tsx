import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, Check } from 'lucide-react-native';
import { create } from 'zustand';
import { Text } from '@/components/AppText';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { font, icon } from '@/constants/design';
import { EASE_OUT } from '@/utils/motion';
import { hapticError, hapticSuccess } from '@/utils/haptics';

/**
 * App-wide toast: a short, non-blocking confirmation at the top of the screen
 * (the keyboard and the bottom action bars never hide it). Replaces success
 * alerts and simple error alerts, which stopped the merchant with an OK button.
 * It survives navigation, so `toast.success(...)` right before `router.back()`
 * shows on the previous screen. Keep Alert for confirmations and choices.
 */

type ToastKind = 'success' | 'error';

interface ToastState {
  id: number;
  kind: ToastKind;
  message: string | null;
  show: (message: string, kind: ToastKind) => void;
  hide: () => void;
}

const DURATION_MS: Record<ToastKind, number> = { success: 2200, error: 4200 };

export const useToastStore = create<ToastState>((set) => ({
  id: 0,
  kind: 'success',
  message: null,
  show: (message, kind) => set((s) => ({ id: s.id + 1, kind, message })),
  hide: () => set({ message: null }),
}));

/** Imperative API, usable from screens, hooks and mutation callbacks. */
export const toast = {
  success(message: string) {
    hapticSuccess();
    useToastStore.getState().show(message, 'success');
  },
  error(message: string) {
    hapticError();
    useToastStore.getState().show(message, 'error');
  },
};

/** Mounted once in the root layout. */
export function ToastHost() {
  const { id, kind, message, hide } = useToastStore();
  const theme = useTheme();
  const dir = useDir();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion() === true;
  const [anim] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) return;
    AccessibilityInfo.announceForAccessibility(message);
    anim.setValue(reduceMotion ? 1 : 0);
    if (!reduceMotion) {
      Animated.timing(anim, { toValue: 1, duration: 200, easing: EASE_OUT, useNativeDriver: true }).start();
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(hide, DURATION_MS[kind]);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // A new show() bumps `id`, even with the same text: restart the timer.
  }, [id, message, kind, anim, hide, reduceMotion]);

  if (!message) return null;

  const isError = kind === 'error';
  const Icon = isError ? AlertCircle : Check;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] });

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>
        <Pressable
          onPress={hide}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            {
              flexDirection: dir.row,
              backgroundColor: theme.mode === 'dark' ? theme.bgElevated : palette.gray900,
            },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: isError ? theme.danger : palette.violet }]}>
            <Icon size={13} color="#fff" strokeWidth={icon.strokeSmall} />
          </View>
          <Text
            style={[styles.text, { textAlign: dir.textAlign }]}
            numberOfLines={3}
            maxFontSizeMultiplier={1.3}
          >
            {message}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 1000, elevation: 1000 },
  toast: {
    maxWidth: 480,
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },
  icon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  text: { flexShrink: 1, color: '#fff', fontSize: 14, lineHeight: 19, fontFamily: font.medium },
});
