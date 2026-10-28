import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type TextStyle, type TouchableOpacityProps } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  /** Gradient drawn over the variant background. */
  gradient?: readonly [string, string, ...string[]];
  gradientDirection?: 'diagonal' | 'horizontal';
  /** Overrides the icon and spinner color. */
  iconColor?: string;
}

const GRADIENT_START = { x: 0, y: 0 };
const GRADIENT_END = { diagonal: { x: 1, y: 1 }, horizontal: { x: 1, y: 0 } } as const;

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
  gradient,
  gradientDirection = 'diagonal',
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
      {gradient && (
        // Rounded instead of clipped: overflow hidden would cut the iOS shadow callers add.
        <LinearGradient
          colors={gradient}
          start={GRADIENT_START}
          end={GRADIENT_END[gradientDirection]}
          style={[StyleSheet.absoluteFill, { borderRadius: StyleSheet.flatten(style)?.borderRadius ?? (size === 'lg' ? radius.lg : radius.md) }]}
        />
      )}
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
