import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet, Animated, Easing, Platform,
  TouchableOpacity, Image as RNImage, ScrollView, TextInput, Keyboard, Pressable, I18nManager,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { LinearGradient } from 'expo-linear-gradient';
import { CreditCard, AlertCircle, ChevronRight, Gift, Coins, Clock, MapPin, Trophy, Shuffle, Search, SlidersHorizontal, X, Sparkles, Bell } from 'lucide-react-native';
import { haptic, HapticStyle } from '@/utils/haptics';
import * as Location from 'expo-location';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useExitOnBack } from '@/hooks/useExitOnBack';
import GuestGuard from '@/components/GuestGuard';
import { useLanguage } from '@/contexts/LanguageContext';
import { LoyaltyCard, ClientNotification } from '@/types';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FadeInView from '@/components/FadeInView';
import GlassCard from '@/components/GlassCard';
import Skeleton from '@/components/Skeleton';
import { getCategoryEmoji, CATEGORIES } from '@/utils/categories';
import { getDistanceSafe } from '@/utils/distance';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePointsOverview, useNotifications } from '@/hooks/useQueryHooks';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { resolveImageUrl } from '@/utils/imageUrl';
import { prefetchImages } from '@/utils/imageCache';
import { timeAgo } from '@/utils/date';

type SortMode = 'recent' | 'closest' | 'points' | 'random';

const SORT_OPTIONS: { key: SortMode; labelKey: string; icon: typeof Clock }[] = [
  { key: 'recent', labelKey: 'home.sortRecent', icon: Clock },
  { key: 'closest', labelKey: 'home.sortNearby', icon: MapPin },
  { key: 'points', labelKey: 'home.sortPoints', icon: Trophy },
  { key: 'random', labelKey: 'home.sortTombola', icon: Shuffle },
];

// ── Next-milestone helper for POINTS cards with no configured reward ──
function getNextMilestone(pts: number): number {
  const milestones = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  return milestones.find((m) => m > pts) ?? Math.ceil((pts + 1) / 1000) * 1000;
}

