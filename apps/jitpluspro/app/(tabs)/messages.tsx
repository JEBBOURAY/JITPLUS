import React, { useState, useRef, useCallback, memo } from 'react';
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
} from 'lucide-react-native';

// Enable LayoutAnimation on Android (old arch only — New Architecture supports it natively)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental && !(global as Record<string, unknown>).__turboModuleProxy) {
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
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusFade } from '@/hooks/useFocusFade';
import PremiumLockCard from '@/components/PremiumLockCard';
import { useQueryClient } from '@tanstack/react-query';
import { useNotificationHistory, useWhatsappQuota, useEmailQuota, queryKeys } from '@/hooks/useQueryHooks';
import type { NotificationRecord } from '@/hooks/useQueryHooks';

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
  theme,
  locale,
  t,
}: {
  item: NotificationRecord;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  theme: ReturnType<typeof useTheme>;
  locale: string;
  t: (key: string, vars?: Record<string, unknown>) => string;
}) {
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
            {t('messages.statSent', { count: item.successCount })}
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

export default function MessagesScreen() {
  const { merchant } = useAuth();
  const isPremium = merchant?.plan === 'PREMIUM';
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { focusStyle } = useFocusFade();
  const { t, locale } = useLanguage();
  const queryClient = useQueryClient();

  // ── Form state ──
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [showCompose, setShowCompose] = useState(true);

  // ── WhatsApp state ──
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [whatsappLoading, setWhatsappLoading] = useState(false);

  // ── Email state ──
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  // ── React Query hooks ──
  const { data: history = [], isLoading: loading, isRefetching: refreshing, refetch: refetchHistory } = useNotificationHistory();
  const { data: whatsappQuota = null } = useWhatsappQuota(isPremium && showWhatsApp);
  const { data: emailQuota = null } = useEmailQuota(isPremium && showEmail);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const sendRipple = useRef(new Animated.Value(0)).current;

  // ── Handle WhatsApp send ──
  const handleSendWhatsApp = () => {
    if (!whatsappMessage.trim()) {
      Alert.alert(t('common.error'), t('messages.whatsappEmptyMsg'));
      return;
    }

    Alert.alert(
      t('messages.whatsappConfirmTitle'),
      t('messages.whatsappConfirmBody', { message: whatsappMessage.trim() }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('messages.send'),
          style: 'default',
          onPress: async () => {
            setWhatsappLoading(true);
            try {
              const res = await api.post('/notifications/send-whatsapp-to-all', {
                body: whatsappMessage.trim(),
              });

              const { recipientCount, successCount, failureCount } = res.data;

              Alert.alert(
                t('messages.whatsappSuccessTitle'),
                t('messages.whatsappSuccessBody', {
                  success: successCount,
                  total: recipientCount,
                  failures: failureCount > 0 ? t('messages.whatsappFailureSuffix', { count: failureCount }) : '',
                }),
              );

              setWhatsappMessage('');
              queryClient.invalidateQueries({ queryKey: queryKeys.whatsappQuota });
              queryClient.invalidateQueries({ queryKey: queryKeys.notificationHistory });
            } catch (err: unknown) {
              const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
              if (axiosErr?.response?.status === 403) {
                const msg = axiosErr?.response?.data?.message || '';
                const isPlanIssue = msg.includes('Premium') || msg.includes('essai');
                Alert.alert(
                  isPlanIssue ? t('messages.premiumOnly') : t('messages.quotaReached'),
                  msg || t('messages.premiumMsg'),
                );
              } else {
                Alert.alert(t('common.error'), getErrorMessage(err, t('common.genericError')));
              }
            } finally {
              setWhatsappLoading(false);
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

    Alert.alert(
      t('messages.emailConfirmTitle'),
      t('messages.emailConfirmBody', { subject: emailSubject.trim() }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('messages.send'),
          style: 'default',
          onPress: async () => {
            setEmailSending(true);
            try {
              const res = await api.post('/notifications/send-email-to-all', {
                subject: emailSubject.trim(),
                body: emailBody.trim(),
              });

              const { recipientCount, successCount, failureCount } = res.data;

              Alert.alert(
                t('messages.emailSuccessTitle'),
                t('messages.emailSuccessBody', {
                  success: successCount,
                  total: recipientCount,
                  failures: failureCount > 0 ? t('messages.emailFailureSuffix', { count: failureCount }) : '',
                }),
              );

              setEmailSubject('');
              setEmailBody('');
              queryClient.invalidateQueries({ queryKey: queryKeys.emailQuota });
              queryClient.invalidateQueries({ queryKey: queryKeys.notificationHistory });
            } catch (err: unknown) {
              const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
              if (axiosErr?.response?.status === 403) {
                const msg = axiosErr?.response?.data?.message || '';
                const isPlanIssue = msg.includes('Premium') || msg.includes('essai');
                Alert.alert(
                  isPlanIssue ? t('messages.premiumOnly') : t('messages.quotaReached'),
                  msg || t('messages.premiumMsg'),
                );
              } else {
                Alert.alert(
                  t('common.error'),
                  getErrorMessage(err, t('common.genericError')),
                );
              }
            } finally {
              setEmailSending(false);
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

    Alert.alert(
      t('messages.notifConfirmTitle'),
      t('messages.notifConfirmBody', { title: title.trim(), body: body.trim() }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('messages.send'),
          style: 'default',
          onPress: async () => {
            setSending(true);
            try {
              const res = await api.post('/notifications/send-to-all', {
                title: title.trim(),
                body: body.trim(),
              });

              const { recipientCount, successCount, failureCount } = res.data;

              Alert.alert(
                t('messages.sentSuccess'),
                t('messages.whatsappSuccessBody', {
                  success: successCount,
                  total: recipientCount,
                  failures: failureCount > 0 ? t('messages.whatsappFailureSuffix', { count: failureCount }) : '',
                }),
              );

              setTitle('');
              setBody('');
              queryClient.invalidateQueries({ queryKey: queryKeys.notificationHistory });
            } catch (err: unknown) {
              Alert.alert(
                t('common.error'),
                getErrorMessage(err, t('common.genericError')),
              );
            } finally {
              setSending(false);
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
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  // ── Render notification card (delegates to memoized component) ──
  const renderNotification = useCallback(({ item }: { item: NotificationRecord }) => (
    <NotificationCard
      item={item}
      isExpanded={expandedId === item.id}
      onToggle={toggleExpanded}
      theme={theme}
      locale={locale}
      t={t}
    />
  ), [expandedId, toggleExpanded, theme, locale, t]);

  const keyExtractor = useCallback((item: NotificationRecord) => item.id, []);

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                  onPress={() => { animateAccordion(); const next = !showCompose; setShowCompose(next); if (next) { setShowWhatsApp(false); setShowEmail(false); setShowHistory(false); } }}
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

                <TouchableOpacity
                  onPress={() => { animateAccordion(); const next = !showWhatsApp; setShowWhatsApp(next); if (next) { setShowCompose(false); setShowEmail(false); setShowHistory(false); } }}
                  activeOpacity={0.8}
                  style={[
                    styles.composeToggle,
                    { flex: 1, backgroundColor: showWhatsApp ? CHANNEL_COLORS.WHATSAPP + '18' : theme.bgCard, borderColor: showWhatsApp ? CHANNEL_COLORS.WHATSAPP : theme.borderLight },
                  ]}
                >
                  <MessageCircle size={16} color={CHANNEL_COLORS.WHATSAPP} />
                  <Text style={[styles.composeToggleText, { color: showWhatsApp ? CHANNEL_COLORS.WHATSAPP : theme.text }]} numberOfLines={1}>
                    WhatsApp
                  </Text>
                  {showWhatsApp ? <ChevronUp size={14} color={CHANNEL_COLORS.WHATSAPP} /> : <ChevronDown size={14} color={theme.textMuted} />}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => { animateAccordion(); const next = !showEmail; setShowEmail(next); if (next) { setShowCompose(false); setShowWhatsApp(false); setShowHistory(false); } }}
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
                      onChangeText={setTitle}
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
                      onChangeText={setBody}
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
                    disabled={sending || !title.trim() || !body.trim()}
                    activeOpacity={0.85}
                  >
                    <Animated.View pointerEvents="none" style={[styles.sendRipple, sendRippleStyle]} />
                    {sending ? (
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

              {showWhatsApp && (
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
                      onChangeText={setWhatsappMessage}
                      placeholder={t('messages.whatsappPlaceholder')}
                      placeholderTextColor={theme.textMuted}
                      multiline
                      maxLength={500}
                    />
                  </View>
                  <Text style={[styles.charCount, { color: charCountColor(whatsappMessage.length, 500, theme.textMuted, theme.warning ?? '#F59E0B', theme.danger) }]}>
                    {whatsappMessage.length}/500
                  </Text>

                  {whatsappQuota && (
                    <Text style={[styles.charCount, {
                      color: whatsappQuota.used >= whatsappQuota.max ? theme.danger : theme.textMuted,
                      marginTop: 12,
                      marginBottom: 16,
                    }]}>
                      {t('messages.whatsappQuota', { used: whatsappQuota.used, max: whatsappQuota.max })}
                      {whatsappQuota.used >= whatsappQuota.max
                        ? t('messages.quotaReached')
                        : t('messages.quotaLeft', { remaining: whatsappQuota.max - whatsappQuota.used })}
                    </Text>
                  )}
                  {!whatsappQuota && <View style={{ marginBottom: 16 }} />}

                  {/* Send WhatsApp button */}
                  {whatsappLoading ? (
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
                      disabled={!whatsappMessage.trim()}
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
                      onChangeText={setEmailSubject}
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
                      onChangeText={setEmailBody}
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
                    disabled={emailSending || !emailSubject.trim() || !emailBody.trim()}
                    activeOpacity={0.85}
                  >
                    {emailSending ? (
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
                onPress={() => { animateAccordion(); const next = !showHistory; setShowHistory(next); if (next) { setShowCompose(false); setShowWhatsApp(false); setShowEmail(false); } }}
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
