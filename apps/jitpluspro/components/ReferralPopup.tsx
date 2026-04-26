import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, Easing, Share, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gift, X, Share2, Users } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms, wp, hp, fontSize, radius } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logWarn } from '@/utils/devLogger';

interface Props {
  visible: boolean;
  onClose: () => void;
  referralCode: string | null;
}

export default function ReferralPopup({ visible, onClose, referralCode }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

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
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
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

  const handleShare = async () => {
    try {
      const iosAppId = process.env.EXPO_PUBLIC_IOS_APP_ID ?? '';
      const androidUrl = 'https://play.google.com/store/apps/details?id=com.jitplus.pro';
      const iosUrl = iosAppId
        ? `https://apps.apple.com/app/id${iosAppId}`
        : 'https://apps.apple.com/search?term=jitplus+pro';
      const webUrl = `https://jitplus-api-290470991104.europe-west9.run.app/pro/referral`;
      const links = `Lien: ${webUrl}\nCode: ${referralCode}`;
      await Share.share({
        message: t('referralScreen.shareMessage', { code: referralCode ?? '', links }),
        title: 'JitPlus Pro',
      });
    } catch (err: any) {
      if (err?.message && !err.message.includes('cancel') && !err.message.includes('dismiss')) {
        logWarn('ReferralPopup', 'Share failed', err);
      }
    }
  };

  const handleClose = () => {
    Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      onClose();
    });
  };

  if (!visible) return null;

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

        {/* Icon + gradient accent */}
        <LinearGradient
          colors={[palette.violetDark, palette.violet]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconCircle}
        >
          <Gift size={ms(20)} color="#fff" strokeWidth={2} />
        </LinearGradient>

        {/* Text */}
        <Text style={[styles.title, { color: theme.text }]}>
          {t('referral.popupTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>
          {t('referral.popupSubtitle')}
        </Text>

        {/* Share button */}
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Pressable onPress={handleShare} accessibilityRole="button">
            <LinearGradient
              colors={[palette.violetDark, palette.violet]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.shareBtn}
            >
              <Share2 size={ms(15)} color="#fff" strokeWidth={2} />
              <Text style={styles.shareBtnText}>{t('referral.popupShareButton')}</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        {/* Social proof */}
        <View style={styles.socialRow}>
          <Users size={ms(12)} color={theme.textMuted} strokeWidth={1.5} />
          <Text style={[styles.socialText, { color: theme.textMuted }]}>
            {t('referral.socialProof')}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: wp(16),
    right: wp(16),
    zIndex: 30,
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
    marginBottom: hp(14),
    paddingHorizontal: wp(8),
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    paddingVertical: hp(12),
    paddingHorizontal: wp(28),
    borderRadius: ms(24),
  },
  shareBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(5),
    marginTop: hp(10),
  },
  socialText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
});
