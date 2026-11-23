import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import MerchantLogo from '@/components/MerchantLogo';
import RetryState from '@/components/RetryState';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { hp, ms, wp } from '@/utils/responsive';
import { DIR_FLIP } from '@/utils/rtl';

/** Building blocks of the booking flow (app/book/[merchantId]). */

/** Title bar: back arrow (left out on the last step), centered title. */
export function BookingHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t } = useLanguage();
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={ms(24)} color={theme.text} style={DIR_FLIP} />
        </TouchableOpacity>
      ) : <View style={styles.headerSpacer} />}
      <Text style={[styles.headerTitle, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={1}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

export function BookingSectionTitle({ label }: { label: string }) {
  const theme = useTheme();
  const fonts = useAppFonts();
  return (
    <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header">{label}</Text>
  );
}

/** Logo and name of the shop, on top of the choice and of the recap. */
export function BookingMerchantStrip({ merchant }: { merchant?: { logoUrl?: string | null; nomBoutique: string } | null }) {
  const theme = useTheme();
  const fonts = useAppFonts();
  if (!merchant) return null;
  return (
    <View style={styles.merchantStrip}>
      <MerchantLogo logoUrl={merchant.logoUrl} merchantName={merchant.nomBoutique} style={styles.merchantLogo} />
      <Text style={[styles.merchantName, { color: theme.textSecondary, fontFamily: fonts.semibold }]} numberOfLines={1}>
        {merchant.nomBoutique}
      </Text>
    </View>
  );
}

/** Centered state (error, unavailable): an icon, the message and an optional retry. */
export function BookingState({ icon, message, onRetry }: { icon: ReactNode; message: string; onRetry?: () => void }) {
  return (
    <View style={styles.stateWrap}>
      {icon}
      <RetryState message={message} onRetry={onRetry} />
    </View>
  );
}

/** Bar pinned under the scroll, above the home indicator. */
export function BookingBottomBar({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bottomBar,
        { borderTopColor: theme.border, backgroundColor: theme.bg, paddingBottom: Math.max(insets.bottom, hp(12)) },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Main action of a step: dimmed while disabled, a spinner while busy. */
export function BookingPrimaryButton({ label, onPress, disabled, busy }: {
  label: string; onPress: () => void; disabled?: boolean; busy?: boolean;
}) {
  const fonts = useAppFonts();
  const opacity = busy ? 0.7 : disabled ? 0.45 : 1;
  return (
    <TouchableOpacity
      // Filled button with white text: keep the deep violet (theme.primary is light in dark mode).
      style={[styles.primaryBtn, { backgroundColor: palette.violet, opacity }]}
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
    >
      {busy
        ? <ActivityIndicator color="#fff" />
        : <Text style={[styles.primaryText, { fontFamily: fonts.semibold }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

export const bookingStyles = StyleSheet.create({
  flex: { flex: 1 },
  scrollBody: { paddingHorizontal: wp(20), paddingBottom: hp(24), gap: hp(10) },
  pressed: { opacity: 0.7 },
  outlineBtn: { marginTop: hp(4), paddingHorizontal: wp(24), paddingVertical: hp(10), borderRadius: 12, borderWidth: 1 },
  outlineBtnText: { fontSize: ms(14) },
});

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: hp(10), paddingHorizontal: wp(20) },
  headerSpacer: { width: ms(24) },
  headerTitle: { flex: 1, fontSize: ms(19), textAlign: 'center', marginHorizontal: wp(10) },
  sectionTitle: { fontSize: ms(16), marginTop: hp(12), textAlign: 'left' },
  merchantStrip: { flexDirection: 'row', alignItems: 'center', gap: wp(10) },
  merchantLogo: { width: ms(32), height: ms(32), borderRadius: ms(9) },
  merchantName: { flex: 1, fontSize: ms(14), textAlign: 'left' },
  stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: hp(12), paddingHorizontal: wp(30), paddingBottom: hp(40) },
  bottomBar: { paddingHorizontal: wp(20), paddingTop: hp(12), borderTopWidth: StyleSheet.hairlineWidth },
  primaryBtn: { borderRadius: ms(14), paddingVertical: hp(14), alignItems: 'center', justifyContent: 'center', minHeight: ms(50) },
  primaryText: { color: '#fff', fontSize: ms(15) },
});
