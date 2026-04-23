import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import CustomTabBar from '@/components/CustomTabBar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export default function TabLayout() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { client, isLoading, isAuthenticated, isProfileComplete, needsPasswordSetup, isGuest } = useAuth();

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
      tabBar={(props) => <CustomTabBar {...(props as any)} />}
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
