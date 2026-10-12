import React, { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, FlatList, AccessibilityInfo, Easing,
  useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent, type AccessibilityActionEvent,
  type GestureResponderEvent, type LayoutChangeEvent, type StyleProp, type ViewStyle,
} from 'react-native';
import { ChevronsLeftRight } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import WalletCard from '@/components/home/WalletCard';
import type { LoyaltyCard } from '@/types';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

const CARD_RATIO = 1.586; // ISO/IEC 7810 ID-1, the shape of a real bank / loyalty card
const MAX_CARD_WIDTH = 400;
/** Share of the screen taken by the focused card — leaves a peek of both neighbours. */
const CARD_SCREEN_RATIO = 0.8;
/** Distance between two card centres, as a share of the card width (< 1 → cards overlap). */
const OVERLAP_STEP = 0.58;
const TAP_SLOP = 8;
const TAP_MAX_MS = 350;
/** A tap right after a fling only stops the scroll; it must not open a card. */
const SCROLL_SETTLE_MS = 120;
const MAX_DOTS = 12;

export function getWalletCardSize(screenW: number) {
  const width = Math.min(Math.round(screenW * CARD_SCREEN_RATIO), MAX_CARD_WIDTH);
  return { width, height: Math.round(width / CARD_RATIO), step: Math.round(width * OVERLAP_STEP) };
}

const ActiveIndexContext = createContext(0);

/**
 * Cells overlap, so their stacking must follow the focus: the centred card on
 * top, its neighbours just below, and so on outwards.
 */
