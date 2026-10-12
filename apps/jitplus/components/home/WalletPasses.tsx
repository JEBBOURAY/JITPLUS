import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Clock, Ticket, Trophy } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import GlassCard from '@/components/GlassCard';
import MerchantLogo from '@/components/MerchantLogo';
import LuckyWheelIcon from '@/components/LuckyWheelIcon';
import PassDetailSheet, { type PassDetail } from '@/components/home/PassDetailSheet';
import { useAppFonts } from '@/utils/fonts';
import { formatDate } from '@/utils/date';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import {
  describeCouponConditions, diffDaysYmd, formatRewardValue, rewardDisplay, toYmd,
} from '@jitplus/shared/src/scratch';
import type { CouponDto, ScratchCardDto } from '@jitplus/shared/src/scratch';
import type { LuckyWheelDraw } from '@/types';

const PASS_W = wp(252);
const PASS_H = ms(142);
const PASS_GAP = wp(12);
const TILE_H = ms(156);
const STUB_W = ms(80);
const NOTCH = ms(9);
const SOON_DAYS = 2;
const WHEEL_GRADIENT = ['#EC4899', '#8B5CF6', '#6D28D9'] as const;
const SCRATCH_GRADIENT = ['#FBBF24', '#F97316', '#C2410C'] as const;
const SCRATCH_COVER = ['#F3F4F6', '#9CA3AF'] as const;
const DIAG_START = { x: 0, y: 0 } as const;
const DIAG_END = { x: 1, y: 1 } as const;
const PERFORATION = Array.from({ length: 9 });

type Fonts = ReturnType<typeof useAppFonts>;

function daysUntil(iso: string): number {
  return diffDaysYmd(toYmd(new Date()), toYmd(new Date(iso)));
}

// ── Game tile (lucky wheel / scratch cards): same layout, own colours ──────

const GameTile = memo(function GameTile({
  colors, title, count, availableLabel, emptyLabel, cta, art, onPress, a11yLabel, fonts,
}: {
  colors: readonly [string, string, ...string[]];
  title: string;
  count: number;
  availableLabel: string;
  emptyLabel: string;
  cta: string;
  art: React.ReactNode;
  onPress: () => void;
  a11yLabel: string;
  fonts: Fonts;
}) {
  const hasAny = count > 0;
  const accentText = colors[colors.length - 1];

  return (
    <GlassCard onPress={onPress} radius={radius.xl} style={styles.tileOuter} accessibilityLabel={a11yLabel}>
      <LinearGradient colors={colors} start={DIAG_START} end={DIAG_END} style={styles.tile}>
        <View pointerEvents="none" style={styles.tileOrb} />
        {!hasAny && <View pointerEvents="none" style={styles.tileMuted} />}

        <View style={styles.tileTop}>
          <View style={styles.tileArt}>{art}</View>
          <View style={[styles.countBadge, hasAny ? styles.countBadgeOn : styles.countBadgeOff]}>
            <Text style={[styles.countText, { color: hasAny ? accentText : '#FFFFFF', fontFamily: fonts.bold }]}>
              {count > 99 ? '99+' : count}
            </Text>
          </View>
        </View>

        <View>
          <Text style={[styles.tileTitle, { fontFamily: fonts.bold }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.tileSub, { fontFamily: fonts.medium }]} numberOfLines={1}>
            {hasAny ? availableLabel : emptyLabel}
          </Text>
        </View>

        <View style={[styles.tileCta, !hasAny && styles.tileCtaMuted]}>
          <Text
            style={[styles.tileCtaText, { color: hasAny ? accentText : '#FFFFFF', fontFamily: fonts.bold }]}
            numberOfLines={1}
          >
            {cta}
          </Text>
        </View>
      </LinearGradient>
    </GlassCard>
  );
});

