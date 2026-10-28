import React, { useState, useCallback, useEffect, memo, useReducer, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
  LayoutAnimation,
  UIManager,
  Keyboard,
  ScrollView,
  Image as RNImage,
  type LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { safeImpact, safeSelection, safeNotification } from '@/utils/haptics';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import {
  Send,
  Mail,
  Shield,
  Lightbulb,
  Info,
  Check,
  History,
  Eraser,
  Percent,
  PenLine,
  CalendarDays,
  Heart,
  Image as ImageIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { JitBell, JitClients } from '@/components/icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthState } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorMessage } from '@/utils/error';
import { useFocusFade } from '@/hooks/useFocusFade';
import { useEmailQuota, useSendPushNotification, useSendEmail } from '@/hooks/useQueryHooks';
import { ReminderBanner } from '@/components/ReminderBanner';
import MerchantLogo from '@/components/MerchantLogo';
import SendConfirmSheet from '@/components/marketing/SendConfirmSheet';
import PremiumLockCard from '@/components/PremiumLockCard';
import { ActionButton } from '@/components/ui/ActionButton';
import { ProBadge } from '@/components/ui/ProBadge';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import { font, shadow, icon } from '@/constants/design';
import { radius } from '@/utils/responsive';

type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const HIT_SLOP_MED = { top: 8, bottom: 8, left: 8, right: 8 };
// Enable LayoutAnimation on Android (old arch only — New Architecture supports it natively).
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental &&
  typeof (globalThis as Record<string, unknown>).nativeFabricUIManager === 'undefined'
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const JITPLUS_APP_ICON = require('@/assets/images/jitpluslogo.png');

// Must match backend DTO validation.
const LIMITS = {
  title: 100,
  body: 500,
  emailSubject: 150,
  emailBody: 2000,
} as const;

const SEND_COOLDOWN_MS = 30_000;
const SEND_COOLDOWN_S = SEND_COOLDOWN_MS / 1000;

type TemplateKey = 'Promo' | 'New' | 'Event' | 'Comeback';
const TEMPLATES: { key: TemplateKey; Icon: IconType }[] = [
  { key: 'Promo', Icon: Percent },
  { key: 'New', Icon: PenLine },
  { key: 'Event', Icon: CalendarDays },
  { key: 'Comeback', Icon: Heart },
];

/**
 * Seconds left until `until`, ticking locally so only the consumer re-renders.
 * The interval stops by itself once the deadline has passed.
 */
function useSecondsLeft(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until == null) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [until]);
  if (until == null) return 0;
  // `now` can lag behind until the first tick, so clamp to the cooldown length.
  return Math.min(SEND_COOLDOWN_S, Math.max(0, Math.ceil((until - now) / 1000)));
}

/**
 * Handle 400/403/429 errors from notification endpoints.
 * Distinguishes content violations, premium plan issues, rate limiting and quota exhaustion.
 */
function handlePremiumError(
  err: unknown,
  t: (key: string, vars?: Record<string, unknown>) => string,
) {
  const axiosErr = err as { response?: { status?: number; data?: { message?: string | string[] } } };
  const status = axiosErr?.response?.status;
  if (status === 400) {
    // Server-side content filter rejection
    Alert.alert(
      t('messages.contentBlockedTitle'),
      getErrorMessage(err, t('messages.contentBlockedMsg')),
    );
    return;
  }
  if (status === 429) {
    Alert.alert(t('common.error'), t('messages.rateLimited'));
    return;
  }
  if (status === 403) {
    const rawMsg = axiosErr?.response?.data?.message;
    const msg = Array.isArray(rawMsg) ? rawMsg.join(' ') : (rawMsg ?? '');
    const isPlanIssue = msg.includes('Premium') || msg.includes('essai');
    Alert.alert(
      isPlanIssue ? t('messages.premiumOnly') : t('messages.quotaReached'),
      msg || t('messages.premiumMsg'),
    );
    return;
  }
  Alert.alert(t('common.error'), getErrorMessage(err, t('common.genericError')));
}

const animateAccordion = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(250, 'easeInEaseOut', 'opacity'));

const charCountColor = (len: number, max: number, muted: string, warn: string, danger: string) =>
  len >= max ? danger : len >= max * 0.85 ? warn : muted;

