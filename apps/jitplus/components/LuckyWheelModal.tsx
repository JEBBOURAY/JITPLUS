import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Easing,
  Modal, Alert, ScrollView, StatusBar, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, History, Info, RefreshCw, Ticket, X } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAppFonts } from '@/utils/fonts';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { extractErrorMessage } from '@/utils/errorMessage';
import { useLuckyWheelAvailableDraws, useTriggerLuckyWheelDraw, useLuckyWheelHistory } from '@/hooks/useQueryHooks';
import { haptic, hapticSelection, hapticSuccess, HapticStyle } from '@/utils/haptics';
import {
  buildWheelSegments, computeLandingRotation, getDrawStatus, groupTicketsByCampaign,
  pickTargetSegment, segmentAtPointer,
} from '@/utils/luckyWheel';
import type { LuckyWheelCampaign, LuckyWheelDrawResult } from '@/types';
import MerchantLogo from './MerchantLogo';
import WheelStage from './luckyWheel/WheelStage';
import WheelResultSheet from './luckyWheel/WheelResultSheet';
import WheelHistory from './luckyWheel/WheelHistory';
import WheelPrizeList from './luckyWheel/WheelPrizeList';
import CampaignPicker from './luckyWheel/CampaignPicker';

const LOCALE_TAGS: Record<string, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar-MA' };
const BG_GRADIENT = ['#24104A', '#150830', '#0B0418'] as const;

