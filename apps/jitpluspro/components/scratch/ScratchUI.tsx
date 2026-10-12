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
import { ArrowLeft } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';
import type { ScratchCampaignStatus } from '@jitplus/shared/src/scratch';

export function ScreenHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel={t('common.back')}>
        <ArrowLeft size={22} color={theme.text} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
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

export function Chip({ label, selected, onPress, disabled, accessibilityLabel }: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
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
          backgroundColor: selected ? theme.primary : theme.bgInput,
          borderColor: selected ? theme.primary : theme.borderLight,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
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
      {loading ? <ActivityIndicator color={colors.text} size="small" /> : Icon ? <Icon size={18} color={colors.text} strokeWidth={2.2} /> : null}
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

export function campaignStatusColor(theme: ThemeColors, status: ScratchCampaignStatus): string {
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

export function CampaignStatusPill({ status }: { status: ScratchCampaignStatus }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const color = campaignStatusColor(theme, status);
  return (
    <View style={[styles.pill, { backgroundColor: `${color}1A`, borderColor: `${color}40` }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]} maxFontSizeMultiplier={1.3}>{t(`scratch.campaignStatus.${status}`)}</Text>
    </View>
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
  header: { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, gap: 6 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: ms(22), fontFamily: 'Lexend_700Bold', letterSpacing: -0.4 },
  section: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  sectionHeader: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { flexShrink: 1, fontSize: ms(15), fontFamily: 'Lexend_600SemiBold' },
  labelWrap: { gap: 2 },
  label: { fontSize: ms(13), fontFamily: 'Lexend_500Medium' },
  hint: { fontSize: ms(11.5), fontFamily: 'Lexend_400Regular' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: ms(15),
    fontFamily: 'Lexend_400Regular',
    minHeight: 46,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  chipText: { fontSize: ms(13), fontFamily: 'Lexend_500Medium' },
  button: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  buttonText: { fontSize: ms(15), fontFamily: 'Lexend_600SemiBold' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: ms(11.5), fontFamily: 'Lexend_600SemiBold' },
  notice: { borderRadius: 12, borderWidth: 1, padding: 12 },
  noticeText: { fontSize: ms(12.5), lineHeight: ms(19), fontFamily: 'Lexend_400Regular' },
});
