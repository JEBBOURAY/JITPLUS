import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Shield, FileText, Gift, Code2, ChevronRight } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ms } from '@/utils/responsive';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function LegalHub() {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={ms(22)} color={theme.text} strokeWidth={2} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('legal.hubTitle')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>{t('legal.hubSubtitle')}</Text>

        <Pressable
          onPress={() => router.push('/legal/privacy')}
          android_ripple={{ color: `${palette.gold}10` }}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: theme.bgCard, borderColor: theme.border },
            pressed && Platform.OS === 'ios' && { opacity: 0.7 },
          ]}
        >
          <View style={[styles.iconBox, { backgroundColor: `${palette.gold}15` }]}>
            <Shield size={ms(22)} color={palette.gold} strokeWidth={1.5} />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('legal.privacyCard')}</Text>
            <Text style={[styles.cardDesc, { color: theme.textMuted }]}>{t('legal.privacyCardDesc')}</Text>
          </View>
          <ChevronRight size={ms(18)} color={theme.textMuted} strokeWidth={1.5} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/legal/terms')}
          android_ripple={{ color: `${palette.gold}10` }}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: theme.bgCard, borderColor: theme.border },
            pressed && Platform.OS === 'ios' && { opacity: 0.7 },
          ]}
        >
          <View style={[styles.iconBox, { backgroundColor: `${palette.gold}15` }]}>
            <FileText size={ms(22)} color={palette.gold} strokeWidth={1.5} />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('legal.termsCard')}</Text>
            <Text style={[styles.cardDesc, { color: theme.textMuted }]}>{t('legal.termsCardDesc')}</Text>
          </View>
          <ChevronRight size={ms(18)} color={theme.textMuted} strokeWidth={1.5} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/legal/referral-terms')}
          android_ripple={{ color: `${palette.gold}10` }}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: theme.bgCard, borderColor: theme.border },
            pressed && Platform.OS === 'ios' && { opacity: 0.7 },
          ]}
        >
          <View style={[styles.iconBox, { backgroundColor: `${palette.gold}15` }]}>
            <Gift size={ms(22)} color={palette.gold} strokeWidth={1.5} />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('legal.referralCard')}</Text>
            <Text style={[styles.cardDesc, { color: theme.textMuted }]}>{t('legal.referralCardDesc')}</Text>
          </View>
          <ChevronRight size={ms(18)} color={theme.textMuted} strokeWidth={1.5} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/legal/licenses')}
          android_ripple={{ color: `${palette.gold}10` }}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: theme.bgCard, borderColor: theme.border },
            pressed && Platform.OS === 'ios' && { opacity: 0.7 },
          ]}
        >
          <View style={[styles.iconBox, { backgroundColor: `${palette.gold}15` }]}>
            <Code2 size={ms(22)} color={palette.gold} strokeWidth={1.5} />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('legal.licensesCard')}</Text>
            <Text style={[styles.cardDesc, { color: theme.textMuted }]}>{t('legal.licensesCardDesc')}</Text>
          </View>
          <ChevronRight size={ms(18)} color={theme.textMuted} strokeWidth={1.5} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </Pressable>

        <Text style={[styles.footer, { color: theme.textMuted }]}>{t('legal.lastUpdate')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: ms(40), alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: ms(16), fontWeight: '700' },
  content: { padding: 16, gap: 12 },
  subtitle: { fontSize: ms(13), textAlign: 'center', marginBottom: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  iconBox: {
    width: ms(44),
    height: ms(44),
    borderRadius: ms(22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: ms(15), fontWeight: '600', marginBottom: 2 },
  cardDesc: { fontSize: ms(12) },
  footer: { fontSize: ms(12), textAlign: 'center', marginTop: 16 },
});