function CarouselCell({ index, style, children, onLayout }: {
  index: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const active = useContext(ActiveIndexContext);
  return (
    <View style={[style, { zIndex: 1000 - Math.abs(index - active) }]} onLayout={onLayout}>
      {children}
    </View>
  );
}

interface Props {
  cards: LoyaltyCard[];
  onCardPress: (merchantId: string) => void;
}

export default memo(function CardCarousel({ cards, onCardPress }: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  const { width: screenW } = useWindowDimensions();

  const { width: itemW, height: itemH, step: snap } = getWalletCardSize(screenW);
  const sidePad = (screenW - snap) / 2;

  const listRef = useRef<FlatList<LoyaltyCard>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [hasSwiped, setHasSwiped] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const pressAnim = useRef(new Animated.Value(1)).current;
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastScrollAt = useRef(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  // New filter / sort / search result → start again from the first card.
  const cardsKey = useMemo(() => cards.map((c) => c.id).join('|'), [cards]);
  useEffect(() => {
    activeRef.current = 0;
    setActive(0);
    scrollX.setValue(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [cardsKey, scrollX]);

  const lastIndex = Math.max(0, cards.length - 1);

  const onScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: true,
      listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        lastScrollAt.current = Date.now();
        const idx = Math.min(lastIndex, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / snap)));
        if (idx !== activeRef.current) {
          activeRef.current = idx;
          setActive(idx);
          setHasSwiped(true);
          haptic();
        }
      },
    },
  ), [scrollX, snap, lastIndex]);

  const goTo = useCallback((index: number) => {
    const target = Math.min(lastIndex, Math.max(0, index));
    listRef.current?.scrollToOffset({ offset: target * snap, animated: !reduceMotion });
  }, [lastIndex, snap, reduceMotion]);

  const openActive = useCallback(() => {
    const card = cards[activeRef.current];
    if (card?.merchant?.id && card.merchant.nomBoutique) onCardPress(card.merchantId);
  }, [cards, onCardPress]);

  const animatePress = useCallback((toValue: number) => {
    Animated.timing(pressAnim, { toValue, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [pressAnim]);

  // Cells overlap, so per-card touchables would steal taps from each other.
  // Taps are resolved by position instead: centre → open, sides → bring that card forward.
  // Raw touch events are used (not a responder) so the native horizontal scroll keeps working.
  const handleTouchStart = useCallback((e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    touchStart.current = { x: pageX, y: pageY, t: Date.now() };
    if (Math.abs(pageX - screenW / 2) <= itemW / 2) animatePress(0.97);
  }, [screenW, itemW, animatePress]);

  const handleTouchEnd = useCallback((e: GestureResponderEvent) => {
    animatePress(1);
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const { pageX, pageY } = e.nativeEvent;
    const isTap = Math.abs(pageX - start.x) < TAP_SLOP
      && Math.abs(pageY - start.y) < TAP_SLOP
      && Date.now() - start.t < TAP_MAX_MS
      && Date.now() - lastScrollAt.current > SCROLL_SETTLE_MS;
    if (!isTap) return;
    const fromCenter = pageX - screenW / 2;
    if (Math.abs(fromCenter) <= itemW / 2) openActive();
    else goTo(activeRef.current + (fromCenter > 0 ? 1 : -1));
  }, [screenW, itemW, animatePress, openActive, goTo]);

  const handleTouchCancel = useCallback(() => {
    touchStart.current = null;
    animatePress(1);
  }, [animatePress]);

  const handleA11yAction = useCallback((e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') goTo(activeRef.current + 1);
    if (e.nativeEvent.actionName === 'decrement') goTo(activeRef.current - 1);
    if (e.nativeEvent.actionName === 'activate') openActive();
  }, [goTo, openActive]);

  const getItemLayout = useCallback((_: unknown, index: number) => ({ length: snap, offset: snap * index, index }), [snap]);
  const keyExtractor = useCallback((c: LoyaltyCard) => c.id, []);

  const renderItem = useCallback(({ item, index }: { item: LoyaltyCard; index: number }) => {
    const r = [(index - 2) * snap, (index - 1) * snap, index * snap, (index + 1) * snap, (index + 2) * snap];
    const scale = scrollX.interpolate({ inputRange: r, outputRange: [0.66, 0.8, 1, 0.8, 0.66], extrapolate: 'clamp' });
    const opacity = scrollX.interpolate({ inputRange: r, outputRange: [0, 0.9, 1, 0.9, 0], extrapolate: 'clamp' });
    const rotateY = scrollX.interpolate({ inputRange: r, outputRange: ['32deg', '24deg', '0deg', '-24deg', '-32deg'], extrapolate: 'clamp' });
    const translateY = scrollX.interpolate({ inputRange: r, outputRange: [hp(10), hp(6), 0, hp(6), hp(10)], extrapolate: 'clamp' });
    const dim = scrollX.interpolate({ inputRange: r, outputRange: [0.35, 0.22, 0, 0.22, 0.35], extrapolate: 'clamp' });
    const isCenter = index === active;

    return (
      <View style={{ width: snap, alignItems: 'center' }} pointerEvents="none">
        <Animated.View
          style={reduceMotion
            ? { opacity: Math.abs(index - active) > 1 ? 0 : 1, transform: [{ scale: isCenter ? 1 : 0.8 }] }
            : {
                opacity,
                transform: [
                  { perspective: 900 },
                  { translateY },
                  { rotateY },
                  { scale: isCenter ? Animated.multiply(scale, pressAnim) : scale },
                ],
              }}
        >
          <WalletCard
            card={item}
            width={itemW}
            height={itemH}
            t={t}
            locale={locale}
            isActive={isCenter}
            reduceMotion={reduceMotion}
          />
          {!reduceMotion && (
            <Animated.View pointerEvents="none" style={[styles.dim, { opacity: dim }]} />
          )}
        </Animated.View>
      </View>
    );
  }, [snap, scrollX, itemW, itemH, t, locale, active, reduceMotion, pressAnim]);

  const activeCard = cards[Math.min(active, lastIndex)];
  if (!activeCard) return null;

  return (
    <View>
      <View
        style={styles.carouselBleed}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${t('home.carouselA11y', { index: active + 1, count: cards.length })} ${t('home.cardAccessibility', { name: activeCard.merchant?.nomBoutique || t('home.unavailableMerchantName') })}`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
        onAccessibilityAction={handleA11yAction}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <ActiveIndexContext.Provider value={active}>
        <Animated.FlatList
          ref={listRef}
          data={cards}
          horizontal
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          extraData={active}
          getItemLayout={getItemLayout}
          showsHorizontalScrollIndicator={false}
          snapToInterval={snap}
          decelerationRate="fast"
          disableIntervalMomentum
          bounces
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={styles.ltr}
          contentContainerStyle={[styles.ltr, { paddingHorizontal: sidePad, paddingTop: hp(14), paddingBottom: hp(30) }]}
          CellRendererComponent={CarouselCell}
          removeClippedSubviews={false}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={7}
        />
        </ActiveIndexContext.Provider>
      </View>

      {/* ── Pagination ── */}
      {cards.length > 1 && (
        <View style={styles.pagination}>
          {cards.length <= MAX_DOTS ? (
            <View style={[styles.dots, styles.ltr]}>
              {cards.map((c, i) => {
                const inputRange = [(i - 1) * snap, i * snap, (i + 1) * snap];
                const scaleX = scrollX.interpolate({ inputRange, outputRange: [1, 2.6, 1], extrapolate: 'clamp' });
                const op = scrollX.interpolate({ inputRange, outputRange: [0.25, 1, 0.25], extrapolate: 'clamp' });
                return (
                  <Animated.View
                    key={c.id}
                    style={[styles.dot, { backgroundColor: theme.text, opacity: op, transform: [{ scaleX }] }]}
                  />
                );
              })}
            </View>
          ) : (
            <View style={[styles.counter, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <Text style={[styles.counterText, { color: theme.text, fontFamily: fonts.bold }]}>
                {active + 1}
                <Text style={{ color: theme.textMuted, fontFamily: fonts.medium }}> / {cards.length}</Text>
              </Text>
            </View>
          )}
          {!hasSwiped && (
            <View style={styles.hint}>
              <ChevronsLeftRight size={ms(13)} color={theme.textMuted} strokeWidth={2} />
              <Text style={[styles.hintText, { color: theme.textMuted, fontFamily: fonts.medium }]}>{t('home.swipeHint')}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  // Horizontal paging maths assume a left-to-right track, whatever the app language.
  ltr: { direction: 'ltr' },
  carouselBleed: { marginHorizontal: -wp(16) },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0F172A', borderRadius: radius['2xl'] },

  pagination: { alignItems: 'center', gap: hp(8), marginTop: -hp(10), marginBottom: hp(14) },
  dots: { flexDirection: 'row', alignItems: 'center', gap: wp(12), height: ms(8) },
  dot: { width: ms(6), height: ms(6), borderRadius: ms(3) },
  counter: { paddingHorizontal: wp(12), paddingVertical: hp(4), borderRadius: 999, borderWidth: 1 },
  counterText: { fontSize: fontSize.xs },
  hint: { flexDirection: 'row', alignItems: 'center', gap: wp(6) },
  hintText: { fontSize: ms(11) },
});