/** Small scratch card drawing that wiggles when cards are waiting. */
const ScratchArt = memo(function ScratchArt({ active }: { active: boolean }) {
  const wiggle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { wiggle.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggle, { toValue: 1, duration: 140, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(wiggle, { toValue: -1, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(wiggle, { toValue: 0, duration: 140, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(3200),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, wiggle]);
  const rotate = wiggle.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-16deg', '-8deg', '0deg'] });

  return (
    <Animated.View style={[styles.scratchArt, { transform: [{ rotate }] }]}>
      <Text style={styles.scratchGift}>🎁</Text>
      <LinearGradient colors={SCRATCH_COVER} start={DIAG_START} end={DIAG_END} style={styles.scratchCover}>
        <Text style={styles.scratchMotif}>✦ ✦</Text>
      </LinearGradient>
    </Animated.View>
  );
});

// ── Ticket-style pass (coupon, won prize) ──────────────────────────────────

const TicketPass = memo(function TicketPass({
  logoUrl, merchantName, headline, tag, status, warning, stubColor, StubIcon, onPress, a11yLabel, fonts,
}: {
  logoUrl?: string | null;
  merchantName: string;
  headline: string;
  tag: string;
  status: string;
  warning?: boolean;
  stubColor: string;
  StubIcon: typeof Ticket;
  onPress: () => void;
  a11yLabel: string;
  fonts: Fonts;
}) {
  const theme = useTheme();
  const isDark = theme.mode === 'dark';
  const notchStyle = { backgroundColor: theme.bg, borderColor: theme.border };

  return (
    <GlassCard onPress={onPress} radius={radius.xl} style={styles.passOuter} accessibilityLabel={a11yLabel}>
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

export default memo(function WalletPasses({
  scratchCards,
  coupons,
  wonPrizes,
  ticketCount,
  spinAnim,
  onOpenWheel,
}: {
  scratchCards: ScratchCardDto[];
  coupons: CouponDto[];
  wonPrizes: LuckyWheelDraw[];
  ticketCount: number;
  spinAnim: Animated.Value;
  onOpenWheel: () => void;
}) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [detail, setDetail] = useState<PassDetail | null>(null);

  // Soonest-expiring first: that is the one the client must not forget.
  const sortedCoupons = useMemo(
    () => [...coupons].sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()),
    [coupons],
  );
  const nextScratch = useMemo(
    () => [...scratchCards].sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0],
    [scratchCards],
  );

  const spin = useMemo(
    () => spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
    [spinAnim],
  );

  const scratchCount = scratchCards.length;
  const hasTickets = wonPrizes.length > 0 || coupons.length > 0;

  const openScratch = () => {
    if (nextScratch) router.push({ pathname: '/scratch/[id]', params: { id: nextScratch.id } });
    else router.push('/scratch');
  };

  const openPrize = (draw: LuckyWheelDraw) => {
    const merchantName = draw.ticket.campaign.merchant?.nom ?? draw.ticket.campaign.name;
    setDetail({
      kind: 'prize',
      tag: t('home.passPrizeTag'),
      headline: draw.prize?.label ?? t('luckyWheel.won'),
      detail: draw.prize?.description,
      merchantName,
      logoUrl: draw.ticket.campaign.merchant?.logoUrl,
      intro: t('home.passPrizeIntro', { merchant: merchantName }),
      steps: [t('scratch.screen.stepVisit', { merchant: merchantName }), t('home.passPrizeStep')],
      conditions: [],
      expiry: draw.claimBefore
        ? t('luckyWheel.claimBeforeLong', { date: formatDate(draw.claimBefore, locale) })
        : t('home.passNoExpiry'),
      expirySoon: !!draw.claimBefore && daysUntil(draw.claimBefore) <= SOON_DAYS,
    });
  };

  const openCoupon = (coupon: CouponDto) => {
    const merchantName = coupon.merchant?.nom ?? '';
    const reward = rewardDisplay({ type: coupon.type, value: coupon.value, label: coupon.label }, t);
    // Without expiresAt the helper returns [rules…, validFrom?, singleUse]: the
    // expiry has its own row in the sheet and "single use" adds nothing here.
    const conditions = describeCouponConditions(
      { conditions: coupon.conditions, validFrom: coupon.validFrom },
      t,
      (iso) => formatDate(iso, locale),
    ).slice(0, -1);
    setDetail({
      kind: 'coupon',
      tag: t('home.passCouponTag'),
      headline: reward.headline,
      detail: reward.detail,
      merchantName,
      logoUrl: coupon.merchant?.logoUrl,
      intro: t('home.passCouponIntro', { merchant: merchantName }),
      steps: [t('scratch.screen.stepVisit', { merchant: merchantName }), t('home.passCouponStep')],
      conditions,
      expiry: t('scratch.conditions.expiresAt', { date: formatDate(coupon.expiresAt, locale) }),
      expirySoon: daysUntil(coupon.expiresAt) <= SOON_DAYS,
    });
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={1}>
          {t('home.perksTitle')}
        </Text>
      </View>

      {/* ── Games: lucky wheel | scratch cards ── */}
      <View style={styles.tilesRow}>
        <GameTile
          colors={WHEEL_GRADIENT}
          title={t('luckyWheel.title')}
          count={ticketCount}
          availableLabel={t('home.availableCount', { count: ticketCount })}
          emptyLabel={t('home.noneAvailable')}
          cta={ticketCount > 0 ? t('luckyWheel.spin') : t('luckyWheel.history')}
          fonts={fonts}
          a11yLabel={`${t('luckyWheel.title')}, ${t('home.availableCount', { count: ticketCount })}`}
          onPress={onOpenWheel}
          art={
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <LuckyWheelIcon size={ms(46)} />
            </Animated.View>
          }
        />
        <GameTile
          colors={SCRATCH_GRADIENT}
          title={t('home.scratchTileTitle')}
          count={scratchCount}
          availableLabel={t('home.availableCount', { count: scratchCount })}
          emptyLabel={t('home.noneAvailable')}
          cta={scratchCount > 0 ? t('scratch.home.cta') : t('scratch.hub.history')}
          fonts={fonts}
          a11yLabel={`${t('home.scratchTileTitle')}, ${t('home.availableCount', { count: scratchCount })}`}
          onPress={openScratch}
          art={<ScratchArt active={scratchCount > 0} />}
        />
      </View>

      {/* ── Won prizes and coupons, as tickets ── */}
      {hasTickets && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={PASS_W + PASS_GAP}
          snapToAlignment="start"
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          {wonPrizes.map((draw) => {
            const merchantName = draw.ticket.campaign.merchant?.nom ?? draw.ticket.campaign.name;
            const soon = !!draw.claimBefore && daysUntil(draw.claimBefore) <= SOON_DAYS;
            return (
              <TicketPass
                key={`prize-${draw.id}`}
                logoUrl={draw.ticket.campaign.merchant?.logoUrl}
                merchantName={merchantName}
                headline={draw.prize?.label ?? t('luckyWheel.won')}
                tag={t('home.passPrizeTag')}
                status={draw.claimBefore
                  ? t('luckyWheel.claimBefore', { date: formatDate(draw.claimBefore, locale) })
                  : t('luckyWheel.pending')}
                warning={soon}
                stubColor={palette.emerald}
                StubIcon={Trophy}
                fonts={fonts}
                a11yLabel={`${t('home.passPrizeTag')}, ${draw.prize?.label ?? ''}, ${merchantName}`}
                onPress={() => openPrize(draw)}
              />
            );
          })}

          {sortedCoupons.map((coupon) => {
            const reward = formatRewardValue({ type: coupon.type, value: coupon.value, label: coupon.label }, t);
            const days = daysUntil(coupon.expiresAt);
            const merchantName = coupon.merchant?.nom ?? '';
            return (
              <TicketPass
                key={`coupon-${coupon.id}`}
                logoUrl={coupon.merchant?.logoUrl}
                merchantName={merchantName}
                headline={reward}
                tag={t('home.passCouponTag')}
                status={days <= 0 ? t('scratch.coupons.expiresToday') : t('scratch.coupons.expiresIn', { count: days })}
                warning={days <= SOON_DAYS}
                stubColor={palette.violet}
                StubIcon={Ticket}
                fonts={fonts}
                a11yLabel={`${t('home.passCouponTag')}, ${reward}, ${merchantName}`}
                onPress={() => openCoupon(coupon)}
              />
            );
          })}
        </ScrollView>
      )}

      <PassDetailSheet pass={detail} onClose={() => setDetail(null)} />
    </View>
  );
});

const styles = StyleSheet.create({
  section: { marginBottom: hp(8) },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: wp(12), marginTop: hp(4), marginBottom: hp(10),
  },
  sectionTitle: { fontSize: fontSize.lg, letterSpacing: -0.3, flexShrink: 1 },

  // Game tiles
  tilesRow: { flexDirection: 'row', gap: wp(12), marginBottom: hp(14) },
  tileOuter: { flex: 1, height: TILE_H },
  tile: { flex: 1, borderRadius: radius.xl, padding: wp(14), overflow: 'hidden', justifyContent: 'space-between' },
  tileOrb: {
    position: 'absolute', width: ms(130), height: ms(130), borderRadius: 999,
    top: -ms(50), right: -ms(40), backgroundColor: 'rgba(255,255,255,0.14)',
  },
  tileMuted: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.28)' },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  tileArt: {
    width: ms(54), height: ms(54), borderRadius: ms(27), backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  countBadge: {
    minWidth: ms(34), height: ms(34), borderRadius: ms(17), paddingHorizontal: wp(8),
    alignItems: 'center', justifyContent: 'center',
  },
  countBadgeOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 3,
  },
  countBadgeOff: { backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  countText: { fontSize: fontSize.lg, letterSpacing: -0.4 },
  tileTitle: { color: '#FFFFFF', fontSize: fontSize.sm, letterSpacing: -0.2 },
  tileSub: { color: 'rgba(255,255,255,0.85)', fontSize: ms(11), marginTop: hp(1) },
  tileCta: {
    alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: 999,
    paddingHorizontal: wp(12), paddingVertical: hp(5), maxWidth: '100%',
  },
  tileCtaMuted: { backgroundColor: 'rgba(255,255,255,0.22)' },
  tileCtaText: { fontSize: fontSize.xs },

  scratchArt: {
    width: ms(38), height: ms(26), borderRadius: ms(5), backgroundColor: '#FEF3C7',
    overflow: 'hidden', flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#F59E0B',
  },
  scratchGift: { fontSize: ms(12), width: '45%', textAlign: 'center' },
  scratchCover: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  scratchMotif: { fontSize: ms(7), color: '#6B7280' },

  // Ticket passes
  scroll: { marginHorizontal: -wp(16) },
  scrollContent: { paddingHorizontal: wp(16), paddingBottom: hp(14), gap: PASS_GAP },
  passOuter: { width: PASS_W, height: PASS_H },
  ticket: { flex: 1, flexDirection: 'row', borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden' },
  ticketShadow: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
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
  ticketTag: { fontSize: ms(10), letterSpacing: 0.4, textTransform: 'uppercase' },
  ticketHeadline: { fontSize: fontSize.lg, letterSpacing: -0.3, marginTop: hp(3) },
  ticketMerchant: { fontSize: fontSize.xs, marginTop: hp(2) },
  ticketStatus: {
    flexDirection: 'row', alignItems: 'center', gap: wp(4), alignSelf: 'flex-start',
    paddingHorizontal: wp(8), paddingVertical: hp(3), borderRadius: 999, marginTop: hp(8), maxWidth: '100%',
  },
  ticketStatusText: { fontSize: ms(10), flexShrink: 1 },
});
