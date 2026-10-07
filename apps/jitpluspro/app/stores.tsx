import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type LayoutChangeEvent } from 'react-native';
import { ArrowLeft, Store, Palette, Shield } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import StoresLocationsTab from '@/components/stores/StoresLocationsTab';
import FicheCommerceTab from '@/components/store-preview/FicheCommerceTab';
import { ms } from '@/utils/responsive';

type TabKey = 'locations' | 'fiche';

const TABS: { key: TabKey; labelKey: string; Icon: LucideIcon }[] = [
  { key: 'locations', labelKey: 'stores.tabLocations', Icon: Store },
  { key: 'fiche', labelKey: 'stores.tabFiche', Icon: Palette },
];

function parseTab(value?: string | string[]): TabKey | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'fiche' || v === 'locations' ? v : null;
}

/**
 * "Mes boutiques" — physical locations (Boutiques tab) and the public
 * profile + loyalty card design (Fiche & carte tab) on a single screen.
 *
 * Route params: `tab=locations|fiche`, `autoPreview=1` (opens the client
 * preview of the fiche immediately), `toast=created|saved` (store form result).
 */
export default function StoresScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { isTeamMember } = useAuth();
  const params = useLocalSearchParams<{ tab?: string; autoPreview?: string }>();
  const requestedTab = parseTab(params.tab);

  const [activeTab, setActiveTab] = useState<TabKey>(requestedTab ?? 'locations');
  // The fiche tab holds an unsaved draft: once opened it stays mounted (hidden)
  // so switching tabs never loses edits. It is not mounted until first opened
  // because it is the heavier of the two (icon grid, gallery, hours editor).
  const [ficheMounted, setFicheMounted] = useState(activeTab === 'fiche');
  // Height of the header + tab bar. KeyboardAvoidingView measures itself
  // relative to its parent, so the fiche tab needs it as keyboard offset.
  const [chromeHeight, setChromeHeight] = useState(0);

  const selectTab = useCallback((key: TabKey) => {
    setActiveTab(key);
    if (key === 'fiche') setFicheMounted(true);
  }, []);

  // Follow later `tab` param changes (e.g. navigate to /stores?tab=fiche while
  // this screen is already mounted). Adjusted during render, not in an effect.
  const [syncedTab, setSyncedTab] = useState(requestedTab);
  if (requestedTab !== syncedTab) {
    setSyncedTab(requestedTab);
    if (requestedTab) selectTab(requestedTab);
  }

  const onChromeLayout = useCallback((e: LayoutChangeEvent) => {
    setChromeHeight(Math.round(e.nativeEvent.layout.height));
  }, []);

  if (shouldWait) return null;

  if (isTeamMember) {
    return (
      <View style={[styles.container, styles.ownerOnly, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
        <Shield size={48} color={theme.textMuted} strokeWidth={1.5} />
        <Text style={[styles.ownerOnlyTitle, { color: theme.text }]}>{t('common.ownerOnly')}</Text>
        <Text style={[styles.ownerOnlyMsg, { color: theme.textMuted }]}>{t('common.ownerOnlyMsg')}</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.ownerOnlyBtn, { backgroundColor: theme.primary }]}>
          <Text style={styles.ownerOnlyBtnText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View onLayout={onChromeLayout}>
        <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ArrowLeft size={22} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{t('stores.title')}</Text>
        </View>

        <View style={[styles.tabBar, { backgroundColor: theme.bgInput }]} accessibilityRole="tablist">
          {TABS.map(({ key, labelKey, Icon }) => {
            const selected = activeTab === key;
            const color = selected ? palette.violet : theme.textMuted;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => selectTab(key)}
                activeOpacity={0.8}
                style={[styles.tab, selected && { backgroundColor: theme.bgCard }]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Icon size={ms(15)} color={color} strokeWidth={2} />
                <Text style={[styles.tabText, { color }]} numberOfLines={1}>{t(labelKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* The locations tab has no local draft (data lives in the React Query
          cache), so it is unmounted when hidden to release its MapView. */}
      {activeTab === 'locations' ? <StoresLocationsTab /> : null}
      {ficheMounted ? (
        <View style={[styles.container, activeTab !== 'fiche' && styles.hidden]}>
          <FicheCommerceTab autoPreview={params.autoPreview === '1'} keyboardOffset={chromeHeight} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hidden: { display: 'none' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 10,
  },
  headerTitle: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    padding: 4,
    borderRadius: 999,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 999,
  },
  tabText: { fontSize: ms(13), fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  ownerOnly: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  ownerOnlyTitle: { fontWeight: '600', fontSize: 16, marginTop: 16, fontFamily: 'Lexend_600SemiBold' },
  ownerOnlyMsg: { textAlign: 'center', marginTop: 8, fontFamily: 'Lexend_400Regular' },
  ownerOnlyBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  ownerOnlyBtnText: { color: '#fff', fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
});
