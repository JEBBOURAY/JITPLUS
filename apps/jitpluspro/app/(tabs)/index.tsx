import React, { useState, useEffect, useCallback, useRef, useDeferredValue } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { Users, Search, X, UserPlus, Star, Stamp, AlertCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useFocusFade } from '@/hooks/useFocusFade';
import { useAuthStore } from '@/stores/authStore';
import { useScanGuard } from '@/hooks/useScanGuard';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ClientListSkeleton } from '@/components/Skeleton';
import TipBanner from '@/components/TipBanner';
import { useClients } from '@/hooks/useQueryHooks';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SEARCH_DEBOUNCE_MS, ASYNC_STORAGE_KEYS } from '@/constants/app';
import { ms } from '@/utils/responsive';
import { timeAgo } from '@/utils/date';
import type { ClientListItem } from '@/types';

const HIT_SLOP_LARGE = { top: 12, bottom: 12, left: 12, right: 12 };
const safeImpact = (style: Haptics.ImpactFeedbackStyle) => {
  Haptics.impactAsync(style).catch(() => {});
};
const safeSelection = () => {
  Haptics.selectionAsync().catch(() => {});
};

/* ── Balance pill variants — differentiated by loyalty type (color + icon) so
   colour-blind users can tell points vs stamps apart without relying on hue alone ── */
const PILL_VARIANTS = {
  points: {
    light: { bg: 'rgba(124,58,237,0.09)', fg: '#7C3AED' },
    dark: { bg: 'rgba(167,139,250,0.15)', fg: '#C4B5FD' },
  },
  stamps: {
    light: { bg: 'rgba(245,158,11,0.10)', fg: '#B45309' },
    dark: { bg: 'rgba(245,158,11,0.18)', fg: '#FBBF24' },
  },
} as const;

