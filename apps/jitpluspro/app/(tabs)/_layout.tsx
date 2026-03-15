import React, { useEffect, useRef } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ActivityIndicator, View } from 'react-native';
import CustomTabBar from '@/components/CustomTabBar';

export default function TabLayout() {
  const { merchant, loading, onboardingCompleted, isTeamMember } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const hasOpenedScanner = useRef(false);

  // Redirect to welcome if not authenticated
  useEffect(() => {
    if (!loading && !merchant) {
      router.replace('/welcome');
    }
  }, [merchant, loading]);

  // Redirect to onboarding if not yet completed (only for merchant owners)
  useEffect(() => {
    if (!loading && merchant && !onboardingCompleted && !isTeamMember) {
      router.replace('/onboarding');
    }
  }, [loading, merchant, onboardingCompleted, isTeamMember]);

  // Open scanner automatically on first load after login (only when onboarding done)
  useEffect(() => {
    if (!loading && merchant && onboardingCompleted && !hasOpenedScanner.current) {
      hasOpenedScanner.current = true;
      // Small delay to let tabs mount before navigating
      const timer = setTimeout(() => router.push('/scan-qr'), 100);
      return () => clearTimeout(timer);
    }
  }, [loading, merchant, onboardingCompleted]);

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
