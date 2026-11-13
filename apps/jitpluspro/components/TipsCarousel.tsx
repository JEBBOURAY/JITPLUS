import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'expo-router';
import PromoBanner, { PROMO_BANNER_OVERFLOW } from '@/components/home/PromoBanner';
import WhyLoyaltySheet from '@/components/home/WhyLoyaltySheet';
import ClientAppPitchSheet from '@/components/home/ClientAppPitchSheet';
import ClientShareSheet from '@/components/home/ClientShareSheet';
import GamesGuideSheet from '@/components/home/GamesGuideSheet';
import DealsGuideSheet from '@/components/home/DealsGuideSheet';
import {
  LanternIcon,
  StarBadgeIcon,
  TajineIcon,
  TeapotIcon,
  WheelIcon,
  type PromoIcon,
} from '@/components/home/PromoIcons';
import { PROMO_TONES, type PromoTone } from '@/components/home/promoTones';
import { useAfterSheetClosed } from '@/components/home/useAfterSheetClosed';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import { useAuthStore } from '@/stores/authStore';

const CARD_GAP = 12;
const H_PAD = 16; // matches the Accueil content horizontal padding
const NEXT_PEEK = 16; // how much of the next card peeks on the right

interface PromoCardDef {
  key: string;
  labelKey: string;
  titleKey: string;
  ctaKey: string;
  /** Accent, shared with the sheet the banner opens. */
  tone: PromoTone;
  Icon: PromoIcon;
}

// Data-driven: add an entry here to add a banner to the carousel.
// The order is the merchant's learning path: understand why loyalty pays, get
// customers on the client app, then animate with games (which need customers
// who already have the app) and deals.
const PROMO_CARDS: readonly PromoCardDef[] = [
  {
    key: 'why',
    labelKey: 'home.promoWhyLabel',
    titleKey: 'home.promoWhyTitle',
    ctaKey: 'home.promoWhyCta',
    tone: 'orange',
    Icon: LanternIcon,
  },
  {
    key: 'client',
    labelKey: 'home.promoClientLabel',
    titleKey: 'home.promoClientTitle',
    ctaKey: 'home.promoClientCta',
    tone: 'emerald',
    Icon: TeapotIcon,
  },
  {
    key: 'share',
    labelKey: 'home.promoShareLabel',
    titleKey: 'home.promoShareTitle',
    ctaKey: 'home.promoShareCta',
    tone: 'sky',
    Icon: TajineIcon,
  },
  {
    key: 'games',
    labelKey: 'home.promoGamesLabel',
    titleKey: 'home.promoGamesTitle',
    ctaKey: 'home.promoGamesCta',
    tone: 'pink',
    Icon: WheelIcon,
  },
  {
    key: 'deals',
    labelKey: 'home.promoDealsLabel',
    titleKey: 'home.promoDealsTitle',
    ctaKey: 'home.promoDealsCta',
    tone: 'violet',
    Icon: StarBadgeIcon,
  },
];

/**
 * Help carousel with snap scrolling.
 * Opened cards are remembered (AsyncStorage) and move to the end of the
 * carousel.
 */
