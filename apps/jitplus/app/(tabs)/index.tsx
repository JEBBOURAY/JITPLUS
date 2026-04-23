import React, { useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet, Animated,
  TouchableOpacity, ScrollView, TextInput, Keyboard, Pressable, I18nManager,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { LinearGradient } from 'expo-linear-gradient';
import { CreditCard, AlertCircle, Clock, Gift, MapPin, Trophy, Shuffle, Search, SlidersHorizontal, X, Sparkles, Bell } from 'lucide-react-native';
import { haptic, HapticStyle } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useExitOnBack } from '@/hooks/useExitOnBack';
import GuestGuard from '@/components/GuestGuard';
import { useLanguage } from '@/contexts/LanguageContext';
import { LoyaltyCard } from '@/types';
import { useRouter } from 'expo-router';
import FadeInView from '@/components/FadeInView';
import ReferralPopup from '@/components/home/ReferralPopup';
import LuckyWheelModal from '@/components/LuckyWheelModal';
import LuckyWheelIcon from '@/components/LuckyWheelIcon';
import Skeleton from '@/components/Skeleton';
import { CATEGORIES, getCategoryEmoji } from '@/utils/categories';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import CardItem from '@/components/home/CardItem';
import { useHomeData, type SortMode } from '@/hooks/useHomeData';
import { useHomeBanners } from '@/hooks/useHomeBanners';

const GRADIENT_VIOLET = [palette.violetDark, palette.violet] as const;
const GRADIENT_EMERALD = ['#10B981', '#059669'] as const;
const GRADIENT_H_START = { x: 0, y: 0 } as const;
const GRADIENT_H_END = { x: 1, y: 0 } as const;

const SORT_OPTIONS: { key: SortMode; labelKey: string; icon: typeof Clock }[] = [
  { key: 'recent', labelKey: 'home.sortRecent', icon: Clock },
  { key: 'closest', labelKey: 'home.sortNearby', icon: MapPin },
  { key: 'points', labelKey: 'home.sortPoints', icon: Trophy },
  { key: 'random', labelKey: 'home.sortLuckyWheel', icon: Shuffle },
];

