import React, { useState, useRef, useCallback, useEffect, memo, useReducer } from 'react';
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
} from 'react-native';
import { timeAgo } from '@/utils/date';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import {
  Send,
  Bell,
  CheckCircle2,
  XCircle,
  Users,
  Megaphone,
  Clock,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Eye,
  Mail,
  Shield,
} from 'lucide-react-native';

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
  GRADIENT: ['#7C3AED', '#1F2937'] as const,
} as const;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorMessage } from '@/utils/error';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusFade } from '@/hooks/useFocusFade';
import PremiumLockCard from '@/components/PremiumLockCard';
import { useNotificationHistory, useWhatsappQuota, useEmailQuota, useSendPushNotification, useSendWhatsApp, useSendEmail } from '@/hooks/useQueryHooks';
import type { NotificationRecord } from '@/hooks/useQueryHooks';

// ── Cooldown duration after a successful send (ms) ──
const SEND_COOLDOWN_MS = 30_000;

/**
 * Handle 403 errors from notification endpoints.
 * Distinguishes premium plan issues from quota exhaustion.
 */
function handlePremiumError(
  err: unknown,
  t: (key: string, vars?: Record<string, unknown>) => string,
) {
  const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
  if (axiosErr?.response?.status === 403) {
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

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={() => { animateAccordion(); onToggle(item.id); }}
      style={[styles.notifCard, { backgroundColor: theme.bgCard, borderColor: isExpanded ? theme.primary + '60' : theme.borderLight }]}
    >
      <View style={styles.notifHeader}>
        <View style={[styles.notifIcon, { backgroundColor: channelColor + '18' }]}>
          <ChannelIcon size={18} color={channelColor} />
        </View>
        <View style={styles.notifMeta}>
          <View style={styles.notifBadgeRow}>
            <View style={[styles.channelBadge, { backgroundColor: channelColor + '18', borderColor: channelColor + '40' }]}>
              <Text style={[styles.channelBadgeText, { color: channelColor }]}>{channelLabel}</Text>
            </View>
            {isExpanded
              ? <ChevronUp size={16} color={theme.textMuted} />
              : <ChevronDown size={16} color={theme.textMuted} />}
          </View>
          <Text style={[styles.notifTitle, { color: theme.text }]} numberOfLines={isExpanded ? undefined : 2}>
            {item.title}
          </Text>
          <View style={styles.notifTime}>
            <Clock size={11} color={theme.textMuted} />
            <Text style={[styles.notifTimeText, { color: theme.textMuted }]}>
              {timeAgo(item.createdAt, locale)}
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.notifBody, { color: theme.textSecondary, marginLeft: 48 }]} numberOfLines={isExpanded ? undefined : 2}>
        {item.body}
      </Text>

      <View style={[styles.notifStats, { borderTopColor: theme.borderLight }]}>
        <View style={styles.stat}>
          <Users size={13} color={theme.textMuted} />
          <Text style={[styles.statText, { color: theme.textMuted }]}>
            {t('messages.statRecipients', { count: channel === 'PUSH' ? (item.receivedCount ?? item.recipientCount) : item.recipientCount })}
          </Text>
        </View>
        <View style={styles.stat}>
          <CheckCircle2 size={13} color={theme.success} />
          <Text style={[styles.statText, { color: theme.success }]}>
            {t('messages.statSent', { count: channel === 'PUSH' ? (item.successCount || item.receivedCount || item.recipientCount) : item.successCount })}
          </Text>
        </View>
        {channel === 'PUSH' && (
          <View style={styles.stat}>
            <Eye size={13} color={theme.primary} />
            <Text style={[styles.statText, { color: theme.primary }]}>
              {t('messages.statRead', { count: item.readCount ?? 0 })}
            </Text>
          </View>
        )}
        {item.failureCount > 0 && (
          <View style={styles.stat}>
            <XCircle size={13} color={theme.danger} />
            <Text style={[styles.statText, { color: theme.danger }]}>{item.failureCount}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ── Messages reducer ──
interface MsgState {
  title: string;
  body: string;
  showCompose: boolean;
  whatsappMessage: string;
  showWhatsApp: boolean;
  emailSubject: string;
  emailBody: string;
  showEmail: boolean;
  pushCooldown: boolean;
  whatsappCooldown: boolean;
  emailCooldown: boolean;
  expandedId: string | null;
  showHistory: boolean;
}

const initialMsgState: MsgState = {
  title: '',
  body: '',
  showCompose: true,
  whatsappMessage: '',
  showWhatsApp: false,
  emailSubject: '',
  emailBody: '',
  showEmail: false,
  pushCooldown: false,
  whatsappCooldown: false,
  emailCooldown: false,
  expandedId: null,
  showHistory: false,
};

type SectionKey = 'showCompose' | 'showWhatsApp' | 'showEmail' | 'showHistory';
type CooldownKey = 'pushCooldown' | 'whatsappCooldown' | 'emailCooldown';

type MsgAction =
  | { type: 'SET'; payload: Partial<MsgState> }
  | { type: 'TOGGLE_SECTION'; section: SectionKey }
  | { type: 'START_COOLDOWN'; key: CooldownKey }
  | { type: 'END_COOLDOWN'; key: CooldownKey }
  | { type: 'RESET_FORM'; form: 'push' | 'whatsapp' | 'email' }
  | { type: 'TOGGLE_EXPANDED'; id: string };

const allSections: SectionKey[] = ['showCompose', 'showWhatsApp', 'showEmail', 'showHistory'];

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
      if (action.form === 'whatsapp') return { ...state, whatsappMessage: '' };
      return { ...state, emailSubject: '', emailBody: '' };
    case 'TOGGLE_EXPANDED':
      return { ...state, expandedId: state.expandedId === action.id ? null : action.id };
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

  const [state, dispatch] = useReducer(msgReducer, initialMsgState);
  const { title, body, showCompose, whatsappMessage, showWhatsApp, emailSubject, emailBody, showEmail, pushCooldown, whatsappCooldown, emailCooldown, expandedId, showHistory } = state;
  const set = useCallback((payload: Partial<MsgState>) => dispatch({ type: 'SET', payload }), []);

  // ── React Query mutations ──
  const pushMutation = useSendPushNotification();
  const whatsappMutation = useSendWhatsApp();
  const emailMutation = useSendEmail();

  // ── React Query hooks (disabled for team members — backend requires owner) ──
  const { data: history = [], isLoading: loading, isRefetching: refreshing, refetch: refetchHistory } = useNotificationHistory(isOwner);
  const { data: whatsappQuota } = useWhatsappQuota(isOwner && isPremium && showWhatsApp);
  const { data: emailQuota } = useEmailQuota(isOwner && isPremium && showEmail);

  const sendRipple = useRef(new Animated.Value(0)).current;

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
  const handleSendWhatsApp = () => {
    if (!whatsappMessage.trim()) {
      Alert.alert(t('common.error'), t('messages.whatsappEmptyMsg'));
      return;
    }
    Keyboard.dismiss();

    Alert.alert(
      t('messages.whatsappConfirmTitle'),
      t('messages.whatsappConfirmBody', { message: whatsappMessage.trim() }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('messages.send'),
          style: 'default',
          onPress: async () => {
            try {
              const { recipientCount, successCount, failureCount } = await whatsappMutation.mutateAsync({
                body: whatsappMessage.trim(),
              });

              Alert.alert(
                t('messages.whatsappSuccessTitle'),
                t('messages.whatsappSuccessBody', {
                  success: successCount,
                  total: recipientCount,
                  failures: failureCount > 0 ? t('messages.whatsappFailureSuffix', { count: failureCount }) : '',
                }),
              );

              dispatch({ type: 'RESET_FORM', form: 'whatsapp' });
              startCooldown('whatsappCooldown');
            } catch (err: unknown) {
              handlePremiumError(err, t);
            }
          },
        },
      ],
    );
  };

  // ── Handle Email send ──
  const handleSendEmail = () => {
    if (!emailSubject.trim() || !emailBody.trim()) {
      Alert.alert(t('messages.notifEmptyFieldsTitle'), t('messages.emailEmptyMsg'));
      return;
    }
    Keyboard.dismiss();

    Alert.alert(
      t('messages.emailConfirmTitle'),
      t('messages.emailConfirmBody', { subject: emailSubject.trim() }),
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
              handlePremiumError(err, t);
            }
          },
        },
      ],
    );
  };

  const onRefresh = useGuardedCallback(async () => { await refetchHistory(); }, [refetchHistory]);

  // ── Send notification ──
  const handleSend = () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert(t('messages.notifEmptyFieldsTitle'), t('messages.notifEmptyFields'));
      return;
    }
    Keyboard.dismiss();

    Alert.alert(
      t('messages.notifConfirmTitle'),
      t('messages.notifConfirmBody', { title: title.trim(), body: body.trim() }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('messages.send'),
          style: 'default',
          onPress: async () => {
            try {
              const { recipientCount, successCount, failureCount } = await pushMutation.mutateAsync({
                title: title.trim(),
                body: body.trim(),
              });

              Alert.alert(
                t('messages.pushSuccessTitle'),
                t('messages.pushSuccessBody', { count: recipientCount }),
              );

              dispatch({ type: 'RESET_FORM', form: 'push' });
              startCooldown('pushCooldown');
            } catch (err: unknown) {
              handlePremiumError(err, t);
            }
          },
        },
      ],
    );
  };

  const triggerSendRipple = () => {
    sendRipple.setValue(0);
    Animated.timing(sendRipple, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  };

  const sendRippleStyle = {
    opacity: sendRipple.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
    transform: [{ scale: sendRipple.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
  };

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

  // ── Team members cannot access notifications ──
  if (isTeamMember) {
    return (
      <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
        <LinearGradient
          colors={[...CHANNEL_COLORS.GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.header, { paddingTop: insets.top + 12 }]}
        >
          <Megaphone size={26} color="#EDE9FE" strokeWidth={1.5} />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{t('messages.title')}</Text>
            <Text style={styles.headerSub}>{t('messages.subtitle')}</Text>
          </View>
        </LinearGradient>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Shield size={48} color={theme.textMuted} strokeWidth={1.5} />
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
            {t('messages.ownerOnly')}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
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
        {/* ── Header ─────────────────────────────── */}
        <LinearGradient
          colors={[...CHANNEL_COLORS.GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.header, { paddingTop: insets.top + 12 }]}
        >
          <Megaphone size={26} color="#EDE9FE" strokeWidth={1.5} />
          <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t('messages.title')}</Text>
            <Text style={styles.headerSub}>{t('messages.subtitle')}</Text>
          </View>
        </LinearGradient>

        <FlatList
          data={showHistory ? history : []}
          keyExtractor={keyExtractor}
          renderItem={renderNotification}
          contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16 }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS !== 'web'}
          maxToRenderPerBatch={8}
          windowSize={5}
          initialNumToRender={8}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
          ListHeaderComponent={
            <>
              {/* ── Channel Toggle Row (Notification / WhatsApp / E-mail) ── */}
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  onPress={() => { animateAccordion(); dispatch({ type: 'TOGGLE_SECTION', section: 'showCompose' }); }}
                  activeOpacity={0.8}
                  style={[
                    styles.composeToggle,
                    { flex: 1, backgroundColor: showCompose ? theme.primary + '18' : theme.bgCard, borderColor: showCompose ? theme.primary : theme.borderLight },
                  ]}
                >
                  <Send size={16} color={theme.primary} />
                  <Text style={[styles.composeToggleText, { color: showCompose ? theme.primary : theme.text }]} numberOfLines={1}>
                    {t('messages.channelNotif')}
                  </Text>
                  {showCompose ? <ChevronUp size={14} color={theme.primary} /> : <ChevronDown size={14} color={theme.textMuted} />}
                </TouchableOpacity>

                <View
                  style={[
                    styles.composeToggle,
                    { flex: 1, backgroundColor: theme.bgCard, borderColor: theme.borderLight, opacity: 0.6 },
                  ]}
                >
                  <MessageCircle size={16} color={theme.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.composeToggleText, { color: theme.textMuted }]} numberOfLines={1}>
                      WhatsApp
                    </Text>
                    <Text style={{ fontSize: 9, color: theme.textMuted, fontStyle: 'italic' }} numberOfLines={1}>
                      {t('messagesPage.comingSoon')}
                    </Text>
                  </View>
                  <Clock size={12} color={theme.textMuted} />
                </View>

                <TouchableOpacity
                  onPress={() => { animateAccordion(); dispatch({ type: 'TOGGLE_SECTION', section: 'showEmail' }); }}
                  activeOpacity={0.8}
                  style={[
                    styles.composeToggle,
                    { flex: 1, backgroundColor: showEmail ? CHANNEL_COLORS.EMAIL + '18' : theme.bgCard, borderColor: showEmail ? CHANNEL_COLORS.EMAIL : theme.borderLight },
                  ]}
                >
                  <Mail size={16} color={CHANNEL_COLORS.EMAIL} />
                  <Text style={[styles.composeToggleText, { color: showEmail ? CHANNEL_COLORS.EMAIL : theme.text }]} numberOfLines={1}>
                    {t('messages.channelEmail')}
                  </Text>
                  {showEmail ? <ChevronUp size={14} color={CHANNEL_COLORS.EMAIL} /> : <ChevronDown size={14} color={theme.textMuted} />}
                </TouchableOpacity>
              </View>

              {showCompose && (
                <View
                  style={[styles.composeCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
                >
                  {/* Title input */}
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                    {t('messages.messageTitle')}
                  </Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      { backgroundColor: theme.bgInput, borderColor: theme.border },
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
                    />
                  </View>
                  <Text style={[styles.charCount, { color: charCountColor(title.length, 100, theme.textMuted, theme.warning ?? '#F59E0B', theme.danger) }]}>
                    {title.length}/100
                  </Text>

                  {/* Body input */}
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 12 }]}>
                    {t('messages.messageBody')}
                  </Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: theme.bgInput,
                        borderColor: theme.border,
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
                    />
                  </View>
                  <Text style={[styles.charCount, { color: charCountColor(body.length, 500, theme.textMuted, theme.warning ?? '#F59E0B', theme.danger) }]}>
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
                      triggerSendRipple();
                      handleSend();
                    }}
                    disabled={pushMutation.isPending || pushCooldown || !title.trim() || !body.trim()}
                    activeOpacity={0.85}
                  >
                    <Animated.View pointerEvents="none" style={[styles.sendRipple, sendRippleStyle]} />
                    {pushMutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Send size={18} color="#fff" strokeWidth={1.5} />
                        <Text style={styles.sendBtnText}>{t('messages.sendToAll')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {false && showWhatsApp && (
                <View
                  style={[styles.composeCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
                >
                  {!isPremium ? (
                    <PremiumLockCard descriptionKey="messages.premiumWhatsappDesc" />
                  ) : (<>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                    {t('messages.whatsappSection')}
                  </Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: theme.bgInput,
                        borderColor: theme.border,
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
                      value={whatsappMessage}
                      onChangeText={(v) => set({ whatsappMessage: v })}
                      placeholder={t('messages.whatsappPlaceholder')}
                      placeholderTextColor={theme.textMuted}
                      multiline
                      maxLength={500}
                    />
                  </View>
                  <Text style={[styles.charCount, { color: charCountColor(whatsappMessage.length, 500, theme.textMuted, theme.warning ?? '#F59E0B', theme.danger) }]}>
                    {whatsappMessage.length}/500
                  </Text>

                  {(() => {
                    if (!whatsappQuota) return null;
                    const wq = whatsappQuota!;
                    return (
                      <Text style={[styles.charCount, {
                        color: wq.used >= wq.max ? theme.danger : theme.textMuted,
                        marginTop: 12,
                        marginBottom: 16,
                      }]}>
                        {t('messages.whatsappQuota', { used: wq.used, max: wq.max })}
                        {wq.used >= wq.max
                          ? t('messages.quotaReached')
                          : t('messages.quotaLeft', { remaining: wq.max - wq.used })}
                      </Text>
                    );
                  })()}
                  {!whatsappQuota && <View style={{ marginBottom: 16 }} />}

                  {/* Send WhatsApp button */}
                  {whatsappMutation.isPending ? (
                    <View style={[styles.sendBtn, { backgroundColor: CHANNEL_COLORS.WHATSAPP, borderColor: '#128c1f' }]}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.sendBtnText}>{t('messages.sending')}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.sendBtn,
                        {
                          backgroundColor: whatsappMessage.trim() ? CHANNEL_COLORS.WHATSAPP : theme.border,
                          borderColor: whatsappMessage.trim() ? '#128c1f' : theme.border,
                        },
                      ]}
                      onPress={handleSendWhatsApp}
                      disabled={whatsappCooldown || !whatsappMessage.trim()}
                      activeOpacity={0.85}
                    >
                      <MessageCircle size={18} color="#fff" strokeWidth={1.5} />
                      <Text style={styles.sendBtnText}>{t('messages.sendWhatsApp')}</Text>
                    </TouchableOpacity>
                  )}
                  </>)}
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
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
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
                    />
                  </View>
                  <Text style={[styles.charCount, { color: charCountColor(emailSubject.length, 150, theme.textMuted, theme.warning ?? '#F59E0B', theme.danger) }]}>
                    {emailSubject.length}/150
                  </Text>

                  <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 12 }]}>
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
                    />
                  </View>
                  <Text style={[styles.charCount, { color: charCountColor(emailBody.length, 2000, theme.textMuted, theme.warning ?? '#F59E0B', theme.danger) }]}>
                    {emailBody.length}/2000
                  </Text>

                  {emailQuota && (
                    <Text style={[styles.charCount, {
                      color: emailQuota.used >= emailQuota.max ? theme.danger : theme.textMuted,
                      marginTop: 4,
                      marginBottom: 16,
                    }]}>
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
                    onPress={handleSendEmail}
                    disabled={emailMutation.isPending || emailCooldown || !emailSubject.trim() || !emailBody.trim()}
                    activeOpacity={0.85}
                  >
                    {emailMutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Mail size={18} color="#fff" strokeWidth={1.5} />
                        <Text style={styles.sendBtnText}>{t('messages.sendEmail')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  </>)}
                </View>
              )}

              {/* ── History title (toggle) ────────── */}
              <TouchableOpacity
                onPress={() => { animateAccordion(); dispatch({ type: 'TOGGLE_SECTION', section: 'showHistory' }); }}
                activeOpacity={0.7}
                style={styles.historyToggle}
              >
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 0, marginBottom: 0 }]}>
                  {t('messages.history')}
                </Text>
                {showHistory
                  ? <ChevronUp size={18} color={theme.textMuted} />
                  : <ChevronDown size={18} color={theme.textMuted} />}
              </TouchableOpacity>
            </>
          }
          ListEmptyComponent={
            !showHistory ? null :
            loading ? (
              <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Bell size={56} color={theme.textMuted} strokeWidth={1.5} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('messages.noMessages')}</Text>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                  {t('messages.noMessagesHint')}
                </Text>
              </View>
            )
          }
        />
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

// ── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 20,
    paddingHorizontal: 20,
    gap: 14,
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_700Bold' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,.7)', marginTop: 4, fontFamily: 'Lexend_500Medium' },

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
    borderRadius: 20,
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
    borderRadius: 24,
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
    borderRadius: 20,
    paddingHorizontal: 14,
  },
  input: { fontSize: 15, paddingVertical: 12, fontFamily: 'Lexend_500Medium' },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: 2, fontFamily: 'Lexend_500Medium' },

  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 24,
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
    borderRadius: 24,
    padding: 16,
    marginBottom: 10,
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
  notifIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
  channelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
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
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, fontFamily: 'Lexend_600SemiBold' },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
    lineHeight: 20,
    fontFamily: 'Lexend_500Medium',
  },
});
