import { Tabs, Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import CustomTabBar from '@/components/CustomTabBar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

// Module-level stable ref so TabLayout re-renders don't recreate the prop
// (which would force the entire bottom navigator to remount).
const renderTabBar = (props: any) => <CustomTabBar {...props} />;

export default function TabLayout() {
  const theme = useTheme();
  const { t } = useLanguage();
  // Direct Zustand selectors instead of useAuth() to avoid re-rendering the
  // entire tab navigator when unrelated auth fields change.
  const client = useAuthStore((s) => s.client);
  const isLoading = useAuthStore((s) => s.loading);
  const isGuest = useAuthStore((s) => s.isGuest);
  const needsPasswordSetup = useAuthStore((s) => s.needsPasswordSetup);
  const isAuthenticated = !!client;
  const isProfileComplete = !!client?.nom && !!client?.prenom && client?.termsAccepted !== false;

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  // Guests can browse — they'll see GuestGuard on auth-required tabs
  if (!isAuthenticated && !isGuest) {
    return <Redirect href="/welcome" />;
  }

  // Redirect to complete-profile if profile is incomplete (interrupted registration)
  if (isAuthenticated && !isProfileComplete) {
    // Only email-OTP new registrations need a password — tracked reliably via SecureStore
    return <Redirect href={{ pathname: '/complete-profile', params: { needsPassword: needsPasswordSetup ? '1' : '0' } }} />;
  }

  return (
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.cards') }}
      />
      <Tabs.Screen
        name="discover"
        options={{ title: t('tabs.discover') }}
      />
      <Tabs.Screen
        name="qr"
        options={{ title: t('tabs.qr') }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: t('tabs.notifications') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile') }}
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
