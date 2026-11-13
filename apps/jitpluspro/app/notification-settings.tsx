import { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Switch } from 'react-native';
import { ArrowLeft, Sparkles, Lightbulb, BellRing, TrendingUp, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import NotificationsDisabledBanner from '@/components/NotificationsDisabledBanner';
import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
  type NotificationPrefKey,
} from '@/hooks/useQueryHooks';
import { logWarn } from '@/utils/devLogger';

const GROUPS: ReadonlyArray<{ key: NotificationPrefKey; icon: LucideIcon; color: string }> = [
  { key: 'news', icon: Sparkles, color: '#7C3AED' },
  { key: 'tips', icon: Lightbulb, color: '#0284C7' },
  { key: 'reminders', icon: BellRing, color: '#4F46E5' },
  { key: 'reports', icon: TrendingUp, color: '#059669' },
];

const HIT_SLOP_BACK = { top: 10, bottom: 10, left: 10, right: 10 };

/** Per-category push switches. Plan, quota, account and security alerts stay on. */
export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign, flip } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isTeamMember } = useAuth();
  const { data: prefs, isLoading, isError, refetch } = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();

  const toggle = useCallback((key: NotificationPrefKey, value: boolean) => {
    update.mutate({ [key]: value }, { onError: (e) => logWarn('NotifSettings', 'update failed', e) });
  }, [update]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 12, flexDirection: row }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={HIT_SLOP_BACK} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={22} color={theme.text} strokeWidth={icon.stroke} style={flip} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text, textAlign }]} numberOfLines={1} accessibilityRole="header">
          {t('notifSettings.title')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <NotificationsDisabledBanner style={styles.banner} />

        <Text style={[styles.intro, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>
          {t('notifSettings.intro')}
        </Text>

        {isLoading ? (
          <ActivityIndicator color={theme.primary} style={styles.loader} />
        ) : isError || !prefs ? (
          <TouchableOpacity onPress={() => refetch()} accessibilityRole="button" style={styles.loader}>
            <Text style={[styles.error, { color: theme.textMuted }]}>{t('notifSettings.loadError')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            {GROUPS.map(({ key, icon: Icon, color }, i) => (
              <View
                key={key}
                style={[
                  styles.row,
                  { flexDirection: row },
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: color + '17' }]}>
                  <Icon size={18} color={color} strokeWidth={2} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
                    {t(`notifSettings.${key}Title`)}
                  </Text>
                  <Text style={[styles.rowCaption, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>
                    {t(`notifSettings.${key}Caption`)}
                  </Text>
                </View>
                <Switch
                  value={prefs[key]}
                  onValueChange={(v) => toggle(key, v)}
                  disabled={isTeamMember}
                  trackColor={{ true: theme.primary, false: theme.border }}
                  accessibilityLabel={t(`notifSettings.${key}Title`)}
                />
              </View>
            ))}
          </View>
        )}

        <View style={[styles.alwaysOn, { flexDirection: row }]}>
          <ShieldCheck size={16} color={theme.textMuted} />
          <Text style={[styles.alwaysOnText, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>
            {t(isTeamMember ? 'notifSettings.ownerOnly' : 'notifSettings.alwaysOn')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: { alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { flex: 1, fontSize: 20, fontFamily: font.semibold, letterSpacing: -0.3 },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  banner: { marginBottom: 16 },
  intro: { fontSize: 13.5, lineHeight: 19, fontFamily: font.regular, marginBottom: 14, paddingHorizontal: 4 },
  loader: { marginTop: 32, alignItems: 'center' },
  error: { fontSize: 14, fontFamily: font.medium },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  rowIcon: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontFamily: font.semibold },
  rowCaption: { fontSize: 12.5, lineHeight: 17, fontFamily: font.regular, marginTop: 2 },
  alwaysOn: { gap: 8, alignItems: 'flex-start', marginTop: 16, paddingHorizontal: 4 },
  alwaysOnText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontFamily: font.regular },
});
