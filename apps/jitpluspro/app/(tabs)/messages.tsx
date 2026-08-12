import React, { useState, useRef, useCallback, useEffect, memo, useReducer } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
  LayoutAnimation,
  UIManager,
  Keyboard,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Send,
  Clock,
  Mail,
  Shield,
  Lightbulb,
  X,
  Zap,
  Info,
  Lock,
  Crown,
  Image as ImageIcon,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthState } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorMessage } from '@/utils/error';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusFade } from '@/hooks/useFocusFade';
import { ms } from '@/utils/responsive';
import { useEmailQuota, useSendPushNotification, useSendEmail } from '@/hooks/useQueryHooks';
import { ReminderBanner } from '@/components/ReminderBanner';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';

// ── Accessibility helpers ──
const HIT_SLOP_LARGE = { top: 12, bottom: 12, left: 12, right: 12 };
const HIT_SLOP_MED = { top: 8, bottom: 8, left: 8, right: 8 };
const safeImpact = (style: Haptics.ImpactFeedbackStyle) => {
  Haptics.impactAsync(style).catch(() => {});
};
const safeSelection = () => {
  Haptics.selectionAsync().catch(() => {});
};
const safeNotification = (type: Haptics.NotificationFeedbackType) => {
  Haptics.notificationAsync(type).catch(() => {});
};

// Enable LayoutAnimation on Android (old arch only — New Architecture supports it natively).
// On New Architecture (Fabric), LayoutAnimation works out of the box.
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental &&
  typeof (global as Record<string, unknown>).nativeFabricUIManager === 'undefined'
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Channel color constants ──
const CHANNEL_COLORS = {
  NOTIF: '#7C3AED',
  EMAIL: '#EA4335',
} as const;
// Darker shades used for send-button gradients / borders
const NOTIF_COLOR_DARK = '#6D28D9';
const EMAIL_COLOR_DARK = '#C5221F';

// ── Cooldown duration after a successful send (ms) ──
const SEND_COOLDOWN_MS = 30_000;

const BANNER_DISMISSED_KEY = 'messages_banner_dismissed';

/* ── Tip banner — dismissable with "don't show again" ── */
const MessagesBanner = React.memo(function MessagesBanner({
  onDismiss,
  onDismissForever,
}: {
  onDismiss: () => void;
  onDismissForever: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const isDark = theme.mode === 'dark';

  return (
    <View style={[bannerStyles.wrapper, { backgroundColor: isDark ? 'rgba(124,58,237,0.12)' : 'rgba(124,58,237,0.06)', borderColor: isDark ? 'rgba(124,58,237,0.25)' : 'rgba(124,58,237,0.15)' }]}>
      <LinearGradient
        colors={['rgba(124,58,237,0.08)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <TouchableOpacity
        style={bannerStyles.closeBtn}
        onPress={onDismiss}
        hitSlop={HIT_SLOP_LARGE}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <X size={16} color={theme.textMuted} strokeWidth={2} />
      </TouchableOpacity>
      <View style={bannerStyles.content}>
        <Zap size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
        <View style={bannerStyles.textWrap}>
          <Text style={[bannerStyles.title, { color: theme.text }]} maxFontSizeMultiplier={1.6}>{t('messages.bannerTitle')}</Text>
          <Text style={[bannerStyles.desc, { color: theme.textMuted }]} maxFontSizeMultiplier={1.6}>{t('messages.bannerDesc')}</Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={onDismissForever}
        style={bannerStyles.hideBtn}
        hitSlop={HIT_SLOP_MED}
        accessibilityRole="button"
        accessibilityLabel={t('messages.bannerHide')}
      >
        <Text style={[bannerStyles.hideText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{t('messages.bannerHide')}</Text>
      </TouchableOpacity>
    </View>
  );
});

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

// ── Smooth accordion transition ──
const animateAccordion = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(250, 'easeInEaseOut', 'opacity'));

// ── Char count color helper ──
const charCountColor = (len: number, max: number, muted: string, warn: string, danger: string) =>
  len >= max ? danger : len >= max * 0.85 ? warn : muted;

// ── Legal note shown below each Send button (CGU + CNDP transparency) ──
const LegalNote = React.memo(function LegalNote() {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={styles.legalNoteRow} accessible accessibilityRole="text">
      <Info size={12} color={theme.textMuted} strokeWidth={1.8} />
      <Text style={[styles.legalNoteText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.6}>
        {t('messages.legalNote')}
      </Text>
    </View>
  );
});

// ── Indeterminate progress bar (shown while a campaign is being sent) ──
const IndeterminateBar = memo(function IndeterminateBar({ color }: { color: string }) {
  const theme = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration: 900, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  return (
    <View
      style={[styles.progressTrack, { backgroundColor: theme.border }]}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      importantForAccessibility="no"
    >
      <Animated.View
        style={[
          styles.progressIndet,
          { backgroundColor: color, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.4, w] }) }] },
        ]}
      />
    </View>
  );
});

