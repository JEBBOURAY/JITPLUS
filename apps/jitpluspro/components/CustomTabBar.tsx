import React, { useCallback, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { LayoutGrid, ReceiptText, type LucideIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { JitClients, JitHome, JitScan } from '@/components/icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon, TAB_BAR_HEIGHT } from '@/constants/design';
import WhatsAppSupportFab from '@/components/WhatsAppSupportFab';
import { useStatsGate } from '@/hooks/useStatsGate';
import { useAuthStore } from '@/stores/authStore';
import { usePlanStatus } from '@/hooks/usePlanStatus';

/**
 * What the bar draws, in order. A `tab` entry switches to a route of the tab
 * navigator (cross-fade); `scan` opens the scanner as a full-screen task;
 * `stats` opens the statistics through their Pro gate. Every route of the tab
 * navigator has an entry here: screens opened from "Mes outils" live in the
 * root stack so they all slide in the same way.
 */
type BarItem =
  | { kind: 'tab'; name: string; labelKey: string; Icon: LucideIcon }
  | { kind: 'scan'; name: 'scan' }
  | { kind: 'stats'; name: string; labelKey: string; Icon: LucideIcon };

const BAR_ITEMS: BarItem[] = [
  { kind: 'tab', name: 'index', labelKey: 'tabs.home', Icon: JitHome },
  { kind: 'tab', name: 'clients', labelKey: 'tabs.clients', Icon: JitClients },
  { kind: 'scan', name: 'scan' },
  { kind: 'tab', name: 'transactions', labelKey: 'tabs.transactions', Icon: ReceiptText },
  { kind: 'stats', name: 'dashboard', labelKey: 'tabs.dashboard', Icon: LayoutGrid },
];

const TAB_HIT_SLOP = { top: 8, bottom: 8, left: 4, right: 4 };
const SCAN_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

const FAB_GAP = 16;

const BarButton = React.memo(function BarButton({
  label,
  Icon,
  isFocused,
  onPress,
}: {
  label: string;
  Icon: LucideIcon;
  isFocused: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = isFocused ? palette.violet : theme.textMuted;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={label}
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.tab}
      hitSlop={TAB_HIT_SLOP}
    >
      <Icon size={24} color={color} strokeWidth={isFocused ? icon.strokeSmall : icon.stroke} />
      <Text
        style={[styles.label, { color, fontFamily: isFocused ? font.semibold : font.medium }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
});

const ScanButton = React.memo(function ScanButton({ onPress, ringColor }: { onPress: () => void; ringColor: string }) {
  const { t } = useLanguage();

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={t('tabs.scan')}
      accessibilityHint={t('tabs.scanHint')}
      onPress={onPress}
      activeOpacity={0.85}
      hitSlop={SCAN_HIT_SLOP}
    >
      <View style={styles.scanShadow}>
        <View style={[styles.scanFab, { backgroundColor: palette.violet, borderColor: ringColor }]}>
          <JitScan size={26} color="#fff" strokeWidth={icon.stroke} />
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default React.memo(function CustomTabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const dir = useDir();
  const router = useRouter();

  const focusedName = state.routes[state.index]?.name;

  const merchant = useAuthStore((s) => s.merchant);
  const { isPremium } = usePlanStatus(merchant);
  const { openStats, lockModal: statsLockModal } = useStatsGate(isPremium);

  const pressTab = useCallback(
    (name: string) => {
      const route = state.routes.find((r) => r.name === name);
      if (!route) return;
      const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (focusedName !== name && !event.defaultPrevented) navigateToTab(route.key);
    },
    [state.routes, emitter, navigateToTab, focusedName],
  );

  const handlers = useMemo(() => {
    const map: Record<string, () => void> = {};
    for (const item of BAR_ITEMS) {
      if (item.kind === 'stats') map[item.name] = openStats;
      else if (item.kind === 'scan') map[item.name] = () => router.push('/scan-qr');
      else map[item.name] = () => pressTab(item.name);
    }
    return map;
  }, [router, pressTab, openStats]);

  // The WhatsApp support button floats above the bar on Accueil only.
  const showSupportFab = focusedName === 'index';

  return (
    <>
      <View
        style={[
          styles.bar,
          { paddingBottom: insets.bottom, backgroundColor: theme.bgCard, borderTopColor: theme.border },
        ]}
      >
        <View style={[styles.row, { flexDirection: dir.row }]}>
          {BAR_ITEMS.map((item) =>
            item.kind === 'scan' ? (
              // Reserve the centre column for the raised button drawn below.
              <View key={item.name} style={styles.tab} pointerEvents="none" />
            ) : (
              <BarButton
                key={item.name}
                label={t(item.labelKey)}
                Icon={item.Icon}
                isFocused={item.kind === 'tab' && focusedName === item.name}
                onPress={handlers[item.name]}
              />
            ),
          )}
        </View>

        {/* Outside the row so the raised button can overflow the bar's top edge. */}
        <View style={styles.scanWrap} pointerEvents="box-none">
          <ScanButton onPress={handlers.scan} ringColor={theme.bgCard} />
        </View>
      </View>

      {showSupportFab && (
        <View
          pointerEvents="box-none"
          style={[
            styles.fab,
            { bottom: insets.bottom + TAB_BAR_HEIGHT + FAB_GAP },
            dir.isRTL ? { left: FAB_GAP } : { right: FAB_GAP },
          ]}
        >
          <WhatsAppSupportFab />
        </View>
      )}

      {statsLockModal}
    </>
  );
});

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    height: TAB_BAR_HEIGHT,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  fab: {
    position: 'absolute',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0,
    fontFamily: font.medium,
  },
  scanWrap: {
    position: 'absolute',
    top: -20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scanShadow: {
    borderRadius: 31,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  scanFab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
  },
});
