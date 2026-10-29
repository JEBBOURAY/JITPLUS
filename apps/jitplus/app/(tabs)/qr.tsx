import { useCallback, useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ScrollView, Image,
  Animated,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { Text } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import {
  Share2, X, ShieldCheck, Sun, WifiOff, RotateCcw, QrCode, ScanLine, Stamp, TriangleAlert,
} from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenCapture from 'expo-screen-capture';
import { useKeepAwake } from 'expo-keep-awake';
import { haptic, HapticStyle } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import FadeInView from '@/components/FadeInView';
import StarLoader from '@/components/StarLoader';
import GuestGuard from '@/components/GuestGuard';
import QrActionSheet from '@/components/qr/QrActionSheet';
import QrRefreshBar from '@/components/qr/QrRefreshBar';
import QrSuccessOverlay from '@/components/qr/QrSuccessOverlay';
import { useBrightnessBoost } from '@/hooks/useBrightnessBoost';
import { useQrCardExport, ViewShot } from '@/hooks/useQrCardExport';
import { useQrToken } from '@/hooks/useQrToken';
import { useScanDetection } from '@/hooks/useScanDetection';
import type { StampsEvent } from '@/stores/wsStore';
import type { LoyaltyCard } from '@/types';
import { useAppFonts } from '@/utils/fonts';
import { getCardProgress } from '@/utils/cardProgress';
import { preloadSounds } from '@/utils/sounds';
import { wp, hp, ms, fontSize, radius, SCREEN } from '@/utils/responsive';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const QR_SIZE = Math.min(SCREEN.width - wp(120), wp(250));
const GRADIENT_CARD = [palette.violetDeep, palette.violetDark, palette.violet] as const;
const GRADIENT_START = { x: 0, y: 0 } as const;
const GRADIENT_END = { x: 1, y: 1 } as const;
const SCROLLED_THRESHOLD = 4;

export default function QRScreen() {
  const theme = useTheme();
  const isDark = theme.mode === 'dark';
  const { client, isGuest } = useAuth();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const insets = useSafeAreaInsets();

  // iOS HIG + Material: keep screen on while a scannable code is visible.
  // Auto-released on unmount — no cleanup needed.
  useKeepAwake('jitplus-qr');

  const { qrValue, qrLoading, qrExpiresAt, qrError, isOffline, refreshDelayMs, fetchQrToken, retry } = useQrToken(client?.id);
  const brightnessBoosted = useBrightnessBoost(!isGuest);
  const { viewShotRef: qrViewRef, share, saveToGallery } = useQrCardExport(t);

  const [showGuidBadge, setShowGuidBadge] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [successEvent, setSuccessEvent] = useState<StampsEvent | null>(null);
  const [successGoal, setSuccessGoal] = useState<number | null>(null);

  useEffect(() => { preloadSounds('stamp', 'reward'); }, []);

  useFocusEffect(useCallback(() => {
    // Anti-exfiltration: no screenshots/recordings of the QR token. Sharing
    // goes through the in-app button, which captures the card deliberately.
    ScreenCapture.preventScreenCaptureAsync('jitplus-qr').catch(() => {});
    AsyncStorage.getItem('showGuidBadge')
      .then((val) => { if (val === '1') setShowGuidBadge(true); })
      .catch(() => {});
    return () => { ScreenCapture.allowScreenCaptureAsync('jitplus-qr').catch(() => {}); };
  }, []));

  // ── Real-time scan confirmation ──
  const qrExpiresAtRef = useRef<number | null>(null);
  useEffect(() => { qrExpiresAtRef.current = qrExpiresAt; }, [qrExpiresAt]);
  const handleScan = useCallback((ev: StampsEvent, card: LoyaltyCard | undefined) => {
    setShowActionMenu(false);
    setSuccessGoal(card ? getCardProgress(card).goal : null);
    setSuccessEvent(ev);
    // v2 tokens are single-use: get the next one ready straight away.
    if (qrExpiresAtRef.current) fetchQrToken();
  }, [fetchQrToken]);
  useScanDetection({ enabled: !isGuest, onScan: handleScan });

  const handleRetry = useCallback(() => {
    haptic(HapticStyle.Light);
    retry();
  }, [retry]);

  // Soft cross-fade when the code is renewed, so the change is visible but calm.
  const [qrOpacity] = useState(() => new Animated.Value(1));
  const prevQrRef = useRef<string | null>(null);
  useEffect(() => {
    if (qrValue && prevQrRef.current && prevQrRef.current !== qrValue) {
      qrOpacity.setValue(0.25);
      Animated.timing(qrOpacity, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    }
    prevQrRef.current = qrValue;
  }, [qrValue, qrOpacity]);

  const handleDismissSuccess = useCallback(() => setSuccessEvent(null), []);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrolled = e.nativeEvent.contentOffset.y > SCROLLED_THRESHOLD;
    setIsScrolled((prev) => (prev === scrolled ? prev : scrolled));
  }, []);

  const closeActionMenu = useCallback(() => setShowActionMenu(false), []);
  const handleShareQR = useCallback(() => { setShowActionMenu(false); share(); }, [share]);
  const handleSaveToGallery = useCallback(() => { setShowActionMenu(false); saveToGallery(); }, [saveToGallery]);

  const handleCloseGuidBadge = useCallback(() => {
    haptic(HapticStyle.Light);
    setShowGuidBadge(false);
    AsyncStorage.setItem('showGuidBadge', '0').catch(() => {});
  }, []);
  if (isGuest) return <GuestGuard />;

  const fullName = client ? `${client.prenom || ''} ${client.nom || ''}`.trim() || t('qr.client') : t('qr.client');
  // v2 tokens (qrExpiresAt != null) are short-lived + single-use, so sharing a
  // captured image yields an already-invalid QR. Only legacy v1 tokens can be shared.
  const canShare = qrExpiresAt == null && !!qrValue;
  const accent = isDark ? palette.violetLight : palette.violet;

  const renderQrContent = () => {
    if (qrLoading) {
      return (
        <View style={styles.qrState}>
          <StarLoader size={88} tone="light" />
          <Text style={[styles.qrStateHint, { fontFamily: fonts.medium }]}>{t('qr.generating')}</Text>
        </View>
      );
    }
    if (qrValue) {
      return (
        <Animated.View style={{ opacity: qrOpacity }}>
          <QRCode value={qrValue} size={QR_SIZE} backgroundColor="#ffffff" color={palette.violetDeep} quietZone={wp(10)} />
        </Animated.View>
      );
    }
    if (qrError) {
      const offline = qrError === 'offline';
      return (
        <View style={styles.qrState}>
          <View style={[styles.qrStateIcon, { backgroundColor: offline ? '#F1F5F9' : '#FEF2F2' }]}>
            {offline
              ? <WifiOff size={ms(26)} color={palette.gray500} strokeWidth={2} />
              : <TriangleAlert size={ms(26)} color={palette.red} strokeWidth={2} />}
          </View>
          <Text style={[styles.qrStateTitle, { fontFamily: fonts.bold }]}>
            {offline ? t('qr.offlineTitle') : t('qr.generateError')}
          </Text>
          <Text style={[styles.qrStateHint, { fontFamily: fonts.regular }]}>
            {offline ? t('qr.offlineHint') : t('qr.errorHint')}
          </Text>
          <TouchableOpacity
            onPress={handleRetry}
            activeOpacity={0.85}
            style={styles.retryBtn}
            accessibilityRole="button"
            accessibilityLabel={t('qr.retryAccessibility')}
          >
            <RotateCcw size={ms(15)} color="#fff" strokeWidth={2.2} />
            <Text style={[styles.retryBtnText, { fontFamily: fonts.bold }]}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  };

  const card = (
    <LinearGradient colors={GRADIENT_CARD} start={GRADIENT_START} end={GRADIENT_END} style={styles.card}>
      <View style={[styles.orb, styles.orbA]} />
      <View style={[styles.orb, styles.orbB]} />

      <View style={styles.cardTop}>
        <View style={styles.cardLogoWrap}>
          <Image source={require('@/assets/images/jitpluslogo-app.png')} style={styles.cardLogo} resizeMode="contain" />
        </View>
        <View style={styles.cardIdentity}>
          <Text style={[styles.cardLabel, { fontFamily: fonts.semibold }]} numberOfLines={1}>{t('qr.loyaltyCard')}</Text>
          <Text style={[styles.cardName, { fontFamily: fonts.bold }]} numberOfLines={1}>{fullName}</Text>
        </View>
        {isOffline && !!qrValue && (
          <View style={styles.offlinePill}>
            <WifiOff size={ms(11)} color="#fff" strokeWidth={2.2} />
            <Text style={[styles.offlinePillText, { fontFamily: fonts.semibold }]}>{t('qr.offlineBadge')}</Text>
          </View>
        )}
      </View>

      <View
        style={styles.qrPanel}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('qr.qrAccessibility')}
      >
        {renderQrContent()}
      </View>

      <View style={styles.cardStatus}>
        <ShieldCheck size={ms(14)} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        <Text style={[styles.cardStatusText, { fontFamily: fonts.medium }]} numberOfLines={1}>
          {qrExpiresAt ? t('qr.secureAuto') : t('qr.securePermanent')}
        </Text>
      </View>
      {!!qrExpiresAt && !!qrValue && (
        <View style={styles.cardBar}>
          <QrRefreshBar
            durationMs={refreshDelayMs}
            cycleKey={qrValue}
            color={palette.goldLight}
            trackColor="rgba(255,255,255,0.16)"
          />
        </View>
      )}
    </LinearGradient>
  );

  const steps = [
    { icon: QrCode, label: t('qr.step1') },
    { icon: ScanLine, label: t('qr.step2') },
    { icon: Stamp, label: t('qr.step3') },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + hp(10), backgroundColor: theme.bg, borderBottomColor: isScrolled ? theme.border : 'transparent' },
          isScrolled && !isDark && styles.headerShadow,
        ]}
      >
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={1} accessibilityRole="header">
              {t('qr.title')}
            </Text>
            <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: fonts.medium }]} numberOfLines={1}>
              {t('qr.subtitle')}
            </Text>
          </View>
          {canShare && !!ViewShot && (
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
              onPress={() => { haptic(HapticStyle.Light); setShowActionMenu(true); }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('qr.actionsAccessibility')}
            >
              <Share2 size={ms(18)} color={theme.text} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: hp(130) + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={32}
      >
        <FadeInView delay={60} duration={380} distance={hp(12)}>
          <View style={styles.cardShadow}>
            {ViewShot ? (
              <ViewShot ref={qrViewRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
                {card}
              </ViewShot>
            ) : card}
          </View>
        </FadeInView>

        {brightnessBoosted && !!qrValue && (
          <FadeInView delay={200} duration={300} distance={hp(6)}>
            <View style={[styles.infoPill, { backgroundColor: isDark ? '#2A2113' : palette.goldUltraLight }]}>
              <Sun size={ms(13)} color={palette.goldDark} strokeWidth={2.2} />
              <Text style={[styles.infoPillText, { color: isDark ? palette.goldLight : palette.goldDark, fontFamily: fonts.semibold }]} numberOfLines={1}>
                {t('qr.brightness')}
              </Text>
            </View>
          </FadeInView>
        )}

        {showGuidBadge && !!client?.id && (
          <FadeInView delay={240} duration={300} distance={hp(6)}>
            <View style={[styles.idBadge, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.idBadgeLabel, { color: theme.textMuted, fontFamily: fonts.medium }]}>{t('qr.clientId')}</Text>
                <Text style={[styles.idBadgeValue, { color: theme.text }]} selectable>
                  {client.id.slice(0, 8)}···{client.id.slice(-4)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleCloseGuidBadge}
                hitSlop={12}
                style={[styles.idBadgeClose, { backgroundColor: theme.bgInput }]}
                accessibilityRole="button"
                accessibilityLabel={t('qr.closeIdBadge')}
              >
                <X size={ms(13)} color={theme.textSecondary} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
          </FadeInView>
        )}

        <FadeInView delay={280} duration={350} distance={hp(8)}>
          <View style={[styles.stepsCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[styles.stepsTitle, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header">
              {t('qr.howTitle')}
            </Text>
            <View style={styles.stepsRow}>
              {steps.map(({ icon: Icon, label }, i) => (
                <View key={i} style={styles.step}>
                  <View style={[styles.stepIcon, { backgroundColor: `${palette.violet}${isDark ? '2E' : '12'}` }]}>
                    <Icon size={ms(18)} color={accent} strokeWidth={2} />
                    <View style={[styles.stepNum, { backgroundColor: palette.violet, borderColor: theme.bgCard }]}>
                      <Text style={[styles.stepNumText, { fontFamily: fonts.bold }]}>{i + 1}</Text>
                    </View>
                  </View>
                  <Text style={[styles.stepLabel, { color: theme.textSecondary, fontFamily: fonts.medium }]} numberOfLines={2}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </FadeInView>
      </ScrollView>
      <QrActionSheet
        visible={showActionMenu}
        bottomInset={insets.bottom}
        theme={theme}
        fonts={fonts}
        t={t}
        onClose={closeActionMenu}
        onShare={handleShareQR}
        onSave={handleSaveToGallery}
      />

      <QrSuccessOverlay event={successEvent} goal={successGoal} onDismiss={handleDismissSuccess} theme={theme} fonts={fonts} t={t} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header (mirrors the home / notifications headers)
  header: {
    paddingHorizontal: wp(20), paddingBottom: hp(12),
    borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 10,
  },
  headerShadow: {
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: wp(8), minHeight: ms(46) },
  titleBlock: { flex: 1 },
  title: { fontSize: fontSize['3xl'], letterSpacing: -0.6 },
  subtitle: { fontSize: fontSize.sm, marginTop: hp(1) },
  iconBtn: {
    width: ms(44), height: ms(44), borderRadius: ms(22), borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: wp(16), paddingTop: hp(10), flexGrow: 1 },

  // Loyalty card
  cardShadow: {
    borderRadius: radius['2xl'],
    shadowColor: palette.violetDark, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 8,
  },
  card: { borderRadius: radius['2xl'], padding: wp(18), overflow: 'hidden', alignItems: 'center' },
  orb: { position: 'absolute', borderRadius: 999 },
  orbA: { width: ms(220), height: ms(220), top: -ms(90), right: -ms(70), backgroundColor: 'rgba(255,255,255,0.08)' },
  orbB: { width: ms(160), height: ms(160), bottom: -ms(70), left: -ms(50), backgroundColor: 'rgba(251,191,36,0.14)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: wp(12), alignSelf: 'stretch', marginBottom: hp(18) },
  cardLogoWrap: {
    width: ms(44), height: ms(44), borderRadius: ms(14), backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  cardLogo: { width: ms(34), height: ms(34) },
  cardIdentity: { flex: 1, minWidth: 0 },
  cardLabel: { color: 'rgba(255,255,255,0.72)', fontSize: ms(11), letterSpacing: 0.8, textTransform: 'uppercase' },
  cardName: { color: '#FFFFFF', fontSize: fontSize.lg, marginTop: hp(2), letterSpacing: -0.2 },
  offlinePill: {
    flexDirection: 'row', alignItems: 'center', gap: wp(4),
    backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: wp(8), paddingVertical: hp(4), borderRadius: 999,
  },
  offlinePillText: { color: '#fff', fontSize: ms(10) },
  qrPanel: {
    backgroundColor: '#FFFFFF', borderRadius: radius.xl, padding: wp(14),
    alignItems: 'center', justifyContent: 'center',
  },
  qrState: { width: QR_SIZE, height: QR_SIZE, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wp(10) },
  qrStateIcon: { width: ms(56), height: ms(56), borderRadius: ms(18), alignItems: 'center', justifyContent: 'center', marginBottom: hp(12) },
  qrStateTitle: { fontSize: fontSize.md, color: palette.gray900, textAlign: 'center' },
  qrStateHint: { fontSize: fontSize.xs, color: palette.gray500, textAlign: 'center', marginTop: hp(6), lineHeight: ms(17) },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6), marginTop: hp(14),
    backgroundColor: palette.violet, paddingHorizontal: wp(18), height: ms(40), borderRadius: 999,
  },
  retryBtnText: { color: '#fff', fontSize: fontSize.sm },
  cardStatus: { flexDirection: 'row', alignItems: 'center', gap: wp(6), marginTop: hp(14) },
  cardStatusText: { color: 'rgba(255,255,255,0.85)', fontSize: fontSize.xs, flexShrink: 1 },
  cardBar: { alignSelf: 'stretch', marginTop: hp(10), paddingHorizontal: wp(24) },

  // Info pill (brightness)
  infoPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(6), alignSelf: 'center',
    paddingHorizontal: wp(12), paddingVertical: hp(6), borderRadius: 999, marginTop: hp(14),
  },
  infoPillText: { fontSize: ms(11), flexShrink: 1 },

  // Client ID (shown once for new users)
  idBadge: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12),
    borderWidth: 1, borderRadius: radius.lg, paddingVertical: hp(10), paddingHorizontal: wp(14), marginTop: hp(14),
  },
  idBadgeLabel: { fontSize: ms(11) },
  idBadgeValue: { fontSize: fontSize.md, fontFamily: 'SpaceMono', letterSpacing: 1, marginTop: hp(2) },
  idBadgeClose: { width: ms(28), height: ms(28), borderRadius: ms(14), alignItems: 'center', justifyContent: 'center' },

  // How it works
  stepsCard: { borderWidth: 1, borderRadius: radius.xl, padding: wp(16), marginTop: hp(14) },
  stepsTitle: { fontSize: fontSize.md, marginBottom: hp(14), letterSpacing: -0.2 },
  stepsRow: { flexDirection: 'row', gap: wp(8) },
  step: { flex: 1, alignItems: 'center' },
  stepIcon: { width: ms(46), height: ms(46), borderRadius: ms(16), alignItems: 'center', justifyContent: 'center', marginBottom: hp(8) },
  stepNum: {
    position: 'absolute', top: -ms(5), right: -ms(5),
    width: ms(19), height: ms(19), borderRadius: ms(10), borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { color: '#fff', fontSize: ms(9) },
  stepLabel: { fontSize: ms(11), textAlign: 'center', lineHeight: ms(15) },

});
