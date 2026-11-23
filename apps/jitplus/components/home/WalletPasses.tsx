import React, { memo, useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Animated } from 'react-native';
import { Text } from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Check, Clock, Gift, Ticket, Trophy } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import GlassCard from '@/components/GlassCard';
import MerchantLogo from '@/components/MerchantLogo';
import LuckyWheelIcon from '@/components/LuckyWheelIcon';
import PassDetailSheet, { type PassDetail } from '@/components/home/PassDetailSheet';
import { useAppFonts } from '@/utils/fonts';
import { pluralKey } from '@jitplus/shared';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { formatBadgeCount } from '@/utils/badge';
import { describeCoupon, describePrize, type PassView } from '@/utils/passDetail';
import type { CouponDto, ScratchCardDto } from '@jitplus/shared/src/scratch';
import type { LuckyWheelDraw } from '@/types';

const PASS_W = wp(252);
const PASS_H = ms(142);
const PASS_GAP = wp(12);
const TILE_H = ms(128);
const STUB_W = ms(80);
const NOTCH = ms(9);
const SCRATCH_COVER = ['#F3F4F6', '#9CA3AF'] as const;
const DIAG_START = { x: 0, y: 0 } as const;
const DIAG_END = { x: 1, y: 1 } as const;
const PERFORATION = Array.from({ length: 9 });

type Fonts = ReturnType<typeof useAppFonts>;

// ── Game tile (lucky wheel / scratch cards / collection): same layout, three on a row ──

