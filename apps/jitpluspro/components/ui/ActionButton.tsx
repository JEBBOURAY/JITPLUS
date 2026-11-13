import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type TextStyle, type TouchableOpacityProps } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { radius } from '@/utils/responsive';
import { font, icon as iconTokens } from '@/constants/design';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

interface Props extends TouchableOpacityProps {
  label: string;
  loading?: boolean;
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconPosition?: 'start' | 'end';
  /** Mirror the icon in Arabic (arrows, chevrons). */
  flipIconInRTL?: boolean;
  labelStyle?: StyleProp<TextStyle>;
  /** @deprecated Ignored: buttons use the flat variant color. Kept so existing callers compile. */
  gradient?: readonly [string, string, ...string[]];
  /** @deprecated Ignored, see `gradient`. */
  gradientDirection?: 'diagonal' | 'horizontal';
  /** Overrides the icon and spinner color. */
  iconColor?: string;
}

export function ActionButton({
  label,
  loading = false,
  disabled,
  style,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'start',
  flipIconInRTL = false,
  labelStyle,
  gradient: _gradient,
  gradientDirection: _gradientDirection,
  iconColor,
  ...props
}: Props) {
  const theme = useTheme();
  const { isRTL } = useLanguage();
  const inactive = disabled || loading;

  const palette = {
    primary: { bg: theme.primary, fg: '#FFFFFF', border: theme.primary },
    secondary: { bg: theme.bgCard, fg: theme.text, border: theme.border },
    ghost: { bg: 'transparent', fg: theme.primary, border: 'transparent' },
    danger: { bg: theme.danger, fg: '#FFFFFF', border: theme.danger },
  }[variant];
  const iconFg = iconColor ?? palette.fg;

  const iconNode = Icon ? (
    <Icon
      size={size === 'lg' ? iconTokens.md : 18}
      color={iconFg}
      strokeWidth={iconTokens.stroke}
      style={flipIconInRTL && isRTL ? styles.flip : undefined}
    />
  ) : null;
  const iconFirst = (iconPosition === 'start') !== isRTL;

  return (
    <TouchableOpacity
      {...props}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      activeOpacity={0.8}
      style={[
        styles.button,
        size === 'lg' && styles.lg,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.55 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={iconFg} />
      ) : (
        <View style={styles.content}>
          {iconFirst && iconNode}
          <Text
            style={[styles.label, size === 'lg' && styles.labelLg, { color: palette.fg }, labelStyle]}
            maxFontSizeMultiplier={1.4}
            numberOfLines={1}
          >
            {label}
          </Text>
          {!iconFirst && iconNode}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lg: { minHeight: 52, paddingVertical: 14, borderRadius: radius.lg },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: 14, fontFamily: font.semibold, textAlign: 'center' },
  labelLg: { fontSize: 16 },
  flip: { transform: [{ scaleX: -1 }] },
});
