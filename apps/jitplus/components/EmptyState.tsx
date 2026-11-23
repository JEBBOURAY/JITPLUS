import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import FadeInView from '@/components/FadeInView';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/utils/fonts';
import { fontSize, hp, ms, radius, wp } from '@/utils/responsive';

/** One size for every empty-state icon circle. */
const ICON_CIRCLE = ms(72);

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  /** primary: filled violet (the one action of the screen); secondary: outlined. */
  variant?: 'primary' | 'secondary';
}

interface Props {
  icon: LucideIcon;
  /** Defaults to the brand violet on its soft tint. */
  iconColor?: string;
  iconBg?: string;
  title: string;
  hint?: string;
  action?: EmptyStateAction;
  /** Second, outlined action under the first one (both then take the full width). */
  secondaryAction?: EmptyStateAction;
  /** Fades the block in after this delay (ms); left out, it shows at once. */
  fadeInDelay?: number;
  style?: StyleProp<ViewStyle>;
}

/** Nothing to show yet: an icon in a circle, what is empty, and what to do next. */
export default function EmptyState({
  icon: Icon, iconColor, iconBg, title, hint, action, secondaryAction, fadeInDelay, style,
}: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const stacked = !!action && !!secondaryAction;

  const renderAction = (a: EmptyStateAction, fallback: 'primary' | 'secondary') => {
    const primary = (a.variant ?? fallback) === 'primary';
    const color = primary ? '#FFFFFF' : theme.text;
    const ActionIcon = a.icon;
    return (
      <TouchableOpacity
        key={a.label}
        onPress={a.onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        style={[
          styles.btn,
          stacked && styles.btnStretch,
          primary
            ? { backgroundColor: palette.violet }
            : { backgroundColor: theme.bgCard, borderColor: theme.border, borderWidth: 1 },
        ]}
      >
        {ActionIcon && <ActionIcon size={ms(16)} color={color} strokeWidth={2} />}
        <Text style={[styles.btnText, { color, fontFamily: primary ? fonts.bold : fonts.semibold }]}>{a.label}</Text>
      </TouchableOpacity>
    );
  };

  const content = (
    <>
      <View style={[styles.iconCircle, { backgroundColor: iconBg ?? theme.primaryBg }]}>
        <Icon size={ms(30)} color={iconColor ?? theme.primary} strokeWidth={1.75} />
      </View>
      <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]}>{title}</Text>
      {!!hint && <Text style={[styles.hint, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{hint}</Text>}
      {(action || secondaryAction) && (
        <View style={[styles.actions, stacked && styles.actionsStacked]}>
          {action && renderAction(action, 'primary')}
          {secondaryAction && renderAction(secondaryAction, 'secondary')}
        </View>
      )}
    </>
  );

  return fadeInDelay != null
    ? <FadeInView delay={fadeInDelay} style={StyleSheet.flatten([styles.wrap, style])}>{content}</FadeInView>
    : <View style={[styles.wrap, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wp(24), paddingVertical: hp(40) },
  iconCircle: {
    width: ICON_CIRCLE, height: ICON_CIRCLE, borderRadius: ICON_CIRCLE / 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: hp(16),
  },
  title: { fontSize: fontSize.lg, textAlign: 'center', letterSpacing: -0.2 },
  hint: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: ms(20), marginTop: hp(6), maxWidth: wp(290) },
  actions: { alignItems: 'center', gap: hp(10), marginTop: hp(22) },
  actionsStacked: { alignSelf: 'stretch', paddingHorizontal: wp(8) },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(8),
    minHeight: ms(48), borderRadius: radius.lg, paddingHorizontal: wp(20),
  },
  btnStretch: { alignSelf: 'stretch' },
  btnText: { fontSize: fontSize.sm },
});
