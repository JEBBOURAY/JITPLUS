import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { Users, Search, X, UserPlus, Zap } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useFocusFade } from '@/hooks/useFocusFade';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ClientListSkeleton } from '@/components/Skeleton';
import { useClients } from '@/hooks/useQueryHooks';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SEARCH_DEBOUNCE_MS } from '@/constants/app';
import type { ClientListItem } from '@/types';

const BANNER_DISMISSED_KEY = 'clients_banner_dismissed';

/* ── Tip banner — dismissable with "don't show again" ── */
const ClientsBanner = React.memo(function ClientsBanner({
  onDismiss,
  onDismissForever,
}: {
  onDismiss: () => void;
  onDismissForever: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const isDark = theme.mode === 'dark';

  return (
    <View style={[bannerStyles.wrapper, { backgroundColor: isDark ? 'rgba(124,58,237,0.12)' : 'rgba(124,58,237,0.06)', borderColor: isDark ? 'rgba(124,58,237,0.25)' : 'rgba(124,58,237,0.15)' }]}>
      <LinearGradient
        colors={['rgba(124,58,237,0.08)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <TouchableOpacity style={bannerStyles.closeBtn} onPress={onDismiss} hitSlop={8}>
        <X size={16} color={theme.textMuted} strokeWidth={2} />
      </TouchableOpacity>
      <View style={bannerStyles.content}>
        <Zap size={18} color={theme.primary} strokeWidth={1.8} />
        <View style={bannerStyles.textWrap}>
          <Text style={[bannerStyles.title, { color: theme.text }]}>{t('clients.bannerTitle')}</Text>
          <Text style={[bannerStyles.desc, { color: theme.textMuted }]}>{t('clients.bannerDesc')}</Text>
        </View>
      </View>
      <TouchableOpacity onPress={onDismissForever} style={bannerStyles.hideBtn} hitSlop={4}>
        <Text style={[bannerStyles.hideText, { color: theme.textMuted }]}>{t('clients.bannerHide')}</Text>
      </TouchableOpacity>
    </View>
  );
});

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
  const { t } = useLanguage();
  const isDark = theme.mode === 'dark';

  // Full display name: "Prénom Nom"
  const displayName = [item.prenom, item.nom].filter(Boolean).join(' ') || '?';

  // Build two-letter initials (e.g. "JD" for "Jean Dupont")
  const firstInitial = item.prenom?.charAt(0) || item.nom?.charAt(0) || '?';
  const lastInitial = item.nom?.charAt(0) && item.prenom ? item.nom.charAt(0) : '';
  const initials = (firstInitial + lastInitial).toUpperCase() || '?';

  const formattedPoints = item.points?.toLocaleString('fr-FR') ?? '0';
  const pillBg = isDark ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.08)';

  return (
    <TouchableOpacity
      style={[styles.clientCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
      onPress={() => onOpenDetail(item.id)}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: theme.primary + '14' }]}>
        <Text style={[styles.avatarText, { color: theme.primary }]}>{initials}</Text>
      </View>

      {/* Nom */}
      <View style={styles.clientInfo}>
        <Text style={[styles.clientName, { color: theme.text }]} numberOfLines={1}>
          {displayName}
        </Text>
      </View>

      {/* Points pill */}
      <View style={[styles.pointsPill, { backgroundColor: pillBg }]}>
        <Text style={[styles.pointsPillText, { color: theme.primary }]}>
          {formattedPoints} {isStamps ? t('common.stampsAbbr') : t('common.pointsAbbr')}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ── Empty State ────────────────────────────────────
function EmptyState({ search, theme, onScan }: { search: string; theme: ReturnType<typeof useTheme>; onScan: () => void }) {
  const { t } = useLanguage();
  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIllustration, { backgroundColor: theme.primaryBg }]}>
        {search ? (
          <Search size={44} color={theme.primary} strokeWidth={1.2} />
        ) : (
          <Users size={44} color={theme.primary} strokeWidth={1.2} />
        )}
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        {search ? t('clients.noResults') : t('clients.noClients')}
      </Text>
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
        {search
          ? t('clients.noResultsFor', { query: search })
          : t('clients.noClientsHint')}
      </Text>
      {!search && (
        <TouchableOpacity style={[styles.emptyCta, { backgroundColor: theme.primary }]} onPress={onScan} activeOpacity={0.7}>
          <UserPlus size={18} color="#fff" />
          <Text style={styles.emptyCtaText}>{t('clients.addClient')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Écran Clients ──────────────────────────────────────────
export default function ClientsScreen() {
  const { merchant } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const { t } = useLanguage();
  const { focusStyle } = useFocusFade();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showClients, setShowClients] = useState(false);

  // ── Banner dismiss state ──
  const [bannerVisible, setBannerVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(BANNER_DISMISSED_KEY).then((val) => {
      if (val !== 'true') setBannerVisible(true);
    });
  }, []);

  const dismissBanner = useCallback(() => {
    setBannerVisible(false);
  }, []);

  const dismissBannerForever = useCallback(() => {
    setBannerVisible(false);
    AsyncStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  }, []);
  const searchInputRef = useRef<TextInput>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const {
    data: clients = [],
    isLoading: loading,
    isRefetching: refreshing,
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

  const isStamps = merchant?.loyaltyType === 'STAMPS';

  const renderClient = useCallback(({ item }: { item: ClientListItem }) => (
    <ClientCard item={item} onOpenDetail={openDetail} isStamps={isStamps} />
  ), [openDetail, isStamps]);

  const keyExtractor = useCallback((item: ClientListItem) => item.id, []);

  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);

  const showSkeleton = loading && clients.length === 0 && !search;

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
      {/* ── Simple header ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('clients.title')}</Text>
      </View>

      {/* ── Dismissable tip banner ── */}
      {bannerVisible && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <ClientsBanner onDismiss={dismissBanner} onDismissForever={dismissBannerForever} />
        </View>
      )}

      {showSkeleton ? (
        <ClientListSkeleton count={7} />
      ) : !showClients ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIllustration, { backgroundColor: theme.primaryBg }]}>
            <Users size={40} color={theme.primary} strokeWidth={1.2} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            {t('clients.title')}
          </Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {t('clients.showClientsHint')}
          </Text>
          <TouchableOpacity
            style={[styles.showClientsCta, { backgroundColor: theme.primary }]}
            onPress={() => setShowClients(true)}
            activeOpacity={0.7}
          >
            <Users size={18} color="#fff" strokeWidth={2} />
            <Text style={styles.showClientsCtaText}>{t('clients.showClients')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
      /* ── List ── */
      <FlatList
        data={clients}
        renderItem={renderClient}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={10}
        windowSize={7}
        initialNumToRender={10}
        ItemSeparatorComponent={ItemSeparator}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* ── Search bar ── */}
            <View style={[styles.searchBar, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
              <Search size={18} color={theme.primary} />
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
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <X size={18} color={theme.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* ── Result count ── */}
            {search.length > 0 && (
              <Text style={[styles.resultCount, { color: theme.textMuted }]}>
                {t('clients.resultsCount', { count: clients.length })}
              </Text>
            )}
          </View>
        }
        ListFooterComponent={
          !search && clients.length > 0 ? (
            <View style={styles.footerEndWrap}>
              <View style={[styles.footerDivider, { backgroundColor: theme.border }]} />
              <Text style={[styles.footerEnd, { color: theme.textMuted }]}>
                {t('common.allDisplayed')}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={<EmptyState search={search} theme={theme} onScan={() => router.push('/scan-qr')} />}
      />
      )}
    </Animated.View>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

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
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120 },
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
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
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
    width: 100,
    height: 100,
    borderRadius: 50,
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

const bannerStyles = StyleSheet.create({
  wrapper: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingRight: 24,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
    letterSpacing: -0.2,
  },
  desc: {
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
    lineHeight: 18,
    marginTop: 3,
    letterSpacing: 0.1,
  },
  hideBtn: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  hideText: {
    fontSize: 11,
    fontFamily: 'Lexend_500Medium',
    textDecorationLine: 'underline',
    letterSpacing: 0.1,
  },
});