// Cruise speed (deg/s). The spin-up ends at this speed and the landing starts
// at it, so the hand-off between the two animations is seamless.
const CRUISE_SPEED = 960;
const SPIN_UP_DEG = 180;
const SPIN_UP_MS = ((2 * SPIN_UP_DEG) / CRUISE_SPEED) * 1000;
const MIN_SPIN_MS = 900;
const MIN_LANDING_TRAVEL = 360 * 4.5;
const MIN_LANDING_MS = 2800;
const TICK_HAPTIC_INTERVAL_MS = 80;

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface ShownResult {
  data: LuckyWheelDrawResult;
  merchantName: string;
  remaining: number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default React.memo(function LuckyWheelModal({ visible, onClose }: Props) {
  const theme = useTheme();
  const { t, locale, isRTL } = useLanguage();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const fonts = useAppFonts();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const localeTag = LOCALE_TAGS[locale] ?? 'fr-FR';

  const {
    data: tickets = [], isLoading, isError, refetch,
  } = useLuckyWheelAvailableDraws(isAuthenticated && visible);
  const { data: historyData = [], isLoading: historyLoading } = useLuckyWheelHistory(isAuthenticated && visible);
  const drawMutation = useTriggerLuckyWheelDraw();

  const [phase, setPhase] = useState<'wheel' | 'history'>('wheel');
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<ShownResult | null>(null);
  const [usedIds, setUsedIds] = useState<string[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  // Freezes the wheel on the campaign being played: the ticket list refetches
  // mid-spin and must not swap the segments under the pointer.
  const [lockedCampaign, setLockedCampaign] = useState<LuckyWheelCampaign | null>(null);
  const [autoSpin, setAutoSpin] = useState(false);

  const spinAnim = useRef(new Animated.Value(0)).current;
  const pointerKick = useRef(new Animated.Value(0)).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(1)).current;
  const rotationRef = useRef(0);
  const rampRef = useRef<Animated.CompositeAnimation | null>(null);
  const spinLockRef = useRef(false);
  const mountedRef = useRef(true);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const available = useMemo(
    () => tickets.filter((tk) => !tk.used && !usedIds.includes(tk.id)),
    [tickets, usedIds],
  );
  const groups = useMemo(() => groupTicketsByCampaign(available), [available]);
  const group = groups.find((g) => g.campaignId === selectedCampaignId) ?? groups[0];
  const ticket = group?.tickets[0];
  const campaign = lockedCampaign ?? ticket?.campaign ?? null;
  const availableCountRef = useRef(0);
  availableCountRef.current = available.length;

  const pendingCount = useMemo(
    () => historyData.filter((d) => getDrawStatus(d) === 'pending').length,
    [historyData],
  );

  const lostLabel = t('luckyWheel.lostShort');
  const segments = useMemo(
    () => (campaign?.prizes?.length
      ? buildWheelSegments(campaign.prizes, campaign.globalWinRate ?? 0, lostLabel)
      : undefined),
    [campaign, lostLabel],
  );

  const wheelSize = Math.round(Math.min(wp(300), screenW - ms(72), screenH * 0.4));

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!visible) return;
    setPhase('wheel');
    setResult(null);
    setSpinning(false);
    setUsedIds([]);
    setSelectedCampaignId(null);
    setLockedCampaign(null);
    setAutoSpin(false);
    spinLockRef.current = false;
    entrance.setValue(0);
    Animated.spring(entrance, { toValue: 1, damping: 14, stiffness: 110, useNativeDriver: true }).start();
  }, [visible, entrance]);

  useEffect(() => {
    contentFade.setValue(0);
    Animated.timing(contentFade, {
      toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
  }, [phase, contentFade]);

  // Pointer flick + light tick each time a segment boundary passes the pointer.
  useEffect(() => {
    const count = segments?.length ?? 0;
    if (!count) return undefined;
    let last = segmentAtPointer(rotationRef.current, count);
    let lastHaptic = 0;
    const id = spinAnim.addListener(({ value }) => {
      rotationRef.current = value;
      const idx = segmentAtPointer(value, count);
      if (idx === last) return;
      last = idx;
      pointerKick.setValue(1);
      Animated.spring(pointerKick, {
        toValue: 0, stiffness: 320, damping: 14, mass: 0.6, useNativeDriver: true,
      }).start();
      const now = Date.now();
      if (now - lastHaptic > TICK_HAPTIC_INTERVAL_MS) {
        lastHaptic = now;
        hapticSelection();
      }
    });
    return () => spinAnim.removeListener(id);
  }, [segments, spinAnim, pointerKick]);

  const stopSpin = useCallback(() => {
    rampRef.current?.stop();
    rampRef.current = null;
    spinAnim.stopAnimation((v) => { rotationRef.current = v; });
  }, [spinAnim]);

  const handleClose = useCallback(() => {
    stopSpin();
    spinLockRef.current = false;
    setSpinning(false);
    onClose();
  }, [onClose, stopSpin]);

  const dismissResult = useCallback(() => {
    setResult(null);
    setLockedCampaign(null);
  }, []);

  const handleSpin = useCallback(async () => {
    if (spinLockRef.current || !ticket || !segments?.length) return;
    const playedCampaign = ticket.campaign;
    const segs = segments;
    spinLockRef.current = true;
    setLockedCampaign(playedCampaign);
    setSelectedCampaignId(playedCampaign.id);
    setSpinning(true);
    haptic(HapticStyle.Medium);

    const start = rotationRef.current % 360;
    spinAnim.setValue(start);
    rotationRef.current = start;
    rampRef.current = Animated.sequence([
      Animated.timing(spinAnim, {
        toValue: start + SPIN_UP_DEG, duration: SPIN_UP_MS, easing: Easing.in(Easing.quad), useNativeDriver: true,
      }),
      Animated.timing(spinAnim, {
        toValue: start + SPIN_UP_DEG + CRUISE_SPEED * 30, duration: 30_000, easing: Easing.linear, useNativeDriver: true,
      }),
    ]);
    rampRef.current.start();
    const minUntil = Date.now() + MIN_SPIN_MS;

    try {
      const res = await drawMutation.mutateAsync(ticket.id);
      if (!mountedRef.current || !visibleRef.current) return;
      setUsedIds((ids) => [...ids, ticket.id]);
      const remainingWait = minUntil - Date.now();
      if (remainingWait > 0) await wait(remainingWait);
      if (!mountedRef.current || !visibleRef.current || !spinLockRef.current) return;

      const target = pickTargetSegment(segs, res.result === 'WON' ? res.prize : null);
      rampRef.current?.stop();
      rampRef.current = null;
      spinAnim.stopAnimation((current) => {
        if (!mountedRef.current) return;
        const finalAngle = computeLandingRotation(current, target, segs.length, MIN_LANDING_TRAVEL, Math.random() - 0.5);
        // Ease-out quad starts at 2 × average speed: match it to the cruise speed.
        const duration = Math.max(MIN_LANDING_MS, ((2 * (finalAngle - current)) / CRUISE_SPEED) * 1000);
        Animated.timing(spinAnim, {
          toValue: finalAngle, duration, easing: Easing.out(Easing.quad), useNativeDriver: true,
        }).start(({ finished }) => {
          if (!mountedRef.current || !finished) return;
          rotationRef.current = finalAngle;
          spinLockRef.current = false;
          setSpinning(false);
          setResult({
            data: res,
            merchantName: playedCampaign.merchant?.nom || playedCampaign.name,
            remaining: availableCountRef.current,
          });
          if (res.result === 'WON') hapticSuccess();
          else haptic(HapticStyle.Light);
        });
      });
    } catch (err) {
      rampRef.current?.stop();
      rampRef.current = null;
      spinAnim.stopAnimation((current) => {
        Animated.timing(spinAnim, {
          toValue: current + 90, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true,
        }).start();
      });
      spinLockRef.current = false;
      if (!mountedRef.current) return;
      setSpinning(false);
      setLockedCampaign(null);
      if (visibleRef.current) Alert.alert(t('common.error'), extractErrorMessage(err));
    }
  }, [ticket, segments, drawMutation, spinAnim, t]);

  const handleReplay = useCallback(() => {
    dismissResult();
    setAutoSpin(true);
  }, [dismissResult]);

  const handleSpinRef = useRef(handleSpin);
  handleSpinRef.current = handleSpin;

  // "Replay" from the result sheet spins straight away once the sheet is gone.
  // Reads handleSpin through a ref so a ticket refetch can't cancel the timer.
  useEffect(() => {
    if (!autoSpin || result || spinning) return undefined;
    const id = setTimeout(() => {
      setAutoSpin(false);
      void handleSpinRef.current();
    }, 280);
    return () => clearTimeout(id);
  }, [autoSpin, result, spinning]);

  const handleViewPrizes = useCallback(() => {
    dismissResult();
    setPhase('history');
  }, [dismissResult]);

  const handleRequestClose = useCallback(() => {
    if (result) dismissResult();
    else if (phase === 'history') setPhase('wheel');
    else handleClose();
  }, [result, phase, dismissResult, handleClose]);

  const openRules = useCallback(() => {
    handleClose();
    router.push('/legal/terms');
  }, [handleClose, router]);

  const spinRotation = spinAnim.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });
  const contentTranslate = contentFade.interpolate({ inputRange: [0, 1], outputRange: [hp(10), 0] });

  const canSpin = !!ticket && !!segments?.length && !spinning && !result;
  const spinsLeft = group?.tickets.length ?? 0;
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const merchantName = campaign?.merchant?.nom || campaign?.name || '';

  const renderStatus = () => {
    if (isLoading && !campaign) {
      return <ActivityIndicator color={palette.goldLight} style={{ marginTop: hp(28) }} />;
    }
    if (isError && !campaign) {
      return (
        <View style={styles.stateCard}>
          <Text style={[styles.stateTitle, { fontFamily: fonts.bold }]}>{t('luckyWheel.loadError')}</Text>
          <TouchableOpacity onPress={() => { void refetch(); }} activeOpacity={0.8} style={styles.ghostBtn} accessibilityRole="button">
            <RefreshCw size={ms(16)} color="#fff" strokeWidth={2} />
            <Text style={[styles.ghostBtnText, { fontFamily: fonts.semibold }]}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (!ticket && !lockedCampaign) {
      return (
        <View style={styles.stateCard}>
          <View style={styles.stateIcon}>
            <Ticket size={ms(26)} color={palette.goldLight} strokeWidth={1.8} />
          </View>
          <Text style={[styles.stateTitle, { fontFamily: fonts.bold }]}>{t('luckyWheel.noTickets')}</Text>
          <Text style={[styles.stateHint, { fontFamily: fonts.regular }]}>{t('luckyWheel.noTicketsHint')}</Text>
          {pendingCount > 0 && (
            <TouchableOpacity onPress={() => setPhase('history')} activeOpacity={0.8} style={styles.ghostBtn} accessibilityRole="button">
              <Text style={[styles.ghostBtnText, { fontFamily: fonts.semibold }]}>{t('luckyWheel.viewPrizes')}</Text>
              <View style={styles.badge}>
                <Text style={[styles.badgeText, { fontFamily: fonts.bold }]}>{pendingCount}</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    return (
      <View style={styles.ctaBlock}>
        <View style={styles.spinsRow}>
          {spinning ? (
            <Text style={[styles.spinningText, { fontFamily: fonts.semibold }]}>{t('luckyWheel.spinning')}</Text>
          ) : (
            <View style={styles.spinsPill}>
              <Ticket size={ms(14)} color={palette.goldLight} strokeWidth={2} />
              <Text style={[styles.spinsText, { fontFamily: fonts.semibold }]}>
                {spinsLeft === 1 ? t('luckyWheel.spinsLeftOne') : t('luckyWheel.spinsLeftOther', { count: spinsLeft })}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={handleSpin}
          disabled={!canSpin}
          activeOpacity={0.85}
          style={[styles.spinBtnWrap, !canSpin && styles.spinBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t('luckyWheel.spinCta')}
          accessibilityState={{ disabled: !canSpin, busy: spinning }}
        >
          <LinearGradient
            colors={[palette.goldSoft, palette.goldLight, palette.goldDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.spinBtn}
          >
            {spinning ? (
              <ActivityIndicator color="#3B1D06" />
            ) : (
              <Text style={[styles.spinBtnText, { fontFamily: fonts.bold }]}>{t('luckyWheel.spinCta')}</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleRequestClose}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={BG_GRADIENT} style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + hp(8) }]}>
          <TouchableOpacity
            onPress={phase === 'history' ? () => setPhase('wheel') : handleClose}
            activeOpacity={0.7}
            style={styles.iconBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={phase === 'history' ? t('common.back') : t('common.close')}
          >
            {phase === 'history'
              ? <BackIcon size={ms(22)} color="#fff" strokeWidth={2} />
              : <X size={ms(20)} color="#fff" strokeWidth={2} />}
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { fontFamily: fonts.bold }]} numberOfLines={1} accessibilityRole="header">
            {phase === 'history' ? t('luckyWheel.history') : t('luckyWheel.title')}
          </Text>
          {phase === 'wheel' ? (
            <TouchableOpacity
              onPress={() => setPhase('history')}
              disabled={spinning}
              activeOpacity={0.7}
              style={[styles.iconBtn, spinning && { opacity: 0.4 }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={pendingCount > 0
                ? `${t('luckyWheel.history')}, ${t('luckyWheel.toCollect', { count: pendingCount })}`
                : t('luckyWheel.history')}
            >
              <History size={ms(20)} color="#fff" strokeWidth={2} />
              {pendingCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={[styles.headerBadgeText, { fontFamily: fonts.bold }]}>{pendingCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.iconBtnSpacer} />
          )}
        </View>

        <Animated.View style={[styles.body, { opacity: contentFade, transform: [{ translateY: contentTranslate }] }]}>
          {phase === 'history' ? (
            <WheelHistory
              draws={historyData}
              loading={historyLoading}
              localeTag={localeTag}
              bottomInset={insets.bottom}
              fonts={fonts}
              t={t}
            />
          ) : (
            <ScrollView
              style={styles.body}
              contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + hp(28) }]}
              showsVerticalScrollIndicator={false}
              scrollEnabled={!spinning}
            >
              {groups.length > 1 && (
                <CampaignPicker
                  groups={groups}
                  selectedId={campaign?.id}
                  disabled={spinning || !!result}
                  fonts={fonts}
                  t={t}
                  onSelect={setSelectedCampaignId}
                />
              )}

              {campaign && (
                <View style={styles.merchantRow}>
                  <MerchantLogo logoUrl={campaign.merchant?.logoUrl} merchantName={merchantName} style={styles.merchantLogo} />
                  <View style={styles.merchantText}>
                    <Text style={[styles.merchantName, { fontFamily: fonts.bold }]} numberOfLines={1}>{merchantName}</Text>
                    {!!campaign.name && campaign.name !== merchantName && (
                      <Text style={[styles.campaignName, { fontFamily: fonts.regular }]} numberOfLines={1}>{campaign.name}</Text>
                    )}
                  </View>
                </View>
              )}

              <View style={styles.stage}>
                <WheelStage
                  size={wheelSize}
                  segments={segments}
                  rotation={spinRotation}
                  pointerKick={pointerKick}
                  entrance={entrance}
                  spinning={spinning}
                  dimmed={!campaign}
                  onPress={canSpin ? handleSpin : undefined}
                  accessibilityLabel={t('luckyWheel.spinCta')}
                />
              </View>

              {renderStatus()}

              {campaign && campaign.prizes?.length > 0 && (
                <View style={styles.section}>
                  <WheelPrizeList prizes={campaign.prizes} globalWinRate={campaign.globalWinRate ?? 0} fonts={fonts} t={t} />
                </View>
              )}

              <View style={styles.legal}>
                <View style={styles.legalHeader}>
                  <Info size={ms(14)} color="rgba(255,255,255,0.6)" strokeWidth={2} />
                  <Text style={[styles.legalTitle, { fontFamily: fonts.semibold }]}>{t('luckyWheel.goodToKnow')}</Text>
                </View>
                <Text style={[styles.legalText, { fontFamily: fonts.medium }]}>{t('luckyWheel.noPurchaseNotice')}</Text>
                <Text style={[styles.legalText, { fontFamily: fonts.regular }]}>{t('luckyWheel.notGamblingNotice')}</Text>
                <Text style={[styles.legalText, { fontFamily: fonts.regular }]}>{t('luckyWheel.merchantOrganizedNotice')}</Text>
                <Text style={[styles.legalText, { fontFamily: fonts.regular }]}>{t('luckyWheel.storeDisclaimer')}</Text>
                <TouchableOpacity onPress={openRules} accessibilityRole="link" hitSlop={8} style={styles.rulesBtn}>
                  <Text style={[styles.rulesText, { fontFamily: fonts.semibold }]}>{t('luckyWheel.rulesLink')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </Animated.View>

        {result && (
          <WheelResultSheet
            result={result.data}
            merchantName={result.merchantName}
            remainingTickets={result.remaining}
            localeTag={localeTag}
            bottomInset={insets.bottom}
            theme={theme}
            fonts={fonts}
            t={t}
            onReplay={handleReplay}
            onClose={handleClose}
            onViewPrizes={handleViewPrizes}
            onDismiss={dismissResult}
          />
        )}
      </LinearGradient>
    </Modal>
  );
});

const ICON_BTN = ms(40);

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(16),
    paddingBottom: hp(8),
  },
  headerTitle: { flex: 1, color: '#fff', fontSize: FS.lg, textAlign: 'center', marginHorizontal: ms(8) },
  iconBtn: {
    width: ICON_BTN,
    height: ICON_BTN,
    borderRadius: ICON_BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  iconBtnSpacer: { width: ICON_BTN, height: ICON_BTN },
  headerBadge: {
    position: 'absolute',
    top: -ms(3),
    right: -ms(3),
    minWidth: ms(18),
    height: ms(18),
    borderRadius: ms(9),
    paddingHorizontal: ms(4),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.goldLight,
    borderWidth: 2,
    borderColor: '#1E0D40',
  },
  headerBadgeText: { color: '#3B1D06', fontSize: ms(10) },

  body: { flex: 1 },
  scroll: { alignItems: 'center', paddingTop: hp(8) },

  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(10),
    paddingHorizontal: wp(24),
    maxWidth: '100%',
  },
  merchantLogo: { width: ms(36), height: ms(36), borderRadius: ms(18), backgroundColor: '#fff' },
  merchantText: { flexShrink: 1 },
  merchantName: { color: '#fff', fontSize: FS.md },
  campaignName: { color: 'rgba(255,255,255,0.6)', fontSize: FS.xs, marginTop: hp(1) },

  stage: { marginTop: hp(14), marginBottom: hp(6), alignItems: 'center' },

  ctaBlock: { alignSelf: 'stretch', alignItems: 'center', paddingHorizontal: wp(24) },
  spinsRow: { height: ms(32), alignItems: 'center', justifyContent: 'center', marginBottom: hp(10) },
  spinsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    paddingHorizontal: ms(12),
    paddingVertical: ms(6),
    borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
  },
  spinsText: { color: palette.goldLight, fontSize: FS.sm },
  spinningText: { color: palette.goldLight, fontSize: FS.md },
  spinBtnWrap: {
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: palette.gold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  spinBtnDisabled: { opacity: 0.55 },
  spinBtn: { height: ms(56), alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  spinBtnText: { color: '#3B1D06', fontSize: FS.lg, letterSpacing: 0.2 },

  stateCard: {
    alignSelf: 'stretch',
    marginHorizontal: wp(24),
    alignItems: 'center',
    gap: hp(8),
    paddingVertical: hp(18),
    paddingHorizontal: wp(20),
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  stateIcon: {
    width: ms(52),
    height: ms(52),
    borderRadius: ms(26),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251,191,36,0.12)',
    marginBottom: hp(2),
  },
  stateTitle: { color: '#fff', fontSize: FS.lg, textAlign: 'center' },
  stateHint: { color: 'rgba(255,255,255,0.6)', fontSize: FS.sm, textAlign: 'center', lineHeight: ms(20) },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    marginTop: hp(6),
    paddingHorizontal: ms(16),
    height: ms(42),
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  ghostBtnText: { color: '#fff', fontSize: FS.sm },
  badge: {
    minWidth: ms(20),
    height: ms(20),
    borderRadius: ms(10),
    paddingHorizontal: ms(5),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.goldLight,
  },
  badgeText: { color: '#3B1D06', fontSize: FS.xs },

  section: { alignSelf: 'stretch', paddingHorizontal: wp(20), marginTop: hp(22) },

  legal: { alignSelf: 'stretch', paddingHorizontal: wp(24), marginTop: hp(22), gap: hp(6) },
  legalHeader: { flexDirection: 'row', alignItems: 'center', gap: ms(6), marginBottom: hp(2) },
  legalTitle: { color: 'rgba(255,255,255,0.7)', fontSize: FS.xs, textTransform: 'uppercase', letterSpacing: 0.8 },
  legalText: { color: 'rgba(255,255,255,0.45)', fontSize: ms(11), lineHeight: ms(16) },
  rulesBtn: { alignSelf: 'flex-start', marginTop: hp(4) },
  rulesText: { color: palette.goldLight, fontSize: FS.xs, textDecorationLine: 'underline' },
});
