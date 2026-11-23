import type React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { DIR_FLIP } from '@/utils/rtl';
import { hp, ms, wp } from '@/utils/responsive';

interface HeaderProps {
  /** The content scrolled under the header: a hairline (and a soft shadow in light mode) separates them. */
  isScrolled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/** Pinned top bar of the main screens (home, QR, appointments, profile, notifications…), safe-area aware. */
export function ScreenHeader({ isScrolled = false, style, children }: HeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + hp(10), backgroundColor: theme.bg, borderBottomColor: isScrolled ? theme.border : 'transparent' },
        isScrolled && !theme.isDark && styles.headerShadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Round back button of the screen headers, mirrored in Arabic.
 * `floating`: white on a dark veil, over a photo hero.
 */
export function HeaderBackButton({ onPress, disabled, floating }: { onPress: () => void; disabled?: boolean; floating?: boolean }) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      style={({ pressed }) => [
        styles.backBtn,
        floating ? styles.floatingBtn : { backgroundColor: theme.bgCard, borderColor: theme.border },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
    >
      <ArrowLeft size={ms(20)} color={floating ? '#FFFFFF' : theme.text} strokeWidth={2} style={DIR_FLIP} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: wp(20),
    paddingBottom: hp(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  headerShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  backBtn: { width: ms(40), height: ms(40), borderRadius: ms(20), borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  floatingBtn: { backgroundColor: 'rgba(15,23,42,0.45)', borderWidth: 0 },
  pressed: { opacity: 0.8 },
});
