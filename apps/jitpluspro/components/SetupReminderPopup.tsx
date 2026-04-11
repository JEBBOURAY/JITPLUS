import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertTriangle, X, ChevronRight } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms, wp, hp, fontSize, radius } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export interface SetupIssue {
  key: 'logo' | 'loyalty' | 'rewards';
  icon: React.ReactNode;
  label: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  issues: SetupIssue[];
}

export default function SetupReminderPopup({ visible, onClose, issues }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const slideAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(0);
      Animated.spring(slideAnim, {
        toValue: 1,
        damping: 16,
        stiffness: 140,
        useNativeDriver: true,
      }).start();

      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
    return () => {
      pulseLoop.current?.stop();
    };
  }, [visible, slideAnim, pulseAnim]);

  const handleClose = () => {
    Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      onClose();
    });
  };

  const handleFix = () => {
    Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      onClose();
      router.push('/settings');
    });
  };

  if (!visible || issues.length === 0) return null;

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [120, 0] });
  const opacity = slideAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.8, 1] });

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: insets.bottom + hp(70), opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.card, { backgroundColor: theme.bgCard }]}>
        {/* Close button */}
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
          colors={['#EF4444', '#DC2626']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconCircle}
        >
          <AlertTriangle size={ms(20)} color="#fff" strokeWidth={2} />
        </LinearGradient>

        {/* Title */}
        <Text style={[styles.title, { color: theme.text }]}>
          {t('setupReminder.title')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>
          {t('setupReminder.subtitle')}
        </Text>

        {/* Issues list */}
        <View style={styles.issuesList}>
          {issues.map((issue) => (
            <View key={issue.key} style={[styles.issueRow, { backgroundColor: theme.bgElevated }]}>
              {issue.icon}
              <Text style={[styles.issueText, { color: theme.text }]} numberOfLines={1}>
                {issue.label}
              </Text>
            </View>
          ))}
        </View>

        {/* CTA button */}
        <Animated.View style={{ transform: [{ scale: pulseAnim }], width: '100%' }}>
          <Pressable onPress={handleFix} accessibilityRole="button">
            <LinearGradient
              colors={['#EF4444', '#DC2626']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fixBtn}
            >
              <Text style={styles.fixBtnText}>{t('setupReminder.fixBtn')}</Text>
              <ChevronRight size={ms(16)} color="#fff" strokeWidth={2.5} />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: wp(16),
    right: wp(16),
    zIndex: 31,
  },
  card: {
    borderRadius: radius.xl,
    padding: ms(20),
    paddingTop: ms(24),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
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
    width: ms(44),
    height: ms(44),
    borderRadius: ms(22),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(10),
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: hp(4),
  },
  subtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: ms(20),
    marginBottom: hp(12),
    paddingHorizontal: wp(8),
  },
  issuesList: {
    width: '100%',
    gap: hp(6),
    marginBottom: hp(14),
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(10),
    paddingVertical: hp(8),
    paddingHorizontal: wp(12),
    borderRadius: radius.md,
  },
  issueText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    flex: 1,
  },
  fixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(6),
    paddingVertical: hp(12),
    paddingHorizontal: wp(28),
    borderRadius: ms(24),
    width: '100%',
  },
  fixBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
});