// ── Carte client ────────────────────────────────────
const ClientCard = React.memo(function ClientCard({
  item,
  onOpenDetail,
  isStamps,
}: {
  item: ClientListItem;
  onOpenDetail: (id: string) => void;
  isStamps?: boolean;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const isDark = theme.mode === 'dark';

  // Full display name: "Prénom Nom"
  const displayName = [item.prenom, item.nom].filter(Boolean).join(' ') || '?';

  // Build two-letter initials (e.g. "JD" for "Jean Dupont")
  const firstInitial = item.prenom?.charAt(0) || item.nom?.charAt(0) || '?';
  const lastInitial = item.nom?.charAt(0) && item.prenom ? item.nom.charAt(0) : '';
  const initials = (firstInitial + lastInitial).toUpperCase() || '?';

  const formattedPoints = item.points?.toLocaleString('fr-FR') ?? '0';

  // Balance pill differentiated by loyalty type (colour + distinct icon)
  const variant = (isStamps ? PILL_VARIANTS.stamps : PILL_VARIANTS.points)[isDark ? 'dark' : 'light'];
  const PillIcon = isStamps ? Stamp : Star;
  const pointsUnit = isStamps ? t('common.stampsAbbr') : t('common.pointsAbbr');

  // "Last visit" subtext
  const lastVisitLabel = item.lastVisit
    ? t('clients.lastVisit', { time: timeAgo(item.lastVisit, locale) })
    : t('clients.neverVisited');

  const a11yLabel = `${displayName}, ${formattedPoints} ${pointsUnit}, ${lastVisitLabel}`;

  return (
    <TouchableOpacity
      style={[styles.clientCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
      onPress={() => {
        safeSelection();
        onOpenDetail(item.id);
      }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={t('clients.openDetailHint', { defaultValue: 'Voir les détails du client' })}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: theme.primary + '14' }]} importantForAccessibility="no">
        <Text style={[styles.avatarText, { color: theme.primary }]} maxFontSizeMultiplier={1.4}>{initials}</Text>
      </View>

      {/* Nom + dernière visite */}
      <View style={styles.clientInfo}>
        <Text style={[styles.clientName, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.6}>
          {displayName}
        </Text>
        <Text style={[styles.clientMeta, { color: theme.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {lastVisitLabel}
        </Text>
      </View>

      {/* Balance pill (points = star/violet, stamps = stamp/amber) */}
      <View style={[styles.pointsPill, { backgroundColor: variant.bg }]} importantForAccessibility="no-hide-descendants">
        <PillIcon size={ms(13)} color={variant.fg} strokeWidth={2.2} />
        <Text
          style={[styles.pointsPillText, { color: variant.fg }]}
          numberOfLines={1}
          ellipsizeMode="tail"
          maxFontSizeMultiplier={1.4}
        >
          {formattedPoints} {pointsUnit}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ── Empty State ────────────────────────────────────
const EmptyState = React.memo(function EmptyState({ search, theme, onScan }: { search: string; theme: ReturnType<typeof useTheme>; onScan: () => void }) {
  const { t } = useLanguage();
  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIllustration, { backgroundColor: `${palette.charbon}12` }]}>
        {search ? (
          <Search size={ms(36)} color={palette.charbon} strokeWidth={1.5} />
        ) : (
          <Users size={ms(36)} color={palette.charbon} strokeWidth={1.5} />
        )}
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6}>
        {search ? t('clients.noResults') : t('clients.noClients')}
      </Text>
      <Text style={[styles.emptyText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
        {search
          ? t('clients.noResultsFor', { query: search })
          : t('clients.noClientsHint')}
      </Text>
      {!search && (
        <TouchableOpacity
          style={[styles.emptyCta, { backgroundColor: theme.primary }]}
          onPress={() => {
            safeImpact(Haptics.ImpactFeedbackStyle.Light);
            onScan();
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('clients.addClient')}
        >
          <UserPlus size={18} color="#fff" />
          <Text style={styles.emptyCtaText} maxFontSizeMultiplier={1.4}>{t('clients.addClient')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// ── Écran Clients ──────────────────────────────────────────
export default function ClientsScreen() {
  const merchant = useAuthStore((s) => s.merchant);
  const theme = useTheme();
  const router = useRouter();
  const { t } = useLanguage();
  const { openScanner } = useScanGuard();
  const { focusStyle } = useFocusFade();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showClients, setShowClients] = useState(false);

  // ── Banner dismiss state ──
  const [bannerVisible, setBannerVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ASYNC_STORAGE_KEYS.CLIENTS_BANNER_DISMISSED).then((val) => {
      if (val !== 'true') setBannerVisible(true);
    });
  }, []);

  const dismissBanner = useCallback(() => {
    setBannerVisible(false);
  }, []);

  const dismissBannerForever = useCallback(() => {
    setBannerVisible(false);
    AsyncStorage.setItem(ASYNC_STORAGE_KEYS.CLIENTS_BANNER_DISMISSED, 'true');
  }, []);
  const searchInputRef = useRef<TextInput>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(deferredSearch), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [deferredSearch]);

  const {
    data: clients = [],
    isLoading: loading,
    isRefetching: refreshing,
    isError,
    refetch,
  } = useClients(debouncedSearch, showClients);

  const onRefresh = useGuardedCallback(async () => {
    await refetch();
  }, [refetch]);

  const clearSearch = useCallback(() => {
    setSearch('');
    searchInputRef.current?.blur();
  }, []);

  const openDetail = useCallback((clientId: string) => {
    router.push({ pathname: '/client-detail', params: { id: clientId } });
  }, [router]);

  const goToScan = useCallback(() => openScanner(), [openScanner]);

  const isStamps = merchant?.loyaltyType === 'STAMPS';

  const renderClient = useCallback(({ item }: { item: ClientListItem }) => (
    <ClientCard item={item} onOpenDetail={openDetail} isStamps={isStamps} />
  ), [openDetail, isStamps]);

  const keyExtractor = useCallback((item: ClientListItem) => item.id, []);

  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);

  const showSkeleton = loading && clients.length === 0 && !search;

  const getItemLayout = useCallback((_: unknown, index: number) => {
    const itemHeight = 72;
    const separatorHeight = 8;
    return { length: itemHeight + separatorHeight, offset: (itemHeight + separatorHeight) * index, index };
  }, []);

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
      {/* ── Simple header ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Text
          style={[styles.headerTitle, { color: theme.text }]}
          maxFontSizeMultiplier={1.4}
          accessibilityRole="header"
        >
          {t('clients.title')}
        </Text>
      </View>

      {/* ── Dismissable tip banner (shared with the Accueil screen) ── */}
      {bannerVisible && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <TipBanner
            title={t('clients.bannerTitle')}
            description={t('clients.bannerDesc')}
            hideLabel={t('clients.bannerHide')}
            onDismiss={dismissBanner}
            onDismissForever={dismissBannerForever}
          />
        </View>
      )}

      {isError && showClients && !loading ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIllustration, { backgroundColor: `${theme.danger}14` }]}>
            <AlertCircle size={ms(36)} color={theme.danger} strokeWidth={1.5} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6}>
            {t('common.errorTitle', { defaultValue: 'Erreur de chargement' })}
          </Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
            {t('common.errorHint', { defaultValue: 'Vérifiez votre connexion et réessayez.' })}
          </Text>
          <TouchableOpacity
            style={[styles.showClientsCta, { backgroundColor: theme.primary }]}
            onPress={() => {
              safeImpact(Haptics.ImpactFeedbackStyle.Light);
              refetch();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry', { defaultValue: 'Réessayer' })}
          >
            <Text style={styles.showClientsCtaText} maxFontSizeMultiplier={1.4}>
              {t('common.retry', { defaultValue: 'Réessayer' })}
            </Text>
          </TouchableOpacity>
        </View>
      ) : showSkeleton ? (
        <ClientListSkeleton count={7} />
      ) : !showClients ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIllustration, { backgroundColor: `${palette.charbon}12` }]}>
            <Users size={ms(36)} color={palette.charbon} strokeWidth={1.5} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6}>
            {t('clients.title')}
          </Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
            {t('clients.showClientsHint')}
          </Text>
          <TouchableOpacity
            style={[styles.showClientsCta, { backgroundColor: theme.primary }]}
            onPress={() => {
              safeImpact(Haptics.ImpactFeedbackStyle.Light);
              setShowClients(true);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('clients.showClients')}
          >
            <Users size={18} color="#fff" strokeWidth={2} />
            <Text style={styles.showClientsCtaText} maxFontSizeMultiplier={1.4}>{t('clients.showClients')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
      /* ── List with sticky search ── */
      <View style={styles.listWrap}>
        {/* ── Sticky search bar — stays visible while the client list scrolls ── */}
        <View style={styles.searchContainer}>
          <View style={[styles.searchBar, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <Search size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, { color: theme.text }]}
              placeholder={t('clients.searchPlaceholder')}
              placeholderTextColor={theme.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              keyboardType="default"
              accessibilityLabel={t('clients.searchPlaceholder')}
              maxFontSizeMultiplier={1.6}
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={clearSearch}
                hitSlop={HIT_SLOP_LARGE}
                style={styles.clearBtn}
                accessibilityRole="button"
                accessibilityLabel={t('common.clear', { defaultValue: 'Effacer' })}
              >
                <X size={18} color={theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* ── Result count ── */}
          {search.length > 0 && (
            <Text
              style={[styles.resultCount, { color: theme.textMuted }]}
              maxFontSizeMultiplier={1.6}
              accessibilityLiveRegion="polite"
            >
              {t('clients.resultsCount', { count: clients.length })}
            </Text>
          )}
        </View>

        <FlatList
          data={clients}
          renderItem={renderClient}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 116 }]}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={8}
          windowSize={7}
          initialNumToRender={10}
          updateCellsBatchingPeriod={50}
          getItemLayout={getItemLayout}
          ItemSeparatorComponent={ItemSeparator}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            !search && clients.length > 0 ? (
              <View style={styles.footerEndWrap}>
                <View style={[styles.footerDivider, { backgroundColor: theme.border }]} />
                <Text style={[styles.footerEnd, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
                  {t('common.allDisplayed')}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={<EmptyState search={search} theme={theme} onScan={goToScan} />}
        />
      </View>
      )}
    </Animated.View>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  /* List wrapper — holds the sticky search + the scrolling FlatList */
  listWrap: { flex: 1 },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  clearBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Header bar — simple title + refresh */
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
  },

  // ── Search ──
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 4,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    marginLeft: 10,
    paddingVertical: Platform.OS === 'ios' ? 0 : 8,
    fontFamily: 'Lexend_500Medium',
  },
  resultCount: {
    fontSize: 13,
    marginTop: 8,
    marginBottom: -4,
    fontWeight: '500',
    fontFamily: 'Lexend_500Medium',
  },

  /* List */
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 },
  separator: { height: 8 },

  /* Client card — matching activity txCard */
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  clientInfo: { flex: 1, marginRight: 8 },
  clientName: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
    letterSpacing: -0.2,
  },
  clientMeta: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
    fontFamily: 'Lexend_500Medium',
    letterSpacing: 0.1,
  },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pointsPillText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.3,
  },

  /* Empty state */
  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyIllustration: {
    width: ms(88),
    height: ms(88),
    borderRadius: ms(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.3,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 48,
    lineHeight: 22,
    fontFamily: 'Lexend_400Regular',
    letterSpacing: 0.1,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    gap: 10,
    elevation: 2,
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.6)',
  },
  emptyCtaText: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_600SemiBold' },

  /* Show clients CTA */
  showClientsCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  showClientsCtaText: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_600SemiBold' },

  /* Footer */
  footerEndWrap: { alignItems: 'center', paddingVertical: 20 },
  footerDivider: { width: 40, height: 1, marginBottom: 12, borderRadius: 1, opacity: 0.4 },
  footerEnd: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
    letterSpacing: 0.2,
    opacity: 0.5,
  },
});
