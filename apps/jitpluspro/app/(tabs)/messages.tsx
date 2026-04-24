import React, { useState, useRef, useCallback, useEffect, memo, useReducer, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Animated,
  LayoutAnimation,
  UIManager,
  Keyboard,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { timeAgo } from '@/utils/date';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import {
  Send,
  Bell,
  CheckCircle2,
  XCircle,
  Users,
  Clock,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Eye,
  Mail,
  Shield,
  Lightbulb,
  X,
  Zap,
  Info,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  WHATSAPP: '#25D366',
  EMAIL: '#EA4335',
} as const;

// ── Emoji stripping (DB-sourced text may contain emojis that conflict with custom icons) ──
const emojiCache = new Map<string, string>();
const stripEmojis = (str: string | null | undefined): string => {
  if (!str) return '';
  const cached = emojiCache.get(str);
  if (cached !== undefined) return cached;
  const stripped = str.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').replace(/\s+/g, ' ').trim();
  if (emojiCache.size > 500) emojiCache.clear();
  emojiCache.set(str, stripped);
  return stripped;
};
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorMessage } from '@/utils/error';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusFade } from '@/hooks/useFocusFade';
import { ms } from '@/utils/responsive';
import PremiumLockCard from '@/components/PremiumLockCard';
import { useNotificationHistory, useEmailQuota, useSendPushNotification, useSendEmail } from '@/hooks/useQueryHooks';
import type { NotificationRecord } from '@/hooks/useQueryHooks';

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
  const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
  const status = axiosErr?.response?.status;
  if (status === 400) {
    // Server-side content filter rejection
    Alert.alert(
      t('messages.contentBlockedTitle'),
      axiosErr?.response?.data?.message || t('messages.contentBlockedMsg'),
    );
    return;
  }
  if (status === 429) {
    Alert.alert(t('common.error'), t('messages.rateLimited'));
    return;
  }
  if (status === 403) {
    const msg = axiosErr?.response?.data?.message || '';
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

// ── Extracted memoized notification card ──
const NotificationCard = memo(function NotificationCard({
  item,
  isExpanded,
  onToggle,
}: {
  item: NotificationRecord;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const channel = item.channel ?? 'PUSH';
  const channelLabel = channel === 'EMAIL'
    ? t('messages.channelEmail')
    : channel === 'WHATSAPP'
      ? t('messages.channelWhatsapp')
      : t('messages.channelNotif');
  const channelColor = channel === 'EMAIL'
    ? CHANNEL_COLORS.EMAIL
    : channel === 'WHATSAPP'
      ? CHANNEL_COLORS.WHATSAPP
      : theme.primary;
  const ChannelIcon = channel === 'EMAIL' ? Mail : channel === 'WHATSAPP' ? MessageCircle : Send;
  const cleanTitle = stripEmojis(item.title);
  const cleanBody = stripEmojis(item.body);

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={() => { animateAccordion(); safeSelection(); onToggle(item.id); }}
      style={[styles.notifCard, { backgroundColor: theme.bgCard, borderColor: isExpanded ? theme.primary + '60' : theme.borderLight }]}
      accessibilityRole="button"
      accessibilityState={{ expanded: isExpanded }}
      accessibilityLabel={`${cleanTitle}. ${channelLabel}.`}
      accessibilityHint={isExpanded ? t('common.collapse') : t('common.expand')}
    >
      <View style={styles.notifHeader}>
        <View style={[styles.notifIconWrap, { shadowColor: channelColor }]} importantForAccessibility="no">
          <LinearGradient
            colors={[channelColor + '30', channelColor + '08']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.notifIcon, { borderColor: channelColor + '35' }]}
          >
            <ChannelIcon size={ms(18)} color={channelColor} strokeWidth={2} />
          </LinearGradient>
        </View>
        <View style={styles.notifMeta}>
          <View style={styles.notifBadgeRow}>
            <View style={[styles.channelBadge, { backgroundColor: channelColor + '18', borderColor: channelColor + '40' }]}>
              <Text style={[styles.channelBadgeText, { color: channelColor }]} maxFontSizeMultiplier={1.4}>{channelLabel}</Text>
            </View>
            {isExpanded
              ? <ChevronUp size={16} color={theme.textMuted} />
              : <ChevronDown size={16} color={theme.textMuted} />}
          </View>
          <Text style={[styles.notifTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6} numberOfLines={isExpanded ? undefined : 2}>
            {cleanTitle}
          </Text>
          <View style={styles.notifTime}>
            <Clock size={11} color={theme.textMuted} />
            <Text style={[styles.notifTimeText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
              {timeAgo(item.createdAt, locale)}
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.notifBody, { color: theme.textSecondary, marginLeft: 48 }]} maxFontSizeMultiplier={1.6} numberOfLines={isExpanded ? undefined : 2}>
        {cleanBody}
      </Text>

      <View style={[styles.notifStats, { borderTopColor: theme.borderLight }]}>
        <View style={styles.stat}>
          <Users size={13} color={theme.textMuted} />
          <Text style={[styles.statText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
            {t('messages.statRecipients', { count: channel === 'PUSH' ? (item.receivedCount ?? item.recipientCount) : item.recipientCount })}
          </Text>
        </View>
        <View style={styles.stat}>
          <CheckCircle2 size={13} color={theme.success} />
          <Text style={[styles.statText, { color: theme.success }]} maxFontSizeMultiplier={1.4}>
            {t('messages.statSent', { count: channel === 'PUSH' ? (item.successCount || item.receivedCount || item.recipientCount) : item.successCount })}
          </Text>
        </View>
        {channel === 'PUSH' && (
          <View style={styles.stat}>
            <Eye size={13} color={theme.primary} />
            <Text style={[styles.statText, { color: theme.primary }]} maxFontSizeMultiplier={1.4}>
              {t('messages.statRead', { count: item.readCount ?? 0 })}
            </Text>
          </View>
        )}
        {item.failureCount > 0 && (
          <View style={styles.stat}>
            <XCircle size={13} color={theme.danger} />
            <Text style={[styles.statText, { color: theme.danger }]} maxFontSizeMultiplier={1.4}>{item.failureCount}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ── History channel filter ──
type HistoryFilter = 'ALL' | 'PUSH' | 'EMAIL' | 'WHATSAPP';

// ── Messages reducer ──
interface MsgState {
  title: string;
  body: string;
  showCompose: boolean;
  emailSubject: string;
  emailBody: string;
  showEmail: boolean;
  pushCooldown: boolean;
  emailCooldown: boolean;
  expandedId: string | null;
  showHistory: boolean;
  historyFilter: HistoryFilter;
}

const initialMsgState: MsgState = {
  title: '',
  body: '',
  showCompose: false,
  emailSubject: '',
  emailBody: '',
  showEmail: false,
  pushCooldown: false,
  emailCooldown: false,
  expandedId: null,
  showHistory: false,
  historyFilter: 'ALL',
};

type SectionKey = 'showCompose' | 'showEmail' | 'showHistory';
type CooldownKey = 'pushCooldown' | 'emailCooldown';

type MsgAction =
  | { type: 'SET'; payload: Partial<MsgState> }
  | { type: 'TOGGLE_SECTION'; section: SectionKey }
  | { type: 'START_COOLDOWN'; key: CooldownKey }
  | { type: 'END_COOLDOWN'; key: CooldownKey }
  | { type: 'RESET_FORM'; form: 'push' | 'email' }
  | { type: 'TOGGLE_EXPANDED'; id: string }
  | { type: 'SET_HISTORY_FILTER'; filter: HistoryFilter };

const allSections: SectionKey[] = ['showCompose', 'showEmail', 'showHistory'];

function msgReducer(state: MsgState, action: MsgAction): MsgState {
  switch (action.type) {
    case 'SET':
      return { ...state, ...action.payload };
    case 'TOGGLE_SECTION': {
      const next = !state[action.section];
      const closed = Object.fromEntries(allSections.map(k => [k, false]));
      return { ...state, ...closed, [action.section]: next };
    }
    case 'START_COOLDOWN':
      return { ...state, [action.key]: true };
    case 'END_COOLDOWN':
      return { ...state, [action.key]: false };
    case 'RESET_FORM':
      if (action.form === 'push') return { ...state, title: '', body: '' };
      return { ...state, emailSubject: '', emailBody: '' };
    case 'TOGGLE_EXPANDED':
      return { ...state, expandedId: state.expandedId === action.id ? null : action.id };
    case 'SET_HISTORY_FILTER':
      return { ...state, historyFilter: action.filter };
  }
}

export default function MessagesScreen() {
  const { merchant, isTeamMember } = useAuth();
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
  const { title, body, showCompose, emailSubject, emailBody, showEmail, pushCooldown, emailCooldown, expandedId, showHistory, historyFilter } = state;
  const set = useCallback((payload: Partial<MsgState>) => dispatch({ type: 'SET', payload }), []);

  // ── React Query mutations ──
  const pushMutation = useSendPushNotification();
  const emailMutation = useSendEmail();

  // ── React Query hooks (disabled for team members — backend requires owner) ──
  // History is only fetched when the user opens the history section
  const { data: history = [], isLoading: loading, isRefetching: refreshing, refetch: refetchHistory } = useNotificationHistory(isOwner && showHistory);
  const { data: emailQuota } = useEmailQuota(isOwner && isPremium && showEmail);

  // ── Filtered history ──
  const filteredHistory = useMemo(() => {
    if (historyFilter === 'ALL') return history;
    return history.filter((n) => {
      const ch = n.channel ?? 'PUSH';
      return ch === historyFilter;
    });
  }, [history, historyFilter]);

  const sendRipple = useRef(new Animated.Value(0)).current;
  const [focusedField, setFocusedField] = useState<'title' | 'body' | null>(null);

  // Cooldown timer refs — cleaned up on unmount to prevent memory leaks
  const cooldownTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    return () => {
      cooldownTimers.current.forEach(clearTimeout);
    };
  }, []);
  const startCooldown = useCallback((key: CooldownKey) => {
    dispatch({ type: 'START_COOLDOWN', key });
    const timer = setTimeout(() => {
      dispatch({ type: 'END_COOLDOWN', key });
      cooldownTimers.current = cooldownTimers.current.filter((t) => t !== timer);
    }, SEND_COOLDOWN_MS);
    cooldownTimers.current.push(timer);
  }, []);

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
              startCooldown('emailCooldown');
            } catch (err: unknown) {
              safeNotification(Haptics.NotificationFeedbackType.Error);
              handlePremiumError(err, t);
            }
          },
        },
      ],
    );
  }, [emailSubject, emailBody, emailMutation, startCooldown, t]);

  const onRefresh = useGuardedCallback(async () => { await refetchHistory(); }, [refetchHistory]);

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
              startCooldown('pushCooldown');
            } catch (err: unknown) {
              safeNotification(Haptics.NotificationFeedbackType.Error);
              handlePremiumError(err, t);
            }
          },
        },
      ],
    );
  }, [title, body, pushMutation, startCooldown, t]);

  const triggerSendRipple = useCallback(() => {
    sendRipple.setValue(0);
    Animated.timing(sendRipple, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [sendRipple]);

  const sendRippleStyle = useMemo(() => ({
    opacity: sendRipple.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
    transform: [{ scale: sendRipple.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
  }), [sendRipple]);

  // focusStyle is provided by useFocusFade()

  // ── Toggle expanded card ──
  const toggleExpanded = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_EXPANDED', id });
  }, []);

  // ── Render notification card (delegates to memoized component) ──
  const renderNotification = useCallback(({ item }: { item: NotificationRecord }) => (
    <NotificationCard
      item={item}
      isExpanded={expandedId === item.id}
      onToggle={toggleExpanded}
    />
  ), [expandedId, toggleExpanded]);

  const keyExtractor = useCallback((item: NotificationRecord) => item.id, []);

  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);

  // ── Filter pills config ──
  const filterOptions: { key: HistoryFilter; label: string }[] = useMemo(() => [
    { key: 'ALL', label: t('messages.filterAll') },
    { key: 'PUSH', label: t('messages.filterPush') },
    { key: 'EMAIL', label: t('messages.filterEmail') },
  ], [t]);

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
        </View>

        {/* ── Dismissable tip banner ── */}
        {bannerVisible && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <MessagesBanner onDismiss={dismissBanner} onDismissForever={dismissBannerForever} />
          </View>
        )}

        <FlatList
          data={showHistory ? filteredHistory : []}
          keyExtractor={keyExtractor}
          renderItem={renderNotification}
          contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16 }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS !== 'web'}
          maxToRenderPerBatch={8}
          windowSize={5}
          initialNumToRender={8}
          ItemSeparatorComponent={ItemSeparator}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
          ListHeaderComponent={
            <View>
              {/* ── Channel Toggle Row (Notification / E-mail) ── */}
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  onPress={() => { animateAccordion(); safeSelection(); dispatch({ type: 'TOGGLE_SECTION', section: 'showCompose' }); }}
                  activeOpacity={0.8}
                  style={[
                    styles.composeToggle,
                    { flex: 1, backgroundColor: showCompose ? theme.primary + '18' : theme.bgCard, borderColor: showCompose ? theme.primary : theme.borderLight },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('messages.channelNotif')}
                  accessibilityState={{ expanded: showCompose }}
                  hitSlop={HIT_SLOP_MED}
                >
                  <Send size={16} color={theme.primary} />
                  <Text style={[styles.composeToggleText, { color: showCompose ? theme.primary : theme.text }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>
                    {t('messages.channelNotif')}
                  </Text>
                  {showCompose ? <ChevronUp size={14} color={theme.primary} /> : <ChevronDown size={14} color={theme.textMuted} />}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => { animateAccordion(); safeSelection(); dispatch({ type: 'TOGGLE_SECTION', section: 'showEmail' }); }}
                  activeOpacity={0.8}
                  style={[
                    styles.composeToggle,
                    { flex: 1, backgroundColor: showEmail ? CHANNEL_COLORS.EMAIL + '18' : theme.bgCard, borderColor: showEmail ? CHANNEL_COLORS.EMAIL : theme.borderLight },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('messages.channelEmail')}
                  accessibilityState={{ expanded: showEmail }}
                  hitSlop={HIT_SLOP_MED}
                >
                  <Mail size={16} color={CHANNEL_COLORS.EMAIL} />
                  <Text style={[styles.composeToggleText, { color: showEmail ? CHANNEL_COLORS.EMAIL : theme.text }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>
                    {t('messages.channelEmail')}
                  </Text>
                  {showEmail ? <ChevronUp size={14} color={CHANNEL_COLORS.EMAIL} /> : <ChevronDown size={14} color={theme.textMuted} />}
                </TouchableOpacity>
              </View>

              {showCompose && (
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

                  <TouchableOpacity
                    style={[
                      styles.sendBtn,
                      {
                        backgroundColor: title.trim() && body.trim() ? theme.primary : theme.border,
                        borderColor: title.trim() && body.trim() ? theme.primaryLight : theme.border,
                      },
                    ]}
                    onPress={() => {
                      safeImpact(Haptics.ImpactFeedbackStyle.Medium);
                      triggerSendRipple();
                      handleSend();
                    }}
                    disabled={pushMutation.isPending || pushCooldown || !title.trim() || !body.trim()}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t('messages.sendToAll')}
                    accessibilityState={{ disabled: pushMutation.isPending || pushCooldown || !title.trim() || !body.trim(), busy: pushMutation.isPending }}
                  >
                    <Animated.View pointerEvents="none" style={[styles.sendRipple, sendRippleStyle]} />
                    {pushMutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" accessibilityLabel={t('messages.sending')} />
                    ) : (
                      <>
                        <Send size={18} color="#fff" strokeWidth={1.5} />
                        <Text style={styles.sendBtnText} maxFontSizeMultiplier={1.4}>{t('messages.sendToAll')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <LegalNote />
                </View>
              )}

              {/* ── Email Compose Card ─────────────── */}
              {showEmail && (
                <View
                  style={[styles.composeCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
                >
                  {!isPremium ? (
                    <PremiumLockCard descriptionKey="messages.premiumEmailDesc" />
                  ) : (<>
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

                  <TouchableOpacity
                    style={[
                      styles.sendBtn,
                      {
                        backgroundColor: emailSubject.trim() && emailBody.trim() ? CHANNEL_COLORS.EMAIL : theme.border,
                        borderColor: emailSubject.trim() && emailBody.trim() ? '#c5221f' : theme.border,
                      },
                    ]}
                    onPress={() => { safeImpact(Haptics.ImpactFeedbackStyle.Medium); handleSendEmail(); }}
                    disabled={emailMutation.isPending || emailCooldown || !emailSubject.trim() || !emailBody.trim()}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t('messages.sendEmail')}
                    accessibilityState={{ disabled: emailMutation.isPending || emailCooldown || !emailSubject.trim() || !emailBody.trim(), busy: emailMutation.isPending }}
                  >
                    {emailMutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" accessibilityLabel={t('messages.sending')} />
                    ) : (
                      <>
                        <Mail size={18} color="#fff" strokeWidth={1.5} />
                        <Text style={styles.sendBtnText} maxFontSizeMultiplier={1.4}>{t('messages.sendEmail')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <LegalNote />
                  </>)}
                </View>
              )}

              {/* ── History section ────────── */}
              <View style={styles.historyToggle}>
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 0, marginBottom: 0 }]} maxFontSizeMultiplier={1.4} accessibilityRole="header">
                  {t('messages.history')}
                </Text>
              </View>

              {!showHistory ? (
                <View style={styles.showHistoryCta}>
                  <View style={[styles.emptyIllustration, { backgroundColor: `${palette.charbon}12` }]} importantForAccessibility="no">
                    <Clock size={ms(36)} color={palette.charbon} strokeWidth={1.5} />
                  </View>
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
                    {t('messages.showHistoryHint')}
                  </Text>
                  <TouchableOpacity
                    style={[styles.showHistoryBtn, { backgroundColor: theme.primary }]}
                    onPress={() => { safeSelection(); dispatch({ type: 'SET', payload: { showHistory: true } }); }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('messages.showHistory')}
                    hitSlop={HIT_SLOP_MED}
                  >
                    <Bell size={18} color="#fff" strokeWidth={2} />
                    <Text style={styles.showHistoryBtnText} maxFontSizeMultiplier={1.4}>{t('messages.showHistory')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* ── Filter pills ── */
                <View style={{ paddingTop: 4, paddingBottom: 8 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                    {filterOptions.map((opt) => {
                      const active = historyFilter === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          onPress={() => { safeSelection(); dispatch({ type: 'SET_HISTORY_FILTER', filter: opt.key }); }}
                          activeOpacity={0.7}
                          style={[
                            styles.filterPill,
                            { backgroundColor: active ? theme.primary : theme.bgCard, borderColor: active ? theme.primary : theme.borderLight },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={opt.label}
                          accessibilityState={{ selected: active }}
                          hitSlop={HIT_SLOP_MED}
                        >
                          <Text style={[styles.filterPillText, { color: active ? '#fff' : theme.text }]} maxFontSizeMultiplier={1.4}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            !showHistory ? null :
            loading ? (
              <View style={styles.emptyContainer} accessible accessibilityRole="progressbar" accessibilityLabel={t('messages.loadingClients')}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyIllustration, { backgroundColor: `${palette.charbon}12` }]} importantForAccessibility="no">
                  <Bell size={ms(36)} color={palette.charbon} strokeWidth={1.5} />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6}>{t('messages.noMessages')}</Text>
                <Text style={[styles.emptyText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.6}>
                  {t('messages.noMessagesHint')}
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            showHistory && filteredHistory.length > 0 ? (
              <View style={styles.footerEndWrap}>
                <View style={[styles.footerDivider, { backgroundColor: theme.border }]} importantForAccessibility="no" />
                <Text style={[styles.footerEnd, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{t('messages.allDisplayed')}</Text>
              </View>
            ) : null
          }
        />
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


  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 16,
  },

  // Compose toggle
  composeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 12,
    borderRadius: 14,
    gap: 4,
    elevation: 2,
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    borderWidth: 1,
  },
  composeToggleText: { flex: 1, fontSize: 11, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

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
  sendRipple: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
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

  // Section
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 28,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.7,
    fontFamily: 'Lexend_600SemiBold',
  },

  // Notification card
  notifCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 0,
    elevation: 3,
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    borderWidth: 1,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  notifIconWrap: {
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 3,
  },
  notifIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  notifMeta: { flex: 1, marginLeft: 12 },
  notifBadgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  notifTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Lexend_600SemiBold', marginTop: 4 },
  notifTime: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  notifTimeText: { fontSize: 11, fontFamily: 'Lexend_500Medium' },
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 12,
  },

  // Show history CTA
  showHistoryCta: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 12,
  },
  showHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  showHistoryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_600SemiBold' },

  // Filter pills
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },
  channelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 14,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  channelBadgeText: { fontSize: 10, fontFamily: 'Lexend_600SemiBold' },
  notifBody: { fontSize: 14, lineHeight: 20, marginBottom: 10, fontFamily: 'Lexend_500Medium', flexShrink: 1 },
  notifStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // Empty
  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyIllustration: {
    width: ms(88),
    height: ms(88),
    borderRadius: ms(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, fontFamily: 'Lexend_600SemiBold' },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
    lineHeight: 20,
    fontFamily: 'Lexend_500Medium',
  },

  // Separator & footer
  separator: { height: 8 },
  footerEndWrap: { alignItems: 'center', paddingVertical: 24 },
  footerDivider: { width: 48, height: 3, borderRadius: 2, marginBottom: 10, opacity: 0.3 },
  footerEnd: { fontSize: 12, fontFamily: 'Lexend_500Medium', opacity: 0.5 },
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
