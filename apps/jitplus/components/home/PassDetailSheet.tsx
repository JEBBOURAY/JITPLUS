import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarClock, Check, QrCode, Store, Ticket, Trophy } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import MerchantLogo from '@/components/MerchantLogo';
import { useAppFonts } from '@/utils/fonts';
import { hp, ms, wp, fontSize as FS, radius } from '@/utils/responsive';

export interface PassDetail {
  kind: 'coupon' | 'prize';
  tag: string;
  headline: string;
  detail?: string | null;
  merchantName: string;
  logoUrl?: string | null;
  intro: string;
  steps: string[];
  /** Usage rules that change how to benefit (minimum purchase, days, hours). */
  conditions: string[];
  expiry: string | null;
  expirySoon: boolean;
}

interface Props {
  pass: PassDetail | null;
  onClose: () => void;
}

const STEP_ICONS = [Store, QrCode];

/** Explains a coupon or a won gift: what it is, how to use it, until when. */
export default React.memo(function PassDetailSheet({ pass, onClose }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const insets = useSafeAreaInsets();
  const isDark = theme.mode === 'dark';

  // Keeps the content on screen while the modal fades out.
  const [shown, setShown] = useState<PassDetail | null>(pass);
  useEffect(() => { if (pass) setShown(pass); }, [pass]);

  const slide = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!pass) return;
    slide.setValue(1);
    Animated.spring(slide, { toValue: 0, damping: 18, stiffness: 170, mass: 0.9, useNativeDriver: true }).start();
  }, [pass, slide]);
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [0, hp(420)] });

  const isPrize = shown?.kind === 'prize';
  const accent = isPrize ? palette.emerald : palette.violet;
  const accentText = isPrize ? palette.emerald : (isDark ? palette.violetLight : palette.violet);
  const BadgeIcon = isPrize ? Trophy : Ticket;

  return (
    <Modal visible={!!pass} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
        {shown && (
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: theme.bgCard, paddingBottom: Math.max(insets.bottom, hp(16)) + hp(8), transform: [{ translateY }] },
            ]}
            accessibilityViewIsModal
          >
            <View style={[styles.handle, { backgroundColor: theme.border }]} />

            <View style={styles.top}>
              <View style={styles.logoWrap}>
                <MerchantLogo logoUrl={shown.logoUrl} merchantName={shown.merchantName} style={styles.logo} />
                <View style={[styles.badge, { backgroundColor: accent, borderColor: theme.bgCard }]}>
                  <BadgeIcon size={ms(12)} color="#fff" strokeWidth={2.4} />
                </View>
              </View>
              <View style={styles.topText}>
                <Text style={[styles.tag, { color: accentText, fontFamily: fonts.semibold }]} numberOfLines={1}>{shown.tag}</Text>
                <Text style={[styles.headline, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={2} accessibilityRole="header">
                  {shown.headline}
                </Text>
                <Text style={[styles.merchant, { color: theme.textSecondary, fontFamily: fonts.medium }]} numberOfLines={1}>
                  {shown.merchantName}
                </Text>
              </View>
            </View>

            {!!shown.detail && (
              <Text style={[styles.detail, { color: theme.text, fontFamily: fonts.medium }]}>{shown.detail}</Text>
            )}
            <Text style={[styles.intro, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{shown.intro}</Text>

            <View style={[styles.box, { backgroundColor: isDark ? 'rgba(124,58,237,0.14)' : palette.violetUltraLight }]}>
              <Text style={[styles.boxTitle, { color: theme.text, fontFamily: fonts.semibold }]}>{t('home.passHowTitle')}</Text>
              {shown.steps.map((step, i) => {
                const Icon = STEP_ICONS[i] ?? Check;
                return (
                  <View key={i} style={styles.row}>
                    <View style={[styles.stepIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#fff' }]}>
                      <Icon size={ms(15)} color={isDark ? palette.violetLight : palette.violet} strokeWidth={2} />
                    </View>
                    <Text style={[styles.rowText, { color: theme.text, fontFamily: fonts.medium }]}>{step}</Text>
                  </View>
                );
              })}
              {shown.conditions.map((line, i) => (
                <View key={`c${i}`} style={styles.row}>
                  <Check size={ms(14)} color={theme.textMuted} strokeWidth={2.4} style={styles.conditionIcon} />
                  <Text style={[styles.conditionText, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{line}</Text>
                </View>
              ))}
            </View>

            {!!shown.expiry && (
              <View
                style={[
                  styles.expiry,
                  { backgroundColor: shown.expirySoon ? `${palette.gold}1F` : theme.bgInput },
                ]}
              >
                <CalendarClock size={ms(16)} color={shown.expirySoon ? palette.goldDark : theme.textSecondary} strokeWidth={2} />
                <Text
                  style={[
                    styles.expiryText,
                    { color: shown.expirySoon ? palette.goldDark : theme.text, fontFamily: fonts.semibold },
                  ]}
                >
                  {shown.expiry}
                </Text>
              </View>
            )}

            <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={styles.primaryWrap} accessibilityRole="button">
              <LinearGradient colors={[palette.violetVivid, palette.violetDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
                <Text style={[styles.primaryText, { fontFamily: fonts.bold }]}>{t('home.passGotIt')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,2,12,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: wp(22),
    paddingTop: hp(10),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 24,
  },
  handle: { alignSelf: 'center', width: ms(40), height: 4, borderRadius: 2, marginBottom: hp(18) },
  top: { flexDirection: 'row', alignItems: 'center', gap: ms(14) },
  logoWrap: { width: ms(56), height: ms(56) },
  logo: { width: ms(56), height: ms(56), borderRadius: ms(16), backgroundColor: '#fff' },
  badge: {
    position: 'absolute', right: -ms(5), bottom: -ms(5), width: ms(24), height: ms(24), borderRadius: ms(12),
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  topText: { flex: 1 },
  tag: { fontSize: ms(11), letterSpacing: 0.5, textTransform: 'uppercase' },
  headline: { fontSize: FS.xl, letterSpacing: -0.3, marginTop: hp(2) },
  merchant: { fontSize: FS.sm, marginTop: hp(2) },
  detail: { fontSize: FS.md, marginTop: hp(16), lineHeight: ms(21) },
  intro: { fontSize: FS.sm, marginTop: hp(10), lineHeight: ms(20) },
  box: { borderRadius: radius.lg, padding: ms(14), gap: hp(10), marginTop: hp(16) },
  boxTitle: { fontSize: FS.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: ms(10) },
  stepIcon: { width: ms(30), height: ms(30), borderRadius: ms(15), alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, fontSize: FS.sm, lineHeight: ms(19) },
  conditionIcon: { marginHorizontal: ms(8) },
  conditionText: { flex: 1, fontSize: FS.xs, lineHeight: ms(17) },
  expiry: {
    flexDirection: 'row', alignItems: 'center', gap: ms(10), marginTop: hp(12),
    paddingHorizontal: ms(14), paddingVertical: hp(12), borderRadius: radius.lg,
  },
  expiryText: { flex: 1, fontSize: FS.sm },
  primaryWrap: { marginTop: hp(20), borderRadius: radius.lg, overflow: 'hidden' },
  primary: { height: ms(52), alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  primaryText: { color: '#fff', fontSize: FS.md },
});
