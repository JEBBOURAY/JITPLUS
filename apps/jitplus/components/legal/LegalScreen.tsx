// Layout shared by the legal screens: header with a back button, scrolling
// content, and the text blocks (section card, body, bullet).
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View, type StyleProp, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms, wp } from '@/utils/responsive';

interface LegalScreenProps {
  title: string;
  children: ReactNode;
  /** Space between blocks (the licences list is tighter). */
  gap?: number;
  /** Long translated texts follow the reading direction of the language. */
  directional?: boolean;
}

export function LegalScreen({ title, children, gap = 12, directional = false }: LegalScreenProps) {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Opened from a link there may be nothing to go back to.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={goBack}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={ms(22)} color={theme.text} strokeWidth={2} style={isRTL ? styles.flipped : undefined} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{title}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { gap }, directional && { direction: isRTL ? 'rtl' : 'ltr' }]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** Tinted box at the top of a page ("Dernière mise à jour…"). */
export function LegalNotice({ children, centered = true }: { children: ReactNode; centered?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: `${theme.primary}10` }]}>
      <Text style={[styles.body, { color: theme.textMuted }, centered && styles.centered]}>{children}</Text>
    </View>
  );
}

interface LegalSectionProps {
  title: string;
  body?: string;
  bullets?: string[];
  /** Extra content after the body and bullets (texts with links). */
  children?: ReactNode;
  /** Last block of the page: leaves room above the bottom edge. */
  last?: boolean;
}

export function LegalSection({ title, body, bullets, children, last }: LegalSectionProps) {
  const theme = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: theme.bgCard }, last && styles.last]}>
      <Text style={[styles.sectionTitle, { color: theme.primary }]}>{title}</Text>
      {body ? <LegalBody>{body}</LegalBody> : null}
      {bullets?.map((bullet) => <LegalBullet key={bullet}>{bullet}</LegalBullet>)}
      {children}
    </View>
  );
}

export function LegalBody({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return <Text style={[styles.body, { color: theme.textSecondary }, style]}>{children}</Text>;
}

export function LegalBullet({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.bullet, { color: theme.textSecondary }]}>{children}</Text>;
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
  flipped: { transform: [{ scaleX: -1 }] },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: ms(16), fontWeight: '600' },
  content: { padding: 16 },
  section: { borderRadius: 14, padding: 16, gap: 6 },
  last: { marginBottom: 32 },
  sectionTitle: { fontSize: ms(14), fontWeight: '600', marginBottom: 6 },
  body: { fontSize: ms(13), lineHeight: ms(21) },
  bullet: { fontSize: ms(13), lineHeight: ms(20), paddingLeft: wp(4) },
  centered: { textAlign: 'center' },
});
