import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ActivityIndicator, View } from 'react-native';
import CustomTabBar from '@/components/CustomTabBar';

export default function TabLayout() {
  const { merchant, loading, onboardingCompleted, isTeamMember } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  // Single redirect chain — priority: auth → email verification → onboarding
  useEffect(() => {
    if (loading) return;
    if (!merchant) {
      router.replace('/welcome');
      return;
    }
    if (!merchant.emailVerified && !merchant.googleId) {
      router.replace({
        pathname: '/verify-email',
        params: { email: merchant.email },
      });
      return;
    }
    if (!onboardingCompleted && !isTeamMember) {
      router.replace('/onboarding');
    }
  }, [loading, merchant, onboardingCompleted, isTeamMember]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!merchant) return null;

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        lazy: true,
        freezeOnBlur: true,
      }}
    >
      {/* ── 5 visible tabs: Activité · Clients · Scan · Messages · Compte ── */}
      <Tabs.Screen name="activity" options={{ title: 'Activité' }} />
      <Tabs.Screen name="index" options={{ title: 'Clients' }} />
      <Tabs.Screen
        name="scan"
        options={{ title: 'Scan' }}
        listeners={() => ({
          tabPress: (e) => {
            e.preventDefault();
            router.push('/scan-qr');
          },
        })}
      />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="account" options={{ title: 'Compte' }} />

    </Tabs>
  );
}
