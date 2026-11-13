import { memo } from 'react';
import { View, Text, StyleSheet, Image as RNImage } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import MerchantLogo from '@/components/MerchantLogo';
import { font, shadow } from '@/constants/design';
import { radius } from '@/utils/responsive';

const JITPLUS_APP_ICON = require('@/assets/images/jitpluslogo.png');

/** Mock of the push notification being composed, as it lands on a phone. */
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
              numberOfLines={2}
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

const styles = StyleSheet.create({
  previewStage: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 10,
    overflow: 'hidden',
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
});
