import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { font } from '@/constants/design';
import { HubCard } from '@/components/ui/HubCard';
import { ScreenHeader } from '@/components/scratch/ScratchUI';

// Same illustration family as the "Mes outils" cards of Accueil.
const POSTERS = [
  { key: 'Store', route: '/client-app-qr', image: require('@/assets/images/tools/affiche_plv.png') },
  { key: 'Social', route: '/social-post', image: require('@/assets/images/tools/notifications.png') },
] as const;

/**
 * Affiche hub, laid out like the Carte de fidélité and Jeux hubs: one card per
 * kind of poster (printed for the store, posted on social media), each opening
 * its own screen.
 */
export default function PostersScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (shouldWait) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={t('home.clientQrHeader')} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <Text style={[styles.sectionTitle, { color: theme.text, textAlign: dir.textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
          {t('home.clientPosterChoose')}
        </Text>

        {POSTERS.map((poster) => (
          <HubCard
            key={poster.key}
            image={poster.image}
            title={t(`home.clientPoster${poster.key}`)}
            description={t(`home.clientPoster${poster.key}Desc`)}
            onPress={() => router.push(poster.route)}
          />
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
});
