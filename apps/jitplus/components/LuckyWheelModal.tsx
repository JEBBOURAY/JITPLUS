import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Easing,
  Modal, Alert, Dimensions, Pressable, ScrollView, Platform,
} from 'react-native';
import { Trophy, Frown, Ticket, X, Clock, ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme, palette, brandGradient } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAppFonts } from '@/utils/fonts';
import { LinearGradient } from 'expo-linear-gradient';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { extractErrorMessage } from '@/utils/errorMessage';
import { useLuckyWheelAvailableDraws, useTriggerLuckyWheelDraw, useLuckyWheelHistory } from '@/hooks/useQueryHooks';
import { haptic, HapticStyle } from '@/utils/haptics';
import { LuckyWheelDraw } from '@/types';
import LuckyWheelIcon, { WheelSegment } from './LuckyWheelIcon';
import type { LuckyWheelPrize, LuckyWheelDrawResult } from '@/types';

const { width: SCREEN_W } = Dimensions.get('window');
const BIG_WHEEL = ms(280);

// Wheel segment palette & constants (module scope to avoid recreation per render)
const PRIZE_COLORS = ['#7C3AED', '#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#F97316'];
const LOST_COLOR = '#6B7280';
const MIN_SEGMENTS = 8;
const MAX_SEGMENTS = 14;
const LANDING_DURATION_MS = 3200;
const MIN_TURNS_BEFORE_LANDING = 4;
const WIN_PULSE_ITERATIONS = 4;
// Fulfilment status returned by backend when a prize has been handed over
const FULFILMENT_CLAIMED = 'CLAIMED';
const FULFILMENT_EXPIRED = 'EXPIRED';

/**
 * Normalize prize percentages using the largest-remainder method so that
 * they sum exactly to `totalPct` (avoiding rounding drift) and return the
 * leftover percentage as the lost share.
 */
