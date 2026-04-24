import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet, Linking, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Download, X, Smartphone, ArrowRight } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms, wp, hp, fontSize, radius } from '@/utils/responsive';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const CLIENT_APP_ANDROID = 'https://play.google.com/store/apps/details?id=com.jitplus.app';
const CLIENT_APP_IOS = 'https://apps.apple.com/app/jitplus/id6762307929';

export default function FirstScanGuide({ visible, onClose }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();

  const slideAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(0);
      Animated.spring(slideAnim, {
        toValue: 1,
        damping: 16,
        stiffness: 140,
        useNativeDriver: true,
      }).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ).start();
    } else {
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleClose = () => {
    Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      onClose();
    });
  };

  if (!visible) return null;

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [200, 0] });
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
        <LinearGradient
          colors={[palette.violetDark, palette.violet]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconCircle}
        >
          <Smartphone size={ms(22)} color="#fff" strokeWidth={2} />
        </LinearGradient>

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
        <Animated.View style={{ transform: [{ scale: pulseAnim }], width: '100%' }}>
          <Pressable onPress={handleClose} accessibilityRole="button">
            <LinearGradient
              colors={[palette.violetDark, palette.violet]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gotItBtn}
            >
              <Text style={styles.gotItText}>{t('scan.guideGotIt')}</Text>
              <ArrowRight size={ms(16)} color="#fff" strokeWidth={2} />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

function StepRow({ number, text, theme }: { number: string; text: string; theme: any }) {
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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
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
    fontWeight: '700',
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
    fontWeight: '700',
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
    fontWeight: '700',
  },
});
