import React, { useCallback, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { JitClients, JitHome, JitMessages, JitScan, JitTeam } from '@/components/icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { radius } from '@/utils/responsive';
import WhatsAppSupportFab from '@/components/WhatsAppSupportFab';
import { useTourTarget, type TourTargetKey } from '@/components/GuidedTour';

const ICONS: Record<string, LucideIcon> = {
  index:     JitHome,
  clients:   JitClients,
  scan:      JitScan,
  messages:  JitMessages,
  team:      JitTeam,
};

const TAB_KEYS: Record<string, string> = {
  index:    'tabs.home',
  clients:  'tabs.clients',
  scan:     'tabs.scan',
  messages: 'tabs.messages',
  team:     'tabs.team',
};

// Guided-tour target keys for the non-scan tabs.
const TAB_TOUR_KEYS: Record<string, TourTargetKey | undefined> = {
  clients:  'clients',
  messages: 'messages',
  team:     'team',
};

// Bar geometry, shared with the WhatsApp button so it lines up over the last tab.
const BAR_SIDE = 16;
const BAR_BOTTOM = 18;
const BAR_BORDER = 1;
const ROW_HEIGHT = 66;
const ROW_PADDING = 6;

type TabNavigation = Pick<BottomTabBarProps, 'emitter' | 'navigateToTab'>;

const TabButton = React.memo(function TabButton({
  route,
  isFocused,
  navigation,
  badge,
  tourKey,
}: {
  route: { key: string; name: string };
  isFocused: boolean;
  navigation: TabNavigation;
  badge?: number;
  tourKey?: TourTargetKey;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { isRTL } = useDir();
  const tourRef = useTourTarget(tourKey);

  const onPress = useCallback(() => {
    const event = navigation.emitter.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigateToTab(route.key);
    }
  }, [navigation, route.key, isFocused]);

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
          size={22}
          color={isFocused ? palette.violet : theme.textMuted}
          strokeWidth={icon.stroke}
        />
        {!!badge && badge > 0 && (
          <View style={[styles.tabBadge, isRTL ? { left: 2 } : { right: 2 }]}>
            <Text style={styles.tabBadgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
      <Text
        style={[
          styles.label,
          { color: isFocused ? palette.violet : theme.textMuted,
            fontFamily: isFocused ? font.semibold : font.medium },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
});

const ScanButton = React.memo(function ScanButton({
  route,
  navigation,
}: {
  route: { key: string; name: string };
  navigation: TabNavigation;
}) {
  const { t } = useLanguage();
  const scanTourRef = useTourTarget('scan');

  const onPress = useCallback(() => {
    const event = navigation.emitter.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigateToTab(route.key);
    }
  }, [navigation, route.key]);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={t('tabs.scan')}
      accessibilityHint={t('tabs.scanHint')}
      onPress={onPress}
      activeOpacity={0.85}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <View ref={scanTourRef} collapsable={false} style={styles.scanShadow}>
        <LinearGradient
          colors={[palette.violet, palette.violetDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.scanFab}
        >
          <JitScan size={26} color="#fff" strokeWidth={icon.stroke} />
        </LinearGradient>
      </View>
    </TouchableOpacity>
  );
});

export default React.memo(function CustomTabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const navigation = useMemo(() => ({ emitter, navigateToTab }), [emitter, navigateToTab]);
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const dir = useDir();
  const isDark = theme.mode === 'dark';

  const scanRoute = state.routes.find((r) => r.name === 'scan');
  const scanIndex = state.routes.findIndex((r) => r.name === 'scan');
  const scanFocused = state.index === scanIndex;
  const scanLabel = t('tabs.scan');

  // The WhatsApp support button floats above the Équipe tab on Accueil only.
  const showSupportFab = state.routes[state.index]?.name === 'index';
  // Only routes that draw a column in the bar, so the button lines up with Équipe.
  const barRoutes = state.routes.filter((r) => r.name === 'scan' || ICONS[r.name]);
  const teamColumn = barRoutes.findIndex((r) => r.name === 'team');

  const barBg = isDark ? 'rgba(20,24,33,0.72)' : 'rgba(255,255,255,0.72)';
  const barBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.65)';

  const barContent = (
    <View style={[styles.row, { flexDirection: dir.row }]}>
      {state.routes.map((route, index) => {
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
                    fontFamily: scanFocused ? font.semibold : font.medium,
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
          bottom: insets.bottom + BAR_BOTTOM,
          backgroundColor: barBg,
          shadowOpacity: isDark ? 0.5 : 0.14,
        },
      ]}
    >
      <View style={[styles.bar, { borderColor: barBorder, backgroundColor: barBg }]}>{barContent}</View>

      {/* Rendered outside the clipped bar so the raised button can overflow it. */}
      <View style={styles.scanWrap} pointerEvents="box-none">
        {scanRoute && <ScanButton route={scanRoute} navigation={navigation} />}
      </View>
    </View>

      {showSupportFab && teamColumn >= 0 && (
        <View
          pointerEvents="box-none"
          style={[
            styles.fabRow,
            {
              flexDirection: dir.row,
              bottom: insets.bottom + BAR_BOTTOM + ROW_HEIGHT + BAR_BORDER * 2 + 12,
            },
          ]}
        >
          {barRoutes.map((route, index) => (
            <View key={route.key} style={styles.fabColumn} pointerEvents="box-none">
              {index === teamColumn && <WhatsAppSupportFab />}
            </View>
          ))}
        </View>
      )}
    </>
  );
});

const styles = StyleSheet.create({
  floating: {
    position: 'absolute',
    left: BAR_SIDE,
    right: BAR_SIDE,
    borderRadius: radius['2xl'],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 18,
  },
  bar: {
    borderRadius: radius['2xl'],
    borderWidth: BAR_BORDER,
    overflow: 'hidden',
  },
  row: {
    height: ROW_HEIGHT,
    alignItems: 'center',
    paddingHorizontal: ROW_PADDING,
  },
  fabRow: {
    position: 'absolute',
    left: BAR_SIDE + BAR_BORDER + ROW_PADDING,
    right: BAR_SIDE + BAR_BORDER + ROW_PADDING,
  },
  fabColumn: {
    flex: 1,
    alignItems: 'center',
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
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    letterSpacing: 0,
    fontFamily: font.medium,
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
    top: -2,
    backgroundColor: '#ef4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: font.bold,
  },
});
