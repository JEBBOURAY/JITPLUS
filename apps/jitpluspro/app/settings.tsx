import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useRewards } from '@/hooks/useQueryHooks';
import { HubCard } from '@/components/ui/HubCard';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
import { OwnerOnlyNotice } from '@/components/stores/StoreUi';

// Same illustration family as the "Mes outils" cards of Accueil.
const PAGE_IMAGE = {
  program: require('@/assets/images/tools/fidelite.png'),
  gifts: require('@/assets/images/tools/cadeaux.png'),
} as const;

/**
 * Loyalty card hub, laid out like the Jeux hub: one card per sub-page
 * (the programme rules and the gifts), each opening its own screen.
 */
export default function LoyaltyHubScreen() {
  const shouldWait = useRequireAuth();
  const { merchant, isTeamMember } = useAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: rewards } = useRewards(!!merchant && !isTeamMember);

  if (shouldWait) return null;

  if (isTeamMember) return <OwnerOnlyNotice />;

  if (!merchant) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const giftsTitle = rewards && rewards.length > 0
    ? t('settingsPage.giftsCount', { count: rewards.length })
    : t('settingsPage.giftsSection');
  const pages = [
    { key: 'program', route: '/loyalty-program', title: t('settingsPage.hubProgramTitle'), description: t('settingsPage.hubProgramDesc') },
    { key: 'gifts', route: '/rewards', title: giftsTitle, description: t('settingsPage.hubGiftsDesc') },
  ] as const;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={t('settingsPage.loyaltyMode')} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        {pages.map((page) => (
          <HubCard
            key={page.key}
            image={PAGE_IMAGE[page.key]}
            title={page.title}
            description={page.description}
            onPress={() => router.push(page.route)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
});