// ── Send button with 3 states: normal / sending / cooldown ──
const SendButton = memo(function SendButton({
  channelColor,
  channelColorDark,
  label,
  Icon,
  canSend,
  isSending,
  cooldownRemaining,
  onPress,
}: {
  channelColor: string;
  channelColorDark: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  canSend: boolean;
  isSending: boolean;
  cooldownRemaining: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const cooling = cooldownRemaining > 0;
  const disabled = !canSend || isSending || cooling;
  const totalSec = SEND_COOLDOWN_MS / 1000;
  const coolFraction = cooling ? Math.min(1, Math.max(0, (totalSec - cooldownRemaining) / totalSec)) : 0;
  return (
    <View>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={cooling ? t('messages.cooldownWait', { s: cooldownRemaining }) : label}
        accessibilityState={{ disabled, busy: isSending }}
      >
        {cooling ? (
          <View style={[styles.sendBtn, { backgroundColor: theme.border, borderColor: theme.border }]}>
            <ActivityIndicator size="small" color={theme.textMuted} />
            <Text style={[styles.sendBtnText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
              {t('messages.cooldownWait', { s: cooldownRemaining })}
            </Text>
          </View>
        ) : isSending ? (
          <View style={[styles.sendBtn, { backgroundColor: channelColor, borderColor: channelColorDark }]}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.sendBtnText} maxFontSizeMultiplier={1.4}>{t('messages.sendingShort')}</Text>
          </View>
        ) : canSend ? (
          <LinearGradient
            colors={[channelColor, channelColorDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.sendBtn, { borderColor: channelColorDark }]}
          >
            <Icon size={18} color="#fff" strokeWidth={2} />
            <Text style={styles.sendBtnText} maxFontSizeMultiplier={1.4}>{label}</Text>
          </LinearGradient>
        ) : (
          <View style={[styles.sendBtn, { backgroundColor: theme.border, borderColor: theme.border }]}>
            <Icon size={18} color={theme.textMuted} strokeWidth={2} />
            <Text style={[styles.sendBtnText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{label}</Text>
          </View>
        )}
      </TouchableOpacity>
      {isSending && <IndeterminateBar color={channelColor} />}
      {cooling && (
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]} importantForAccessibility="no">
          <View style={[styles.progressFill, { backgroundColor: theme.textMuted, width: `${Math.round(coolFraction * 100)}%` }]} />
        </View>
      )}
    </View>
  );
});

// ── Per-channel Premium lock card (E-mail reserved for Pro plan) ──
const EmailLockCard = memo(function EmailLockCard({ onUpgrade }: { onUpgrade: () => void }) {
  const { t } = useLanguage();
  return (
    <View style={styles.lockWrapper}>
      <LinearGradient
        colors={['#0f031e', '#1a0533']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.lockCard}
      >
        <LinearGradient
          colors={[palette.gold, '#F59E0B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.lockIconBg}
        >
          <Crown size={26} color="#1a0533" strokeWidth={2} />
        </LinearGradient>
        <Text style={styles.lockTitle} maxFontSizeMultiplier={1.4}>{t('messages.emailLockedTitle')}</Text>
        <Text style={styles.lockDesc} maxFontSizeMultiplier={1.6}>{t('messages.emailLockedDesc')}</Text>
        <TouchableOpacity
          onPress={onUpgrade}
          activeOpacity={0.85}
          style={styles.lockCtaWrap}
          accessibilityRole="button"
          accessibilityLabel={t('messages.upgradeToPro')}
        >
          <LinearGradient
            colors={[palette.gold, '#F59E0B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.lockCta}
          >
            <Crown size={16} color="#1a0533" strokeWidth={2.2} />
            <Text style={styles.lockCtaText} maxFontSizeMultiplier={1.3}>{t('messages.upgradeToPro')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
});

// ── Messages reducer ──
type ActiveChannel = 'NOTIF' | 'EMAIL';

interface MsgState {
  title: string;
  body: string;
  emailSubject: string;
  emailBody: string;
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

type CooldownKey = 'pushCooldownUntil' | 'emailCooldownUntil';

type MsgAction =
  | { type: 'SET'; payload: Partial<MsgState> }
  | { type: 'SET_CHANNEL'; channel: ActiveChannel }
  | { type: 'START_COOLDOWN'; key: CooldownKey; until: number }
  | { type: 'END_COOLDOWN'; key: CooldownKey }
  | { type: 'RESET_FORM'; form: 'push' | 'email' };

function msgReducer(state: MsgState, action: MsgAction): MsgState {
  switch (action.type) {
    case 'SET':
      return { ...state, ...action.payload };
    case 'SET_CHANNEL':
      return { ...state, activeChannel: action.channel };
    case 'START_COOLDOWN':
      return { ...state, [action.key]: action.until };
    case 'END_COOLDOWN':
      return { ...state, [action.key]: null };
    case 'RESET_FORM':
      if (action.form === 'push') return { ...state, title: '', body: '' };
      return { ...state, emailSubject: '', emailBody: '' };
  }
}

export default function MessagesScreen() {
  const { merchant, isTeamMember } = useAuthState();
  const isPremium = merchant?.plan === 'PREMIUM';
  const isOwner = !isTeamMember;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { focusStyle } = useFocusFade();
  const { t, locale } = useLanguage();

  // ── Banner dismiss state ──
  const [bannerVisible, setBannerVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(BANNER_DISMISSED_KEY).then((val) => {
      if (val !== 'true') setBannerVisible(true);
    });
  }, []);

  const dismissBanner = useCallback(() => {
    setBannerVisible(false);
  }, []);

  const dismissBannerForever = useCallback(() => {
    setBannerVisible(false);
    AsyncStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  }, []);

  const [state, dispatch] = useReducer(msgReducer, initialMsgState);
  const { title, body, emailSubject, emailBody, activeChannel, pushCooldownUntil, emailCooldownUntil } = state;
  const set = useCallback((payload: Partial<MsgState>) => dispatch({ type: 'SET', payload }), []);
  const router = useRouter();
  const goToPlan = useCallback(() => { safeSelection(); router.push('/plan'); }, [router]);

  // ── React Query mutations ──
  const pushMutation = useSendPushNotification();
  const emailMutation = useSendEmail();

  // ── React Query hooks (disabled for team members — backend requires owner) ──
  const { data: emailQuota } = useEmailQuota(isOwner && isPremium && activeChannel === 'EMAIL');

  const [focusedField, setFocusedField] = useState<'title' | 'body' | null>(null);

  // Cooldown timer refs — cleaned up on unmount to prevent memory leaks
  const cooldownTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    return () => {
      cooldownTimers.current.forEach(clearTimeout);
    };
  }, []);
  const startCooldown = useCallback((key: CooldownKey) => {
    dispatch({ type: 'START_COOLDOWN', key, until: Date.now() + SEND_COOLDOWN_MS });
    const timer = setTimeout(() => {
      dispatch({ type: 'END_COOLDOWN', key });
      cooldownTimers.current = cooldownTimers.current.filter((t) => t !== timer);
    }, SEND_COOLDOWN_MS);
    cooldownTimers.current.push(timer);
  }, []);

  // ── Live countdown while a cooldown is active (re-enables the button automatically) ──
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (pushCooldownUntil == null && emailCooldownUntil == null) return;
    const id = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(id);
  }, [pushCooldownUntil, emailCooldownUntil]);
  const pushRemaining = pushCooldownUntil ? Math.max(0, Math.ceil((pushCooldownUntil - nowTick) / 1000)) : 0;
  const emailRemaining = emailCooldownUntil ? Math.max(0, Math.ceil((emailCooldownUntil - nowTick) / 1000)) : 0;

  // ── Handle WhatsApp send ──
  // NOTE: WhatsApp broadcast UI is disabled (not yet approved). Intentionally removed.

  // ── Handle Email send ──
  const handleSendEmail = useCallback(() => {
    if (!emailSubject.trim() || !emailBody.trim()) {
      Alert.alert(t('messages.notifEmptyFieldsTitle'), t('messages.emailEmptyMsg'));
      return;
    }
    Keyboard.dismiss();

    Alert.alert(
      t('messages.emailConfirmTitle'),
      t('messages.emailConfirmBody', {
        subject: emailSubject.trim(),
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('messages.send'),
          style: 'default',
          onPress: async () => {
            try {
              const { recipientCount, successCount, failureCount } = await emailMutation.mutateAsync({
                subject: emailSubject.trim(),
                body: emailBody.trim(),
              });

              safeNotification(Haptics.NotificationFeedbackType.Success);
              Alert.alert(
                t('messages.emailSuccessTitle'),
                t('messages.emailSuccessBody', {
                  success: successCount,
                  total: recipientCount,
                  failures: failureCount > 0 ? t('messages.emailFailureSuffix', { count: failureCount }) : '',
                }),
              );

              dispatch({ type: 'RESET_FORM', form: 'email' });
              startCooldown('emailCooldownUntil');
            } catch (err: unknown) {
              safeNotification(Haptics.NotificationFeedbackType.Error);
              handlePremiumError(err, t);
            }
          },
        },
      ],
    );
  }, [emailSubject, emailBody, emailMutation, startCooldown, t]);

  // ── Send notification ──
  const handleSend = useCallback(() => {
    if (!title.trim() || !body.trim()) {
      Alert.alert(t('messages.notifEmptyFieldsTitle'), t('messages.notifEmptyFields'));
      return;
    }
    Keyboard.dismiss();

    Alert.alert(
      t('messages.notifConfirmTitle'),
      t('messages.notifConfirmBody', {
        title: title.trim(),
        body: body.trim(),
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('messages.send'),
          style: 'default',
          onPress: async () => {
            try {
              const { recipientCount } = await pushMutation.mutateAsync({
                title: title.trim(),
                body: body.trim(),
              });

              safeNotification(Haptics.NotificationFeedbackType.Success);
              Alert.alert(
                t('messages.pushSuccessTitle'),
                t('messages.pushSuccessBody', { count: recipientCount }),
              );

              dispatch({ type: 'RESET_FORM', form: 'push' });
              startCooldown('pushCooldownUntil');
            } catch (err: unknown) {
              safeNotification(Haptics.NotificationFeedbackType.Error);
              handlePremiumError(err, t);
            }
          },
        },
      ],
    );
  }, [title, body, pushMutation, startCooldown, t]);

  // focusStyle is provided by useFocusFade()

  // focusStyle is provided by useFocusFade()
  if (isTeamMember) {
    return (
      <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
        <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4} accessibilityRole="header">{t('messages.title')}</Text>
        </View>
        {bannerVisible && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <MessagesBanner onDismiss={dismissBanner} onDismissForever={dismissBannerForever} />
          </View>
        )}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }} accessible accessibilityRole="alert">
          <Shield size={48} color={theme.textMuted} strokeWidth={1.5} />
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' }} maxFontSizeMultiplier={1.6}>
            {t('messages.ownerOnly')}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 }} maxFontSizeMultiplier={1.6}>
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
        {/* ── Simple header ── */}
        <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4} accessibilityRole="header">{t('messages.title')}</Text>
          <TouchableOpacity
            onPress={() => {
              safeSelection();
              router.push('/messages-history');
            }}
            activeOpacity={0.8}
            style={[
              styles.historyHeaderBtn,
              {
                backgroundColor: theme.bgCard,
                borderColor: theme.borderLight,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('messages.showHistory')}
            accessibilityHint={t('messages.showHistoryHint')}
          >
            <Clock size={14} color={theme.textMuted} strokeWidth={2} />
            <Text
              style={[
                styles.historyHeaderBtnText,
                { color: theme.textMuted },
              ]}
              maxFontSizeMultiplier={1.3}
            >
              {t('messages.showHistory')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Dismissable tip banner ── */}
        {bannerVisible && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <MessagesBanner onDismiss={dismissBanner} onDismissForever={dismissBannerForever} />
          </View>
        )}

        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 116, paddingHorizontal: 16 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {!isTeamMember && (
            <ReminderBanner
              visible={!merchant?.logoUrl}
              Icon={ImageIcon}
              title={t('reminders.logoTitle')}
              message={t('reminders.logoMessage')}
              actionLabel={t('reminders.logoAction')}
              onPress={() => router.push('/profile')}
              storageKey={ASYNC_STORAGE_KEYS.MESSAGES_LOGO_BANNER_DISMISSED}
            />
          )}
              {/* ── Channel segmented control (Notif / E-mail) ── */}
              <View style={styles.segmentRow}>
                <TouchableOpacity
                  onPress={() => { animateAccordion(); safeSelection(); dispatch({ type: 'SET_CHANNEL', channel: 'NOTIF' }); }}
                  activeOpacity={0.85}
                  style={[
                    styles.segmentTab,
                    { backgroundColor: activeChannel === 'NOTIF' ? CHANNEL_COLORS.NOTIF + '18' : theme.bgCard, borderColor: activeChannel === 'NOTIF' ? CHANNEL_COLORS.NOTIF : theme.borderLight },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('messages.channelNotif')}
                  accessibilityState={{ selected: activeChannel === 'NOTIF' }}
                  hitSlop={HIT_SLOP_MED}
                >
                  <Send size={16} color={activeChannel === 'NOTIF' ? CHANNEL_COLORS.NOTIF : theme.textMuted} />
                  <Text style={[styles.segmentText, { color: activeChannel === 'NOTIF' ? CHANNEL_COLORS.NOTIF : theme.text }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>
                    {t('messages.channelNotif')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => { animateAccordion(); safeSelection(); dispatch({ type: 'SET_CHANNEL', channel: 'EMAIL' }); }}
                  activeOpacity={0.85}
                  style={[
                    styles.segmentTab,
                    { backgroundColor: activeChannel === 'EMAIL' ? CHANNEL_COLORS.EMAIL + '18' : theme.bgCard, borderColor: activeChannel === 'EMAIL' ? CHANNEL_COLORS.EMAIL : theme.borderLight },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('messages.channelEmail')}${!isPremium ? ` — ${t('messages.premiumOnly')}` : ''}`}
                  accessibilityState={{ selected: activeChannel === 'EMAIL' }}
                  hitSlop={HIT_SLOP_MED}
                >
                  <Mail size={16} color={activeChannel === 'EMAIL' ? CHANNEL_COLORS.EMAIL : theme.textMuted} />
                  <Text style={[styles.segmentText, { color: activeChannel === 'EMAIL' ? CHANNEL_COLORS.EMAIL : theme.text }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>
                    {t('messages.channelEmail')}
                  </Text>
                  {!isPremium && <Lock size={13} color={activeChannel === 'EMAIL' ? CHANNEL_COLORS.EMAIL : theme.textMuted} strokeWidth={2.2} />}
                </TouchableOpacity>
              </View>

              {activeChannel === 'NOTIF' && (
                <View
                  style={[styles.composeCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
                >
                  {/* Tip */}
                  <View style={[styles.composeTip, { backgroundColor: theme.primary + '0D' }]}>
                    <Lightbulb size={14} color={theme.primary} />
                    <Text style={[styles.composeTipText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
                      {t('messages.composeTip')}
                    </Text>
                  </View>

                  {/* Title input */}
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4} nativeID="push-title-label">
                    {t('messages.messageTitle')}
                  </Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      { backgroundColor: theme.bgInput, borderColor: focusedField === 'title' ? theme.primary : theme.border },
                    ]}
                  >
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={title}
                      onChangeText={(v) => set({ title: v })}
                      placeholder={t('messages.messageTitlePlaceholder')}
                      placeholderTextColor={theme.textMuted}
                      maxLength={100}
                      returnKeyType="next"
                      onFocus={() => setFocusedField('title')}
                      onBlur={() => setFocusedField((f) => f === 'title' ? null : f)}
                      accessibilityLabel={t('messages.messageTitle')}
                      accessibilityLabelledBy="push-title-label"
                      maxFontSizeMultiplier={1.4}
                    />
                  </View>
                  <Text
                    style={[styles.charCount, { color: charCountColor(title.length, 100, theme.textMuted, theme.warning ?? '#F59E0B', theme.danger) }]}
                    maxFontSizeMultiplier={1.6}
                    accessibilityLiveRegion="polite"
                  >
                    {title.length}/100
                  </Text>

                  {/* Body input */}
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 12 }]} maxFontSizeMultiplier={1.4} nativeID="push-body-label">
                    {t('messages.messageBody')}
                  </Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: theme.bgInput,
                        borderColor: focusedField === 'body' ? theme.primary : theme.border,
                        minHeight: 100,
                        alignItems: 'flex-start',
                      },
                    ]}
                  >
                    <TextInput
                      style={[
                        styles.input,
                        { color: theme.text, textAlignVertical: 'top', minHeight: 80 },
                      ]}
                      value={body}
                      onChangeText={(v) => set({ body: v })}
                      placeholder={t('messages.messageBodyPlaceholder')}
                      placeholderTextColor={theme.textMuted}
                      multiline
                      maxLength={500}
                      onFocus={() => setFocusedField('body')}
                      onBlur={() => setFocusedField((f) => f === 'body' ? null : f)}
                      accessibilityLabel={t('messages.messageBody')}
                      accessibilityLabelledBy="push-body-label"
                      maxFontSizeMultiplier={1.4}
                    />
                  </View>
                  <Text
                    style={[styles.charCount, { color: charCountColor(body.length, 500, theme.textMuted, theme.warning ?? '#F59E0B', theme.danger) }]}
                    maxFontSizeMultiplier={1.6}
                    accessibilityLiveRegion="polite"
                  >
                    {body.length}/500
                  </Text>

                  <SendButton
                    channelColor={CHANNEL_COLORS.NOTIF}
                    channelColorDark={NOTIF_COLOR_DARK}
                    label={t('messages.sendToAll')}
                    Icon={Send}
                    canSend={!!title.trim() && !!body.trim()}
                    isSending={pushMutation.isPending}
                    cooldownRemaining={pushRemaining}
                    onPress={() => {
                      safeImpact(Haptics.ImpactFeedbackStyle.Medium);
                      handleSend();
                    }}
                  />
                  <LegalNote />
                </View>
              )}

              {/* ── Email Compose Card ─────────────── */}
              {activeChannel === 'EMAIL' && (
                !isPremium ? (
                  <EmailLockCard onUpgrade={goToPlan} />
                ) : (
                <View
                  style={[styles.composeCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
                >
                  <>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4} nativeID="email-subject-label">
                    {t('messages.emailSubject')}
                  </Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      { backgroundColor: theme.bgInput, borderColor: theme.border },
                    ]}
                  >
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={emailSubject}
                      onChangeText={(v) => set({ emailSubject: v })}
                      placeholder={t('messages.emailSubjectPlaceholder')}
                      placeholderTextColor={theme.textMuted}
                      maxLength={150}
                      returnKeyType="next"
                      accessibilityLabel={t('messages.emailSubject')}
                      accessibilityLabelledBy="email-subject-label"
                      maxFontSizeMultiplier={1.4}
                    />
                  </View>
                  <Text
                    style={[styles.charCount, { color: charCountColor(emailSubject.length, 150, theme.textMuted, theme.warning ?? '#F59E0B', theme.danger) }]}
                    maxFontSizeMultiplier={1.6}
                    accessibilityLiveRegion="polite"
                  >
                    {emailSubject.length}/150
                  </Text>

                  <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 12 }]} maxFontSizeMultiplier={1.4} nativeID="email-body-label">
                    {t('messages.emailBody')}
                  </Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: theme.bgInput,
                        borderColor: theme.border,
                        minHeight: 120,
                        alignItems: 'flex-start',
                      },
                    ]}
                  >
                    <TextInput
                      style={[
                        styles.input,
                        { color: theme.text, textAlignVertical: 'top', minHeight: 100 },
                      ]}
                      value={emailBody}
                      onChangeText={(v) => set({ emailBody: v })}
                      placeholder={t('messages.emailBodyPlaceholder')}
                      placeholderTextColor={theme.textMuted}
                      multiline
                      maxLength={2000}
                      accessibilityLabel={t('messages.emailBody')}
                      accessibilityLabelledBy="email-body-label"
                      maxFontSizeMultiplier={1.4}
                    />
                  </View>
                  <Text
                    style={[styles.charCount, { color: charCountColor(emailBody.length, 2000, theme.textMuted, theme.warning ?? '#F59E0B', theme.danger) }]}
                    maxFontSizeMultiplier={1.6}
                    accessibilityLiveRegion="polite"
                  >
                    {emailBody.length}/2000
                  </Text>

                  {emailQuota && (
                    <Text
                      style={[styles.charCount, {
                        color: emailQuota.used >= emailQuota.max ? theme.danger : theme.textMuted,
                        marginTop: 4,
                        marginBottom: 16,
                      }]}
                      maxFontSizeMultiplier={1.6}
                      accessibilityLiveRegion="polite"
                    >
                      {t('messages.emailQuota', { used: emailQuota.used, max: emailQuota.max })}
                      {emailQuota.used >= emailQuota.max
                        ? t('messages.quotaReached')
                        : t('messages.quotaLeft', { remaining: emailQuota.max - emailQuota.used })}
                    </Text>
                  )}
                  {!emailQuota && <View style={{ marginBottom: 16 }} />}

                  <SendButton
                    channelColor={CHANNEL_COLORS.EMAIL}
                    channelColorDark={EMAIL_COLOR_DARK}
                    label={t('messages.sendEmail')}
                    Icon={Mail}
                    canSend={!!emailSubject.trim() && !!emailBody.trim()}
                    isSending={emailMutation.isPending}
                    cooldownRemaining={emailRemaining}
                    onPress={() => { safeImpact(Haptics.ImpactFeedbackStyle.Medium); handleSendEmail(); }}
                  />
                  <LegalNote />
                  </>
                </View>
                )
              )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

// ── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  /* Header bar — simple title */
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
  },
  historyHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minHeight: 34,
  },
  historyHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Lexend_600SemiBold',
  },

  // Channel segmented control
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  segmentText: { fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },

  // Send button progress bars
  progressTrack: {
    height: 3,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: { height: 3, borderRadius: 2 },
  progressIndet: { width: '40%', height: 3, borderRadius: 2 },

  // E-mail premium lock card
  lockWrapper: {
    marginTop: 8,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.25)',
  },
  lockCard: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 22,
    gap: 12,
  },
  lockIconBg: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    fontFamily: 'Lexend_700Bold',
  },
  lockDesc: {
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    paddingHorizontal: 6,
    fontFamily: 'Lexend_500Medium',
  },
  lockCtaWrap: {
    marginTop: 6,
    borderRadius: 14,
    overflow: 'hidden',
    minHeight: 48,
  },
  lockCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  lockCtaText: { fontSize: 15, fontWeight: '800', color: '#1a0533', fontFamily: 'Lexend_700Bold' },

  // Compose card
  composeCard: {
    marginTop: 8,
    borderRadius: 14,
    padding: 18,
    elevation: 3,
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    borderWidth: 1,
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, fontFamily: 'Lexend_600SemiBold' },
  inputWrapper: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  input: { fontSize: 15, paddingVertical: 12, fontFamily: 'Lexend_500Medium' },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: 2, fontFamily: 'Lexend_500Medium' },

  composeTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 14,
  },
  composeTipText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: 'Lexend_500Medium' },

  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 16,
    gap: 10,
    overflow: 'hidden',
    borderWidth: 1,
  },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  legalNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  legalNoteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Lexend_500Medium',
    opacity: 0.85,
  },
});

const bannerStyles = StyleSheet.create({
  wrapper: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingRight: 24,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
    letterSpacing: -0.2,
  },
  desc: {
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
    lineHeight: 18,
    marginTop: 3,
    letterSpacing: 0.1,
  },
  hideBtn: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  hideText: {
    fontSize: 11,
    fontFamily: 'Lexend_500Medium',
    textDecorationLine: 'underline',
    letterSpacing: 0.1,
  },
});
