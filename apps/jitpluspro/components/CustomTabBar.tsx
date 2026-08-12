import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Animated, AccessibilityInfo, Easing, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Home, Users, QrCode, Megaphone, MessageCircle } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { pokeInteraction, subscribeInteraction } from '@/utils/interaction';
import SupportSpeedDial from '@/components/SupportSpeedDial';
import { useTourTarget, type TourTargetKey } from '@/components/GuidedTour';

// ── Tab configuration ─────────────────────────────────────
const ICONS: Record<string, LucideIcon> = {
  activity:  Home,
  index:     Users,
  scan:      QrCode,
  messages:  Megaphone,
  support:   MessageCircle,
};

const TAB_KEYS: Record<string, string> = {
  activity: 'tabs.home',
  index:    'tabs.clients',
  scan:     'tabs.scan',
  messages: 'tabs.messages',
  support:  'tabs.support',
};

// Guided-tour target keys for the non-scan/non-support tabs.
const TAB_TOUR_KEYS: Record<string, TourTargetKey | undefined> = {
  index:    'clients',
  messages: 'messages',
};

const TabButton = React.memo(function TabButton({
  route,
  isFocused,
  navigation,
  badge,
  overrideOnPress,
  tourKey,
}: {
  route: { key: string; name: string };
  isFocused: boolean;
  navigation: BottomTabBarProps['navigation'];
  badge?: number;
  overrideOnPress?: () => void;
  tourKey?: TourTargetKey;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const tourRef = useTourTarget(tourKey);

  const onPress = useCallback(() => {
    pokeInteraction();
    if (overrideOnPress) {
      overrideOnPress();
      return;
    }
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  }, [navigation, route.key, route.name, isFocused, overrideOnPress]);

  const IconComponent = ICONS[route.name];
  if (!IconComponent) return null;
  const label = t(TAB_KEYS[route.name] ?? route.name);

  return (
    <TouchableOpacity
      ref={tourRef}
      key={route.key}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={label}
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.tab}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      {isFocused && (
        <View style={[styles.indicator, { backgroundColor: palette.violet }]} />
      )}
      <View
        style={[
          styles.iconContainer,
          isFocused && { backgroundColor: `${palette.violet}15` },
        ]}
      >
        <IconComponent
          size={21}
          color={isFocused ? palette.violet : theme.textMuted}
          strokeWidth={1.5}
        />
        {!!badge && badge > 0 && (
          <View style={styles.tabBadge}>
            <Text style={styles.tabBadgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
      <Text
        style={[
          styles.label,
          { color: isFocused ? palette.violet : theme.textMuted,
            fontWeight: isFocused ? '700' : '500' },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
});

// ── Center "Scan" button — pops above the floating bar (Revolut style) ──
const ScanButton = React.memo(function ScanButton({
  route,
  navigation,
  pulse,
}: {
  route: { key: string; name: string };
  navigation: BottomTabBarProps['navigation'];
  pulse: Animated.Value;
}) {
  const { t } = useLanguage();
  const scanTourRef = useTourTarget('scan');

  const onPress = useCallback(() => {
    pokeInteraction();
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  }, [navigation, route.key, route.name]);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={t('tabs.scan')}
      accessibilityHint={t('tabs.scanHint')}
      onPress={onPress}
      activeOpacity={0.85}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      {/* Opacity animates on the visual only — the TouchableOpacity keeps its full hit area. */}
      <Animated.View ref={scanTourRef} collapsable={false} style={[styles.scanShadow, { opacity: pulse }]}>
        <LinearGradient
          colors={[palette.violet, palette.violetDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.scanFab}
        >
          <QrCode size={26} color="#fff" strokeWidth={1.8} />
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
});

export default React.memo(function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const isDark = theme.mode === 'dark';

  const scanRoute = state.routes.find((r) => r.name === 'scan');
  const scanIndex = state.routes.findIndex((r) => r.name === 'scan');
  const scanFocused = state.index === scanIndex;
  const scanLabel = t('tabs.scan');

  // Support tab opens a floating speed-dial overlay instead of navigating.
  const [supportOpen, setSupportOpen] = useState(false);

  // ── Scan button "breathing" — only on the Accueil tab, only while idle ──
  const isHome = state.routes[state.index]?.name === 'activity';
  const pulse = useRef(new Animated.Value(1)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted) reduceMotionRef.current = v; });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { reduceMotionRef.current = v; });
    return () => { mounted = false; sub.remove(); };
  }, []);

  useEffect(() => {
    const stopPulse = () => {
      loopRef.current?.stop();
      loopRef.current = null;
      pulse.stopAnimation();
      pulse.setValue(1);
    };
    const startPulse = () => {
      if (loopRef.current || reduceMotionRef.current) return;
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.85, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loopRef.current.start();
    };
    const scheduleIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      stopPulse();
      if (!isHome) return;
      idleTimerRef.current = setTimeout(startPulse, 3000);
    };

    scheduleIdle();
    const unsub = subscribeInteraction(scheduleIdle);
    return () => {
      unsub();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      stopPulse();
    };
  }, [isHome, pulse]);

  // Frosted-glass tokens — semi-transparent so the blur reads on light AND dark.
  const barBg = isDark ? 'rgba(20,24,33,0.72)' : 'rgba(255,255,255,0.72)';
  const barBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.65)';

  const barContent = (
    <View style={styles.row}>
      {state.routes.map((route, index) => {
        if (route.name === 'support') {
          // Toggle the speed-dial overlay; never navigate to a screen.
          return (
            <TabButton
              key={route.key}
              route={route}
              isFocused={supportOpen}
              navigation={navigation}
              overrideOnPress={() => setSupportOpen((o) => !o)}
              tourKey="support"
            />
          );
        }
        if (route.name === 'scan') {
          // Reserve the centre column so the label lines up under the popped button.
          return (
            <View key={route.key} style={styles.tab} pointerEvents="none">
              <View style={styles.scanSlot} />
              <Text
                style={[
                  styles.label,
                  {
                    color: scanFocused ? palette.violet : theme.textMuted,
                    fontWeight: scanFocused ? '700' : '500',
                  },
                ]}
              >
                {scanLabel}
              </Text>
            </View>
          );
        }
        return (
          <TabButton
            key={route.key}
            route={route}
            isFocused={state.index === index}
            navigation={navigation}
            tourKey={TAB_TOUR_KEYS[route.name]}
          />
        );
      })}
    </View>
  );

  return (
    <>
    <View
      pointerEvents="box-none"
      style={[
        styles.floating,
        {
          bottom: insets.bottom + 18,
          backgroundColor: barBg,
          shadowOpacity: isDark ? 0.5 : 0.14,
        },
      ]}
    >
      {Platform.OS === 'android' ? (
        // Android: skip real-time blur (dimezisBlurView re-composites on every
        // content change behind it → screen-wide jank on scroll/layout). A
        // translucent frosted fill reads near-identical, at zero per-frame cost.
        <View style={[styles.blur, { borderColor: barBorder, backgroundColor: barBg }]}>{barContent}</View>
      ) : (
        <BlurView
          intensity={isDark ? 24 : 36}
          tint={isDark ? 'dark' : 'light'}
          style={[styles.blur, { borderColor: barBorder }]}
        >
          {barContent}
        </BlurView>
      )}

      {/* Pop-up centre button — rendered outside the clipped blur so it can overflow */}
      <View style={styles.scanWrap} pointerEvents="box-none">
        {scanRoute && <ScanButton route={scanRoute} navigation={navigation} pulse={pulse} />}
      </View>
    </View>

      <SupportSpeedDial visible={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
});

const styles = StyleSheet.create({
  floating: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 18,
  },
  blur: {
    borderRadius: 26,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    height: 66,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconContainer: {
    width: 46,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.3,
    fontFamily: 'Lexend_500Medium',
  },
  indicator: {
    position: 'absolute',
    top: -7,
    width: 22,
    height: 3,
    borderRadius: 2,
  },
  // Centre column reserves the same footprint as an icon so the label aligns.
  scanSlot: {
    width: 46,
    height: 34,
  },
  scanWrap: {
    position: 'absolute',
    top: -22,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scanShadow: {
    borderRadius: 30,
    shadowColor: palette.violet,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  scanFab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  tabBadge: {
    position: 'absolute',
    top: 0,
    right: 2,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
});
