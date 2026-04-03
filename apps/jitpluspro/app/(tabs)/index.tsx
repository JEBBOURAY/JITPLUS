import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Animated as RNAnimated,
  Platform,
} from 'react-native';
import { Users, Search, X, UserPlus, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusFade } from '@/hooks/useFocusFade';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, brandGradient, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ClientListSkeleton } from '@/components/Skeleton';
import { useClients } from '@/hooks/useQueryHooks';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SEARCH_DEBOUNCE_MS } from '@/constants/app';
import type { ClientListItem } from '@/types';

// ── Carte client animée ────────────────────────────────────
const ClientCard = React.memo(function ClientCard({
  item,
  onPress,
  theme,
  isStamps,
}: {
  item: ClientListItem;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
  isStamps?: boolean;
}) {
  const { t } = useLanguage();
  const scaleAnim = useRef(new RNAnimated.Value(1)).current;

  const handlePressIn = () =>
    RNAnimated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const handlePressOut = () =>
    RNAnimated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  // Full display name: "Prénom Nom"
  const displayName = [item.prenom, item.nom].filter(Boolean).join(' ') || '?';

  // Build two-letter initials (e.g. "JD" for "Jean Dupont")
  const firstInitial = item.prenom?.charAt(0) || item.nom?.charAt(0) || '?';
  const lastInitial = item.nom?.charAt(0) && item.prenom ? item.nom.charAt(0) : '';
  const initials = (firstInitial + lastInitial).toUpperCase() || '?';

  const formattedPoints = item.points?.toLocaleString('fr-FR') ?? '0';

  return (
    <RNAnimated.View style={[styles.cardOuter, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        style={[
          styles.clientCard,
          { backgroundColor: theme.bgCard, borderBottomColor: theme.borderLight },
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.7}
      >
        {/* Avatar violet avec initiales blanches */}
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        {/* Prénom + Nom */}
        <View style={styles.clientInfo}>
          <Text style={[styles.clientName, { color: theme.text }]} numberOfLines={1}>
            {displayName}
          </Text>
        </View>

        {/* Points à droite */}
        <Text style={[styles.pointsValue, { color: theme.primary }]}>
          {formattedPoints} <Text style={styles.pointsLabel}>{isStamps ? t('common.stampsAbbr') : t('common.pointsAbbr')}</Text>
        </Text>
        <ChevronRight size={16} color={palette.violet} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
    </RNAnimated.View>
  );
});

// ── Empty State moderne ────────────────────────────────────
function EmptyState({ search, theme, onScan }: { search: string; theme: ReturnType<typeof useTheme>; onScan: () => void }) {
  const { t } = useLanguage();
  return (
    <View style={styles.emptyContainer}>
      {/* Illustration circles */}
      <View style={styles.emptyIllustration}>
        <View style={[styles.emptyCircle1, { backgroundColor: theme.primaryBg }]} />
        <View style={[styles.emptyCircle2, { backgroundColor: theme.mode === 'dark' ? '#1e1b4b' : '#ddd6fe' }]} />
        <View style={[styles.emptyIconCircle, { backgroundColor: theme.primaryBg }]}>
          {search ? (
            <Search size={40} color={theme.primary} strokeWidth={1.5} />
          ) : (
            <Users size={40} color={theme.primary} strokeWidth={1.5} />
          )}
        </View>
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
  } = useClients(debouncedSearch);

  const onRefresh = useGuardedCallback(async () => {
    await refetch();
  }, [refetch]);

  const clearSearch = () => {
    setSearch('');
    searchInputRef.current?.blur();
  };

  const openDetail = useCallback((clientId: string) => {
    router.push({ pathname: '/client-detail', params: { id: clientId } });
  }, [router]);

  const isStamps = merchant?.loyaltyType === 'STAMPS';

  const renderClient = useCallback(({ item }: { item: ClientListItem }) => (
    <ClientCard item={item} onPress={() => openDetail(item.id)} theme={theme} isStamps={isStamps} />
  ), [openDetail, theme, isStamps]);

  const keyExtractor = useCallback((item: ClientListItem) => item.id, []);

  const showSkeleton = loading && clients.length === 0 && !search;

  return (
    <RNAnimated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
      {/* ── Header (single instance to avoid Fabric reparenting crash) ── */}
      <View collapsable={false}>
        <LinearGradient
          colors={[...brandGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.header, { paddingTop: insets.top + 12 }]}
        >
          <View>
            <Text style={styles.headerTitle}>{t('clients.title')}</Text>
            <Text style={styles.headerSub}>{t('clients.subtitle')}</Text>
          </View>
        </LinearGradient>
      </View>

      {showSkeleton ? (
        <ClientListSkeleton count={7} />
      ) : (
      /* ── List ── */
      <FlatList
        data={clients}
        renderItem={renderClient}
        keyExtractor={keyExtractor}
        getItemLayout={(_data, index) => ({ length: 61, offset: 61 * index, index })}
        contentContainerStyle={styles.list}
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={10}
        windowSize={7}
        initialNumToRender={10}
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
              <Search size={18} color={palette.violet} />
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
        ListEmptyComponent={<EmptyState search={search} theme={theme} onScan={() => router.push('/scan-qr')} />}
      />
      )}
    </RNAnimated.View>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pendingBannerText: { fontSize: 13, fontWeight: '600', color: '#7C3AED', fontFamily: 'Inter_600SemiBold' },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_700Bold' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,.7)', marginTop: 4, fontFamily: 'Lexend_500Medium' },

  // ── Search ──
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 6,
    elevation: 3,
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
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

  // ── List ──
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 130 },

  // ── Compact Row ──
  cardOuter: { marginBottom: 0 },
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_700Bold' },
  clientInfo: { flex: 1, marginRight: 8 },
  clientName: { fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  pointsValue: { fontSize: 13, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  pointsLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', fontFamily: 'Lexend_500Medium' },

  // ── Empty State ──
  emptyContainer: { alignItems: 'center', paddingTop: 50 },
  emptyIllustration: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyCircle1: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    opacity: 0.5,
  },
  emptyCircle2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    opacity: 0.7,
    top: 5,
    left: 5,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, fontFamily: 'Lexend_600SemiBold' },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
    lineHeight: 20,
    fontFamily: 'Lexend_500Medium',
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
});
