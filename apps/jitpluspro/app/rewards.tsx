import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { DemoVideoButton } from '@/components/demo/DemoVideoButton';
import { RewardManager } from '@/components/settings/RewardManager';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
import { OwnerOnlyNotice } from '@/components/stores/StoreUi';
import { DEFAULT_STAMPS_FOR_REWARD } from '@/utils/stamps';

/** Every gift of the programme: add, edit (photo, description) and delete. Each one saves on its own. */
export default function RewardsScreen() {
  const shouldWait = useRequireAuth();
  const { merchant, isTeamMember } = useAuth();
  const { isPremium } = usePlanStatus(merchant);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  if (shouldWait) return null;

  if (isTeamMember) return <OwnerOnlyNotice />;

  if (!merchant) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader
        title={t('settingsPage.giftsSection')}
        right={<DemoVideoButton id="cadeaux" variant="header" />}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <RewardManager
          theme={theme}
          t={t}
          isPremium={isPremium}
          hasAccumulationLimit={merchant.accumulationLimit != null}
          accumulationLimit={merchant.accumulationLimit?.toString() ?? ''}
          stampsForReward={merchant.stampsForReward || DEFAULT_STAMPS_FOR_REWARD}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingTop: 4, paddingHorizontal: 16 },
});
