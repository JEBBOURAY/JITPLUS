import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Keyboard, TextInput, FlatList } from 'react-native';
import { haptic } from '@/utils/haptics';
import { useStampsOverview, useNotifications, useLuckyWheelAvailableDraws } from '@/hooks/useQueryHooks';
import { prefetchImages } from '@/utils/imageCache';
import { FOCUS_DELAY_MS } from '@/constants';

export function useHomeData(client: { prenom?: string | null } | null) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── React Query ──
  const {
    data: stampsData,
    isLoading,
    isError: loadError,
    refetch,
    isRefetching,
  } = useStampsOverview(!!client);

  const { data: luckyWheelTickets = [] } = useLuckyWheelAvailableDraws(!!client);
  const { data: notifData } = useNotifications(!!client);

  // Prefetch merchant logos
  useEffect(() => {
    if (stampsData?.cards?.length) {
      prefetchImages(stampsData.cards.map((c) => c.merchant?.logoUrl));
    }
  }, [stampsData]);

  const toggleSearch = useCallback(() => {
    haptic();
    setShowSearch((v) => {
      if (!v) setTimeout(() => searchInputRef.current?.focus(), FOCUS_DELAY_MS);
      else { setSearchQuery(''); Keyboard.dismiss(); }
      return !v;
    });
  }, []);

  // ── Search, most recently used first ──
  const cards = useMemo(() => {
    const rawCards = stampsData?.cards ?? [];
    const q = debouncedSearch.toLowerCase();
    const filtered = q
      ? rawCards.filter((c) =>
        c.merchant?.nomBoutique?.toLowerCase().includes(q) ||
        c.merchant?.categorie?.toLowerCase().includes(q))
      : [...rawCards];
    return filtered.sort((a, b) =>
      new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  }, [stampsData?.cards, debouncedSearch]);

  return {
    showSearch,
    searchQuery,
    debouncedSearch,
    searchInputRef,
    flatListRef,

    stampsData,
    isLoading,
    loadError,
    isRefetching,
    luckyWheelTickets,
    notifData,
    cards,

    setSearchQuery,
    refetch,
    toggleSearch,
  };
}
