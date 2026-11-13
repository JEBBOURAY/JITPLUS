import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { X, Smartphone, ArrowRight } from 'lucide-react-native';
import { useTheme, palette, type ThemeColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms, wp, hp, fontSize, radius } from '@/utils/responsive';
import { EASE_OUT } from '@/utils/motion';
import { useReduceMotion } from '@/hooks/useReduceMotion';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function FirstScanGuide({ visible, onClose }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();

  const reduceMotion = useReduceMotion() === true;
  const [slideAnim] = useState(() => new Animated.Value(0));
  const closingRef = useRef(false);

  // Nothing renders while hidden (see below), so only the show transition is animated here;
  // the hide transition runs in handleClose before onClose flips `visible`.
  useEffect(() => {
    if (!visible) return;
    closingRef.current = false;
    slideAnim.setValue(0);
    // Not caused by a finger: a timed ease-out, no spring overshoot.
    Animated.timing(slideAnim, { toValue: 1, duration: 260, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [visible, slideAnim]);

  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(slideAnim, { toValue: 0, duration: 180, easing: EASE_OUT, useNativeDriver: true }).start(() => {
      onClose();
    });
  };

  if (!visible) return null;

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 24, 0] });
  const opacity = slideAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.8, 1] });

  return (
    <Animated.View
      style={[styles.container, { opacity, transform: [{ translateY }] }]}
      pointerEvents="box-none"
    >
      <View style={[styles.card, { backgroundColor: theme.bgCard }]}>
        {/* Close */}
        <Pressable
          style={[styles.closeBtn, { backgroundColor: theme.bgElevated }]}
          onPress={handleClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <X size={ms(14)} color={theme.textMuted} strokeWidth={2.5} />
        </Pressable>

        {/* Icon */}
        <View style={[styles.iconCircle, { backgroundColor: palette.violet }]}>
          <Smartphone size={ms(22)} color="#fff" strokeWidth={2} />
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: theme.text }]}>
          {t('scan.guideTitle')}
        </Text>

        {/* Steps */}
        <View style={styles.stepsContainer}>
          <StepRow number="1" text={t('scan.guideStep1')} theme={theme} />
          <StepRow number="2" text={t('scan.guideStep2')} theme={theme} />
          <StepRow number="3" text={t('scan.guideStep3')} theme={theme} />
        </View>

        {/* CTA */}
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          {t('scan.guideHint')}
        </Text>

        {/* Got it button */}
        <View style={{ width: '100%' }}>
          <Pressable onPress={handleClose} accessibilityRole="button">
            <View style={[styles.gotItBtn, { backgroundColor: palette.violet }]}>
              <Text style={styles.gotItText}>{t('scan.guideGotIt')}</Text>
              <ArrowRight size={ms(16)} color="#fff" strokeWidth={2} />
            </View>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

function StepRow({ number, text, theme }: { number: string; text: string; theme: ThemeColors }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepNumber}>{number}</Text>
      </View>
      <Text style={[styles.stepText, { color: theme.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: wp(16),
    right: wp(16),
    bottom: hp(120),
    zIndex: 50,
  },
  card: {
    borderRadius: radius.xl,
    padding: ms(20),
    paddingTop: ms(24),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  closeBtn: {
    position: 'absolute',
    top: ms(12),
    right: ms(12),
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  iconCircle: {
    width: ms(48),
    height: ms(48),
    borderRadius: ms(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(10),
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: hp(12),
  },
  stepsContainer: {
    width: '100%',
    gap: hp(8),
    marginBottom: hp(10),
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(10),
  },
  stepBadge: {
    width: ms(24),
    height: ms(24),
    borderRadius: ms(12),
    backgroundColor: palette.violet + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: palette.violet,
  },
  stepText: {
    fontSize: fontSize.sm,
    flex: 1,
    lineHeight: ms(20),
  },
  hint: {
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginBottom: hp(12),
    lineHeight: ms(18),
  },
  gotItBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(8),
    paddingVertical: hp(12),
    borderRadius: ms(24),
  },
  gotItText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