function computeOddsBreakdown(
  prizes: { id?: string; label: string; weight?: number }[],
  globalWinRate: number,
): { perPrize: number[]; lostPct: number } {
  const totalPct = Math.max(0, Math.min(100, Math.round(globalWinRate * 100)));
  if (!prizes.length || totalPct === 0) {
    return { perPrize: prizes.map(() => 0), lostPct: 100 };
  }
  const totalWeight = prizes.reduce((s, p) => s + (p.weight || 1), 0) || 1;
  const raw = prizes.map((p) => ((p.weight || 1) / totalWeight) * totalPct);
  const floors = raw.map((v) => Math.floor(v));
  let remainder = totalPct - floors.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const perPrize = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++) {
    perPrize[order[k].i] += 1;
    remainder -= 1;
  }
  const lostPct = Math.max(0, 100 - perPrize.reduce((s, v) => s + v, 0));
  return { perPrize, lostPct };
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default React.memo(function LuckyWheelModal({ visible, onClose }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const fonts = useAppFonts();

  const { data: tickets = [], isLoading, isError } = useLuckyWheelAvailableDraws(isAuthenticated && visible);
  const { data: historyData = [], isLoading: historyLoading } = useLuckyWheelHistory(isAuthenticated && visible);
  const drawMutation = useTriggerLuckyWheelDraw();

  const [phase, setPhase] = useState<'wheel' | 'result' | 'history'>('wheel');
  const [drawResult, setDrawResult] = useState<LuckyWheelDrawResult | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [currentTicketIdx, setCurrentTicketIdx] = useState(0);
  const spinLockRef = useRef(false); // immediate lock to prevent double-tap

  // Current ticket (respects multi-merchant / multi-campaign)
  const currentTicket = tickets[currentTicketIdx] ?? tickets[0];

  // Build dynamic wheel segments from current ticket's campaign prizes
  // Distribution reflects merchant config: globalWinRate + prize weights
  const lostLabel = t('luckyWheel.lost');
  const wheelSegments = useMemo<WheelSegment[] | undefined>(() => {
    const prizes = currentTicket?.campaign?.prizes;
    if (!prizes?.length) return undefined;
    const winRate = currentTicket?.campaign?.globalWinRate ?? 0.5;

    // Total weight across all prizes
    const totalWeight = prizes.reduce((sum: number, p: LuckyWheelPrize) => sum + (p.weight || 1), 0);

    // Target segment count — more prizes = more segments, clamped to [MIN, MAX]
    const targetTotal = Math.max(MIN_SEGMENTS, Math.min(MAX_SEGMENTS, prizes.length * 3));

    // Prize segments proportional to weight, at least 1 each
    const winSegments = Math.max(prizes.length, Math.round(targetTotal * winRate));
    const lostSegments = Math.max(1, targetTotal - winSegments);

    // Distribute win segments among prizes by weight
    const prizeSegCounts: number[] = [];
    let assignedWin = 0;
    prizes.forEach((p: LuckyWheelPrize, i: number) => {
      const share = ((p.weight || 1) / totalWeight) * winSegments;
      const count = i === prizes.length - 1
        ? winSegments - assignedWin // last prize gets remainder
        : Math.max(1, Math.round(share));
      prizeSegCounts.push(count);
      assignedWin += count;
    });

    // Build segment list: interleave prizes and lost segments evenly
    const segs: WheelSegment[] = [];
    // Create all prize segments
    const prizeSegs: WheelSegment[] = [];
    prizes.forEach((p: LuckyWheelPrize, i: number) => {
      for (let j = 0; j < prizeSegCounts[i]; j++) {
        prizeSegs.push({ label: p.label, color: PRIZE_COLORS[i % PRIZE_COLORS.length] });
      }
    });
    // Create all lost segments
    const lostSegs: WheelSegment[] = [];
    for (let j = 0; j < lostSegments; j++) {
      lostSegs.push({ label: lostLabel, color: LOST_COLOR });
    }

    // Interleave: distribute lost segments evenly among prize segments
    const total = prizeSegs.length + lostSegs.length;
    let pi = 0, li = 0;
    for (let i = 0; i < total; i++) {
      // Ratio-based interleaving: place a lost segment when proportionally due
      const lostTarget = ((i + 1) / total) * lostSegments;
      if (li < lostSegments && li < Math.round(lostTarget)) {
        segs.push(lostSegs[li++]);
      } else if (pi < prizeSegs.length) {
        segs.push(prizeSegs[pi++]);
      } else {
        segs.push(lostSegs[li++]);
      }
    }

    return segs;
  }, [currentTicket, lostLabel]);

  // Animations
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.15)).current;
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (visible) {
      setPhase('wheel');
      setDrawResult(null);
      setSpinning(false);
      setCurrentTicketIdx(0);
      spinLockRef.current = false;
      overlayAnim.setValue(0);
      scaleAnim.setValue(0.15);
      labelOpacity.setValue(0);
      spinAnim.setValue(0);

      Animated.parallel([
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 14,
          stiffness: 120,
          useNativeDriver: true,
        }),
        Animated.timing(labelOpacity, {
          toValue: 1,
          duration: 400,
          delay: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      spinAnim.stopAnimation(() => {});
    }
  }, [visible, overlayAnim, scaleAnim, labelOpacity, spinAnim]);

  const handleClose = useCallback(() => {
    spinAnim.stopAnimation(() => {});
    spinLockRef.current = false;

    Animated.parallel([
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.15,
        duration: 250,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setPhase('wheel');
      setDrawResult(null);
      setSpinning(false);
      setCurrentTicketIdx(0);
      pulseAnim.setValue(1);
      onClose();
    });
  }, [onClose, overlayAnim, scaleAnim, pulseAnim]);

  const handleSpin = useCallback(async () => {
    // Immediate lock to prevent double-tap
    if (spinLockRef.current) return;
    const ticket = currentTicket;
    if (!ticket) return;
    const segments = wheelSegments;
    if (!segments?.length) return;

    spinLockRef.current = true;
    setSpinning(true);
    haptic(HapticStyle.Medium);

    // Start a long linear ramp; we'll interrupt and redirect to a precise
    // landing angle once the server returns the result.
    spinAnim.setValue(0);
    Animated.timing(spinAnim, {
      toValue: 360 * 30, // enough turns to cover the await window
      duration: 30_000,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();

    try {
      const result = await drawMutation.mutateAsync(ticket.id);
      if (!mountedRef.current) return;

      // Pick the target segment index that matches the result.
      const wonLabel = result.result === 'WON' ? result.prize?.label : null;
      const targetIdx = wonLabel
        ? segments.findIndex((s) => s.label === wonLabel && s.color !== LOST_COLOR)
        : segments.findIndex((s) => s.color === LOST_COLOR);
      const safeIdx = targetIdx >= 0 ? targetIdx : 0;
      const anglePerSeg = 360 / segments.length;
      // Segment i's center (measured clockwise from the top pointer) sits at
      // i * angle + angle/2. To land it under the pointer we rotate the wheel
      // backwards by that amount (i.e. negative rotation).
      const landingAngle = -(safeIdx * anglePerSeg + anglePerSeg / 2);

      spinAnim.stopAnimation((currentVal: number) => {
        if (!mountedRef.current) return;
        // Compute the next forward angle that is a multiple of 360 plus the
        // landing offset and ensures at least MIN_TURNS_BEFORE_LANDING extra spins.
        const minTarget = currentVal + 360 * MIN_TURNS_BEFORE_LANDING;
        const turns = Math.ceil((minTarget - landingAngle) / 360);
        const finalAngle = turns * 360 + landingAngle;

        Animated.timing(spinAnim, {
          toValue: finalAngle,
          duration: LANDING_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (!mountedRef.current || !finished) return;
          setSpinning(false);
          setDrawResult(result);
          setPhase('result');

          if (result.result === 'WON') {
            haptic(HapticStyle.Heavy);
            pulseAnim.setValue(1);
            Animated.loop(
              Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.12, duration: 500, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
              ]),
              { iterations: WIN_PULSE_ITERATIONS },
            ).start();
          } else {
            haptic(HapticStyle.Light);
          }
          // Reset to first ticket: the used ticket is removed from the list on refetch,
          // so index 0 always points to the next available one (prevents skipping).
          setCurrentTicketIdx(0);
          spinLockRef.current = false;
        });
      });
    } catch (err) {
      spinAnim.stopAnimation(() => {});
      spinLockRef.current = false;
      if (!mountedRef.current) return;
      setSpinning(false);
      Alert.alert(t('common.error'), extractErrorMessage(err));
    }
  }, [currentTicket, wheelSegments, drawMutation, spinAnim, pulseAnim, t]);

  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  const ticketCount = tickets.length;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
        {/* Tap backdrop to close */}
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

        {/* Main wheel area — centered */}
        <View style={styles.centerContainer}>
          {phase === 'wheel' && (
            <>
              {/* Title above wheel */}
              <Animated.View style={{ opacity: labelOpacity, marginBottom: hp(18), alignItems: 'center' }}>
                {currentTicket?.campaign?.name ? (
                  <Text style={[styles.modalTitle, { fontFamily: fonts.bold }]} numberOfLines={2}>{currentTicket.campaign.name}</Text>
                ) : (
                  <Text style={[styles.modalTitle, { fontFamily: fonts.bold }]}>{t('luckyWheel.title')}</Text>
                )}
                {currentTicket?.campaign?.merchant?.nom ? (
                  <Text style={[styles.merchantName, { fontFamily: fonts.semibold }]}>
                    {t('luckyWheel.merchantLabel', { merchant: currentTicket.campaign.merchant.nom })}
                  </Text>
                ) : (
                  <Text style={[styles.modalSubtitle, { fontFamily: fonts.regular }]}>{t('luckyWheel.subtitle')}</Text>
                )}
                {Platform.OS === 'ios' && (
                  <Text style={{ fontSize: 10, textAlign: 'center', opacity: 0.5, marginTop: 4, letterSpacing: -0.2 }}>
                    Apple Inc. n'est ni sponsor ni partenaire de ce jeu
                  </Text>
                )}
                {Platform.OS === 'android' && (
                  <Text style={{ fontSize: 10, textAlign: 'center', opacity: 0.5, marginTop: 4, letterSpacing: -0.2 }}>
                    Google LLC n'est ni sponsor ni partenaire de ce jeu
                  </Text>
                )}
                <Text style={{ fontSize: 10, textAlign: 'center', opacity: 0.6, marginTop: 4, letterSpacing: -0.2, fontFamily: fonts.medium }}>
                  {t('luckyWheel.noPurchaseNotice')}
                </Text>
                <Text style={{ fontSize: 10, textAlign: 'center', opacity: 0.55, marginTop: 2, letterSpacing: -0.2 }}>
                  {t('luckyWheel.notGamblingNotice')}
                </Text>
                <Text style={{ fontSize: 10, textAlign: 'center', opacity: 0.55, marginTop: 2, letterSpacing: -0.2 }}>
                  {t('luckyWheel.merchantOrganizedNotice')}
                </Text>
                <Text style={{ fontSize: 10, textAlign: 'center', opacity: 0.5, marginTop: 4, letterSpacing: -0.2 }}>
                  {t('luckyWheel.storeDisclaimer')}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    router.push('/legal/terms');
                  }}
                  accessibilityRole="link"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{ fontSize: 11, textAlign: 'center', marginTop: 2, color: palette.goldLight, textDecorationLine: 'underline' }}>
                    {t('luckyWheel.rulesLink')}
                  </Text>
                </TouchableOpacity>
              </Animated.View>

              <View style={styles.glowRing}>
                <Animated.View style={[
                  styles.bigWheel,
                  {
                    transform: [
                      { scale: scaleAnim },
                      { rotate: spinRotation },
                    ],
                  },
                ]}>
                  <Pressable
                    onPress={ticketCount > 0 && !spinning && !spinLockRef.current ? handleSpin : undefined}
                    style={styles.wheelPressable}
                    accessibilityRole="button"
                    accessibilityLabel={t('luckyWheel.spin')}
                    accessibilityState={{ disabled: ticketCount === 0 || spinning }}
                  >
                    <LuckyWheelIcon size={BIG_WHEEL} segments={wheelSegments} />
                  </Pressable>
                </Animated.View>
              </View>

              {/* Odds disclosure — required by App Store & Google Play */}
              {!spinning && currentTicket?.campaign && (
                <Animated.View style={{ opacity: labelOpacity, marginTop: hp(12), alignItems: 'center' }}>
                  <View style={styles.oddsContainer}>
                    <Text style={[styles.oddsTitle, { fontFamily: fonts.semibold }]}>
                      {t('luckyWheel.winRate', { rate: Math.round((currentTicket.campaign.globalWinRate ?? 0) * 100) })}
                    </Text>
                    {currentTicket.campaign.prizes?.length > 0 && (() => {
                      const { perPrize, lostPct } = computeOddsBreakdown(
                        currentTicket.campaign.prizes,
                        currentTicket.campaign.globalWinRate ?? 0,
                      );
                      return (
                        <View style={styles.oddsList}>
                          {currentTicket.campaign.prizes.map((p: LuckyWheelPrize, i: number) => (
                            <Text key={p.id ?? i} style={[styles.oddsItem, { fontFamily: fonts.regular }]}>
                              {p.label} — {perPrize[i]}%
                            </Text>
                          ))}
                          <Text style={[styles.oddsItem, { fontFamily: fonts.regular, opacity: 0.7 }]}>
                            {t('luckyWheel.lost')} — {lostPct}%
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                </Animated.View>
              )}

              {/* Label below wheel */}
              <Animated.View style={{ opacity: labelOpacity, marginTop: hp(20) }}>
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : isError ? (
                  <Text style={[styles.wheelLabel, { color: '#fff', fontFamily: fonts.bold }]}>{t('luckyWheel.errorDraw')}</Text>
                ) : spinning ? (
                  <Text style={[styles.wheelLabel, { color: palette.goldLight, fontFamily: fonts.bold }]}>{t('luckyWheel.spinning')}</Text>
                ) : ticketCount > 0 ? (
                  <View style={styles.labelGroup}>
                    <View style={styles.ticketBadge}>
                      <Ticket size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                      <Text style={[styles.ticketBadgeText, { fontFamily: fonts.semibold }]}>
                        {t('luckyWheel.ticketsAvailable', { count: ticketCount })}
                      </Text>
                    </View>
                    <Text style={[styles.spinCta, { fontFamily: fonts.bold }]}>
                      {t('luckyWheel.spin')}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.labelGroup}>
                    <Text style={[styles.wheelLabel, { color: '#fff', fontFamily: fonts.bold }]}>{t('luckyWheel.noTickets')}</Text>
                    <Text style={[styles.wheelHint, { color: 'rgba(255,255,255,0.65)', fontFamily: fonts.regular }]}>
                      {t('luckyWheel.noTicketsHint')}
                    </Text>
                  </View>
                )}
              </Animated.View>

              {/* History link */}
              <TouchableOpacity onPress={() => setPhase('history')} activeOpacity={0.7} style={styles.historyLink}>
                <Clock size={ms(14)} color="rgba(255,255,255,0.6)" strokeWidth={1.5} />
                <Text style={[styles.historyLinkText, { fontFamily: fonts.medium }]}>{t('luckyWheel.history')}</Text>
              </TouchableOpacity>
            </>
          )}

          {phase === 'history' && (
            <View style={[styles.historyCard, { backgroundColor: theme.bgCard }]}>
              <View style={styles.historyHeader}>
                <TouchableOpacity onPress={() => setPhase('wheel')} activeOpacity={0.7} hitSlop={8}>
                  <ChevronLeft size={ms(22)} color={theme.text} strokeWidth={2} />
                </TouchableOpacity>
                <Text style={[styles.historyTitle, { color: theme.text, fontFamily: fonts.bold }]}>{t('luckyWheel.history')}</Text>
                <View style={{ width: ms(22) }} />
              </View>
              {historyLoading ? (
                <ActivityIndicator size="small" color={palette.violet} style={{ marginTop: hp(24) }} />
              ) : historyData.length === 0 ? (
                <View style={styles.historyEmpty}>
                  <Clock size={ms(32)} color={theme.textMuted} strokeWidth={1.2} />
                  <Text style={[styles.historyEmptyText, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('luckyWheel.noHistory')}</Text>
                </View>
              ) : (
                <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
                  {historyData.map((draw: LuckyWheelDraw) => {
                    const isWon = draw.result === 'WON';
                    const date = new Date(draw.createdAt);
                    const dateStr = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
                    let status = '';
                    if (isWon) {
                      if (draw.fulfilment === FULFILMENT_CLAIMED) status = t('luckyWheel.claimed');
                      else if (draw.fulfilment === FULFILMENT_EXPIRED || (draw.claimBefore && new Date(draw.claimBefore) < new Date())) status = t('luckyWheel.expired');
                      else status = t('luckyWheel.pending');
                    }
                    return (
                      <View
                        key={draw.id}
                        style={[styles.historyRow, { borderBottomColor: theme.border }]}
                        accessible
                        accessibilityRole="text"
                        accessibilityLabel={t('luckyWheel.historyItemA11y', {
                          result: isWon ? (draw.prize?.label ?? t('luckyWheel.won')) : t('luckyWheel.lost'),
                          merchant: draw.ticket?.campaign?.merchant?.nom ?? '',
                          campaign: draw.ticket?.campaign?.name ?? '',
                          date: dateStr,
                        })}
                      >
                        <View style={[styles.historyIcon, { backgroundColor: isWon ? `${palette.violet}15` : `${palette.red}10` }]}>
                          {isWon ? <Trophy size={ms(18)} color={palette.violet} strokeWidth={1.5} /> : <Frown size={ms(18)} color={palette.red} strokeWidth={1.5} />}
                        </View>
                        <View style={styles.historyInfo}>
                          <Text style={[styles.historyPrize, { color: theme.text, fontFamily: fonts.semibold }]}>
                            {isWon ? draw.prize?.label ?? t('luckyWheel.won') : t('luckyWheel.lost')}
                          </Text>
                          <Text style={[styles.historyCampaign, { color: theme.textMuted, fontFamily: fonts.regular }]}>
                            {[draw.ticket?.campaign?.merchant?.nom, draw.ticket?.campaign?.name].filter(Boolean).join(' · ')} · {dateStr}
                          </Text>
                          {isWon && status ? (
                            <Text style={[styles.historyStatus, {
                              color: draw.fulfilment === FULFILMENT_CLAIMED ? '#10B981' : (status === t('luckyWheel.expired') ? palette.red : palette.gold),
                              fontFamily: fonts.medium,
                            }]}>
                              {status}
                              {draw.claimBefore && draw.fulfilment !== FULFILMENT_CLAIMED && draw.fulfilment !== FULFILMENT_EXPIRED && new Date(draw.claimBefore) > new Date()
                                ? ` — ${t('luckyWheel.claimBefore', { date: new Date(draw.claimBefore).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) })}`
                                : ''}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}

          {phase === 'result' && drawResult && (
            <Animated.View style={[styles.resultCard, { backgroundColor: theme.bgCard, transform: [{ scale: scaleAnim }] }]}>
              {drawResult.result === 'WON' ? (
                <>
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    <LinearGradient colors={brandGradient as [string, string]} style={styles.resultIcon}>
                      <Trophy size={ms(40)} color="#FFF" strokeWidth={1.5} />
                    </LinearGradient>
                  </Animated.View>
                  <Text style={[styles.resultTitle, { color: theme.text, fontFamily: fonts.bold }]}>{t('luckyWheel.resultWon')}</Text>
                  <Text style={[styles.resultDesc, { color: theme.textSecondary, fontFamily: fonts.regular }]}>
                    {t('luckyWheel.resultWonDesc', { prize: drawResult.prize?.label ?? '' })}
                  </Text>
                </>
              ) : (
                <>
                  <View style={[styles.resultIcon, { backgroundColor: `${palette.red}15` }]}>
                    <Frown size={ms(40)} color={palette.red} strokeWidth={1.5} />
                  </View>
                  <Text style={[styles.resultTitle, { color: theme.text, fontFamily: fonts.bold }]}>{t('luckyWheel.resultLost')}</Text>
                  <Text style={[styles.resultDesc, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('luckyWheel.resultLostDesc')}</Text>
                </>
              )}
              {ticketCount > 0 ? (
                <>
                  <TouchableOpacity
                    onPress={() => { setDrawResult(null); setPhase('wheel'); }}
                    activeOpacity={0.8}
                    style={styles.resultCloseBtn}
                  >
                    <LinearGradient colors={brandGradient as [string, string]} style={styles.resultCloseBtnGradient}>
                      <Text style={[styles.resultCloseBtnText, { fontFamily: fonts.semibold }]}>{t('luckyWheel.replay')}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleClose} activeOpacity={0.7} style={styles.resultSecondaryBtn}>
                    <Text style={[styles.resultSecondaryBtnText, { color: theme.textMuted, fontFamily: fonts.medium }]}>{t('luckyWheel.close')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity onPress={handleClose} activeOpacity={0.8} style={styles.resultCloseBtn}>
                  <LinearGradient colors={brandGradient as [string, string]} style={styles.resultCloseBtnGradient}>
                    <Text style={[styles.resultCloseBtnText, { fontFamily: fonts.semibold }]}>{t('luckyWheel.close')}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </Animated.View>
          )}
        </View>

        {/* Close X in top-right */}
        <Animated.View style={[styles.closeBtn, { opacity: overlayAnim }]}>
          <TouchableOpacity onPress={handleClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <View style={styles.closeBtnCircle}>
              <X size={ms(20)} color="#fff" strokeWidth={1.5} />
            </View>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
})

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(8,2,20,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Title
  modalTitle: {
    fontSize: FS['2xl'],
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    color: '#FFF',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    fontSize: FS.sm,
    fontFamily: 'Lexend_400Regular',
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: hp(4),
  },
  merchantName: {
    fontSize: FS.md,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
    color: palette.goldLight,
    textAlign: 'center',
    marginTop: hp(4),
  },

  // Glow ring around wheel
  glowRing: {
    width: BIG_WHEEL + ms(24),
    height: BIG_WHEEL + ms(24),
    borderRadius: (BIG_WHEEL + ms(24)) / 2,
    borderWidth: 2,
    borderColor: 'rgba(245,158,11,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.violet,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 16,
  },

  // Big wheel
  bigWheel: {
    width: BIG_WHEEL,
    height: BIG_WHEEL,
    borderRadius: BIG_WHEEL / 2,
    shadowColor: palette.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 14,
  },
  wheelPressable: {
    width: BIG_WHEEL,
    height: BIG_WHEEL,
    borderRadius: BIG_WHEEL / 2,
    overflow: 'hidden',
  },

  // Odds disclosure (store compliance)
  oddsContainer: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: ms(12),
    paddingHorizontal: ms(16),
    paddingVertical: ms(10),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    maxWidth: SCREEN_W - wp(80),
  },
  oddsTitle: {
    fontSize: FS.sm,
    fontWeight: '600',
    color: palette.goldLight,
    textAlign: 'center',
    marginBottom: hp(4),
  },
  oddsList: {
    gap: hp(2),
    alignItems: 'center',
  },
  oddsItem: {
    fontSize: FS.xs,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },

  // Labels
  labelGroup: { alignItems: 'center', gap: hp(8) },
  wheelLabel: {
    fontSize: FS.lg,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    textAlign: 'center',
  },
  wheelHint: {
    fontSize: FS.sm,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    paddingHorizontal: wp(30),
  },
  ticketBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: ms(14),
    paddingVertical: ms(6),
    borderRadius: ms(20),
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  ticketBadgeText: {
    fontSize: FS.sm,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
    color: palette.goldLight,
  },
  spinCta: {
    fontSize: FS.md,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.3,
  },

  // Close button
  closeBtn: {
    position: 'absolute',
    top: hp(50),
    right: wp(20),
  },
  closeBtnCircle: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Result card
  resultCard: {
    width: SCREEN_W - wp(60),
    borderRadius: radius['2xl'],
    padding: ms(28),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  resultIcon: {
    width: ms(80),
    height: ms(80),
    borderRadius: ms(40),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(16),
  },
  resultTitle: { fontSize: FS['2xl'], fontWeight: '700', fontFamily: 'Lexend_700Bold', textAlign: 'center' },
  resultDesc: { fontSize: FS.md, marginTop: hp(8), textAlign: 'center', fontFamily: 'Lexend_400Regular' },
  resultCloseBtn: { marginTop: hp(24), width: '100%', borderRadius: radius.md, overflow: 'hidden' },
  resultCloseBtnGradient: { paddingVertical: hp(14), borderRadius: radius.md, alignItems: 'center' },
  resultCloseBtnText: { color: '#FFF', fontSize: FS.md, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  resultSecondaryBtn: { marginTop: hp(10), paddingVertical: hp(8), alignItems: 'center' },
  resultSecondaryBtnText: { fontSize: FS.sm, fontWeight: '500' },

  // History link below wheel
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    marginTop: hp(12),
    paddingVertical: hp(6),
    paddingHorizontal: ms(12),
  },
  historyLinkText: {
    fontSize: FS.sm,
    color: 'rgba(255,255,255,0.6)',
  },

  // History view
  historyCard: {
    width: SCREEN_W - wp(40),
    maxHeight: Dimensions.get('window').height * 0.7,
    borderRadius: radius['2xl'],
    padding: ms(20),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: hp(16),
  },
  historyTitle: {
    fontSize: FS.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  historyEmpty: {
    alignItems: 'center',
    paddingVertical: hp(40),
    gap: hp(12),
  },
  historyEmptyText: {
    fontSize: FS.md,
    textAlign: 'center',
  },
  historyList: {
    maxHeight: Dimensions.get('window').height * 0.55,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: hp(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: ms(12),
  },
  historyIcon: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyInfo: {
    flex: 1,
    gap: hp(2),
  },
  historyPrize: {
    fontSize: FS.md,
    fontWeight: '600',
  },
  historyCampaign: {
    fontSize: FS.xs,
  },
  historyStatus: {
    fontSize: FS.xs,
    marginTop: hp(2),
  },
});
