import { memo, type ReactNode } from 'react';
import { ActivityIndicator, I18nManager, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/utils/fonts';
import { fontSize as FS, hp, ms, wp } from '@/utils/responsive';
import ToggleSwitch from './ToggleSwitch';

export interface SettingsRowProps {
  icon: LucideIcon;
  /** Accent used for the icon tile; defaults to the theme primary. */
  tint?: string;
  title: string;
  subtitle?: string;
  /** Right-hand accessory. `switch` renders a toggle bound to `checked`. */
  accessory?: 'chevron' | 'switch' | 'none';
  checked?: boolean;
  /** Short value shown before the chevron (e.g. current language). */
  valueText?: string;
  /** Replaces the icon with a spinner and blocks presses. */
  loading?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  onPress?: () => void;
  /** Rendered under the title line (e.g. an inline segmented control). */
  children?: ReactNode;
}

const CHEVRON_FLIP = I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined;

function SettingsRow({
  icon: Icon, tint, title, subtitle, accessory = 'chevron', checked = false, valueText,
  loading, disabled, destructive, onPress, children,
}: SettingsRowProps) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const accent = destructive ? theme.danger : tint ?? theme.primary;
  const isSwitch = accessory === 'switch';
  const inactive = !!(disabled || loading);

  const content = (
    <>
      <View style={styles.mainLine}>
        <View style={[styles.iconTile, { backgroundColor: `${accent}${theme.isDark ? '26' : '14'}` }]}>
          {loading
            ? <ActivityIndicator size="small" color={accent} />
            : <Icon size={ms(17)} color={accent} strokeWidth={2} />}
        </View>
        <View style={styles.texts}>
          <Text
            style={[styles.title, { color: destructive ? theme.danger : theme.text, fontFamily: fonts.medium }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {!!subtitle && (
            <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={2}>
              {subtitle}
            </Text>
          )}
        </View>
        {!!valueText && (
          <Text style={[styles.valueText, { color: theme.textSecondary, fontFamily: fonts.medium }]} numberOfLines={1}>
            {valueText}
          </Text>
        )}
        {accessory === 'chevron' && (
          <ChevronRight size={ms(18)} color={theme.textMuted} strokeWidth={2} style={CHEVRON_FLIP} />
        )}
        {isSwitch && <ToggleSwitch value={checked} />}
      </View>
      {children}
    </>
  );

  // A non-pressable row must not be a Pressable: it would group its children
  // into one accessibility element and hide nested controls from screen readers.
  if (!onPress) return <View style={styles.row}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      android_ripple={{ color: `${accent}14` }}
      accessibilityRole={isSwitch ? 'switch' : 'button'}
      accessibilityState={isSwitch ? { checked, disabled: inactive } : { disabled: inactive, busy: !!loading }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={({ pressed }) => [
        styles.row,
        pressed && Platform.OS === 'ios' && { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)' },
      ]}
    >
      {content}
    </Pressable>
  );
}

export default memo(SettingsRow);

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: wp(14),
    paddingVertical: hp(12),
    minHeight: ms(60),
    justifyContent: 'center',
  },
  mainLine: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  iconTile: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(11),
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1 },
  title: { fontSize: FS.md, textAlign: 'left' },
  subtitle: { fontSize: FS.xs, marginTop: hp(2), lineHeight: ms(16), textAlign: 'left' },
  valueText: { fontSize: FS.sm, maxWidth: '40%' },
});