const GameTile = memo(function GameTile({
  color, title, count, status, art, onPress, a11yLabel, fonts,
}: {
  /** Game colour, only as a soft tint behind the drawing */
  color: string;
  title: string;
  count: number;
  /** "2 tickets", "Aucune carte"… */
  status: string;
  art: React.ReactNode;
  onPress: () => void;
  a11yLabel: string;
  fonts: Fonts;
}) {
  const theme = useTheme();
  const hasAny = count > 0;

  // Calm card: the content is the drawing and the count; the gold badge marks what can be played now.
  return (
    <GlassCard onPress={onPress} style={styles.tileOuter} accessibilityLabel={a11yLabel}>
      <View style={[styles.tile, { backgroundColor: theme.bgCard, borderColor: hasAny ? `${theme.accent}66` : theme.border }]}>
        <View style={styles.tileTop}>
          <View style={[styles.tileArt, { backgroundColor: `${color}${theme.mode === 'dark' ? '33' : '14'}` }]}>{art}</View>
          {hasAny && (
            <View style={[styles.countBadge, { backgroundColor: theme.accent }]}>
              <Text style={[styles.countText, { fontFamily: fonts.bold }]} maxFontSizeMultiplier={1.2}>
                {formatBadgeCount(count)}
              </Text>
            </View>
          )}
        </View>
        <View>
          <Text style={[styles.tileTitle, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={2}>{title}</Text>
          <Text
            style={[styles.tileSub, { color: hasAny ? theme.accent : theme.textMuted, fontFamily: fonts.medium }]}
            numberOfLines={2}
          >
            {status}
          </Text>
        </View>
      </View>
    </GlassCard>
  );
});

/** Small scratch card drawing: a gift under a grey scratch coating. */
const ScratchArt = memo(function ScratchArt() {
  return (
    <View style={styles.scratchArt}>
      <View style={styles.scratchGift}>
        <Gift size={ms(12)} color={palette.goldDark} strokeWidth={2.2} />
      </View>
      <LinearGradient colors={SCRATCH_COVER} start={DIAG_START} end={DIAG_END} style={styles.scratchCover} />
    </View>
  );
});

/** Small collection drawing: a list of products, the first ones ticked. */
const COLLECTION_ART_ROWS = [true, true, false] as const;
const CollectionArt = memo(function CollectionArt() {
  return (
    <View style={styles.collectionArt}>
      {COLLECTION_ART_ROWS.map((done, i) => (
        <View key={i} style={styles.collectionArtRow}>
          <View style={[styles.collectionArtBox, done && styles.collectionArtBoxDone]}>
            {done && <Check size={ms(8)} color="#fff" strokeWidth={3.5} />}
          </View>
          <View style={[styles.collectionArtLine, done && styles.collectionArtLineDone]} />
        </View>
      ))}
    </View>
  );
});

// ── Ticket-style pass (coupon, won prize) ──────────────────────────────────

const TicketPass = memo(function TicketPass({
  pass, stubColor, StubIcon, onPress, fonts,
}: {
  pass: PassView;
  stubColor: string;
  StubIcon: typeof Ticket;
  /** Stable across renders (receives the pass id) so the memo holds. */
  onPress: (id: string) => void;
  fonts: Fonts;
}) {
  const theme = useTheme();
  const isDark = theme.mode === 'dark';
  const notchStyle = { backgroundColor: theme.bg, borderColor: theme.border };
  const { id, logoUrl, merchantName, headline, tag, status, warning, a11yLabel } = pass;
  const handlePress = useCallback(() => onPress(id), [onPress, id]);

  return (
    <GlassCard onPress={handlePress} style={styles.passOuter} accessibilityLabel={a11yLabel}>
      <View style={[styles.ticket, !isDark && styles.ticketShadow, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <View style={[styles.stub, { backgroundColor: `${stubColor}${isDark ? '24' : '12'}` }]}>
          <View style={[styles.stubLogo, { borderColor: `${stubColor}40` }]}>
            <MerchantLogo logoUrl={logoUrl} merchantName={merchantName} style={styles.stubLogoImg} />
          </View>
          <View style={[styles.stubIcon, { backgroundColor: stubColor }]}>
            <StubIcon size={ms(11)} color="#fff" strokeWidth={2.4} />
          </View>
        </View>

        <View style={styles.perforation} pointerEvents="none">
          {PERFORATION.map((_, i) => (
            <View key={i} style={[styles.perfDot, { backgroundColor: theme.border }]} />
          ))}
        </View>
        <View pointerEvents="none" style={[styles.notch, styles.notchTop, notchStyle]} />
        <View pointerEvents="none" style={[styles.notch, styles.notchBottom, notchStyle]} />

        <View style={styles.ticketBody}>
          <Text style={[styles.ticketTag, { color: stubColor, fontFamily: fonts.semibold }]} numberOfLines={1}>{tag}</Text>
          <Text style={[styles.ticketHeadline, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={2}>{headline}</Text>
          <Text style={[styles.ticketMerchant, { color: theme.textSecondary, fontFamily: fonts.medium }]} numberOfLines={1}>
            {merchantName}
          </Text>
          <View style={[styles.ticketStatus, { backgroundColor: warning ? `${palette.gold}1F` : theme.bgInput }]}>
            <Clock size={ms(11)} color={warning ? palette.goldDark : theme.textMuted} strokeWidth={2.2} />
            <Text
              style={[styles.ticketStatusText, { color: warning ? palette.goldDark : theme.textMuted, fontFamily: fonts.semibold }]}
              numberOfLines={1}
            >
              {status}
            </Text>
          </View>
        </View>
      </View>
    </GlassCard>
  );
});

// ── Section ────────────────────────────────────────────────────────────────

const SCRATCH_ART = <ScratchArt />;
const COLLECTION_ART = <CollectionArt />;

export default memo(function WalletPasses({
  scratchCards,
  coupons,
  wonPrizes,
  ticketCount,
  collectionCount,
  spinAnim,
  onOpenWheel,
}: {
  scratchCards: ScratchCardDto[];
  coupons: CouponDto[];
  wonPrizes: LuckyWheelDraw[];
  ticketCount: number;
  /** Collections in progress in the client's shops. */
  collectionCount: number;
  spinAnim: Animated.Value;
  onOpenWheel: () => void;
}) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [detail, setDetail] = useState<PassDetail | null>(null);

  const prizes = useMemo(() => wonPrizes.map((draw) => describePrize(draw, t, locale)), [wonPrizes, t, locale]);
  // Soonest-expiring first: that is the one the client must not forget.
  const couponPasses = useMemo(
    () => [...coupons]
      .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())
      .map((coupon) => describeCoupon(coupon, t, locale)),
    [coupons, t, locale],
  );
  const nextScratch = useMemo(
    () => [...scratchCards].sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0],
    [scratchCards],
  );

  const spin = useMemo(
    () => spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
    [spinAnim],
  );
  const wheelArt = useMemo(() => (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <LuckyWheelIcon size={ms(37)} />
    </Animated.View>
  ), [spin]);

  const scratchCount = scratchCards.length;
  const hasTickets = prizes.length > 0 || couponPasses.length > 0;

  const nextScratchId = nextScratch?.id;
  const openScratch = useCallback(() => {
    if (nextScratchId) router.push({ pathname: '/scratch/[id]', params: { id: nextScratchId } });
    else router.push('/scratch');
  }, [nextScratchId, router]);

  const hasCollections = collectionCount > 0;
  const openCollections = useCallback(() => {
    router.push(hasCollections ? '/collections' : { pathname: '/collections', params: { view: 'history' } });
  }, [hasCollections, router]);

  const openPrize = useCallback((id: string) => {
    const pass = prizes.find((p) => p.id === id);
    if (pass) setDetail(pass.detail);
  }, [prizes]);
  const openCoupon = useCallback((id: string) => {
    const pass = couponPasses.find((p) => p.id === id);
    if (pass) setDetail(pass.detail);
  }, [couponPasses]);
  const closeDetail = useCallback(() => setDetail(null), []);

  // Won prizes and coupons, as tickets.
  const ticketsRow = (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={PASS_W + PASS_GAP}
          snapToAlignment="start"
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          {prizes.map((pass) => (
            <TicketPass
              key={`prize-${pass.id}`}
              pass={pass}
              stubColor={palette.emerald}
              StubIcon={Trophy}
              fonts={fonts}
              onPress={openPrize}
            />
          ))}

          {couponPasses.map((pass) => {
            const fromCollection = pass.kind === 'collection';
            return (
              <TicketPass
                key={`coupon-${pass.id}`}
                pass={pass}
                stubColor={fromCollection ? palette.goldDark : palette.violet}
                StubIcon={fromCollection ? Gift : Ticket}
                fonts={fonts}
                onPress={openCoupon}
              />
            );
          })}
        </ScrollView>
  );

  const sectionTitle = (text: string) => (
    <View style={styles.sectionHeader}>
      <Text
        style={[styles.sectionTitle, { color: theme.text, fontFamily: fonts.bold }]}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {text}
      </Text>
    </View>
  );
  const wheelStatus = ticketCount > 0
    ? t(pluralKey('home.wheelTickets', ticketCount, locale), { count: ticketCount })
    : t('home.wheelNone');
  const scratchStatus = scratchCount > 0 ? t('home.scratchCount', { count: scratchCount }) : t('home.scratchNone');
  const collectionStatus = hasCollections ? t('home.inProgressCount', { count: collectionCount }) : t('home.collectionNone');

  return (
    <View style={styles.section}>
      {/* ── Games: lucky wheel | scratch cards | collection ── */}
      {sectionTitle(t('home.gamesTitle'))}
      <View style={styles.tilesRow}>
        <GameTile
          color={palette.violetDark}
          title={t('luckyWheel.title')}
          count={ticketCount}
          status={wheelStatus}
          fonts={fonts}
          a11yLabel={`${t('luckyWheel.title')}, ${wheelStatus}`}
          onPress={onOpenWheel}
          art={wheelArt}
        />
        <GameTile
          color={palette.goldDark}
          title={t('home.scratchTileTitle')}
          count={scratchCount}
          status={scratchStatus}
          fonts={fonts}
          a11yLabel={`${t('home.scratchTileTitle')}, ${scratchStatus}`}
          onPress={openScratch}
          art={SCRATCH_ART}
        />
        <GameTile
          color={palette.violet}
          title={t('home.collectionTileTitle')}
          count={collectionCount}
          status={collectionStatus}
          fonts={fonts}
          a11yLabel={`${t('home.collectionTileTitle')}, ${collectionStatus}`}
          onPress={openCollections}
          art={COLLECTION_ART}
        />
      </View>

      {/* ── Won gifts, right under the games they come from (no title: the tickets say what they are) ── */}
      {hasTickets && ticketsRow}

      <PassDetailSheet pass={detail} onClose={closeDetail} />
    </View>
  );
});

const styles = StyleSheet.create({
  section: { marginBottom: hp(8) },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: wp(12), marginBottom: hp(12),
  },
  sectionTitle: { fontSize: fontSize.lg, letterSpacing: -0.3, flexShrink: 1 },

  // Game tiles
  tilesRow: { flexDirection: 'row', gap: wp(8), marginBottom: hp(12) },
  tileOuter: { flex: 1, minHeight: TILE_H },
  tile: {
    flexGrow: 1, borderRadius: radius.lg, borderWidth: 1, padding: wp(12), gap: hp(10),
    overflow: 'hidden', justifyContent: 'space-between',
  },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  tileArt: { width: ms(44), height: ms(44), borderRadius: ms(22), alignItems: 'center', justifyContent: 'center' },
  countBadge: {
    minWidth: ms(22), height: ms(22), borderRadius: ms(11), paddingHorizontal: wp(6),
    alignItems: 'center', justifyContent: 'center',
  },
  countText: { color: '#FFFFFF', fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
  // Two lines reserved: "Collections" and "Roue de la chance" end on the same baseline.
  tileTitle: { fontSize: fontSize.sm, lineHeight: ms(18), minHeight: ms(36) },
  tileSub: { fontSize: fontSize.xs, marginTop: hp(2) },

  collectionArt: { gap: ms(3) },
  collectionArtRow: { flexDirection: 'row', alignItems: 'center', gap: ms(3) },
  collectionArtBox: {
    width: ms(10), height: ms(10), borderRadius: ms(3), borderWidth: 1.5, borderColor: palette.violetSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  collectionArtBoxDone: { backgroundColor: palette.violet, borderColor: palette.violet },
  collectionArtLine: { width: ms(14), height: ms(3), borderRadius: ms(2), backgroundColor: palette.violetUltraLight },
  collectionArtLineDone: { backgroundColor: palette.violetSoft },

  scratchArt: {
    width: ms(32), height: ms(22), borderRadius: ms(5), backgroundColor: palette.goldUltraLight,
    overflow: 'hidden', flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: palette.gold,
    transform: [{ rotate: '-8deg' }],
  },
  scratchGift: { width: '45%', alignItems: 'center', justifyContent: 'center' },
  scratchCover: { flex: 1, height: '100%' },

  // Ticket passes
  scroll: { marginHorizontal: -wp(16) },
  scrollContent: { paddingHorizontal: wp(16), paddingBottom: hp(14), gap: PASS_GAP },
  passOuter: { width: PASS_W, minHeight: PASS_H },
  ticket: { flexGrow: 1, flexDirection: 'row', borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden' },
  ticketShadow: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  stub: { width: STUB_W, alignItems: 'center', justifyContent: 'center' },
  stubLogo: {
    width: ms(48), height: ms(48), borderRadius: ms(24), borderWidth: 1.5,
    backgroundColor: '#fff', overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  stubLogoImg: { width: '100%', height: '100%' },
  stubIcon: {
    position: 'absolute', bottom: ms(30), right: ms(14),
    width: ms(20), height: ms(20), borderRadius: ms(10),
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },
  perforation: {
    position: 'absolute', left: STUB_W - 1, top: NOTCH + hp(4), bottom: NOTCH + hp(4),
    justifyContent: 'space-between',
  },
  perfDot: { width: 2, height: ms(5), borderRadius: 1 },
  notch: {
    position: 'absolute', left: STUB_W - NOTCH, width: NOTCH * 2, height: NOTCH * 2,
    borderRadius: NOTCH, borderWidth: 1,
  },
  notchTop: { top: -NOTCH - 1 },
  notchBottom: { bottom: -NOTCH - 1 },
  ticketBody: { flex: 1, paddingHorizontal: wp(14), paddingVertical: hp(12), justifyContent: 'center' },
  ticketTag: { fontSize: ms(10) },
  ticketHeadline: { fontSize: fontSize.lg, letterSpacing: -0.3, marginTop: hp(3) },
  ticketMerchant: { fontSize: fontSize.xs, marginTop: hp(2) },
  ticketStatus: {
    flexDirection: 'row', alignItems: 'center', gap: wp(4), alignSelf: 'flex-start',
    paddingHorizontal: wp(8), paddingVertical: hp(3), borderRadius: 999, marginTop: hp(8), maxWidth: '100%',
  },
  ticketStatusText: { fontSize: ms(10), flexShrink: 1 },
});
