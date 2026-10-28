import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { useReducedMotion } from 'react-native-reanimated';
import { Check, Gift, Stamp } from 'lucide-react-native';
import { palette, type ThemeColors } from '@/contexts/ThemeContext';
import type { StampsEvent } from '@/stores/wsStore';
import { hapticSuccess } from '@/utils/haptics';
import { playSound } from '@/utils/sounds';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface QrSuccessOverlayProps {
  event: StampsEvent | null;
  /** Stamps needed for a reward at this merchant, when known — draws the mini stamp card. */
  goal?: number | null;
  onDismiss: () => void;
  theme: ThemeColors;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const AUTO_DISMISS_MS = 5000;
const SLAM_DELAY_MS = 140;
const SLAM_MS = 300;
const SLOT_STAGGER_MS = 240;
/** Above this, a grid of slots gets too dense; only the balance pill is shown. */
const MAX_GRID_SLOTS = 12;

const HALO_SIZE = ms(112);
const SLOT_SIZE = ms(26);
const SLOT_GAP = wp(6);

const PARTICLES = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2 + 0.3;
  const distance = ms(i % 2 ? 64 : 82);
  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance,
    size: ms(i % 3 === 0 ? 9 : 6),
    colorIndex: i % 3,
  };
});

interface StampGrid { goal: number; prevEarned: number; nowEarned: number }

function getStampGrid(event: StampsEvent, goal: number | null | undefined): StampGrid | null {
  if (event.type !== 'EARN_STAMPS' || !goal || goal > MAX_GRID_SLOTS) return null;
  const clamp = (n: number) => Math.min(Math.max(0, n), goal);
  return { goal, prevEarned: clamp(event.newBalance - event.stamps), nowEarned: clamp(event.newBalance) };
}

/** Full-screen confirmation shown when the merchant scans the QR while it is displayed:
 *  a rubber stamp slams onto the card with a sound, then the new stamps fill their slots. */
