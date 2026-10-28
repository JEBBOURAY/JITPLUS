import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { JitGames, JitTicket } from '@/components/icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { ProBadge } from '@/components/ui/ProBadge';
import { ScreenHeader } from '@/components/scratch/ScratchUI';

const GAMES = [
  { key: 'wheel', route: '/lucky-wheel', Icon: JitGames },
  { key: 'scratch', route: '/scratch-campaigns', Icon: JitTicket },
] as const;

export default function GamesScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (shouldWait) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={t('games.title')} onBack={() => router.back()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <Text style={[styles.sectionTitle, { color: theme.text, textAlign: dir.textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
          {t('games.chooseGame')}
        </Text>

        {GAMES.map((game) => {
          const title = t(`games.${game.key}Title`);
          return (
            <TouchableOpacity
              key={game.key}
              onPress={() => router.push(game.route)}
              style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border, flexDirection: dir.row }]}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${t('games.premium')}`}
            >
              <View style={[styles.icon, { backgroundColor: theme.primaryBg }]}>
                <game.Icon size={ms(26)} color={theme.primary} strokeWidth={icon.stroke} />
              </View>
              <View style={styles.cardContent}>
                <Text style={[styles.cardTitle, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
                  {title}
                </Text>
                <Text style={[styles.cardDescription, { color: theme.textSecondary, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
                  {t(`games.${game.key}Description`)}
                </Text>
                <ProBadge variant="primary" style={[styles.badge, { alignSelf: dir.alignStart }]} />
              </View>
              <ChevronRight size={20} color={theme.primary} strokeWidth={icon.stroke} style={dir.flip} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  sectionTitle: { fontSize: ms(16), fontFamily: font.semibold },
  card: {
    alignItems: 'center',
    padding: 16,
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  icon: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1, gap: 6 },
  cardTitle: { fontSize: ms(16), fontFamily: font.semibold },
  cardDescription: { fontSize: ms(13), lineHeight: ms(20), fontFamily: font.regular },
  badge: { marginTop: 4 },
});
