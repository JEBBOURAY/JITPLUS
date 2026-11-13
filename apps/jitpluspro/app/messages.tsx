import { useCallback, useRef, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
} from 'react-native';
import { safeSelection } from '@/utils/haptics';
import { ChevronRight, Image as ImageIcon, type LucideIcon } from 'lucide-react-native';
import { JitCalendar, JitClients, JitClock, JitDeals, JitLock, JitMegaphone } from '@/components/icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthState } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useNotificationSend } from '@/hooks/useNotificationSend';
import { ReminderBanner } from '@/components/ReminderBanner';
import { DemoVideoButton } from '@/components/demo/DemoVideoButton';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
import ComposeFields, { MESSAGE_LIMITS as LIMITS, type ComposeFieldsHandle, type MessageField } from '@/components/marketing/ComposeFields';
import SendConfirmSheet from '@/components/marketing/SendConfirmSheet';
import SendButton from '@/components/marketing/SendButton';
import { PushPreview } from '@/components/marketing/MessagePreview';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import { font, icon } from '@/constants/design';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type TemplateKey = 'Promo' | 'New' | 'Event' | 'Comeback';
// JitPlus icons only.
const TEMPLATES: { key: TemplateKey; Icon: LucideIcon }[] = [
  { key: 'Promo', Icon: JitDeals },
  { key: 'New', Icon: JitMegaphone },
  { key: 'Event', Icon: JitCalendar },
  { key: 'Comeback', Icon: JitClients },
];

const animateLayout = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(250, 'easeInEaseOut', 'opacity'));

