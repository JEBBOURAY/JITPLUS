import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter, type Href } from 'expo-router';
import { Shield, FileText, Code2, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { LegalScreen } from '@/components/legal/LegalScreen';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function LegalHub() {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const router = useRouter();

  const pages: { href: Href; Icon: LucideIcon; title: string; desc: string }[] = [
    { href: '/legal/privacy', Icon: Shield, title: t('legal.privacyCard'), desc: t('legal.privacyCardDesc') },
    { href: '/legal/terms', Icon: FileText, title: t('legal.termsCard'), desc: t('legal.termsCardDesc') },
    { href: '/legal/licenses', Icon: Code2, title: t('legal.licensesCard'), desc: t('legal.licensesCardDesc') },
  ];

  return (
    <LegalScreen title={t('legal.hubTitle')}>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>{t('legal.hubSubtitle')}</Text>

      {pages.map(({ href, Icon, title, desc }) => (
        <Pressable
          key={title}
          onPress={() => router.push(href)}
          android_ripple={{ color: `${palette.gold}10` }}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: theme.bgCard, borderColor: theme.border },
            pressed && Platform.OS === 'ios' && { opacity: 0.7 },
          ]}
        >
          <View style={[styles.iconBox, { backgroundColor: `${palette.gold}15` }]}>
            <Icon size={ms(22)} color={palette.gold} strokeWidth={1.5} />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
            <Text style={[styles.cardDesc, { color: theme.textMuted }]}>{desc}</Text>
          </View>
          <ChevronRight size={ms(18)} color={theme.textMuted} strokeWidth={1.5} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </Pressable>
      ))}

      <Text style={[styles.footer, { color: theme.textMuted }]}>{t('legal.lastUpdate')}</Text>
    </LegalScreen>
  );
}

const styles = StyleSheet.create({
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
