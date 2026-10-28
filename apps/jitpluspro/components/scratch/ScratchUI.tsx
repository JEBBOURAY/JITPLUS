import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  type StyleProp,
  type ViewStyle,
  type TextInputProps,
} from 'react-native';
import { ArrowLeft, Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';
import { font, icon as iconTokens } from '@/constants/design';
import type { ScratchCampaignStatus } from '@jitplus/shared/src/scratch';

/** Same look as the "Ma boutique" ScreenHeader (components/stores/StoreUi). */
export function ScreenHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 12, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <ArrowLeft size={iconTokens.md} color={theme.text} strokeWidth={iconTokens.stroke} style={isRTL ? styles.flipX : undefined} />
      </TouchableOpacity>
      <Text
        style={[styles.headerTitle, { color: theme.text, textAlign: isRTL ? 'right' : 'left' }]}
        numberOfLines={1}
        accessibilityRole="header"
        maxFontSizeMultiplier={1.3}
      >
        {title}
      </Text>
      {right}
    </View>
  );
}

export function Section({ title, children, style, right }: {
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  right?: React.ReactNode;
}) {
  const theme = useTheme();
  const { isRTL } = useLanguage();
  return (
    <View style={[styles.section, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }, style]}>
      {(title || right) && (
        <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {title ? (
            <Text style={[styles.sectionTitle, { color: theme.text, textAlign: isRTL ? 'right' : 'left' }]} maxFontSizeMultiplier={1.4}>
              {title}
            </Text>
          ) : <View />}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function FieldLabel({ text, hint }: { text: string; hint?: string }) {
  const theme = useTheme();
  const { isRTL } = useLanguage();
  const textAlign = isRTL ? 'right' : 'left';
  return (
    <View style={styles.labelWrap}>
      <Text style={[styles.label, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>{text}</Text>
      {hint ? <Text style={[styles.hint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>{hint}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const theme = useTheme();
  const { isRTL } = useLanguage();
  return (
    <TextInput
      placeholderTextColor={theme.inputPlaceholder}
      {...props}
      style={[
        styles.input,
        { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text, textAlign: isRTL ? 'right' : 'left' },
        props.multiline && styles.inputMultiline,
        props.style,
      ]}
    />
  );
}

/** Tinted outline chip, same style as the "Ma boutique" chips (components/stores/FicheControls). */
export function Chip({ label, selected, onPress, disabled, accessibilityLabel }: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const { isRTL } = useLanguage();
  const color = selected ? '#FFFFFF' : theme.textSecondary;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.chip,
        {
          flexDirection: isRTL ? 'row-reverse' : 'row',
          backgroundColor: selected ? theme.primary : theme.bgInput,
          borderColor: selected ? theme.primary : theme.borderLight,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color }]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      {selected && <Check size={13} color={color} strokeWidth={iconTokens.strokeSmall} />}
    </TouchableOpacity>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  const { isRTL } = useLanguage();
  return <View style={[styles.chipRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>{children}</View>;
}

export function Button({ label, onPress, loading, disabled, variant = 'primary', icon: Icon, style }: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const { isRTL } = useLanguage();
  const colors = buttonColors(theme, variant);
  const inactive = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      accessibilityLabel={label}
      style={[
        styles.button,
        { backgroundColor: colors.bg, borderColor: colors.border, opacity: inactive ? 0.55 : 1, flexDirection: isRTL ? 'row-reverse' : 'row' },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.text} size="small" /> : Icon ? <Icon size={18} color={colors.text} strokeWidth={iconTokens.stroke} /> : null}
      <Text style={[styles.buttonText, { color: colors.text }]} maxFontSizeMultiplier={1.3}>{label}</Text>
    </TouchableOpacity>
  );
}

function buttonColors(theme: ThemeColors, variant: 'primary' | 'secondary' | 'danger' | 'ghost') {
  switch (variant) {
    case 'danger':
      return { bg: theme.danger, border: theme.danger, text: '#FFFFFF' };
    case 'secondary':
      return { bg: theme.bgCard, border: theme.border, text: theme.text };
    case 'ghost':
      return { bg: 'transparent', border: 'transparent', text: theme.primary };
    default:
      return { bg: theme.primary, border: theme.primary, text: '#FFFFFF' };
  }
}

function campaignStatusColor(theme: ThemeColors, status: ScratchCampaignStatus): string {
  switch (status) {
    case 'SCHEDULED':
      return theme.warning;
    case 'SENDING':
      return theme.primary;
    case 'SENT':
      return theme.success;
    case 'CANCELLED':
      return theme.danger;
    default:
      return theme.textMuted;
  }
}

export function StatusPill({ label, color }: { label: string; color: string }) {
  const { isRTL } = useLanguage();
  return (
    <View style={[styles.pill, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: `${color}1A`, borderColor: `${color}40` }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]} maxFontSizeMultiplier={1.3}>{label}</Text>
    </View>
  );
}

export function CampaignStatusPill({ status }: { status: ScratchCampaignStatus }) {
  const theme = useTheme();
  const { t } = useLanguage();
  return <StatusPill label={t(`scratch.campaignStatus.${status}`)} color={campaignStatusColor(theme, status)} />;
}

/** Big tappable choice with a title and a one-line explanation. */
export function OptionCard({ title, description, icon: Icon, selected, onPress }: {
  title: string;
  description: string;
  icon?: LucideIcon;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { isRTL } = useLanguage();
  const textAlign = isRTL ? 'right' : 'left';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${description}`}
      style={[
        styles.option,
        {
          flexDirection: isRTL ? 'row-reverse' : 'row',
          borderColor: selected ? theme.primary : theme.borderLight,
          backgroundColor: selected ? theme.primaryBg : theme.bgElevated,
        },
      ]}
    >
      {Icon ? (
        <View style={[styles.optionIcon, { backgroundColor: theme.primaryBg }]}>
          <Icon size={iconTokens.md} color={theme.primary} strokeWidth={iconTokens.stroke} />
        </View>
      ) : null}
      <View style={styles.optionBody}>
        <Text style={[styles.optionTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>{title}</Text>
        <Text style={[styles.optionDesc, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>{description}</Text>
      </View>
      <View style={[styles.radio, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : 'transparent' }]}>
        {selected && <Check size={14} color="#FFFFFF" strokeWidth={iconTokens.strokeSmall} />}
      </View>
    </TouchableOpacity>
  );
}

/**
 * Open state of a MoreOptions block: it opens by itself for a value outside the
 * presets (a loaded campaign included), then follows the merchant's taps.
 */
export function useMoreOptions(custom: boolean) {
  const [open, setOpen] = React.useState(custom);
  const [touched, setTouched] = React.useState(false);
  if (custom && !open && !touched) setOpen(true);
  const toggle = React.useCallback(() => {
    setTouched(true);
    setOpen((v) => !v);
  }, []);
  const close = React.useCallback(() => {
    setTouched(true);
    setOpen(false);
  }, []);
  return { open, toggle, close };
}

/** Collapsed-by-default block for the settings most merchants never need. */
export function MoreOptions({ open, onToggle, label, children }: {
  open: boolean;
  onToggle: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const { isRTL } = useLanguage();
  return (
    <>
      <TouchableOpacity
        onPress={onToggle}
        style={[styles.moreToggle, { borderTopColor: theme.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.moreText, { color: theme.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        {open
          ? <ChevronUp size={18} color={theme.textMuted} strokeWidth={iconTokens.stroke} />
          : <ChevronDown size={18} color={theme.textMuted} strokeWidth={iconTokens.stroke} />}
      </TouchableOpacity>
      {open && <View style={styles.moreBody}>{children}</View>}
    </>
  );
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warning' | 'danger' }) {
  const theme = useTheme();
  const { isRTL } = useLanguage();
  const color = tone === 'danger' ? theme.danger : tone === 'warning' ? theme.warning : theme.primary;
  return (
    <View style={[styles.notice, { backgroundColor: `${color}12`, borderColor: `${color}35` }]}>
      <Text style={[styles.noticeText, { color: theme.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} maxFontSizeMultiplier={1.4}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flipX: { transform: [{ scaleX: -1 }] },
  header: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10, gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 24, fontFamily: font.bold, letterSpacing: -0.5 },
  section: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  sectionHeader: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { flexShrink: 1, fontSize: ms(15), fontFamily: font.semibold },
  labelWrap: { gap: 2 },
  label: { fontSize: ms(13), fontFamily: font.medium },
  hint: { fontSize: ms(12), fontFamily: font.regular },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: ms(15),
    fontFamily: font.regular,
    minHeight: 46,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexWrap: 'wrap', gap: 8 },
  chip: { alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  chipText: { fontSize: 13, fontFamily: font.medium },
  button: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  buttonText: { fontSize: ms(15), fontFamily: font.semibold },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: ms(12), fontFamily: font.semibold },
  option: { alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 14 },
  optionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optionBody: { flex: 1 },
  optionTitle: { fontSize: ms(15), fontFamily: font.semibold },
  optionDesc: { fontSize: ms(13), fontFamily: font.regular, lineHeight: ms(18), marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  moreToggle: { alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, minHeight: 44 },
  moreText: { flex: 1, fontSize: ms(14), fontFamily: font.medium },
  moreBody: { gap: 10 },
  notice: { borderRadius: 12, borderWidth: 1, padding: 12 },
  noticeText: { fontSize: ms(13), lineHeight: ms(19), fontFamily: font.regular },
});
