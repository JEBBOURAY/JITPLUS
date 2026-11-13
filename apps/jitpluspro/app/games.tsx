import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { font } from '@/constants/design';
import { HubCard } from '@/components/ui/HubCard';
import { ProBadge } from '@/components/ui/ProBadge';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
import { useAuthStore } from '@/stores/authStore';
import { getPlanStatus } from '@/utils/plan';

// Same illustration family as the "Mes outils" cards of Accueil.
const GAMES = [
  { key: 'wheel', route: '/lucky-wheel', image: require('@/assets/images/tools/jeux.png') },
  { key: 'scratch', route: '/scratch-campaigns', image: require('@/assets/images/tools/carte_a_gratter.png') },
] as const;

export default function GamesScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const router = useRouter();
  const hidePlan = useAuthStore((s) => getPlanStatus(s.merchant).hidePlan);
  const insets = useSafeAreaInsets();

  if (shouldWait) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={t('games.title')} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <Text style={[styles.sectionTitle, { color: theme.text, textAlign: dir.textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
          {t('games.chooseGame')}
        </Text>

        {GAMES.map((game) => (
          <HubCard
            key={game.key}
            image={game.image}
            title={t(`games.${game.key}Title`)}
            description={t(`games.${game.key}Description`)}
            onPress={() => router.push(game.route)}
            accessibilitySuffix={hidePlan ? undefined : t('common.pro')}
          >
            <ProBadge variant="primary" style={[styles.badge, { alignSelf: dir.alignStart }]} />
          </HubCard>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  // Same section title as "Mes outils" on Accueil.
  sectionTitle: { fontSize: 18, fontFamily: font.semibold, letterSpacing: -0.3 },
  badge: { marginTop: 4 },
});
