import { Tabs, Redirect } from 'expo-router';
import { useAuthStore, isProfileComplete } from '@/stores/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import CustomTabBar from '@/components/CustomTabBar';
import StarLoader from '@/components/StarLoader';
import { View, StyleSheet } from 'react-native';

// Module-level stable ref so TabLayout re-renders don't recreate the prop
// (which would force the entire bottom navigator to remount).
const renderTabBar = (props: React.ComponentProps<typeof CustomTabBar>) => <CustomTabBar {...props} />;

export default function TabLayout() {
  const theme = useTheme();
  const { t } = useLanguage();
  // Direct Zustand selectors instead of useAuth() to avoid re-rendering the
  // entire tab navigator when unrelated auth fields change.
  const client = useAuthStore((s) => s.client);
  const isLoading = useAuthStore((s) => s.loading);
  const needsPasswordSetup = useAuthStore((s) => s.needsPasswordSetup);
  const isAuthenticated = !!client;
  const profileComplete = isProfileComplete(client);

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.bg }]}>
        <StarLoader />
      </View>
    );
  }

  // Signed out: the root layout sends them to the login screen (a second
  // redirect here stacked a second login screen).
  if (!isAuthenticated) return null;

  // Redirect to complete-profile if profile is incomplete (interrupted registration)
  if (isAuthenticated && !profileComplete) {
    // Only email-OTP new registrations need a password — tracked reliably via SecureStore
    return <Redirect href={{ pathname: '/complete-profile', params: { needsPassword: needsPasswordSetup ? '1' : '0' } }} />;
  }

  return (
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
        lazy: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.cards') }}
      />
      <Tabs.Screen
        name="deals"
        options={{ title: t('tabs.deals') }}
      />
      <Tabs.Screen
        name="qr"
        options={{ title: t('tabs.qr') }}
      />
      <Tabs.Screen
        name="discover"
        // Once opened the map tab stays mounted: freeze its React tree while
        // another tab is shown, so list refetches don't re-render the map
        // and its markers in the background.
        options={{ title: t('tabs.discover'), freezeOnBlur: true }}
      />
      <Tabs.Screen
        name="rdv"
        options={{ title: t('tabs.rdv') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
