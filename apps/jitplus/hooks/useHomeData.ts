import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Keyboard, TextInput, FlatList } from 'react-native';
import * as Location from 'expo-location';
import { haptic, HapticStyle } from '@/utils/haptics';
import { usePointsOverview, useNotifications, useLuckyWheelAvailableDraws } from '@/hooks/useQueryHooks';
import { getDistanceSafe } from '@/utils/distance';
import { prefetchImages } from '@/utils/imageCache';
import { LoyaltyCard } from '@/types';
import { FOCUS_DELAY_MS } from '@/constants';

type SortMode = 'recent' | 'closest' | 'points' | 'random';

export { type SortMode };

export function useHomeData(client: { prenom?: string | null } | null) {
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [randomSeed, setRandomSeed] = useState(1);
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Simple seeded PRNG (mulberry32)
  const seededRandom = useCallback((seed: number) => {
    let t = seed + 0x6D2B79F5;
    return () => {
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, []);

  // ── React Query ──
  const {
    data: pointsData,
    isLoading,
    isError: loadError,
    refetch,
    isRefetching,
  } = usePointsOverview(!!client);

  const { data: luckyWheelTickets = [] } = useLuckyWheelAvailableDraws(!!client);
  const { data: notifData } = useNotifications(!!client);

  // Prefetch merchant logos
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
        if (cancelled) return;
        if (status !== 'granted') {
          // Permission denied: revert to 'recent' so the sort chip doesn't
          // stay "stuck" on an unusable state (Play Store UX / A11y best practice).
          setSortMode('recent');
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        if (!cancelled) setSortMode('recent');
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
      if (!v) setTimeout(() => searchInputRef.current?.focus(), FOCUS_DELAY_MS);
      else { setSearchQuery(''); Keyboard.dismiss(); }
      return !v;
    });
  }, []);

  const toggleFilters = useCallback(() => {
    haptic();
    setShowFilters((v) => !v);
  }, []);

  const activeFilterCount = selectedCategory !== 'all' ? 1 : 0;

  // ── Predictive search suggestions ──
  const searchSuggestions = useMemo(() => {
    if (!searchQuery || searchQuery.length < 1) return [];
    const q = searchQuery.toLowerCase();
    const rawCards = pointsData?.cards ?? [];
    const seen = new Set<string>();
    return rawCards
      .filter((c) => {
        const name = c.merchant?.nomBoutique;
        if (!name || seen.has(name)) return false;
        const match = name.toLowerCase().includes(q) ||
          c.merchant?.categorie?.toLowerCase().includes(q);
        if (match) seen.add(name);
        return match;
      })
      .slice(0, 5)
      .map((c) => ({ id: c.merchantId, name: c.merchant!.nomBoutique, category: c.merchant?.categorie }));
  }, [searchQuery, pointsData?.cards]);

  // ── Filter cards ──
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

  // ── Category counts ──
  const categoryCounts = useMemo(() => {
    const rawCards = pointsData?.cards ?? [];
    const counts: Record<string, number> = { all: rawCards.length };
    for (const c of rawCards) {
      const cat = c.merchant?.categorie;
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [pointsData?.cards]);

  // ── Sort cards ──
  const cards = useMemo(() => {
    if (!filteredCards.length) return filteredCards;
    const sorted = [...filteredCards];

    switch (sortMode) {
      case 'recent':
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

  const handleSuggestionTap = useCallback((name: string) => {
    haptic();
    setSearchQuery(name);
    setDebouncedSearch(name);
    Keyboard.dismiss();
    const idx = cards.findIndex((c) => c.merchant?.nomBoutique === name);
    if (idx >= 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({ index: idx, animated: true, viewOffset: 80 });
    }
  }, [cards]);

  return {
    // State
    sortMode,
    selectedCategory,
    userLocation,
    showSearch,
    showFilters,
    searchQuery,
    debouncedSearch,
    searchInputRef,
    flatListRef,
    activeFilterCount,

    // Data
    pointsData,
    isLoading,
    loadError,
    isRefetching,
    luckyWheelTickets,
    notifData,
    cards,
    categoryCounts,
    searchSuggestions,

    // Setters
    setSearchQuery,

    // Actions
    refetch,
    handleSortChange,
    handleCategoryChange,
    toggleSearch,
    toggleFilters,
    handleSuggestionTap,
  };
}
