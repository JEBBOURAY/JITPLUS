import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { font } from '@/constants/design';
import { hapticSuccess } from '@/utils/haptics';
import { wp, hp, ms, fontSize } from '@/utils/responsive';

const DISPLAY_MS = 1800;

interface Props {
  storeName: string;
  /** Called once, after the pause or when the merchant taps to skip. */
  onDone: () => void;
}

/** Short celebration between "create account" and the dashboard. */
export function WelcomeOverlay({ storeName, onDone }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const reduceMotion = useReduceMotion();
  const [fade] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(0));
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  // Only reads refs: stable, so the effect below does not restart because of it.
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;
    hapticSuccess();
    const duration = reduceMotion ? 0 : 260;
    const anim = Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration, useNativeDriver: true }),
      reduceMotion
        ? Animated.timing(pop, { toValue: 1, duration: 0, useNativeDriver: true })
        : Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 12 }),
    ]);
    anim.start();
    const timer = setTimeout(finish, DISPLAY_MS);
    return () => {
      anim.stop();
      clearTimeout(timer);
    };
  }, [reduceMotion, fade, pop, finish]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: theme.bg, opacity: fade }]}>
      <Pressable
        style={styles.center}
        onPress={finish}
        accessibilityRole="button"
        accessibilityLabel={t('registerExtra.welcomeReadyTitle', { nom: storeName })}
      >
        <Animated.View
          style={[
            styles.badge,
            {
              transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
            },
          ]}
        >
          <Check size={ms(44)} color="#fff" strokeWidth={3} />
        </Animated.View>
        <Text style={[styles.title, { color: theme.text }]}>
          {t('registerExtra.welcomeReadyTitle', { nom: storeName })}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>
          {t('registerExtra.welcomeReadySub')}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 10, elevation: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wp(32) },
  badge: {
    width: ms(92),
    height: ms(92),
    borderRadius: ms(46),
    backgroundColor: palette.charbon,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(24),
  },
  title: { fontSize: ms(22), fontFamily: font.semibold, textAlign: 'center', marginBottom: hp(8) },
  subtitle: { fontSize: fontSize.sm, fontFamily: font.medium, textAlign: 'center', lineHeight: ms(20) },
});
