import React, { useEffect, useRef } from 'react';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ActivityIndicator, View } from 'react-native';
import CustomTabBar from '@/components/CustomTabBar';
import { GuidedTourProvider } from '@/components/GuidedTour';
import { canScan } from '@/hooks/useScanGuard';

const renderTabBar = (props: any) => <CustomTabBar {...props} />;

export default function TabLayout() {
  const { merchant, loading } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const didEnforceHomeRef = useRef(false);

  const isAuthenticated = !!merchant;

  // Auth is the ONLY blocking gate. Email verification and business setup are
  // handled non-blockingly via the Accueil checklist — never a forced tunnel.
  // The app lands directly on the "Accueil" tab after login/registration.
  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [loading, isAuthenticated, router]);

  // Ensure cold start lands on Accueil (not Clients/index) when opening tabs root.
  // Do not override explicit deep links like /(tabs)/messages or /(tabs)/scan.
  useEffect(() => {
    if (loading || !isAuthenticated || didEnforceHomeRef.current) return;

    const inTabsGroup = segments[0] === '(tabs)';
    const activeTab = segments.at(1);
    const shouldRedirectToHome = inTabsGroup && (!activeTab || activeTab === 'index');

    if (shouldRedirectToHome) {
      didEnforceHomeRef.current = true;
      router.replace('/(tabs)/activity');
    }
  }, [loading, isAuthenticated, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!merchant) return null;

  return (
    <GuidedTourProvider>
      <Tabs
        initialRouteName="activity"
        tabBar={renderTabBar}
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          lazy: true,
          freezeOnBlur: true,
          // Scene background = our token so tab screens never flash the stock
          // navigation background (white/grey) during a theme swap.
          sceneStyle: { backgroundColor: theme.bg },
        }}
      >
        {/* ── 5 visible tabs: Accueil · Clients · Scan · Messages · Support ── */}
        <Tabs.Screen name="activity" options={{ title: 'Accueil' }} />
        <Tabs.Screen name="index" options={{ title: 'Clients' }} />
        <Tabs.Screen
          name="scan"
          options={{ title: 'Scan' }}
          listeners={() => ({
            tabPress: (e) => {
              e.preventDefault();
              // Hard dependency: no scanning without a loyalty program. Route to
              // the loyalty setup (with warning banner) instead of the camera.
              if (canScan(merchant)) {
                router.push('/scan-qr');
              } else {
                router.push({ pathname: '/settings', params: { loyaltySetup: '1' } });
              }
            },
          })}
        />
        <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
        <Tabs.Screen name="support" options={{ title: 'Support' }} />

        {/* ── Hidden route: Compte is reachable only via the avatar on Accueil ── */}
        <Tabs.Screen name="account" options={{ href: null }} />

      </Tabs>
    </GuidedTourProvider>
  );
}