export default function HomeScreen() {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client, isGuest } = useAuth();

  useExitOnBack(true, t('common.pressBackToExit'));

  const homeData = useHomeData(client);
  const banners = useHomeBanners(client, homeData.notifData, homeData.luckyWheelTickets);

  const handleRefresh = useGuardedCallback(async () => {
    haptic();
    await homeData.refetch();
  }, [homeData.refetch]);

  const handleCardPress = useCallback((merchantId: string) => {
    haptic(HapticStyle.Medium);
    router.push({ pathname: '/merchant/[id]', params: { id: merchantId } });
  }, [router]);

  const handleLuckyWheelOpen = useCallback(() => {
    haptic(HapticStyle.Medium);
    banners.setShowLuckyWheel(true);
  }, [banners.setShowLuckyWheel]);

  const handleLuckyWheelClose = useCallback(() => {
    banners.setShowLuckyWheel(false);
  }, [banners.setShowLuckyWheel]);

  const renderCard = useCallback(({ item: card, index }: { item: LoyaltyCard; index: number }) => (
    <CardItem
      card={card}
      t={t}
      locale={locale}
      searchHighlight={homeData.debouncedSearch}
      isClosest={homeData.sortMode === 'closest' && index === 0 && !!homeData.userLocation}
      theme={theme}
      onPress={handleCardPress}
    />
  ), [handleCardPress, t, locale, homeData.debouncedSearch, homeData.sortMode, homeData.userLocation, theme]);

  const keyExtractor = useCallback((item: LoyaltyCard) => item.id, []);

  const firstName = client?.prenom || 'Client';

  const listHeader = useMemo(() => (
    <>
      {banners.showWelcome && (
        <Animated.View style={[styles.welcomeBanner, {
          opacity: banners.welcomeAnim,
          transform: [{ translateY: banners.welcomeAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
        }]}>
          <LinearGradient colors={GRADIENT_VIOLET} start={GRADIENT_H_START} end={GRADIENT_H_END} style={styles.welcomeGradient}>
            <Sparkles size={ms(16)} color="#fff" />
            <Text style={styles.welcomeText}>{t('home.welcomeBack', { name: firstName })}</Text>
          </LinearGradient>
        </Animated.View>
      )}

      {homeData.loadError && !homeData.isLoading && (
        <FadeInView delay={100}>
          <TouchableOpacity
            style={[styles.errorBanner, { backgroundColor: `${theme.danger}10`, borderColor: `${theme.danger}20` }]}
            onPress={() => homeData.refetch()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('home.reloadAccessibility')}
          >
            <AlertCircle size={ms(16)} color={theme.danger} strokeWidth={2} />
            <Text style={[styles.errorBannerText, { color: theme.danger }]}>{t('home.loadError')}</Text>
          </TouchableOpacity>
        </FadeInView>
      )}

      {homeData.isLoading && (
        <FadeInView delay={350}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={[styles.cardSkeleton, { backgroundColor: theme.bgCard }]}>
              <Skeleton width={ms(48)} height={ms(48)} borderRadius={ms(16)} />
              <View style={{ flex: 1, marginLeft: wp(14), gap: hp(8) }}>
                <Skeleton width={wp(120)} height={hp(16)} borderRadius={6} />
                <Skeleton width={wp(80)} height={hp(12)} borderRadius={4} />
              </View>
              <Skeleton width={wp(50)} height={hp(24)} borderRadius={8} />
            </View>
          ))}
        </FadeInView>
      )}
    </>
  ), [banners.showWelcome, banners.welcomeAnim, firstName, homeData.loadError, homeData.isLoading, theme, homeData.refetch, t]);

  const listEmpty = useMemo(() => {
    if (homeData.isLoading) return null;
    const isSearchEmpty = !!homeData.debouncedSearch && homeData.cards.length === 0;
    return (
      <View style={[styles.emptyCards, { backgroundColor: theme.bgCard }]}>
        <View style={[styles.emptyIcon, { backgroundColor: `${palette.gold}15` }]}>
          {isSearchEmpty
            ? <Search size={ms(36)} color={palette.gold} strokeWidth={1.5} />
            : <CreditCard size={ms(36)} color={palette.gold} strokeWidth={1.5} />}
        </View>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          {isSearchEmpty ? t('home.noSearchResults', { query: homeData.debouncedSearch }) : t('home.noCards')}
        </Text>
        {!isSearchEmpty && (
          <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{t('home.noCardsHint')}</Text>
        )}
      </View>
    );
  }, [homeData.isLoading, theme, t, homeData.debouncedSearch, homeData.cards.length]);

  if (isGuest) return <GuestGuard />;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Floating top bar */}
      <View style={[styles.topBar, { top: insets.top + ms(10) }]} pointerEvents="box-none">
        {homeData.showSearch ? (
          <View>
            <View style={[styles.searchBarExpanded, { backgroundColor: theme.bgCard, borderWidth: 1, borderColor: theme.border }]}>
              <Search size={ms(18)} color={theme.textMuted} strokeWidth={2} />
              <TextInput
                ref={homeData.searchInputRef}
                style={[styles.searchInput, { color: theme.text }]}
                placeholder={t('home.searchPlaceholder')}
                placeholderTextColor={theme.textMuted}
                value={homeData.searchQuery} onChangeText={homeData.setSearchQuery}
                returnKeyType="search" autoFocus
              />
              {homeData.debouncedSearch ? (
                <Text style={[styles.searchCount, { color: palette.violet }]}>{homeData.cards.length}</Text>
              ) : null}
              <Pressable onPress={homeData.toggleSearch} hitSlop={8}>
                <View style={[styles.closePill, { backgroundColor: theme.bgElevated }]}>
                  <X size={ms(14)} color={theme.textMuted} strokeWidth={2} />
                </View>
              </Pressable>
            </View>
            {homeData.searchQuery.length > 0 && homeData.searchSuggestions.length > 0 && (
              <View style={[styles.suggestionsBox, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                {homeData.searchSuggestions.map((s) => {
                  const name = s.name;
                  const q = homeData.searchQuery.toLowerCase();
                  const idx = name.toLowerCase().indexOf(q);
                  return (
                    <Pressable
                      key={s.id}
                      style={({ pressed }) => [styles.suggestionRow, pressed && { backgroundColor: `${palette.violet}08` }]}
                      onPress={() => homeData.handleSuggestionTap(name)}
                    >
                      <Search size={ms(13)} color={theme.textMuted} strokeWidth={1.5} />
                      <Text style={[styles.suggestionText, { color: theme.text }]} numberOfLines={1}>
                        {idx >= 0 ? (
                          <>
                            {name.slice(0, idx)}
                            <Text style={{ color: palette.violet, fontWeight: '700' }}>{name.slice(idx, idx + homeData.searchQuery.length)}</Text>
                            {name.slice(idx + homeData.searchQuery.length)}
                          </>
                        ) : name}
                      </Text>
                      {s.category && (
                        <Text style={[styles.suggestionCategory, { color: theme.textMuted }]}>{getCategoryEmoji(s.category)}</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.topButtons}>
            <TouchableOpacity
              style={[styles.floatingBtn, { backgroundColor: theme.bgCard, borderWidth: 1, borderColor: theme.border }]}
              activeOpacity={0.8}
              onPress={homeData.toggleSearch}
              accessibilityRole="button"
              accessibilityLabel={t('home.searchPlaceholder')}
            >
              <Search size={ms(20)} color={theme.text} strokeWidth={2} />
            </TouchableOpacity>
            <View style={[styles.counterBadge, { backgroundColor: theme.bgCard, borderWidth: 1, borderColor: theme.border }]}>
              <CreditCard size={ms(13)} color={palette.violet} strokeWidth={2} />
              <Text style={[styles.counterText, { color: theme.text }]}>{t('home.cardCount', { count: homeData.cards.length })}</Text>
            </View>
            <TouchableOpacity
              style={[styles.floatingBtn, { backgroundColor: homeData.showFilters ? palette.violet : theme.bgCard, borderWidth: homeData.showFilters ? 0 : 1, borderColor: theme.border }]}
              activeOpacity={0.8} onPress={homeData.toggleFilters}
              accessibilityRole="button"
              accessibilityLabel={t('home.searchPlaceholder')}
              accessibilityState={{ expanded: homeData.showFilters }}
            >
              <SlidersHorizontal size={ms(20)} color={homeData.showFilters ? '#fff' : theme.text} strokeWidth={2} />
              {homeData.activeFilterCount > 0 && <View style={styles.filterDot} />}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Filter chips */}
      {homeData.showFilters && (
        <View style={[styles.floatingFilterBar, { top: insets.top + ms(64) }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.floatingFilterScroll, I18nManager.isRTL && { flexDirection: 'row-reverse' }]}>
            {CATEGORIES.map((cat) => {
              const isActive = homeData.selectedCategory === cat.id;
              const Icon = cat.icon;
              const count = homeData.categoryCounts[cat.id] || 0;
              return (
                <Pressable key={cat.id} onPress={() => homeData.handleCategoryChange(cat.id)} accessibilityRole="button" accessibilityState={{ selected: isActive }}>
                  <View style={[styles.chip, isActive ? { backgroundColor: palette.violet, borderColor: palette.violet } : { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                    <Icon size={ms(13)} color={isActive ? '#fff' : theme.textMuted} strokeWidth={2} />
                    <Text style={[styles.chipLabel, { color: isActive ? '#fff' : theme.text }]}>{t(cat.labelKey)}</Text>
                    {count > 0 && (
                      <View style={[styles.chipCount, { backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : `${palette.violet}15` }]}>
                        <Text style={[styles.chipCountText, { color: isActive ? '#fff' : palette.violet }]}>{count}</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.floatingFilterScroll, I18nManager.isRTL && { flexDirection: 'row-reverse' }]}>
            {SORT_OPTIONS.map(({ key, labelKey, icon: Icon }) => {
              const active = homeData.sortMode === key;
              return (
                <Pressable key={key} onPress={() => homeData.handleSortChange(key)} accessibilityRole="button" accessibilityState={{ selected: active }}>
                  <View style={[styles.chip, active ? { backgroundColor: palette.violet, borderColor: palette.violet } : { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                    <Icon size={ms(13)} color={active ? '#fff' : theme.textMuted} strokeWidth={2} />
                    <Text style={[styles.chipLabel, { color: active ? '#fff' : theme.text }]}>{t(labelKey)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Reward notification banner */}
      {banners.rewardBannerNotif && (
        <Animated.View
          style={[styles.rewardNotifBanner, {
            top: insets.top + ms(70),
            opacity: banners.rewardBannerAnim,
            transform: [{ translateY: banners.rewardBannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
          }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity activeOpacity={0.9} onPress={() => { haptic(); router.push('/(tabs)/notifications'); banners.setRewardBannerNotif(null); }}>
            <LinearGradient colors={GRADIENT_EMERALD} start={GRADIENT_H_START} end={GRADIENT_H_END} style={styles.rewardNotifGradient}>
              <Bell size={ms(15)} color="#fff" strokeWidth={2} />
              <Gift size={ms(13)} color="#fff" strokeWidth={2} />
              <Text style={styles.rewardNotifText} numberOfLines={1}>
                {banners.rewardBannerNotif.merchantName
                  ? t('home.rewardBannerWithMerchant', { name: banners.rewardBannerNotif.merchantName })
                  : t('home.rewardBannerGeneric')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}

      <FlatList
        ref={homeData.flatListRef}
        data={homeData.isLoading ? [] : homeData.cards}
        renderItem={renderCard}
        keyExtractor={keyExtractor}
        style={styles.content}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + ms(70) }]}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={<View style={{ height: hp(100) }} />}
        refreshControl={
          <RefreshControl refreshing={homeData.isRefetching} onRefresh={handleRefresh}
            tintColor={theme.primaryLight} colors={[theme.primary]} />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          // Guard against rare race when list hasn't finished layout yet
          homeData.flatListRef.current?.scrollToOffset({
            offset: index * (averageItemLength || 100),
            animated: true,
          });
        }}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={7}
        initialNumToRender={8}
      />
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />

      <ReferralPopup visible={banners.showReferral} onClose={banners.dismissReferral} />

      {client && (
        <TouchableOpacity
          onPress={handleLuckyWheelOpen}
          activeOpacity={0.85}
          style={[styles.luckyWheelFab, { bottom: insets.bottom + hp(70) }]}
          accessibilityLabel={t('luckyWheel.title')}
        >
          <Animated.View style={[styles.luckyWheelFabGradient, {
            transform: [
              { scale: banners.luckyWheelPulseAnim },
              { rotate: banners.luckyWheelSpinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
            ],
          }]}>
            <LuckyWheelIcon size={ms(44)} />
          </Animated.View>
          {homeData.luckyWheelTickets.length > 0 && (
            <View style={styles.luckyWheelFabBadge}>
              <Text style={styles.luckyWheelFabBadgeText}>{homeData.luckyWheelTickets.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      <LuckyWheelModal visible={banners.showLuckyWheel} onClose={handleLuckyWheelClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  scrollContent: { paddingHorizontal: wp(20), flexGrow: 1, justifyContent: 'center' },

  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    padding: wp(14), borderRadius: radius.md, borderWidth: 1, marginBottom: hp(20),
  },
  errorBannerText: { fontSize: fontSize.sm, fontWeight: '600', flex: 1 },

  // Skeleton
  cardSkeleton: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.lg, padding: wp(14), paddingLeft: wp(10), marginBottom: hp(12),
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
    overflow: 'hidden' as const,
  },

  // Empty
  emptyCards: {
    borderRadius: radius.xl, padding: wp(32), alignItems: 'center', gap: hp(8),
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 2,
  },
  emptyIcon: {
    width: ms(88), height: ms(88), borderRadius: ms(24),
    alignItems: 'center', justifyContent: 'center', marginBottom: hp(4),
  },
  emptyText: { fontSize: fontSize.md, fontWeight: '600' },
  emptyHint: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: ms(20) },

  // Welcome
  welcomeBanner: {
    marginHorizontal: wp(20), marginTop: -hp(8), marginBottom: hp(8),
    borderRadius: radius.lg, overflow: 'hidden',
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 3,
  },
  welcomeGradient: { flexDirection: 'row', alignItems: 'center', gap: wp(10), paddingVertical: hp(14), paddingHorizontal: wp(20) },
  welcomeText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700', letterSpacing: 0.2 },

  // Top bar
  topBar: { position: 'absolute', left: 0, right: 0, paddingHorizontal: wp(16), zIndex: 10 },
  topButtons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  floatingBtn: {
    width: ms(46), height: ms(46), borderRadius: ms(23),
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: hp(2) }, shadowRadius: 12, elevation: 3,
  },
  counterBadge: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    paddingHorizontal: wp(14), paddingVertical: hp(8), borderRadius: ms(20),
    shadowColor: '#000', shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: hp(2) }, shadowRadius: 8, elevation: 3,
  },
  counterText: { fontSize: fontSize.sm, fontWeight: '700' },
  filterDot: {
    position: 'absolute', top: ms(8), right: ms(8),
    width: ms(8), height: ms(8), borderRadius: ms(4),
    backgroundColor: '#ef4444', borderWidth: 1.5, borderColor: '#FFFFFF',
  },

  // Search
  searchBarExpanded: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: ms(25), paddingHorizontal: wp(16), height: ms(50), gap: wp(10),
    shadowColor: '#000', shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: hp(2) }, shadowRadius: 12, elevation: 3,
  },
  searchInput: { flex: 1, fontSize: fontSize.md, paddingVertical: 0 },
  searchCount: { fontSize: fontSize.xs, fontWeight: '700', minWidth: ms(20), textAlign: 'center' },
  closePill: {
    width: ms(28), height: ms(28), borderRadius: ms(14),
    backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
  },
  suggestionsBox: {
    marginTop: hp(4), borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 4,
  },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    paddingVertical: hp(11), paddingHorizontal: wp(16),
  },
  suggestionText: { flex: 1, fontSize: fontSize.sm, fontWeight: '500' },
  suggestionCategory: { fontSize: fontSize.sm },

  // Filter bar
  floatingFilterBar: { position: 'absolute', left: 0, right: 0, zIndex: 9 },
  floatingFilterScroll: { paddingHorizontal: wp(16), paddingVertical: hp(4), gap: wp(6) },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: wp(5),
    paddingHorizontal: wp(16), paddingVertical: hp(8),
    borderRadius: ms(18), borderWidth: 1, marginRight: wp(2),
    shadowColor: '#000', shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: hp(2) }, shadowRadius: 8, elevation: 2,
  },
  chipLabel: { fontSize: fontSize.xs, fontWeight: '600' },
  chipCount: {
    minWidth: ms(18), height: ms(18), borderRadius: ms(9),
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: wp(4),
  },
  chipCountText: { fontSize: ms(10), fontWeight: '700' },

  // Reward banner
  rewardNotifBanner: { position: 'absolute', left: wp(16), right: wp(16), zIndex: 20 },
  rewardNotifGradient: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(10),
    paddingVertical: hp(12), paddingHorizontal: wp(16), borderRadius: radius.lg,
    shadowColor: '#10B981', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  rewardNotifText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700', flex: 1 },

  // LuckyWheel FAB
  luckyWheelFab: {
    position: 'absolute', right: wp(20), zIndex: 30, alignItems: 'center' as const,
    width: ms(60), height: ms(60), borderRadius: ms(30),
    shadowColor: palette.violet, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  luckyWheelFabGradient: {
    width: ms(60), height: ms(60), borderRadius: ms(30), backgroundColor: '#FFF',
    alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const,
  },
  luckyWheelFabBadge: {
    position: 'absolute' as const, top: -ms(2), right: -ms(2),
    minWidth: ms(20), height: ms(20), borderRadius: ms(10),
    backgroundColor: palette.red, alignItems: 'center' as const, justifyContent: 'center' as const,
    paddingHorizontal: ms(4), borderWidth: 2, borderColor: '#fff',
  },
  luckyWheelFabBadgeText: { color: '#fff', fontSize: ms(10), fontWeight: '800' },
});
