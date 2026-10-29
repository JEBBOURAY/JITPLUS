import { memo } from 'react';
import { View, Text, StyleSheet, Image as RNImage } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import MerchantLogo from '@/components/MerchantLogo';
import { font, shadow } from '@/constants/design';
import { radius } from '@/utils/responsive';

const JITPLUS_APP_ICON = require('@/assets/images/jitpluslogo.png');

/** Lock-screen style mock of the push notification being composed. */
export const PushPreview = memo(function PushPreview({
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
          <Text style={[styles.notifAppName, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>JitPlus</Text>
          <Text style={[styles.notifTime, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>{t('messages.previewNow')}</Text>
        </View>
        <View style={styles.notifContent}>
          <View style={styles.notifTextCol}>
            <Text
              style={[styles.notifTitle, { color: shownTitle ? theme.text : theme.textMuted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {shownTitle || t('messages.previewTitlePlaceholder')}
            </Text>
            <Text
              style={[styles.notifBody, { color: shownBody ? theme.text : theme.textMuted }]}
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

/** Inbox style mock of the email being composed. */
export const EmailPreview = memo(function EmailPreview({
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

const styles = StyleSheet.create({
  flex1: { flex: 1 },

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
});
