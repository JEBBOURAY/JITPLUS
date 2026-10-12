import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { ArrowLeft, ChevronRight, FerrisWheel, Gamepad2, Ticket } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { ms } from '@/utils/responsive';

export default function GamesScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rowDirection = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';
  const arrowStyle = isRTL ? { transform: [{ scaleX: -1 }] } : undefined;

  if (shouldWait) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, flexDirection: rowDirection }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={22} color={theme.text} style={arrowStyle} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text, textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
          {t('games.title')}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={[styles.intro, { backgroundColor: theme.primaryBg }]}>
          <Gamepad2 size={ms(32)} color={theme.primary} strokeWidth={1.8} />
          <Text style={[styles.introText, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
            {t('games.intro')}
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text, textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
          {t('games.chooseGame')}
        </Text>

        <TouchableOpacity
          onPress={() => router.push('/lucky-wheel')}
          style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border, flexDirection: rowDirection }]}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${t('games.wheelTitle')}, ${t('games.premium')}`}
        >
          <View style={[styles.icon, { backgroundColor: theme.primaryBg }]}>
            <FerrisWheel size={ms(26)} color={theme.primary} strokeWidth={1.8} />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.4}>
              {t('games.wheelTitle')}
            </Text>
            <Text style={[styles.cardDescription, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
              {t('games.wheelDescription')}
            </Text>
            <View style={[styles.badge, { backgroundColor: theme.primaryBg, alignSelf: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text style={[styles.badgeText, { color: theme.primary }]} maxFontSizeMultiplier={1.4}>
                {t('games.premium')}
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color={theme.primary} style={arrowStyle} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/scratch-campaigns')}
          style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border, flexDirection: rowDirection }]}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${t('games.scratchTitle')}, ${t('games.premium')}`}
        >
          <View style={[styles.icon, { backgroundColor: theme.primaryBg }]}>
            <Ticket size={ms(26)} color={theme.primary} strokeWidth={1.8} />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.4}>
              {t('games.scratchTitle')}
            </Text>
            <Text style={[styles.cardDescription, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
              {t('games.scratchDescription')}
            </Text>
            <View style={[styles.badge, { backgroundColor: theme.primaryBg, alignSelf: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text style={[styles.badgeText, { color: theme.primary }]} maxFontSizeMultiplier={1.4}>
                {t('games.premium')}
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color={theme.primary} style={arrowStyle} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 28,
    fontFamily: 'Lexend_700Bold',
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  intro: { borderRadius: 20, padding: 20, gap: 12 },
  introText: { fontSize: ms(14), lineHeight: ms(22), fontFamily: 'Lexend_400Regular' },
  sectionTitle: { fontSize: ms(16), fontFamily: 'Lexend_600SemiBold', marginTop: 10 },
  card: {
    alignItems: 'center',
    padding: 16,
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  icon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1, gap: 6 },
  cardTitle: { fontSize: ms(16), fontFamily: 'Lexend_600SemiBold' },
  cardDescription: { fontSize: ms(13), lineHeight: ms(20), fontFamily: 'Lexend_400Regular' },
  badge: { alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginTop: 4 },
  badgeText: { fontSize: ms(11), fontFamily: 'Lexend_600SemiBold' },
});