/** Ready-made texts: four tinted tiles, all in view, that fill the fields in one tap. */
const TemplateTiles = memo(function TemplateTiles({ onPick }: { onPick: (key: TemplateKey) => void }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  return (
    <View style={styles.templates}>
      <Text style={[styles.templatesTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
        {t('messages.templatesTitle')}
      </Text>
      <View style={[styles.tiles, { flexDirection: row }]}>
        {TEMPLATES.map(({ key, Icon }) => {
          const label = t(`messages.template${key}`);
          return (
            <TouchableOpacity
              key={key}
              onPress={() => onPick(key)}
              activeOpacity={0.75}
              style={[styles.tile, { backgroundColor: `${theme.primary}14`, borderColor: `${theme.primary}40` }]}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Icon size={20} color={theme.primary} strokeWidth={icon.stroke} />
              <Text
                style={[styles.tileLabel, { color: theme.text }]}
                maxFontSizeMultiplier={1.2}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

export default function MessagesScreen() {
  const { merchant, isTeamMember } = useAuthState();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const dir = useDir();
  const router = useRouter();
  const merchantName = merchant?.nom?.trim() || 'JitPlus';
  const logoUrl = merchant?.logoUrl;
  const reduceMotion = useReduceMotion() === true;
  const fieldsRef = useRef<ComposeFieldsHandle>(null);

  // Backend requires the owner role, so team members never fetch.
  const send = useNotificationSend(merchant?.id, !isTeamMember);
  const { title, body, edit, clear, review, closeRecap } = send;

  const goToHistory = useCallback(() => { safeSelection(); router.push('/messages-history'); }, [router]);
  const goToProfile = useCallback(() => router.push('/account'), [router]);
  const viewHistoryFromRecap = useCallback(() => {
    closeRecap();
    goToHistory();
  }, [closeRecap, goToHistory]);

  const setField = useCallback((name: MessageField, value: string) => edit({ [name]: value }), [edit]);
  const clearForm = useCallback(() => {
    safeSelection();
    clear();
  }, [clear]);

  // Fills the fields in one tap. Asks before overwriting typed text.
  const applyTemplate = useCallback((key: TemplateKey) => {
    const apply = () => {
      if (!reduceMotion) animateLayout();
      safeSelection();
      edit({
        title: t(`messages.tpl${key}Title`, { name: merchantName }).slice(0, LIMITS.title),
        body: t(`messages.tpl${key}Body`, { name: merchantName }).slice(0, LIMITS.body),
      });
    };
    if (!send.hasContent) {
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
  }, [t, merchantName, send.hasContent, edit, reduceMotion]);

  // An incomplete message points at the field left to fill instead of going to the recap.
  const handleSendPress = useCallback(() => {
    if (send.isComplete) {
      void review();
      return;
    }
    safeSelection();
    fieldsRef.current?.focusMissing();
  }, [send.isComplete, review]);

  if (isTeamMember) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={t('messages.title')} />
        <View style={styles.ownerOnly} accessible accessibilityRole="alert">
          <JitLock size={48} color={theme.textMuted} strokeWidth={icon.stroke} />
          <Text style={[styles.ownerTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6}>
            {t('messages.ownerOnly')}
          </Text>
          <Text style={[styles.ownerMsg, { color: theme.textMuted }]} maxFontSizeMultiplier={1.6}>
            {t('messages.ownerOnlyMsg')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader title={t('messages.title')} right={<DemoVideoButton id="messages" variant="header" />} />
          {/* The live preview is the centrepiece, right under the title. */}
          <View style={styles.previewWrap}>
            <PushPreview title={title} body={body} logoUrl={logoUrl} />
          </View>

          <View style={styles.content}>
            <TemplateTiles onPick={applyTemplate} />

            <ComposeFields ref={fieldsRef} title={title} body={body} onChangeField={setField} />
            {send.formError ? (
              <Text
                style={[styles.formError, { color: theme.danger, textAlign: dir.textAlign }]}
                maxFontSizeMultiplier={1.4}
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
              >
                {send.formError}
              </Text>
            ) : null}

            {/* Next to what they act on: the quota above the send button, "Clear" under the fields. */}
            <View style={[styles.sendInfo, { flexDirection: dir.row }]}>
              <Text
                style={[styles.hint, { color: send.blockedMessage ? theme.danger : theme.textSecondary, textAlign: dir.textAlign }]}
                maxFontSizeMultiplier={1.4}
                accessibilityRole={send.blockedMessage ? 'alert' : undefined}
              >
                {send.blockedMessage
                  ?? (send.status
                    ? t('messages.quotaLeft', { remaining: send.status.remaining, limit: send.status.dailyLimit })
                    : t('messages.channelPushHint'))}
              </Text>
              {send.hasContent && (
                <TouchableOpacity onPress={clearForm} hitSlop={HIT_SLOP} accessibilityRole="button">
                  <Text style={[styles.clearText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                    {t('messages.clearForm')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <SendButton
              cooldownUntil={send.cooldownUntil}
              ready={send.isComplete}
              loading={send.isChecking}
              disabled={send.blockedMessage != null}
              onPress={handleSendPress}
            />

            <TouchableOpacity
              onPress={goToHistory}
              activeOpacity={0.7}
              style={[styles.historyRow, { flexDirection: dir.row, backgroundColor: theme.bgCard, borderColor: theme.border }]}
              accessibilityRole="button"
              accessibilityLabel={t('messages.history')}
            >
              <JitClock size={22} color={theme.text} strokeWidth={icon.stroke} />
              <Text style={[styles.historyText, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
                {t('messages.history')}
              </Text>
              <ChevronRight size={18} color={theme.textMuted} strokeWidth={icon.stroke} style={dir.flip} />
            </TouchableOpacity>

            <ReminderBanner
              visible={!logoUrl}
              Icon={ImageIcon}
              title={t('reminders.logoTitle')}
              message={t('reminders.logoMessage')}
              actionLabel={t('reminders.logoAction')}
              onPress={goToProfile}
              storageKey={ASYNC_STORAGE_KEYS.MESSAGES_LOGO_BANNER_DISMISSED}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <SendConfirmSheet
        visible={send.recap.visible}
        title={title.trim()}
        body={body.trim()}
        audience={send.audience}
        isSending={send.isSending}
        error={send.recap.error ?? send.blockedMessage}
        blocked={send.blockedMessage != null}
        successMessage={send.recap.successMessage}
        onConfirm={send.confirm}
        onClose={closeRecap}
        onViewHistory={viewHistoryFromRecap}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12 },

  previewWrap: { paddingHorizontal: 16 },

  templates: { gap: 8 },
  templatesTitle: { fontSize: 15, fontFamily: font.semibold, letterSpacing: -0.2, paddingHorizontal: 4 },
  tiles: { gap: 8 },
  tile: { flex: 1, alignItems: 'center', gap: 4, minHeight: 56, justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1, borderRadius: 14 },
  tileLabel: { fontSize: 12, fontFamily: font.semibold },

  sendInfo: { alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  hint: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: font.medium },
  clearText: { fontSize: 13, fontFamily: font.semibold },

  // Same bordered card as the "Mes outils" cards of Accueil.
  historyRow: { alignItems: 'center', gap: 14, marginTop: 12, minHeight: 48, paddingHorizontal: 16, borderWidth: 1, borderRadius: 18 },
  historyText: { flex: 1, fontSize: 15, fontFamily: font.semibold, letterSpacing: -0.2 },

  formError: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4, fontFamily: font.medium },

  ownerOnly: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  ownerTitle: { fontSize: 18, fontFamily: font.semibold, marginTop: 16, textAlign: 'center' },
  ownerMsg: { fontSize: 14, fontFamily: font.regular, marginTop: 8, textAlign: 'center', lineHeight: 20 },
});
