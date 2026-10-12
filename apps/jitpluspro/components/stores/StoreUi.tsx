/**
 * Shared building blocks of the "Ma boutique" hub and its section screens.
 * They follow the visual language of the loyalty settings screen: borderless
 * surfaces separated by a soft shadow, filled fields, 20px radius panels with
 * an icon header.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  I18nManager,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
  type TextInputProps,
} from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Check, Lock, Save, Shield } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { palette, useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

export function haptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Light elevation used instead of borders for surfaces. */
export function surfaceShadow(theme: ThemeColors) {
  return theme.mode === 'dark'
    ? null
    : { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 };
}

export function fieldFill(theme: ThemeColors) {
  return theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : theme.bgInput;
}

/** Horizontal space taken by a panel (outer margin + inner padding, both sides). */
export const PANEL_INSET = 16 * 2 + 16 * 2;

interface PanelProps {
  Icon: LucideIcon;
  title: string;
  caption?: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function Panel({ Icon, title, caption, right, style, children }: PanelProps) {
  const theme = useTheme();
  return (
    <View style={[ui.panel, { backgroundColor: theme.bgCard }, surfaceShadow(theme), style]}>
      <View style={ui.panelHeader}>
        <View style={[ui.panelIcon, { backgroundColor: theme.primaryBg }]}>
          <Icon size={17} color={theme.primary} strokeWidth={1.9} />
        </View>
        <Text style={[ui.panelTitle, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3} accessibilityRole="header">
          {title}
        </Text>
        {right}
      </View>
      {caption ? (
        <Text style={[ui.caption, ui.panelCaption, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
          {caption}
        </Text>
      ) : null}
      {children ? <View style={ui.panelBody}>{children}</View> : null}
    </View>
  );
}

export function ProPill() {
  const { t } = useLanguage();
  return (
    <View style={[ui.proPill, { backgroundColor: palette.gold + '2E' }]}>
      <Lock size={11} color="#B45309" strokeWidth={2.4} />
      <Text style={ui.proPillText} maxFontSizeMultiplier={1.2}>{t('settingsPage.proBadge')}</Text>
    </View>
  );
}

/** Small rounded counter shown at the right of a panel header ("2/5"). */
export function CountPill({ value }: { value: string }) {
  const theme = useTheme();
  return (
    <View style={[ui.countPill, { backgroundColor: fieldFill(theme) }]}>
      <Text style={[ui.countPillText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.2}>{value}</Text>
    </View>
  );
}

export interface SegmentItem<K extends string> {
  key: K;
  label: string;
  Icon?: LucideIcon;
}

interface SegmentedProps<K extends string> {
  items: readonly SegmentItem<K>[];
  value: K;
  onChange: (key: K) => void;
  role?: 'tablist' | 'radiogroup';
  style?: StyleProp<ViewStyle>;
}

function SegmentedInner<K extends string>({ items, value, onChange, role = 'tablist', style }: SegmentedProps<K>) {
  const theme = useTheme();
  return (
    <View style={[ui.segmented, { backgroundColor: fieldFill(theme) }, style]} accessibilityRole={role}>
      {items.map(({ key, label, Icon }) => {
        const selected = key === value;
        const color = selected ? theme.primary : theme.textMuted;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onChange(key)}
            activeOpacity={0.8}
            style={[ui.segment, selected && [ui.segmentActive, { backgroundColor: theme.bgCard }]]}
            accessibilityRole={role === 'tablist' ? 'tab' : 'radio'}
            accessibilityState={{ selected }}
          >
            {Icon ? <Icon size={15} color={color} strokeWidth={2} /> : null}
            <Text style={[ui.segmentText, { color }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export const Segmented = memo(SegmentedInner) as typeof SegmentedInner;

/** Transient confirmation pill. `show` replaces any message already visible. */
export function useToast(durationMs = 1800) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const show = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(null), durationMs);
  }, [durationMs]);
  return { message, show };
}

let queuedToast: { message: string; at: number } | null = null;

/** Shows `message` on the next screen that regains focus (e.g. after router.back()). */
export function queueToast(message: string) {
  queuedToast = { message, at: Date.now() };
}

/** Displays a message queued with `queueToast` when the screen gains focus. */
export function useQueuedToast(show: (message: string) => void) {
  useFocusEffect(useCallback(() => {
    if (!queuedToast) return;
    // Expire it: if no consumer was focused right after the queue (deep link,
    // popped stack…), the message must not surface on an unrelated screen later.
    if (Date.now() - queuedToast.at < 10_000) show(queuedToast.message);
    queuedToast = null;
  }, [show]));
}

export function Toast({ message, bottom = 24 }: { message: string | null; bottom?: number }) {
  const theme = useTheme();
  if (!message) return null;
  return (
    <View style={[ui.toastWrap, { bottom }]} pointerEvents="none" accessibilityLiveRegion="polite">
      <View style={[ui.toast, { backgroundColor: theme.mode === 'dark' ? theme.bgCard : '#0F172A' }]}>
        <View style={[ui.toastIcon, { backgroundColor: palette.violet }]}>
          <Check size={12} color="#fff" strokeWidth={3} />
        </View>
        <Text style={ui.toastText} maxFontSizeMultiplier={1.3}>{message}</Text>
      </View>
    </View>
  );
}

function BackButton({ onPress }: { onPress?: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useLanguage();
  return (
    <TouchableOpacity
      onPress={onPress ?? (() => router.back())}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
    >
      <View style={[ui.iconBtn, { backgroundColor: fieldFill(theme) }]}>
        <ArrowLeft size={20} color={theme.text} style={I18nManager.isRTL ? ui.flipX : undefined} />
      </View>
    </TouchableOpacity>
  );
}

/** Settings-style screen header: back button, large title, optional caption. */
export function ScreenHeader({ title, caption, onBack, right }: { title: string; caption?: string; onBack?: () => void; right?: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[ui.header, { paddingTop: insets.top + 12 }]}>
      <View style={ui.headerRow}>
        <BackButton onPress={onBack} />
        <Text style={[ui.headerTitle, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3} accessibilityRole="header">
          {title}
        </Text>
        {right}
      </View>
      {caption ? (
        <Text style={[ui.caption, ui.headerCaption, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>{caption}</Text>
      ) : null}
    </View>
  );
}

/** Sticky bottom bar with the unsaved-changes hint and the save button. */
export function SaveBar({ dirty, saving, onSave, label }: { dirty: boolean; saving: boolean; onSave: () => void; label?: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const text = label ?? t('storePreview.save');
  return (
    <View
      style={[
        ui.saveBar,
        { backgroundColor: theme.bg, paddingBottom: Math.max(insets.bottom + 12, 20) },
        theme.mode === 'dark' ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderLight } : ui.saveBarShadow,
      ]}
    >
      {dirty ? (
        <View style={ui.unsavedRow} accessibilityLiveRegion="polite">
          <View style={[ui.unsavedDot, { backgroundColor: theme.warning }]} />
          <Text style={[ui.caption, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
            {t('settingsPage.unsavedChanges')}
          </Text>
        </View>
      ) : null}
      <TouchableOpacity
        onPress={onSave}
        disabled={!dirty || saving}
        activeOpacity={0.85}
        style={[
          ui.saveBtn,
          dirty
            ? [ui.saveBtnRaised, { backgroundColor: palette.violet, borderBottomColor: palette.violetDark }]
            : { backgroundColor: fieldFill(theme), borderBottomColor: 'transparent' },
        ]}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityState={{ disabled: !dirty || saving, busy: saving }}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Save size={18} color={dirty ? '#fff' : theme.textMuted} strokeWidth={2} />
            <Text style={[ui.saveBtnText, { color: dirty ? '#fff' : theme.textMuted }]} maxFontSizeMultiplier={1.2}>{text}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

/** Bottom padding a scroll view needs so its content clears the SaveBar. */
const SAVE_BAR_SPACE = 170;

/**
 * Wraps a navigation (or any one-shot action) so a fast double-tap cannot
 * trigger it twice (e.g. two pushes of /store-form, which would stack
 * duplicate create screens).
 */
export function usePressGuard(delayMs = 600) {
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return useCallback((fn: () => void) => {
    if (locked.current) return;
    locked.current = true;
    fn();
    timer.current = setTimeout(() => { locked.current = false; }, delayMs);
  }, [delayMs]);
}

/**
 * Asks for confirmation before leaving the screen with unsaved changes.
 * Returns a function that lets the next navigation through (e.g. right after
 * a successful save, before the cleared draft has re-rendered).
 */
export function useDiscardGuard(dirty: boolean, busy = false) {
  const navigation = useNavigation();
  const { t } = useLanguage();
  const dirtyRef = useRef(dirty);
  const bypassRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty && !busy; }, [dirty, busy]);
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!dirtyRef.current || bypassRef.current) return;
      e.preventDefault();
      Alert.alert(t('storePreview.discardTitle'), t('storePreview.discardBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('storePreview.discardConfirm'), style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
  }, [navigation, t]);
  return useCallback(() => { bypassRef.current = true; }, []);
}

interface TextFieldProps extends TextInputProps {
  label: string;
  Icon?: LucideIcon;
  iconColor?: string;
  hint?: string;
  error?: string | null;
  counter?: boolean;
}

/** Labelled filled text input (single line or multiline). */
export function TextField({ label, Icon, iconColor, hint, error, counter, multiline, style, ...input }: TextFieldProps) {
  const theme = useTheme();
  const length = typeof input.value === 'string' ? input.value.length : 0;
  return (
    <View style={ui.field}>
      <Text style={[ui.fieldLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{label}</Text>
      <View
        style={[
          ui.input,
          multiline && ui.inputMultiline,
          { backgroundColor: fieldFill(theme) },
          error ? { borderColor: theme.danger, borderWidth: 1 } : null,
        ]}
      >
        {Icon ? <Icon size={17} color={iconColor ?? theme.textMuted} strokeWidth={1.9} style={multiline ? ui.inputIconTop : undefined} /> : null}
        <TextInput
          placeholderTextColor={theme.textMuted}
          maxFontSizeMultiplier={1.3}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[ui.inputText, multiline && ui.inputTextMultiline, { color: theme.text }, style]}
          {...input}
        />
      </View>
      {error || hint || (counter && input.maxLength) ? (
        <View style={ui.fieldFooter}>
          <Text style={[ui.caption, ui.fieldHint, { color: error ? theme.danger : theme.textMuted }]} maxFontSizeMultiplier={1.3}>
            {error ?? hint ?? ''}
          </Text>
          {counter && input.maxLength ? (
            <Text style={[ui.caption, { color: theme.textMuted }]}>{length}/{input.maxLength}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

interface SectionScreenProps {
  title: string;
  caption?: string;
  /** Rendered pinned to the bottom (usually a SaveBar). */
  footer?: React.ReactNode;
  toast?: string | null;
  scrollRef?: React.Ref<ScrollView>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  children: React.ReactNode;
}

/** Layout shared by every "Ma boutique" section screen. */
export function SectionScreen({ title, caption, footer, toast = null, scrollRef, refreshControl, children }: SectionScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const flash = useToast();
  useQueuedToast(flash.show);
  return (
    <View style={[ui.flex, { backgroundColor: theme.bg }]}>
      {/* The header sits inside the KeyboardAvoidingView so it starts at the
          top of the screen and needs no keyboard offset. */}
      <KeyboardAvoidingView style={ui.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title={title} caption={caption} />
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: (footer ? SAVE_BAR_SPACE : 40) + insets.bottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
      {footer}
      <Toast message={toast ?? flash.message} bottom={insets.bottom + (footer ? 110 : 24)} />
    </View>
  );
}

/** Full-screen notice shown to team members on owner-only screens. */
export function OwnerOnlyNotice() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useLanguage();
  return (
    <View style={[ui.flex, { backgroundColor: theme.bg }]}>
      <ScreenHeader title="" />
      <View style={ui.ownerOnly}>
        <View style={[ui.ownerOnlyIcon, { backgroundColor: theme.primaryBg }]}>
          <Shield size={34} color={theme.primary} strokeWidth={1.6} />
        </View>
        <Text style={[ui.ownerOnlyTitle, { color: theme.text }]}>{t('common.ownerOnly')}</Text>
        <Text style={[ui.ownerOnlyMsg, { color: theme.textMuted }]}>{t('common.ownerOnlyMsg')}</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.85}
          style={[ui.ownerOnlyBtn, { backgroundColor: palette.violet, borderBottomColor: palette.violetDark }]}
          accessibilityRole="button"
        >
          <Text style={ui.ownerOnlyBtnText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export const ui = StyleSheet.create({
  flex: { flex: 1 },
  flipX: { transform: [{ scaleX: -1 }] },
  iconBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { flex: 1, fontSize: 26, fontFamily: 'Lexend_700Bold', letterSpacing: -0.5 },
  headerCaption: { marginTop: 8 },

  field: { gap: 7 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: 13 },
  inputMultiline: { alignItems: 'flex-start', paddingVertical: 12 },
  inputIconTop: { marginTop: 2 },
  inputText: { flex: 1, fontSize: 14.5, fontFamily: 'Lexend_400Regular', paddingVertical: 10 },
  inputTextMultiline: { minHeight: 96, paddingVertical: 0 },
  fieldFooter: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fieldHint: { flex: 1 },

  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12 },
  saveBarShadow: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 8 },
  unsavedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 10 },
  unsavedDot: { width: 7, height: 7, borderRadius: 4 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 15, borderBottomWidth: 3 },
  saveBtnRaised: { shadowColor: palette.violet, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 4 },
  saveBtnText: { fontSize: 14.5, fontFamily: 'Lexend_600SemiBold' },

  ownerOnly: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingBottom: 60 },
  ownerOnlyIcon: { width: 76, height: 76, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  ownerOnlyTitle: { fontSize: 17, marginTop: 18, fontFamily: 'Lexend_600SemiBold', textAlign: 'center' },
  ownerOnlyMsg: { fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginTop: 8, fontFamily: 'Lexend_400Regular' },
  ownerOnlyBtn: { marginTop: 22, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 14, borderBottomWidth: 3 },
  ownerOnlyBtnText: { color: '#fff', fontSize: 14.5, fontFamily: 'Lexend_600SemiBold' },

  // Typography scale: panel title 15/SemiBold · field label 13.5/Medium · caption 12/Regular
  fieldLabel: { fontSize: 13.5, fontFamily: 'Lexend_500Medium' },
  caption: { fontSize: 12, lineHeight: 17, fontFamily: 'Lexend_400Regular' },

  panel: { marginHorizontal: 16, marginTop: 16, borderRadius: 20 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingTop: 16, paddingHorizontal: 16 },
  panelIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { flex: 1, fontSize: 15, fontFamily: 'Lexend_600SemiBold', letterSpacing: -0.2 },
  panelCaption: { paddingHorizontal: 16, marginTop: 10 },
  panelBody: { padding: 16, paddingTop: 14 },

  proPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 9 },
  proPillText: { fontSize: 11, color: '#B45309', fontFamily: 'Lexend_600SemiBold' },
  countPill: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 9 },
  countPillText: { fontSize: 11.5, fontFamily: 'Lexend_600SemiBold' },

  segmented: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10, borderRadius: 11 },
  segmentActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  segmentText: { fontSize: 13, fontFamily: 'Lexend_600SemiBold' },

  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 999 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, paddingLeft: 10, paddingRight: 16, borderRadius: 999 },
  toastIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  toastText: { color: '#fff', fontSize: 13, fontFamily: 'Lexend_500Medium' },
});