export default React.memo(function QrSuccessOverlay({ event, goal, onDismiss, theme, fonts, t }: QrSuccessOverlayProps) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState<{ event: StampsEvent; grid: StampGrid | null } | null>(null);
  const [fade] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(0.4));
  const [slam] = useState(() => new Animated.Value(0));
  const [bump] = useState(() => new Animated.Value(1));
  const [impact] = useState(() => new Animated.Value(0));
  const [shake] = useState(() => new Animated.Value(0));
  const [slots] = useState(() => new Animated.Value(0));
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);
  // Captured when the event arrives: a cards refetch must not redraw the grid mid-animation.
  const goalRef = useRef(goal);
  useEffect(() => { goalRef.current = goal; }, [goal]);

  const hide = useCallback(() => {
    Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setShown(null);
      onDismissRef.current();
    });
  }, [fade]);

  useEffect(() => {
    if (!event) return;
    const grid = getStampGrid(event, goalRef.current);
    const newSlots = grid ? grid.nowEarned - grid.prevEarned : 0;
    setShown({ event, grid });

    const onImpact = () => {
      playSound(event.type === 'REDEEM_REWARD' ? 'reward' : 'stamp');
      hapticSuccess();
    };

    bump.setValue(1);
    shake.setValue(0);
    if (reduceMotion) {
      fade.setValue(1);
      pop.setValue(1);
      slam.setValue(1);
      impact.setValue(1);
      slots.setValue(newSlots);
      onImpact();
    } else {
      fade.setValue(0);
      pop.setValue(0.4);
      slam.setValue(0);
      impact.setValue(0);
      slots.setValue(0);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 180, mass: 0.8 }),
      ]).start();
      Animated.sequence([
        Animated.delay(SLAM_DELAY_MS),
        Animated.timing(slam, { toValue: 1, duration: SLAM_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished) return;
        onImpact();
        Animated.parallel([
          Animated.timing(impact, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(bump, { toValue: 0.86, duration: 70, useNativeDriver: true }),
            Animated.spring(bump, { toValue: 1, useNativeDriver: true, damping: 6, stiffness: 260 }),
          ]),
          Animated.sequence([
            Animated.timing(shake, { toValue: 1, duration: 45, useNativeDriver: true }),
            Animated.timing(shake, { toValue: -0.8, duration: 45, useNativeDriver: true }),
            Animated.timing(shake, { toValue: 0.4, duration: 45, useNativeDriver: true }),
            Animated.timing(shake, { toValue: 0, duration: 45, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(180),
            Animated.timing(slots, { toValue: newSlots, duration: newSlots * SLOT_STAGGER_MS, easing: Easing.linear, useNativeDriver: true }),
          ]),
        ]).start();
      });
    }

    const timer = setTimeout(hide, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [event, reduceMotion, fade, pop, slam, bump, impact, shake, slots, hide]);

  if (!shown) return null;

  const { event: ev, grid } = shown;
  const isRedeem = ev.type === 'REDEEM_REWARD';
  const tint = isRedeem ? palette.gold : palette.emerald;
  const particleColors = [tint, palette.gold, palette.violetLight];
  const title = isRedeem
    ? t('qr.successRedeemTitle')
    : t('qr.successEarnTitle', { count: Math.abs(ev.stamps) });
  const atMerchant = ev.merchantName ? t('qr.successAt', { merchant: ev.merchantName }) : '';
  const subtitle = isRedeem && ev.rewardTitle
    ? [ev.rewardTitle, ev.merchantName].filter(Boolean).join(' · ')
    : atMerchant;

  const stampTransform = [
    { scale: Animated.multiply(slam.interpolate({ inputRange: [0, 1], outputRange: [2.8, 1] }), bump) },
    { rotate: slam.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '-12deg'] }) },
  ];
  const perRow = grid ? (grid.goal <= 6 ? grid.goal : Math.ceil(grid.goal / 2)) : 0;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]} accessibilityLiveRegion="assertive">
      <Pressable style={StyleSheet.absoluteFill} onPress={hide} accessibilityRole="button" accessibilityLabel={t('common.close')} />
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: theme.bgCard,
            transform: [{ scale: pop }, { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-ms(6), ms(6)] }) }],
          },
        ]}
      >
        <View style={[styles.halo, { backgroundColor: `${tint}1F` }]}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ripple,
              {
                borderColor: tint,
                opacity: impact.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.6, 0] }),
                transform: [{ scale: impact.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.9] }) }],
              },
            ]}
          />
          {PARTICLES.map((p, i) => (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={[
                styles.particle,
                {
                  width: p.size, height: p.size, borderRadius: p.size / 2,
                  left: (HALO_SIZE - p.size) / 2, top: (HALO_SIZE - p.size) / 2,
                  backgroundColor: particleColors[p.colorIndex],
                  opacity: impact.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                  transform: [
                    { translateX: impact.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                    { translateY: impact.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) },
                    { scale: impact.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
                  ],
                },
              ]}
            />
          ))}
          <Animated.View
            style={[
              styles.stampRing,
              {
                borderColor: tint,
                opacity: slam.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] }),
                transform: stampTransform,
              },
            ]}
          >
            <View style={[styles.circle, { backgroundColor: tint }]}>
              {isRedeem
                ? <Gift size={ms(36)} color="#fff" strokeWidth={2.2} />
                : <Stamp size={ms(36)} color="#fff" strokeWidth={2.2} />}
            </View>
          </Animated.View>
        </View>
        <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header">{title}</Text>
        {!!subtitle && (
          <Text style={[styles.subtitle, { color: theme.textSecondary, fontFamily: fonts.medium }]} numberOfLines={2}>{subtitle}</Text>
        )}

        {grid && (
          <View
            style={[styles.grid, { width: perRow * SLOT_SIZE + (perRow - 1) * SLOT_GAP }]}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            {Array.from({ length: grid.goal }, (_, i) => {
              const isNew = i >= grid.prevEarned && i < grid.nowEarned;
              const k = i - grid.prevEarned;
              return (
                <View key={i} style={styles.slot}>
                  <View style={[StyleSheet.absoluteFill, styles.slotEmpty, { borderColor: `${tint}66` }]} />
                  {(i < grid.prevEarned || isNew) && (
                    <Animated.View
                      style={[
                        StyleSheet.absoluteFill,
                        styles.slotFilled,
                        { backgroundColor: tint },
                        isNew && {
                          opacity: slots.interpolate({ inputRange: [k, k + 0.35], outputRange: [0, 1], extrapolate: 'clamp' }),
                          transform: [{ scale: slots.interpolate({ inputRange: [k, k + 0.6, k + 1], outputRange: [2.2, 0.9, 1], extrapolate: 'clamp' }) }],
                        },
                      ]}
                    >
                      <Check size={ms(14)} color="#fff" strokeWidth={3} />
                    </Animated.View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={[styles.balancePill, { backgroundColor: `${palette.violet}12` }]}>
          <Text style={[styles.balanceText, { color: theme.mode === 'dark' ? palette.violetLight : palette.violet, fontFamily: fonts.semibold }]}>
            {t('qr.successBalance', { count: ev.newBalance })}
          </Text>
        </View>
        <TouchableOpacity onPress={hide} activeOpacity={0.85} style={[styles.cta, { backgroundColor: palette.violet }]} accessibilityRole="button">
          <Text style={[styles.ctaText, { fontFamily: fonts.bold }]}>{t('qr.successCta')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: { backgroundColor: 'rgba(15,23,42,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  card: {
    width: '84%', maxWidth: wp(340), borderRadius: radius['2xl'], alignItems: 'center',
    paddingHorizontal: wp(22), paddingTop: hp(28), paddingBottom: hp(20),
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 28, elevation: 12,
  },
  halo: { width: HALO_SIZE, height: HALO_SIZE, borderRadius: HALO_SIZE / 2, alignItems: 'center', justifyContent: 'center', marginBottom: hp(18) },
  ripple: { position: 'absolute', width: ms(88), height: ms(88), borderRadius: ms(44), borderWidth: 3 },
  particle: { position: 'absolute' },
  stampRing: { width: ms(92), height: ms(92), borderRadius: ms(46), borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  circle: { width: ms(76), height: ms(76), borderRadius: ms(38), alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize['2xl'], textAlign: 'center', letterSpacing: -0.4 },
  subtitle: { fontSize: fontSize.md, textAlign: 'center', marginTop: hp(6), lineHeight: ms(21) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SLOT_GAP, marginTop: hp(16), maxWidth: '100%' },
  slot: { width: SLOT_SIZE, height: SLOT_SIZE },
  slotEmpty: { borderRadius: SLOT_SIZE / 2, borderWidth: 1.5, borderStyle: 'dashed' },
  slotFilled: { borderRadius: SLOT_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  balancePill: { marginTop: hp(14), paddingHorizontal: wp(14), paddingVertical: hp(6), borderRadius: 999 },
  balanceText: { fontSize: fontSize.sm },
  cta: { alignSelf: 'stretch', height: ms(50), borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: hp(22) },
  ctaText: { color: '#fff', fontSize: fontSize.md },
});
