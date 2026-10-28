import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { ActivityIndicator, View } from 'react-native';
import CustomTabBar from '@/components/CustomTabBar';
import { GuidedTourProvider } from '@/components/GuidedTour';

const renderTabBar = (props: any) => <CustomTabBar {...props} />;

export default function TabLayout() {
  const isAuthenticated = useAuthStore((s) => !!s.merchant);
  const loading = useAuthStore((s) => s.loading);
  const theme = useTheme();
  const router = useRouter();

  // Auth is the ONLY blocking gate: email verification and business setup are
  // never a forced tunnel.
  // The app lands directly on the "Accueil" tab after login/registration.
  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <GuidedTourProvider>
      <Tabs
        tabBar={renderTabBar}
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          lazy: true,
          // Scene background = our token so tab screens never flash the stock
          // navigation background (white/grey) during a theme swap.
          sceneStyle: { backgroundColor: theme.bg },
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="clients" />
        <Tabs.Screen
          name="scan"
          listeners={() => ({
            tabPress: (e) => {
              e.preventDefault();
              router.push('/scan-qr');
            },
          })}
        />
        <Tabs.Screen name="messages" />
        <Tabs.Screen name="team" />

      </Tabs>
    </GuidedTourProvider>
  );
}