function TipsCarousel() {
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const [activeIndex, setActiveIndex] = useState(0);
  const [readKeys, setReadKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [whyVisible, setWhyVisible] = useState(false);
  const [clientBenefitsVisible, setClientBenefitsVisible] = useState(false);
  const [clientShareVisible, setClientShareVisible] = useState(false);
  const [gamesVisible, setGamesVisible] = useState(false);
  const [dealsVisible, setDealsVisible] = useState(false);

  const cardW = winW - H_PAD * 2 - NEXT_PEEK;
  const interval = cardW + CARD_GAP;

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(ASYNC_STORAGE_KEYS.PROMO_CARDS_READ)
      .then((raw) => {
        if (!active || !raw) return;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setReadKeys(new Set(parsed.filter((k): k is string => typeof k === 'string')));
          }
        } catch {
          // Corrupted value: start fresh.
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const openWhy = useCallback(() => setWhyVisible(true), []);
  const closeWhy = useCallback(() => setWhyVisible(false), []);
  const handleConfigureWhy = useCallback(() => {
    setWhyVisible(false);
    router.push('/settings' as never);
  }, [router]);
  const openClientBenefits = useCallback(() => setClientBenefitsVisible(true), []);
  const closeClientBenefits = useCallback(() => setClientBenefitsVisible(false), []);
  const openClientShare = useCallback(() => setClientShareVisible(true), []);
  const closeClientShare = useCallback(() => setClientShareVisible(false), []);
  const openGames = useCallback(() => setGamesVisible(true), []);
  const closeGames = useCallback(() => setGamesVisible(false), []);
  const handleStartGames = useCallback(() => {
    setGamesVisible(false);
    router.push('/games' as never);
  }, [router]);

  const openDeals = useCallback(() => setDealsVisible(true), []);
  const closeDeals = useCallback(() => setDealsVisible(false), []);
  const handleCreateDeal = useCallback(() => {
    setDealsVisible(false);
    router.push('/deals/create' as never);
  }, [router]);

  const openers = useMemo<Record<string, () => void>>(() => ({
    why: openWhy,
    games: openGames,
    client: openClientBenefits,
    share: openClientShare,
    deals: openDeals,
  }), [openWhy, openGames, openClientBenefits, openClientShare, openDeals]);

  const markRead = useCallback((key: string) => {
    setReadKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev).add(key);
      AsyncStorage.setItem(ASYNC_STORAGE_KEYS.PROMO_CARDS_READ, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  // One stable handler per card so the memoized banners skip re-renders while scrolling.
  const pressHandlers = useMemo<Record<string, () => void>>(
    () => Object.fromEntries(
      PROMO_CARDS.map((c) => [c.key, () => {
        markRead(c.key);
        openers[c.key]?.();
      }]),
    ),
    [markRead, openers],
  );

  const afterSheetClosed = useAfterSheetClosed();

  const handlePitchShare = useCallback(() => {
    setClientBenefitsVisible(false);
    markRead('share');
    afterSheetClosed(() => setClientShareVisible(true));
  }, [markRead, afterSheetClosed]);

  // Unread banners first; opened ones slide to the end of the carousel.
  const orderedCards = useMemo(
    () => [
      ...PROMO_CARDS.filter((c) => !readKeys.has(c.key)),
      ...PROMO_CARDS.filter((c) => readKeys.has(c.key)),
    ],
    [readKeys],
  );

  const clampedIndex = Math.min(activeIndex, orderedCards.length - 1);
  const activeCard = orderedCards[clampedIndex];
  const activeTint = activeCard ? PROMO_TONES[activeCard.tone].fill : theme.primary;

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = Math.round(e.nativeEvent.contentOffset.x / interval);
      const idx = Math.max(0, Math.min(orderedCards.length - 1, raw));
      setActiveIndex(idx);
    },
    [interval, orderedCards.length],
  );

  const sheets = (
    <>
      <WhyLoyaltySheet
        visible={whyVisible}
        onClose={closeWhy}
        onConfigure={isTeamMember ? undefined : handleConfigureWhy}
      />

      <GamesGuideSheet visible={gamesVisible} onClose={closeGames} onStart={handleStartGames} />

      <ClientAppPitchSheet
        visible={clientBenefitsVisible}
        onClose={closeClientBenefits}
        onShare={handlePitchShare}
      />

      <ClientShareSheet visible={clientShareVisible} onClose={closeClientShare} />

      <DealsGuideSheet
        visible={dealsVisible}
        onClose={closeDeals}
        onCreate={isTeamMember ? undefined : handleCreateDeal}
      />
    </>
  );

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={interval}
        snapToAlignment="start"
        disableIntervalMomentum
        directionalLockEnabled
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.track}
      >
        {orderedCards.map((c) => (
          <View key={c.key} style={styles.cardSlot}>
            <PromoBanner
              label={t(c.labelKey)}
              title={t(c.titleKey)}
              cta={t(c.ctaKey)}
              tone={c.tone}
              Icon={c.Icon}
              read={readKeys.has(c.key)}
              readA11yLabel={t('home.promoReadA11y')}
              width={cardW}
              onPress={pressHandlers[c.key]}
            />
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {orderedCards.map((c, i) => (
          <View
            key={c.key}
            style={[
              styles.dot,
              i === clampedIndex
                ? { width: 18, backgroundColor: activeTint }
                : { width: 6, backgroundColor: theme.border },
            ]}
          />
        ))}
      </View>

      {sheets}
    </View>
  );
}

export default React.memo(TipsCarousel);

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -H_PAD },
  track: { paddingHorizontal: H_PAD, paddingTop: PROMO_BANNER_OVERFLOW + 4, paddingBottom: 4 },
  cardSlot: { marginRight: CARD_GAP },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 12 },
  dot: { height: 6, borderRadius: 3 },
});