// ── Memoized card component for FlatList performance ──
const CardItem = React.memo(function CardItem({
  card,
  onPress,
  t,
  isClosest,
  locale,
}: {
  card: LoyaltyCard;
  onPress: () => void;
  t: (scope: string, options?: Record<string, unknown>) => string;
  isClosest?: boolean;
  locale?: string;
}) {
  const theme = useTheme();
  const isStamps = card.merchant?.loyaltyType === 'STAMPS';
  const isMerchantUnavailable = !card.merchant?.id || !card.merchant?.nomBoutique;
  const [logoError, setLogoError] = useState(false);

  // Defensive: backend should always return a number, but guard against null/undefined
  const balance = card.balance ?? 0;

  // ── STAMPS ──
  const goal = card.merchant?.stampsForReward || 10;
  const stampsEarned = Math.min(balance, goal);
  const stampsRemaining = Math.max(0, goal - stampsEarned);
  const stampsComplete = stampsEarned >= goal;

  // ── POINTS ──
  const minRewardCost = card.merchant?.minRewardCost;
  const nextTarget = minRewardCost || getNextMilestone(balance);
  const pointsProgress = Math.min(balance / nextTarget, 1);
  const pointsPct = Math.round(pointsProgress * 100);
  const pointsComplete = balance >= nextTarget;

  // Animated progress bar — re-runs when balance changes
  const progressAnim = useRef(new Animated.Value(0)).current;
  const animTarget = isStamps ? stampsEarned / goal : pointsProgress;
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: animTarget,
      duration: 700,
      delay: 150,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animTarget]);

  // Max 20 stamp dots shown; extras are mentioned as "+N"
  const visibleStamps = Math.min(goal, 20);
  const stampDots = useMemo(
    () => Array.from({ length: visibleStamps }, (_, i) => i < stampsEarned),
    [visibleStamps, stampsEarned],
  );

  const lastScanLabel = useMemo(
    () => timeAgo(card.updatedAt || card.createdAt, locale),
    [card.updatedAt, card.createdAt, locale],
  );

  return (
    <GlassCard onPress={onPress}>
      <View
        style={[styles.cardItem, { backgroundColor: theme.bgCard }]}
        accessibilityRole="button"
        accessibilityLabel={t('home.cardAccessibility', { name: card.merchant?.nomBoutique || t('common.shop') })}
      >
        {/* ── Premium accent bar ── */}
        <LinearGradient
          colors={[palette.violetDark, palette.violet]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.accentBar}
        />

        {/* ── Logo ── */}
        <View style={[styles.cardIcon, { backgroundColor: theme.primaryBg }]}>
          {card.merchant?.logoUrl && !logoError ? (
            <Image
              source={resolveImageUrl(card.merchant.logoUrl)}
              style={styles.merchantLogo}
              contentFit="cover"
              cachePolicy="disk"
              recyclingKey={card.merchant.logoUrl}
              onError={() => setLogoError(true)}
            />
          ) : (
            <Text style={styles.cardEmoji}>{getCategoryEmoji(card.merchant?.categorie)}</Text>
          )}
        </View>

        {/* ── Card body ── */}
        <View style={styles.cardInfo}>
          {/* Name row */}
          <View style={styles.cardNameRow}>
            <Text style={[styles.cardName, { color: theme.text }]} numberOfLines={1}>
              {isMerchantUnavailable ? t('home.unavailableMerchantName') : (card.merchant?.nomBoutique || t('common.shop'))}
            </Text>
            <RNImage
              source={require('@/assets/images/jitpluslogo.png')}
              style={styles.cardLogo}
              resizeMode="contain"
            />
          </View>
          {/* Nearest badge */}
          {isClosest && (
            <View style={[styles.closestBadge, { backgroundColor: `${palette.emerald}18` }]}>
              <MapPin size={ms(9)} color={palette.emerald} strokeWidth={1.5} />
              <Text style={[styles.closestBadgeText, { color: palette.emerald }]}>
                {t('home.nearestBadge')}
              </Text>
            </View>
          )}

          {isMerchantUnavailable ? (
            <View style={[styles.unavailableBanner, { backgroundColor: `${theme.danger}10` }]}>
              <AlertCircle size={ms(12)} color={theme.danger} strokeWidth={1.8} />
              <Text style={[styles.unavailableText, { color: theme.danger }]}>
                {t('home.unavailableMerchantMessage')}
              </Text>
            </View>
          ) : isStamps ? (
            /* ── STAMPS: visual circle grid ── */
            <>
              <View style={styles.stampsGrid}>
                {stampDots.map((filled, i) => {
                  const hasLogo = !!card.merchant?.logoUrl && !logoError;
                  if (hasLogo) {
                    return (
                      <View
                        key={i}
                        style={[
                          styles.stampDot,
                          {
                            borderColor: filled ? palette.violet : theme.borderLight,
                            backgroundColor: filled ? theme.bgElevated : theme.bgCard,
                          },
                        ]}
                      >
                        <Image
                          source={resolveImageUrl(card.merchant!.logoUrl!)}
                          style={[styles.stampLogo, { opacity: filled ? 1 : 0.18 }]}
                          contentFit="cover"
                          cachePolicy="disk"
                        />
                      </View>
                    );
                  }
                  return (
                    <View
                      key={i}
                      style={[
                        styles.stampDot,
                        filled
                          ? { backgroundColor: palette.violet, borderColor: palette.violet }
                          : { backgroundColor: 'transparent', borderColor: theme.borderLight },
                      ]}
                    >
                      {filled && <Text style={styles.stampCheck}>✓</Text>}
                    </View>
                  );
                })}
                {goal > 20 && (
                  <Text style={[styles.stampsExtra, { color: theme.textMuted }]}>+{goal - 20}</Text>
                )}
              </View>

              {stampsComplete ? (
                <View style={[styles.rewardBanner, { backgroundColor: `${palette.emerald}22` }]}>
                  <Text style={[styles.rewardBannerText, { color: palette.emerald }]}>
                    {t('home.rewardReady')}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.stampsMeta, { color: theme.textMuted }]}>
                  {t('home.stampsRemaining', { count: stampsRemaining })}
                </Text>
              )}
            </>
          ) : (
            /* ── POINTS: animated progress bar ── */
            <>
              <View style={styles.pointsTopRow}>
                <View style={styles.pointsValueRow}>
                  <Coins size={ms(12)} color={palette.violet} strokeWidth={1.5} />
                  <Text style={[styles.pointsValue, { color: palette.violet }]}>
                    {balance.toLocaleString('fr-MA')} pts
                  </Text>
                </View>
                {pointsComplete ? (
                  <View style={[styles.rewardBadge, { backgroundColor: `${palette.emerald}22` }]}>
                    <Text style={[styles.rewardBadgeText, { color: palette.emerald }]}>
                      {t('home.rewardReady')}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.pointsPct, { color: theme.textMuted }]}>{pointsPct}%</Text>
                )}
              </View>

              <View style={[styles.pointsBar, { backgroundColor: theme.borderLight }]}>
                <Animated.View
                  style={[
                    styles.pointsBarFill,
                    {
                      width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                      backgroundColor: pointsComplete ? palette.emerald : palette.violet,
                    },
                  ]}
                />
              </View>

              {!pointsComplete && (
                <Text style={[styles.pointsTargetLabel, { color: theme.textMuted }]} numberOfLines={1}>
                  {minRewardCost
                    ? t('home.pointsProgress', {
                        current: balance.toLocaleString('fr-MA'),
                        target: nextTarget.toLocaleString('fr-MA'),
                      })
                    : t('home.pointsMilestone', { target: nextTarget.toLocaleString('fr-MA') })}
                </Text>
              )}
            </>
          )}
          {/* Last scan */}
          <Text style={[styles.lastScanText, { color: theme.textMuted }]}>
            {t('home.lastScan')} {lastScanLabel}
          </Text>
        </View>

        {!isMerchantUnavailable && <ChevronRight size={ms(18)} color={theme.textMuted} strokeWidth={1.5} />}
      </View>
    </GlassCard>
  );
});