const MessagesHeader = memo(function MessagesHeader({
  topInset,
  onOpenHistory,
}: {
  topInset: number;
  onOpenHistory?: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={[styles.headerBar, { paddingTop: topInset + 12 }]}>
      <View style={styles.headerTextCol}>
        <Text style={[styles.headerTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4} accessibilityRole="header" numberOfLines={1}>
          {t('messages.title')}
        </Text>
        <Text style={[styles.headerSubtitle, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4} numberOfLines={2}>
          {t('messages.subtitle')}
        </Text>
      </View>
      {onOpenHistory && (
        <TouchableOpacity
          onPress={onOpenHistory}
          activeOpacity={0.8}
          style={[styles.historyHeaderBtn, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
          accessibilityRole="button"
          accessibilityLabel={t('messages.showHistory')}
          accessibilityHint={t('messages.showHistoryHint')}
          hitSlop={HIT_SLOP_MED}
        >
          <History size={16} color={theme.textMuted} strokeWidth={icon.stroke} />
          <Text style={[styles.historyHeaderBtnText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
            {t('messages.historyShort')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

const SectionHeader = memo(function SectionHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
});

const ClearButton = memo(function ClearButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={HIT_SLOP_MED}
      style={[styles.clearBtn, { borderColor: theme.border }]}
      accessibilityRole="button"
      accessibilityLabel={t('messages.clearForm')}
    >
      <Eraser size={13} color={theme.textMuted} strokeWidth={2} />
      <Text style={[styles.clearBtnText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>{t('messages.clearForm')}</Text>
    </TouchableOpacity>
  );
});

const ChannelCard = memo(function ChannelCard({
  channel,
  selected,
  Icon,
  name,
  desc,
  locked,
  onSelect,
}: {
  channel: ActiveChannel;
  selected: boolean;
  Icon: IconType;
  name: string;
  desc: string;
  locked?: boolean;
  onSelect: (channel: ActiveChannel) => void;
}) {
  const theme = useTheme();
  const color = theme.primary;
  const handlePress = useCallback(() => onSelect(channel), [onSelect, channel]);
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={[
        styles.channelCard,
        {
          backgroundColor: selected ? color + '18' : theme.bgCard,
          borderColor: selected ? color : theme.borderLight,
        },
      ]}
      accessibilityRole="radio"
      accessibilityLabel={`${name}, ${desc}`}
      accessibilityState={{ selected, checked: selected }}
    >
      <View style={styles.channelCardTop}>
        <View style={[styles.channelIcon, { backgroundColor: theme.bgInput }]}>
          <Icon size={icon.md} color={selected ? color : theme.textMuted} strokeWidth={icon.stroke} />
        </View>
        {selected ? (
          <View style={[styles.channelCheck, { backgroundColor: color }]}>
            <Check size={12} color="#fff" strokeWidth={icon.strokeSmall} />
          </View>
        ) : locked ? (
          <ProBadge locked />
        ) : (
          <View style={[styles.channelRadio, { borderColor: theme.border }]} />
        )}
      </View>
      <Text style={[styles.channelName, { color: selected ? color : theme.text }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>{name}</Text>
      <Text style={[styles.channelDesc, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4} numberOfLines={2}>{desc}</Text>
    </TouchableOpacity>
  );
});

// Focus state stays local so typing does not re-render the whole screen.
const ComposeField = memo(function ComposeField({
  name,
  label,
  value,
  onChangeField,
  placeholder,
  multiline,
  minHeight = 80,
  inputRef,
  onSubmitEditing,
}: {
  name: FieldName;
  label: string;
  value: string;
  onChangeField: (name: FieldName, value: string) => void;
  placeholder: string;
  multiline?: boolean;
  minHeight?: number;
  inputRef?: React.Ref<TextInput>;
  /** Single-line only: keeps the keyboard open and runs this on "Next". */
  onSubmitEditing?: () => void;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);
  const handleChange = useCallback((v: string) => onChangeField(name, v), [onChangeField, name]);
  const maxLength = LIMITS[name];
  const labelId = `${name}-label`;
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4} nativeID={labelId}>
          {label}
        </Text>
        <Text
          style={[styles.charCount, { color: charCountColor(value.length, maxLength, theme.textMuted, theme.warning, theme.danger) }]}
          maxFontSizeMultiplier={1.4}
          accessibilityLiveRegion="polite"
        >
          {value.length}/{maxLength}
        </Text>
      </View>
      <View
        style={[
          styles.inputWrapper,
          { backgroundColor: theme.bgInput, borderColor: focused ? theme.primary : theme.border },
          multiline && { minHeight: minHeight + 20, alignItems: 'flex-start' },
          focused && styles.inputFocused,
        ]}
      >
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            { color: theme.text },
            multiline && { textAlignVertical: 'top', minHeight },
          ]}
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          multiline={multiline}
          maxLength={maxLength}
          returnKeyType={multiline ? 'default' : 'next'}
          submitBehavior={onSubmitEditing && !multiline ? 'submit' : undefined}
          onSubmitEditing={onSubmitEditing}
          onFocus={handleFocus}
          onBlur={handleBlur}
          accessibilityLabel={label}
          accessibilityLabelledBy={labelId}
          maxFontSizeMultiplier={1.4}
        />
      </View>
    </View>
  );
});

const TemplateChips = memo(function TemplateChips({
  onPick,
}: {
  onPick: (key: TemplateKey) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const sectionLabel = t('messages.templatesLabel');
  return (
    <View style={styles.templatesBlock}>
      <Text style={[styles.overline, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
        {sectionLabel}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.templatesRow}
        keyboardShouldPersistTaps="handled"
      >
        {TEMPLATES.map(({ key, Icon }) => {
          const label = t(`messages.template${key}`);
          return (
            <TouchableOpacity
              key={key}
              onPress={() => onPick(key)}
              activeOpacity={0.8}
              style={[styles.templateChip, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
              accessibilityRole="button"
              accessibilityLabel={`${sectionLabel} : ${label}`}
            >
              <Icon size={14} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
              <Text style={[styles.templateChipText, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
});

const PushPreview = memo(function PushPreview({
  title,
  body,
  logoUrl,
}: {
  title: string;
  body: string;
  logoUrl?: string | null;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const shownTitle = title.trim();
  const shownBody = body.trim();
  const bubbleText = theme.text;
  const bubbleMuted = theme.textMuted;
  return (
    <View
      style={[styles.previewStage, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
      accessible
      accessibilityLabel={`${t('messages.previewLabel')}. ${shownTitle} ${shownBody}`}
    >
      <View style={styles.previewClockWrap} importantForAccessibility="no-hide-descendants">
        <Text style={[styles.previewClock, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.2}>09:41</Text>
      </View>
      <View style={[styles.notifBubble, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }, shadow.sm]}>
        <View style={styles.notifHeader}>
          <RNImage source={JITPLUS_APP_ICON} style={styles.notifAppIcon} resizeMode="contain" />
          <Text style={[styles.notifAppName, { color: bubbleMuted }]} maxFontSizeMultiplier={1.2}>JitPlus</Text>
          <Text style={[styles.notifTime, { color: bubbleMuted }]} maxFontSizeMultiplier={1.2}>{t('messages.previewNow')}</Text>
        </View>
        <View style={styles.notifContent}>
          <View style={styles.notifTextCol}>
            <Text
              style={[styles.notifTitle, { color: shownTitle ? bubbleText : bubbleMuted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {shownTitle || t('messages.previewTitlePlaceholder')}
            </Text>
            <Text
              style={[styles.notifBody, { color: shownBody ? bubbleText : bubbleMuted }]}
              numberOfLines={4}
              maxFontSizeMultiplier={1.3}
            >
              {shownBody || t('messages.previewBodyPlaceholder')}
            </Text>
          </View>
          <MerchantLogo logoUrl={logoUrl} style={styles.notifThumb} />
        </View>
      </View>
    </View>
  );
});

const EmailPreview = memo(function EmailPreview({
  subject,
  body,
  senderName,
  logoUrl,
}: {
  subject: string;
  body: string;
  senderName: string;
  logoUrl?: string | null;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const shownSubject = subject.trim();
  const shownBody = body.trim();
  return (
    <View
      style={[styles.emailPreview, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
      accessible
      accessibilityLabel={`${t('messages.previewLabel')}. ${shownSubject} ${shownBody}`}
    >
      <View style={styles.emailHeader}>
        <MerchantLogo logoUrl={logoUrl} style={styles.emailAvatar} />
        <View style={styles.flex1}>
          <Text style={[styles.emailSender, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {senderName}
          </Text>
          <Text style={[styles.emailTo, { color: theme.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {t('messages.previewEmailTo')}
          </Text>
        </View>
        <Text style={[styles.emailTime, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>{t('messages.previewNow')}</Text>
      </View>
      <Text
        style={[styles.emailSubject, { color: shownSubject ? theme.text : theme.textMuted }]}
        numberOfLines={2}
        maxFontSizeMultiplier={1.3}
      >
        {shownSubject || t('messages.previewSubjectPlaceholder')}
      </Text>
      <Text
        style={[styles.emailBodyText, { color: shownBody ? theme.textSecondary : theme.textMuted }]}
        numberOfLines={5}
        maxFontSizeMultiplier={1.3}
      >
        {shownBody || t('messages.previewBodyPlaceholder')}
      </Text>
    </View>
  );
});

const AudienceRow = memo(function AudienceRow({ text }: { text: string }) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={[styles.audienceRow, { backgroundColor: theme.bgElevated, borderColor: theme.borderLight }]}>
      <JitClients size={icon.sm} color={theme.textMuted} strokeWidth={icon.stroke} />
      <View style={styles.flex1}>
        <Text style={[styles.overline, styles.audienceLabel, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
          {t('messages.audienceLabel')}
        </Text>
        <Text style={[styles.audienceText, { color: theme.text }]} maxFontSizeMultiplier={1.4}>{text}</Text>
      </View>
    </View>
  );
});

const EmailQuotaBar = memo(function EmailQuotaBar({ used, max }: { used: number; max: number }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const reached = used >= max;
  const fraction = max > 0 ? Math.min(1, used / max) : 1;
  const barColor = reached ? theme.danger : theme.primary;
  return (
    <View style={styles.quotaBlock} accessible accessibilityLiveRegion="polite">
      <View style={styles.fieldLabelRow}>
        <Text style={[styles.overline, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
          {t('messages.emailQuotaLabel')}
        </Text>
        <Text style={[styles.quotaValue, { color: reached ? theme.danger : theme.text }]} maxFontSizeMultiplier={1.3}>
          {used}/{max}
        </Text>
      </View>
      <View style={[styles.quotaTrack, { backgroundColor: theme.border }]}>
        <View style={[styles.quotaFill, { backgroundColor: barColor, width: `${Math.round(fraction * 100)}%` }]} />
      </View>
      <Text style={[styles.quotaHint, { color: reached ? theme.danger : theme.textMuted }]} maxFontSizeMultiplier={1.4}>
        {reached
          ? t('messages.emailQuotaReached')
          : t('messages.emailQuotaRemaining', { remaining: max - used })}
      </Text>
    </View>
  );
});

// CGU + CNDP transparency, shown below each Send button.
const LegalNote = memo(function LegalNote() {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={styles.legalNoteRow} accessible accessibilityRole="text">
      <Info size={12} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
      <Text style={[styles.legalNoteText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.6}>
        {t('messages.legalNote')}
      </Text>
    </View>
  );
});

const IndeterminateBar = memo(function IndeterminateBar() {
  const theme = useTheme();
  const [progress] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: 900, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);
  const translateX = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.4, width] }),
    [progress, width],
  );
  return (
    <View
      style={[styles.progressTrack, { backgroundColor: theme.border }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      importantForAccessibility="no"
    >
      <Animated.View style={[styles.progressIndet, { backgroundColor: theme.primary, transform: [{ translateX }] }]} />
    </View>
  );
});

const SendButton = memo(function SendButton({
  label,
  Icon,
  canSend,
  isSending,
  cooldownUntil,
  hint,
  onPress,
}: {
  label: string;
  Icon: LucideIcon;
  /** When false the button stays tappable so it can guide the user to the missing field. */
  canSend: boolean;
  isSending: boolean;
  cooldownUntil: number | null;
  hint?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const cooldownRemaining = useSecondsLeft(cooldownUntil);
  const cooling = cooldownRemaining > 0;
  const disabled = isSending || cooling;
  const ready = canSend && !disabled;
  const coolFraction = cooling ? (SEND_COOLDOWN_S - cooldownRemaining) / SEND_COOLDOWN_S : 0;
  const cooldownLabel = t('messages.cooldownWait', { s: cooldownRemaining });
  const active = ready || isSending;
  return (
    <View style={styles.sendBlock}>
      <ActionButton
        onPress={onPress}
        disabled={disabled}
        size="lg"
        variant={active ? 'primary' : 'secondary'}
        labelStyle={active ? undefined : { color: theme.textMuted }}
        iconColor={active ? undefined : theme.textMuted}
        icon={cooling || isSending ? undefined : Icon}
        label={cooling ? cooldownLabel : isSending ? t('messages.sendingShort') : label}
        accessibilityLabel={cooling ? cooldownLabel : label}
        accessibilityHint={!canSend ? hint : undefined}
      />
      {!canSend && !disabled && hint && (
        <Text style={[styles.sendHint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
          {hint}
        </Text>
      )}
      {isSending && <IndeterminateBar />}
      {cooling && (
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]} importantForAccessibility="no">
          <View style={[styles.progressFill, { backgroundColor: theme.textMuted, width: `${Math.round(coolFraction * 100)}%` }]} />
        </View>
      )}
    </View>
  );
});

const EmailLockCard = memo(function EmailLockCard({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <PremiumLockCard
      titleKey="messages.emailLockedTitle"
      descriptionKey="messages.emailLockedDesc"
      ctaLabelKey="messages.upgradeToPro"
      onPress={onUpgrade}
      style={styles.lockCard}
    />
  );
});

type ActiveChannel = 'NOTIF' | 'EMAIL';
type FieldName = keyof typeof LIMITS;
type CooldownKey = 'pushCooldownUntil' | 'emailCooldownUntil';

interface MsgState extends Record<FieldName, string> {
  activeChannel: ActiveChannel;
  pushCooldownUntil: number | null;
  emailCooldownUntil: number | null;
}

const initialMsgState: MsgState = {
  title: '',
  body: '',
  emailSubject: '',
  emailBody: '',
  activeChannel: 'NOTIF',
  pushCooldownUntil: null,
  emailCooldownUntil: null,
};

type MsgAction =
  | { type: 'SET_FIELDS'; payload: Partial<Record<FieldName, string>> }
  | { type: 'SET_CHANNEL'; channel: ActiveChannel }
  | { type: 'START_COOLDOWN'; key: CooldownKey }
  | { type: 'RESET_FORM'; form: 'push' | 'email' };

function msgReducer(state: MsgState, action: MsgAction): MsgState {
  switch (action.type) {
    case 'SET_FIELDS':
      return { ...state, ...action.payload };
    case 'SET_CHANNEL':
      return { ...state, activeChannel: action.channel };
    case 'START_COOLDOWN':
      return { ...state, [action.key]: Date.now() + SEND_COOLDOWN_MS };
    case 'RESET_FORM':
      if (action.form === 'push') return { ...state, title: '', body: '' };
      return { ...state, emailSubject: '', emailBody: '' };
  }
}

interface SheetState {
  isEmail: boolean;
  heading: string;
  body: string;
  successMessage: string | null;
}
const EMPTY_SHEET: SheetState = { isEmail: false, heading: '', body: '', successMessage: null };

export default function MessagesScreen() {
  const { merchant, isTeamMember } = useAuthState();
  const { isPremium } = usePlanStatus(merchant);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { focusStyle } = useFocusFade();
  const { t } = useLanguage();
  const router = useRouter();
  const merchantName = merchant?.nom?.trim() || 'JitPlus';
  const logoUrl = merchant?.logoUrl;


  const [state, dispatch] = useReducer(msgReducer, initialMsgState);
  const { title, body, emailSubject, emailBody, activeChannel, pushCooldownUntil, emailCooldownUntil } = state;

  const goToPlan = useCallback(() => { safeSelection(); router.push('/plan'); }, [router]);
  const goToHistory = useCallback(() => { safeSelection(); router.push('/messages-history'); }, [router]);
  const goToProfile = useCallback(() => router.push('/profile'), [router]);

  const selectChannel = useCallback((channel: ActiveChannel) => {
    animateAccordion();
    safeSelection();
    dispatch({ type: 'SET_CHANNEL', channel });
  }, []);

  const setField = useCallback((name: FieldName, value: string) => {
    dispatch({ type: 'SET_FIELDS', payload: { [name]: value } });
  }, []);

  const { mutateAsync: sendPush, isPending: isPushSending } = useSendPushNotification();
  const { mutateAsync: sendEmail, isPending: isEmailSending } = useSendEmail();

  const isEmail = activeChannel === 'EMAIL';
  const formHeading = isEmail ? emailSubject : title;
  const formBody = isEmail ? emailBody : body;
  const formHasContent = formHeading.length > 0 || formBody.length > 0;
  const formComplete = !!formHeading.trim() && !!formBody.trim();

  // Backend requires the owner role, so team members never fetch the quota.
  const { data: emailQuota } = useEmailQuota(!isTeamMember && isPremium && isEmail);

  const scrollRef = useRef<ScrollView>(null);
  const headingRef = useRef<TextInput>(null);
  const bodyRef = useRef<TextInput>(null);
  const composeY = useRef(0);
  const previewY = useRef(0);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
  }, []);

  const onComposeLayout = useCallback((e: LayoutChangeEvent) => { composeY.current = e.nativeEvent.layout.y; }, []);
  const onPreviewLayout = useCallback((e: LayoutChangeEvent) => { previewY.current = e.nativeEvent.layout.y; }, []);
  const scrollToY = useCallback((y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }, []);
  const scrollToPreviewSoon = useCallback(() => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    // Waits for the layout animation so the preview offset reflects the filled form.
    scrollTimer.current = setTimeout(() => scrollToY(previewY.current), 300);
  }, [scrollToY]);

  const focusBody = useCallback(() => bodyRef.current?.focus(), []);
  const focusMissingField = useCallback(() => {
    safeSelection();
    scrollToY(composeY.current);
    (formHeading.trim() ? bodyRef : headingRef).current?.focus();
  }, [formHeading, scrollToY]);

  const sendHint = !formHeading.trim()
    ? t(isEmail ? 'messages.missingSubject' : 'messages.missingTitle')
    : !formBody.trim()
      ? t('messages.missingBody')
      : undefined;

  // Sheet data outlives `sheetVisible` so the closing animation keeps its content.
  const [sheet, setSheet] = useState<SheetState>(EMPTY_SHEET);
  const [sheetVisible, setSheetVisible] = useState(false);
  const clearForm = useCallback(() => {
    safeSelection();
    dispatch({ type: 'RESET_FORM', form: isEmail ? 'email' : 'push' });
  }, [isEmail]);

  // Asks before overwriting typed text.
  const applyTemplate = useCallback((key: TemplateKey) => {
    const heading = t(`messages.tpl${key}Title`, { name: merchantName });
    const content = t(`messages.tpl${key}Body`, { name: merchantName });
    const apply = () => {
      animateAccordion();
      safeSelection();
      dispatch({
        type: 'SET_FIELDS',
        payload: isEmail
          ? { emailSubject: heading.slice(0, LIMITS.emailSubject), emailBody: content.slice(0, LIMITS.emailBody) }
          : { title: heading.slice(0, LIMITS.title), body: content.slice(0, LIMITS.body) },
      });
      Keyboard.dismiss();
      scrollToPreviewSoon();
    };
    if (!formHasContent) {
      apply();
      return;
    }
    Alert.alert(
      t('messages.templateReplaceTitle'),
      t('messages.templateReplaceMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('messages.templateReplaceConfirm'), onPress: apply },
      ],
    );
  }, [t, merchantName, isEmail, formHasContent, scrollToPreviewSoon]);

  // Send flow: tap "Send", then recap sheet, then success state.
  const handleSendPress = useCallback(() => {
    safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    if (!formComplete) {
      focusMissingField();
      return;
    }
    Keyboard.dismiss();
    setSheet({ isEmail, heading: formHeading.trim(), body: formBody.trim(), successMessage: null });
    setSheetVisible(true);
  }, [formComplete, focusMissingField, isEmail, formHeading, formBody]);

  const confirmSend = useCallback(async () => {
    if (sheet.successMessage != null) return;
    try {
      let message: string;
      if (sheet.isEmail) {
        const { recipientCount, successCount, failureCount } = await sendEmail({ subject: sheet.heading, body: sheet.body });
        message = t('messages.emailSuccessBody', {
          success: successCount,
          total: recipientCount,
          failures: failureCount > 0 ? t('messages.emailFailureSuffix', { count: failureCount }) : '',
        });
        dispatch({ type: 'RESET_FORM', form: 'email' });
        dispatch({ type: 'START_COOLDOWN', key: 'emailCooldownUntil' });
      } else {
        const { recipientCount } = await sendPush({ title: sheet.heading, body: sheet.body });
        message = t(recipientCount === 1 ? 'messages.pushSuccessBody_one' : 'messages.pushSuccessBody_other', { count: recipientCount });
        dispatch({ type: 'RESET_FORM', form: 'push' });
        dispatch({ type: 'START_COOLDOWN', key: 'pushCooldownUntil' });
      }
      safeNotification(Haptics.NotificationFeedbackType.Success);
      setSheet((s) => ({ ...s, successMessage: message }));
    } catch (err: unknown) {
      // Sheet stays open so the merchant can go back and edit (e.g. blocked content).
      safeNotification(Haptics.NotificationFeedbackType.Error);
      handlePremiumError(err, t);
    }
  }, [sheet, sendEmail, sendPush, t]);

  const closeSheet = useCallback(() => setSheetVisible(false), []);
  const viewHistoryFromSheet = useCallback(() => {
    setSheetVisible(false);
    goToHistory();
  }, [goToHistory]);
  const clearButton = useMemo(
    () => (formHasContent ? <ClearButton onPress={clearForm} /> : null),
    [formHasContent, clearForm],
  );


  if (isTeamMember) {
    return (
      <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
        <MessagesHeader topInset={insets.top} />
        <View style={styles.ownerOnly} accessible accessibilityRole="alert">
          <View style={[styles.ownerIconWrap, { backgroundColor: theme.primaryBg }]}>
            <Shield size={36} color={theme.textMuted} strokeWidth={icon.stroke} />
          </View>
          <Text style={[styles.ownerTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6}>
            {t('messages.ownerOnly')}
          </Text>
          <Text style={[styles.ownerMsg, { color: theme.textMuted }]} maxFontSizeMultiplier={1.6}>
            {t('messages.ownerOnlyMsg')}
          </Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <MessagesHeader topInset={insets.top} onOpenHistory={goToHistory} />

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.screenPadding, { paddingBottom: insets.bottom + 116 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <ReminderBanner
            visible={!logoUrl}
            Icon={ImageIcon}
            title={t('reminders.logoTitle')}
            message={t('reminders.logoMessage')}
            actionLabel={t('reminders.logoAction')}
            onPress={goToProfile}
            storageKey={ASYNC_STORAGE_KEYS.MESSAGES_LOGO_BANNER_DISMISSED}
          />

          <SectionHeader title={t('messages.step1Title')} />
          <View style={styles.channelRow} accessibilityRole="radiogroup">
            <ChannelCard
              channel="NOTIF"
              selected={!isEmail}
              Icon={JitBell}
              name={t('messages.channelPushName')}
              desc={t('messages.channelPushDesc')}
              onSelect={selectChannel}
            />
            <ChannelCard
              channel="EMAIL"
              selected={isEmail}
              Icon={Mail}
              name={t('messages.channelEmailName')}
              desc={isPremium ? t('messages.channelEmailDesc') : t('messages.premiumOnly')}
              locked={!isPremium}
              onSelect={selectChannel}
            />
          </View>

          {isEmail && !isPremium ? (
            <EmailLockCard onUpgrade={goToPlan} />
          ) : (
            <>
              <View onLayout={onComposeLayout}>
                <SectionHeader title={t('messages.step2Title')} right={clearButton} />
              </View>
              <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                <TemplateChips onPick={applyTemplate} />
                {isEmail ? (
                  <>
                    <ComposeField
                      name="emailSubject"
                      label={t('messages.emailSubject')}
                      value={emailSubject}
                      onChangeField={setField}
                      placeholder={t('messages.emailSubjectPlaceholder')}
                      inputRef={headingRef}
                      onSubmitEditing={focusBody}
                    />
                    <ComposeField
                      name="emailBody"
                      label={t('messages.emailBody')}
                      value={emailBody}
                      onChangeField={setField}
                      placeholder={t('messages.emailBodyPlaceholder')}
                      multiline
                      minHeight={120}
                      inputRef={bodyRef}
                    />
                  </>
                ) : (
                  <>
                    <ComposeField
                      name="title"
                      label={t('messages.messageTitle')}
                      value={title}
                      onChangeField={setField}
                      placeholder={t('messages.messageTitlePlaceholder')}
                      inputRef={headingRef}
                      onSubmitEditing={focusBody}
                    />
                    <ComposeField
                      name="body"
                      label={t('messages.messageBody')}
                      value={body}
                      onChangeField={setField}
                      placeholder={t('messages.messageBodyPlaceholder')}
                      multiline
                      minHeight={90}
                      inputRef={bodyRef}
                    />
                  </>
                )}
                <View style={styles.composeTip}>
                  <Lightbulb size={14} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
                  <Text style={[styles.composeTipText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
                    {t('messages.composeTip')}
                  </Text>
                </View>
              </View>

              <View onLayout={onPreviewLayout}>
                <SectionHeader title={t('messages.step3Title')} />
              </View>
              <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                <Text style={[styles.overline, styles.previewLabel, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                  {t('messages.previewLabel')}
                </Text>
                {isEmail ? (
                  <EmailPreview subject={emailSubject} body={emailBody} senderName={merchantName} logoUrl={logoUrl} />
                ) : (
                  <PushPreview title={title} body={body} logoUrl={logoUrl} />
                )}

                <AudienceRow text={isEmail ? t('messages.audienceEmail') : t('messages.audiencePush')} />

                {isEmail && emailQuota && <EmailQuotaBar used={emailQuota.used} max={emailQuota.max} />}

                <SendButton
                  label={isEmail ? t('messages.sendEmail') : t('messages.sendToAll')}
                  Icon={isEmail ? Mail : Send}
                  canSend={formComplete}
                  isSending={isEmail ? isEmailSending : isPushSending}
                  cooldownUntil={isEmail ? emailCooldownUntil : pushCooldownUntil}
                  hint={sendHint}
                  onPress={handleSendPress}
                />
                <LegalNote />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <SendConfirmSheet
        visible={sheetVisible}
        isEmail={sheet.isEmail}
        heading={sheet.heading}
        body={sheet.body}
        audience={sheet.isEmail ? t('messages.audienceEmail') : t('messages.audiencePush')}

        isSending={sheet.isEmail ? isEmailSending : isPushSending}
        successMessage={sheet.successMessage}
        onConfirm={confirmSend}
        onClose={closeSheet}
        onViewHistory={viewHistoryFromSheet}
      />
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  screenPadding: { paddingHorizontal: 16 },
  previewLabel: { marginBottom: 10 },
  audienceLabel: { marginBottom: 2 },
  ownerOnly: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  ownerTitle: { fontSize: 18, fontFamily: font.bold, marginTop: 16, textAlign: 'center' },
  ownerMsg: { fontSize: 14, fontFamily: font.regular, marginTop: 8, textAlign: 'center', lineHeight: 20 },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTextCol: { flex: 1 },
  headerTitle: {
    fontSize: 28,
    fontFamily: font.bold,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
    fontFamily: font.regular,
  },
  historyHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 12,
    minHeight: 38,
  },
  historyHeaderBtnText: {
    fontSize: 12,
    fontFamily: font.semibold,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 22,
    marginBottom: 10,
    minHeight: 28,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: font.bold,
    letterSpacing: -0.3,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  clearBtnText: { fontSize: 12, fontFamily: font.medium },

  channelRow: { flexDirection: 'row', gap: 10 },
  channelCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    minHeight: 112,
  },
  channelCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  channelIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
  },
  channelName: { fontSize: 14, fontFamily: font.semibold },
  channelDesc: { fontSize: 12, lineHeight: 16, marginTop: 2, fontFamily: font.regular },

  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  overline: {
    fontSize: 11,
    fontFamily: font.semibold,
  },

  templatesBlock: { marginBottom: 14 },
  templatesRow: { gap: 8, paddingTop: 8, paddingRight: 4 },
  templateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  templateChipText: { fontSize: 13, fontFamily: font.medium },

  field: { marginBottom: 12 },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  fieldLabel: { fontSize: 13, fontFamily: font.semibold },
  charCount: { fontSize: 11, fontFamily: font.medium },
  inputWrapper: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  inputFocused: { borderWidth: 1.5 },
  input: { fontSize: 15, paddingVertical: 12, fontFamily: font.medium },

  composeTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  composeTipText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: font.medium },

  previewStage: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  previewClockWrap: { alignItems: 'center', marginBottom: 10 },
  previewClock: {
    fontSize: 26,
    fontFamily: font.bold,
    letterSpacing: -0.5,
  },
  notifBubble: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 12,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  notifAppIcon: { width: 18, height: 18, borderRadius: 5 },
  notifAppName: { flex: 1, fontSize: 11, fontFamily: font.semibold },
  notifTime: { fontSize: 11, fontFamily: font.regular },
  notifContent: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  notifTextCol: { flex: 1 },
  notifTitle: { fontSize: 14, fontFamily: font.semibold },
  notifBody: { fontSize: 13, lineHeight: 18, marginTop: 2, fontFamily: font.regular },
  notifThumb: { width: 38, height: 38, borderRadius: 8 },

  emailPreview: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    paddingTop: 16,
    overflow: 'hidden',
  },
  emailHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  emailAvatar: { width: 36, height: 36, borderRadius: 18 },
  emailSender: { fontSize: 14, fontFamily: font.semibold },
  emailTo: { fontSize: 11, fontFamily: font.regular, marginTop: 1 },
  emailTime: { fontSize: 11, fontFamily: font.regular },
  emailSubject: { fontSize: 15, fontFamily: font.bold, marginBottom: 6 },
  emailBodyText: { fontSize: 13, lineHeight: 19, fontFamily: font.regular },

  audienceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 14,
  },

  audienceText: { fontSize: 13, lineHeight: 18, fontFamily: font.medium },

  quotaBlock: { marginTop: 14 },
  quotaValue: { fontSize: 12, fontFamily: font.semibold },
  quotaTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  quotaFill: { height: 6, borderRadius: 3 },
  quotaHint: { fontSize: 11, marginTop: 6, fontFamily: font.medium },

  sendBlock: { marginTop: 16 },
  sendHint: { fontSize: 11, textAlign: 'center', marginTop: 8, fontFamily: font.medium },

  progressTrack: {
    height: 3,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: { height: 3, borderRadius: 2 },
  progressIndet: { width: '40%', height: 3, borderRadius: 2 },

  legalNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  legalNoteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: font.medium,
    opacity: 0.85,
  },

  lockCard: { marginHorizontal: 0, marginVertical: 0, marginTop: 16 },

  ownerIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