export default function HomeScreen() {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client, isGuest } = useAuth();

  // Android: "press back again to exit" on the home tab
  useExitOnBack();

  const [showWelcome, setShowWelcome] = useState(false);
  const welcomeAnim = useRef(new Animated.Value(0)).current;
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [randomSeed, setRandomSeed] = useState(1);
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchInputRef = useRef<TextInput>(null);

  // Debounce search to avoid re-filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Simple seeded PRNG (mulberry32) — deterministic for a given seed
  const seededRandom = useCallback((seed: number) => {
    let t = seed + 0x6D2B79F5;
    return () => {
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, []);

  // ── React Query for points data ──
  const {
    data: pointsData,
    isLoading,
    isError: loadError,
    refetch,
    isRefetching,
  } = usePointsOverview(!!client);

  // ── Notifications cache for reward banner ──
  const { data: notifData } = useNotifications(!!client);
  const [rewardBannerNotif, setRewardBannerNotif] = useState<ClientNotification | null>(null);
  const rewardBannerAnim = useRef(new Animated.Value(0)).current;
  const shownRewardIdsRef = useRef(new Set<string>());

  // Prefetch merchant logos once loaded
  useEffect(() => {
    if (pointsData?.cards?.length) {
      prefetchImages(pointsData.cards.map((c) => c.merchant?.logoUrl));
    }
  }, [pointsData]);

  // Request location when "closest" is selected
  useEffect(() => {
    if (sortMode !== 'closest') return;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        // silently fail — cards will stay in default order
      }
    })();
    return () => { cancelled = true; };
  }, [sortMode]);

  const handleSortChange = useCallback((mode: SortMode) => {
    haptic();
    if (mode === 'random') setRandomSeed((s) => s + 1);
    setSortMode(mode);
  }, []);

  const handleCategoryChange = useCallback((id: string) => {
    haptic();
    setSelectedCategory(id);
  }, []);

  const toggleSearch = useCallback(() => {
    haptic();
    setShowSearch((v) => {
      if (!v) setTimeout(() => searchInputRef.current?.focus(), 100);
      else { setSearchQuery(''); Keyboard.dismiss(); }
      return !v;
    });
  }, []);

  const toggleFilters = useCallback(() => {
    haptic();
    setShowFilters((v) => !v);
  }, []);

  const activeFilterCount = selectedCategory !== 'all' ? 1 : 0;

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('showWelcome').then((val) => {
        if (val === '1') {
          AsyncStorage.removeItem('showWelcome');
          setShowWelcome(true);
          Animated.sequence([
            Animated.timing(welcomeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.delay(3000),
            Animated.timing(welcomeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
          ]).start(() => setShowWelcome(false));
        }
      });
    }, [welcomeAnim])
  );

  // ── Reward notification banner on focus ──
  useFocusEffect(
    useCallback(() => {
      const notifications = notifData?.pages[0]?.notifications ?? [];
      const TWENTYFOUR_H = 24 * 60 * 60 * 1000;
      const freshReward = notifications.find(
        (n) => {
          if (n.type !== 'reward' || n.isRead || shownRewardIdsRef.current.has(n.id)) return false;
          const ts = new Date(n.createdAt).getTime();
          return !isNaN(ts) && Date.now() - ts < TWENTYFOUR_H;
        },
      );
      if (!freshReward) return;
      shownRewardIdsRef.current.add(freshReward.id);
      setRewardBannerNotif(freshReward);
      rewardBannerAnim.setValue(0);
      Animated.sequence([
        Animated.timing(rewardBannerAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(5000),
        Animated.timing(rewardBannerAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => setRewardBannerNotif(null));
    }, [notifData, rewardBannerAnim])
  );

  const handleRefresh = useGuardedCallback(async () => {
    haptic();
    await refetch();
  }, [refetch]);

  // Refetch cards when the tab regains focus (freezeOnBlur prevents auto-refetch)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const firstName = client?.prenom || 'Client';

  // ── Filter cards by category and search ──
  const filteredCards = useMemo(() => {
    const rawCards = pointsData?.cards ?? [];
    return rawCards.filter((c) => {
      const matchesCategory = selectedCategory === 'all' || c.merchant?.categorie === selectedCategory;
      const matchesSearch = !debouncedSearch ||
        c.merchant?.nomBoutique?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        c.merchant?.categorie?.toLowerCase().includes(debouncedSearch.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [pointsData?.cards, selectedCategory, debouncedSearch]);

  // ── Sort cards based on selected filter ──
  const cards = useMemo(() => {
    if (!filteredCards.length) return filteredCards;
    const sorted = [...filteredCards];

    switch (sortMode) {
      case 'recent':
        // Already sorted by updatedAt desc from backend, but let's enforce it
        sorted.sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt).getTime();
          const dateB = new Date(b.updatedAt || b.createdAt).getTime();
          return dateB - dateA;
        });
        break;

      case 'closest':
        if (userLocation) {
          sorted.sort((a, b) => {
            const distA = getDistanceSafe(userLocation.lat, userLocation.lng, a.merchant?.latitude, a.merchant?.longitude);
            const distB = getDistanceSafe(userLocation.lat, userLocation.lng, b.merchant?.latitude, b.merchant?.longitude);
            return distA - distB;
          });
        }
        break;

      case 'points':
        sorted.sort((a, b) => b.balance - a.balance);
        break;

      case 'random':
        // Fisher-Yates shuffle with seeded PRNG — stable across re-renders
        {
          const rng = seededRandom(randomSeed);
          for (let i = sorted.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
          }
        }
        break;
    }

    return sorted;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCards, sortMode, userLocation, randomSeed]);

  const handleCardPress = useCallback((merchantId: string) => {
    haptic(HapticStyle.Medium);
    router.push({ pathname: '/merchant/[id]', params: { id: merchantId } });
  }, [router]);

  const renderCard = useCallback(({ item: card, index }: { item: LoyaltyCard; index: number }) => (
    <CardItem
      card={card}
      t={t}
      locale={locale}
      isClosest={sortMode === 'closest' && index === 0 && !!userLocation}
      onPress={() => {
        if (!card.merchant?.id || !card.merchant?.nomBoutique) return;
        handleCardPress(card.merchantId);
      }}
    />
  ), [handleCardPress, t, locale, sortMode, userLocation]);

  const keyExtractor = useCallback((item: LoyaltyCard) => item.id, []);

  const listHeader = useMemo(() => (
    <>
      {/* Welcome Banner */}
      {showWelcome && (
        <Animated.View style={[styles.welcomeBanner, {
          opacity: welcomeAnim,
          transform: [{ translateY: welcomeAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
        }]}>
          <LinearGradient colors={[palette.violetDark, palette.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.welcomeGradient}>
            <Sparkles size={ms(16)} color="#fff" />
            <Text style={styles.welcomeText}>{t('home.welcomeBack', { name: firstName })}</Text>
          </LinearGradient>
        </Animated.View>
      )}

      {/* Error Banner */}
      {loadError && !isLoading && (
        <FadeInView delay={100}>
          <TouchableOpacity
            style={[styles.errorBanner, { backgroundColor: `${theme.danger}10`, borderColor: `${theme.danger}20` }]}
            onPress={() => refetch()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('home.reloadAccessibility')}
          >
            <AlertCircle size={ms(16)} color={theme.danger} strokeWidth={1.5} />
            <Text style={[styles.errorBannerText, { color: theme.danger }]}>
              {t('home.loadError')}
            </Text>
          </TouchableOpacity>
        </FadeInView>
      )}

      {/* Skeleton loading */}
      {isLoading && (
        <FadeInView delay={350}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={[styles.cardItem, { backgroundColor: theme.bgCard }]}>
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
  ), [showWelcome, welcomeAnim, firstName, loadError, isLoading, theme, refetch, t]);

  const listEmpty = useMemo(() => {
    if (isLoading) return null;
    return (
      <View style={[styles.emptyCards, { backgroundColor: theme.bgCard }]}>
        <View style={[styles.emptyIcon, { backgroundColor: theme.primaryBg }]}>
          <CreditCard size={ms(28)} color={theme.textMuted} strokeWidth={1.5} />
        </View>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          {t('home.noCards')}
        </Text>
        <Text style={[styles.emptyHint, { color: theme.textMuted }]}>
          {t('home.noCardsHint')}
        </Text>
      </View>
    );
  }, [isLoading, theme, t]);

  // Guest users see a login prompt on this tab
  if (isGuest) return <GuestGuard />;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Floating top bar — discover style */}
      <View style={[styles.topBar, { top: insets.top + ms(10) }]} pointerEvents="box-none">
        {showSearch ? (
            <View style={[styles.searchBarExpanded, { backgroundColor: theme.bgCard, borderWidth: 1, borderColor: theme.border }]}>
            <Search size={ms(18)} color={theme.textMuted} strokeWidth={1.5} />
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, { color: theme.text }]}
              placeholder={t('home.searchPlaceholder')}
              placeholderTextColor={theme.textMuted}
              value={searchQuery} onChangeText={setSearchQuery}
              returnKeyType="search" autoFocus
            />
            <Pressable onPress={toggleSearch} hitSlop={8}>
              <View style={[styles.closePill, { backgroundColor: theme.bgElevated }]}>
                <X size={ms(14)} color={theme.textMuted} strokeWidth={1.5} />
              </View>
            </Pressable>
          </View>
        ) : (
          <View style={styles.topButtons}>
            <TouchableOpacity style={[styles.floatingBtn, { backgroundColor: theme.bgCard, borderWidth: 1, borderColor: theme.border }]} activeOpacity={0.8} onPress={toggleSearch}>
              <Search size={ms(20)} color={theme.text} strokeWidth={1.5} />
            </TouchableOpacity>
            <View style={[styles.counterBadge, { backgroundColor: theme.bgCard, borderWidth: 1, borderColor: theme.border }]}>
              <CreditCard size={ms(13)} color={palette.violet} strokeWidth={1.5} />
              <Text style={[styles.counterText, { color: theme.text }]}>
                {t('home.cardCount', { count: cards.length })}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.floatingBtn, { backgroundColor: showFilters ? palette.violet : theme.bgCard, borderWidth: showFilters ? 0 : 1, borderColor: theme.border }]}
              activeOpacity={0.8} onPress={toggleFilters}
              accessibilityRole="button"
              accessibilityLabel={t('home.searchPlaceholder')}
              accessibilityState={{ expanded: showFilters }}
            >
              <SlidersHorizontal size={ms(20)} color={showFilters ? '#fff' : theme.text} strokeWidth={1.5} />
              {activeFilterCount > 0 && <View style={styles.filterDot} />}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Filter chips — discover style */}
      {showFilters && (
        <View style={[styles.floatingFilterBar, { top: insets.top + ms(64) }]}>
          {/* Category chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.floatingFilterScroll, I18nManager.isRTL && { flexDirection: 'row-reverse' }]}>
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.id;
              const Icon = cat.icon;
              return (
                <Pressable key={cat.id} onPress={() => handleCategoryChange(cat.id)} accessibilityRole="button" accessibilityState={{ selected: isActive }}>
                  <View style={[
                    styles.chip,
                    isActive
                      ? { backgroundColor: palette.violet, borderColor: palette.violet }
                      : { backgroundColor: theme.bgCard, borderColor: theme.border },
                  ]}>
                    <Icon size={ms(13)} color={isActive ? '#fff' : theme.textMuted} strokeWidth={1.5} />
                    <Text style={[styles.chipLabel, { color: isActive ? '#fff' : theme.text }]}>
                      {t(cat.labelKey)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          {/* Sort chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.floatingFilterScroll, I18nManager.isRTL && { flexDirection: 'row-reverse' }]}>
            {SORT_OPTIONS.map(({ key, labelKey, icon: Icon }) => {
              const active = sortMode === key;
              return (
                <Pressable key={key} onPress={() => handleSortChange(key)} accessibilityRole="button" accessibilityState={{ selected: active }}>
                  <View style={[
                    styles.chip,
                    active
                      ? { backgroundColor: palette.violet, borderColor: palette.violet }
                      : { backgroundColor: theme.bgCard, borderColor: theme.border },
                  ]}>
                    <Icon size={ms(13)} color={active ? '#fff' : theme.textMuted} strokeWidth={1.5} />
                    <Text style={[styles.chipLabel, { color: active ? '#fff' : theme.text }]}>
                      {t(labelKey)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Reward notification banner ── */}
      {rewardBannerNotif && (
        <Animated.View
          style={[
            styles.rewardNotifBanner,
            {
              top: insets.top + ms(70),
              opacity: rewardBannerAnim,
              transform: [{ translateY: rewardBannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
            },
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => { haptic(); router.push('/(tabs)/notifications'); setRewardBannerNotif(null); }}
          >
            <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rewardNotifGradient}>
              <Bell size={ms(15)} color="#fff" strokeWidth={1.5} />
              <Text style={styles.rewardNotifText} numberOfLines={1}>
                {rewardBannerNotif.merchantName
                  ? `🎁 ${t('home.rewardBannerWithMerchant', { name: rewardBannerNotif.merchantName })}`
                  : `🎁 ${t('home.rewardBannerGeneric')}`}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}

      <FlatList
        data={isLoading ? [] : cards}
        renderItem={renderCard}
        keyExtractor={keyExtractor}
        style={styles.content}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + ms(70) }]}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={<View style={{ height: hp(100) }} />}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh}
            tintColor={theme.primaryLight} colors={[theme.primary]} />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={10}
        windowSize={7}
        initialNumToRender={8}
      />
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: { paddingBottom: hp(24), borderBottomLeftRadius: ms(28), borderBottomRightRadius: ms(28) },
  headerContent: { paddingHorizontal: wp(24), paddingTop: hp(8) },
  headerTitle: { fontSize: fontSize['2xl'], fontWeight: '700', color: '#fff', letterSpacing: -0.3 },

  // Content
  content: { flex: 1 },
  scrollContent: { paddingHorizontal: wp(20), flexGrow: 1, justifyContent: 'center' },

  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: wp(10),
    padding: wp(14), borderRadius: radius.md, borderWidth: 1, marginBottom: hp(20),
  },
  errorBannerText: { fontSize: fontSize.sm, fontWeight: '600', flex: 1 },

  // Cards
  cardsSection: {},
  cardItem: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.lg, padding: wp(14), paddingLeft: wp(10), marginBottom: hp(12),
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
    overflow: 'hidden' as const,
  },
  accentBar: {
    position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: ms(4),
    borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg,
  },
  cardIcon: { width: ms(50), height: ms(50), borderRadius: ms(14), alignItems: 'center', justifyContent: 'center', marginLeft: wp(4), marginRight: wp(14), overflow: 'hidden' as const },
  cardEmoji: { fontSize: ms(22) },
  merchantLogo: { width: ms(50), height: ms(50), borderRadius: ms(14) },
  cardInfo: { flex: 1 },
  cardNameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: hp(4) },
  cardName: { fontSize: fontSize.md, fontWeight: '700', letterSpacing: -0.2, flex: 1 },
  cardLogo: { width: ms(18), height: ms(18), marginLeft: wp(6), opacity: 0.4 },
  cardProgress: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(6), flexWrap: 'wrap' as const },
  cardPoints: { fontSize: fontSize.sm, fontWeight: '700' },
  progressBar: { height: ms(4), borderRadius: ms(2), flex: 1, minWidth: wp(40), maxWidth: wp(80), overflow: 'hidden' as const },
  progressFill: { height: '100%' as const, borderRadius: ms(2) },
  cardRemaining: { fontSize: fontSize.xs, fontWeight: '500' },

  // ── Stamps grid ──
  stampsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: wp(4),
    marginTop: hp(4),
    marginBottom: hp(4),
  },
  stampDot: {
    width: ms(26), height: ms(26), borderRadius: ms(13),
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden' as const,
  },
  stampLogo: { width: '100%' as const, height: '100%' as const, borderRadius: ms(12) },
  stampCheck: { color: '#fff', fontSize: ms(12), fontWeight: '700' },
  stampsExtra: { fontSize: fontSize.xs, fontWeight: '600', alignSelf: 'center' as const },
  stampsMeta: { fontSize: fontSize.xs, fontWeight: '500', marginTop: hp(1) },

  // ── Points bar ──
  pointsTopRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: hp(4),
    marginBottom: hp(5),
  },
  pointsValueRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: wp(4) },
  pointsValue: { fontSize: fontSize.sm, fontWeight: '700' },
  pointsPct: { fontSize: fontSize.xs, fontWeight: '600' },
  pointsBar: { height: ms(7), borderRadius: ms(4), overflow: 'hidden' as const, marginBottom: hp(4) },
  pointsBarFill: { height: '100%' as const, borderRadius: ms(4) },
  pointsTargetLabel: { fontSize: fontSize.xs, fontWeight: '500' },

  // ── Shared reward indicators ──
  rewardBanner: {
    marginTop: hp(4),
    paddingVertical: hp(4), paddingHorizontal: wp(10),
    borderRadius: ms(8), alignSelf: 'flex-start' as const,
  },
  rewardBannerText: { fontSize: fontSize.xs, fontWeight: '700' },
  rewardBadge: {
    paddingVertical: hp(2), paddingHorizontal: wp(8),
    borderRadius: ms(8),
  },
  rewardBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },
  unavailableBanner: {
    marginTop: hp(4),
    paddingVertical: hp(5),
    paddingHorizontal: wp(10),
    borderRadius: ms(8),
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(6),
  },
  unavailableText: { fontSize: fontSize.xs, fontWeight: '600' },

  // Empty
  emptyCards: {
    borderRadius: radius.xl, padding: wp(32), alignItems: 'center', gap: hp(8),
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 2,
  },
  emptyIcon: {
    width: ms(64), height: ms(64), borderRadius: ms(32),
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

  // Filter chips (sort — inline)
  filterScroll: { marginBottom: hp(14) },
  filterRow: { flexDirection: 'row', gap: wp(8), paddingVertical: hp(2) },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    paddingHorizontal: wp(16), paddingVertical: hp(8),
    borderRadius: ms(20), borderWidth: 1,
  },
  filterChipText: { fontSize: fontSize.sm, fontWeight: '600' },

  // ── Floating top bar (discover-style) ──
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
    paddingHorizontal: wp(14), paddingVertical: hp(8),
    borderRadius: ms(20),
    shadowColor: '#000', shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: hp(2) }, shadowRadius: 8, elevation: 3,
  },
  counterText: { fontSize: fontSize.sm, fontWeight: '700' },
  filterDot: {
    position: 'absolute', top: ms(8), right: ms(8),
    width: ms(8), height: ms(8), borderRadius: ms(4),
    backgroundColor: '#ef4444', borderWidth: 1.5, borderColor: '#FFFFFF',
  },

  // Search bar expanded
  searchBarExpanded: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: ms(25), paddingHorizontal: wp(16), height: ms(50), gap: wp(10),
    shadowColor: '#000', shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: hp(2) }, shadowRadius: 12, elevation: 3,
  },
  searchInput: { flex: 1, fontSize: fontSize.md, paddingVertical: 0 },
  closePill: {
    width: ms(28), height: ms(28), borderRadius: ms(14),
    backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
  },

  // Floating filter bar (category chips)
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

  // ── Closest badge ──
  closestBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(4),
    paddingHorizontal: wp(8),
    paddingVertical: hp(3),
    borderRadius: ms(8),
    alignSelf: 'flex-start' as const,
    marginTop: hp(2),
    marginBottom: hp(3),
  },
  closestBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },

  // ── Last scan ──
  lastScanText: { fontSize: fontSize.xs, fontWeight: '500', marginTop: hp(3), opacity: 0.75 },

  // ── Reward notification banner ──
  rewardNotifBanner: {
    position: 'absolute',
    left: wp(16),
    right: wp(16),
    zIndex: 20,
  },
  rewardNotifGradient: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(10),
    paddingVertical: hp(12),
    paddingHorizontal: wp(16),
    borderRadius: radius.lg,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  rewardNotifText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700', flex: 1 },
});
