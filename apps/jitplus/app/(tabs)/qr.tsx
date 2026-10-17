import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, Platform, TouchableOpacity, Alert, ScrollView, Image,
  ActivityIndicator, Modal, Animated, Pressable,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import {
  Share2, X, Download, ShieldCheck, Sun, WifiOff, RotateCcw, QrCode, ScanLine, Stamp, TriangleAlert,
} from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Brightness from 'expo-brightness';
import * as ScreenCapture from 'expo-screen-capture';
import { useKeepAwake } from 'expo-keep-awake';
import NetInfo from '@react-native-community/netinfo';
import { haptic, hapticSuccess, HapticStyle } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/services/api';
import FadeInView from '@/components/FadeInView';
import GuestGuard from '@/components/GuestGuard';
import QrRefreshBar from '@/components/qr/QrRefreshBar';
import QrSuccessOverlay from '@/components/qr/QrSuccessOverlay';
import { useStampsOverview } from '@/hooks/useQueryHooks';
import { useWsStore, type StampsEvent } from '@/stores/wsStore';
import { useAppFonts } from '@/utils/fonts';
import { getCardProgress } from '@/utils/cardProgress';
import type { LoyaltyCard } from '@/types';
import { preloadSounds } from '@/utils/sounds';
import { wp, hp, ms, fontSize, radius, SCREEN } from '@/utils/responsive';

// react-native-view-shot is NOT available in Expo Go SDK 51+
import type ViewShotType from 'react-native-view-shot';
import type { ViewShotRef } from 'react-native-view-shot';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

let ViewShot: typeof ViewShotType | null = null;
try {
  ViewShot = require('react-native-view-shot').default as typeof ViewShotType;
} catch {
  // Not available in Expo Go — share QR will be disabled
}

// expo-media-library is a NATIVE module. It must be loaded lazily: an eager
// top-level `import` runs requireNativeModule() at module-eval time, which THROWS
// on binaries that don't contain the native code (e.g. an OTA/EAS update shipped
// to an older build). That throw makes the whole route module fail to load, so
// expo-router receives `undefined` from loadRoute() and crashes in fromImport
// with "Cannot read property 'ErrorBoundary' of undefined". Loading it in a
// try/catch keeps the QR screen working; save-to-gallery just degrades gracefully.
let MediaLibrary: typeof import('expo-media-library') | null = null;
try {
  MediaLibrary = require('expo-media-library');
} catch {
  // Native module not present in this binary — save-to-gallery will be disabled
}

const QR_SIZE = Math.min(SCREEN.width - wp(120), wp(250));
const QR_TOKEN_STORAGE_KEY = 'qr_permanent_token';
const GRADIENT_CARD = [palette.violetDeep, palette.violetDark, palette.violet] as const;
const GRADIENT_START = { x: 0, y: 0 } as const;
const GRADIENT_END = { x: 1, y: 1 } as const;
const SCROLLED_THRESHOLD = 4;
const SCAN_POLL_MS = 4000;
/** The same scan can arrive by WebSocket, push and polling: show it once. */
const SCAN_DEDUPE_MS = 30_000;

type QrErrorKind = 'offline' | 'server' | null;

function toBalanceMap(cards: LoyaltyCard[]): Map<string, number> {
  return new Map(cards.map((c) => [c.merchantId, c.balance ?? 0]));
}

/** Seconds until a v2 token should be refreshed (~10s before expiry, never < 5s). */
function getRefreshDelayS(expiresAt: number): number {
  const nowS = Math.floor(Date.now() / 1000);
  return Math.max(5, expiresAt - nowS - 10);
}

export default function QRScreen() {
  const theme = useTheme();
  const isDark = theme.mode === 'dark';
  const { client, isGuest } = useAuth();
  const { t } = useLanguage();
  const { regular, medium, semibold, bold } = useAppFonts();
  const fonts = useMemo(() => ({ regular, medium, semibold, bold }), [regular, medium, semibold, bold]);
  const insets = useSafeAreaInsets();

  // iOS HIG + Material: keep screen on while a scannable code is visible.
  // Auto-released on unmount — no cleanup needed.
  useKeepAwake('jitplus-qr');

  const qrViewRef = useRef<ViewShotRef | null>(null);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(true);
  // v2 tokens expire (~60s). Null for v1 permanent tokens.
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [qrError, setQrError] = useState<QrErrorKind>(null);
  const qrErrorRef = useRef<QrErrorKind>(null);
  // Read by the NetInfo listener without re-subscribing it on every change.
  useEffect(() => { qrErrorRef.current = qrError; }, [qrError]);
  const [isOffline, setIsOffline] = useState(false);
  const isFocusedRef = useRef(false);
  const focusedAtRef = useRef(0);
  const fetchingQrRef = useRef(false);

  const [showGuidBadge, setShowGuidBadge] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [brightnessBoosted, setBrightnessBoosted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [successEvent, setSuccessEvent] = useState<StampsEvent | null>(null);
  const [successGoal, setSuccessGoal] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Keeps the cards query observed so a scan received while the QR is shown
  // refetches balances immediately instead of only marking them stale.
  // Also polled while the QR is visible: the WebSocket event can be missed
  // (expired token, or emitted by another Cloud Run instance than the one
  // holding this socket), so a balance change is the fallback scan signal.
  const { data: stampsOverview, refetch: refetchStamps } = useStampsOverview(
    !isGuest,
    isFocused && !isGuest ? SCAN_POLL_MS : false,
  );
  const cardsRef = useRef(stampsOverview?.cards);
  useEffect(() => { cardsRef.current = stampsOverview?.cards; }, [stampsOverview]);
  const refetchStampsRef = useRef(refetchStamps);
  useEffect(() => { refetchStampsRef.current = refetchStamps; }, [refetchStamps]);
  const isGuestRef = useRef(isGuest);
  useEffect(() => { isGuestRef.current = isGuest; }, [isGuest]);
  // Last known balance per merchant, compared against each poll to detect a scan.
  const balancesRef = useRef<Map<string, number> | null>(null);
  const balancesReadyRef = useRef(false);

  useEffect(() => { preloadSounds('stamp', 'reward'); }, []);

  /** Fetch a fresh QR token.
   *  - v2 tokens are short-lived (~60s) + single-use → never cached, refreshed periodically
   *  - v1 legacy permanent tokens → cached in SecureStore for offline display
   */
  const fetchQrToken = useCallback(async () => {
    if (!client?.id) return;
    if (fetchingQrRef.current) return; // Prevent concurrent fetches (focus + timer race)
    fetchingQrRef.current = true;

    let showedCached = false;
    // Try cached v1 token first (SecureStore — encrypted on-device)
    try {
      const cached = Platform.OS === 'web'
        ? null // Web has no SecureStore — always fetch fresh
        : await SecureStore.getItemAsync(QR_TOKEN_STORAGE_KEY);
      // Only accept legacy v1 tokens from cache (v2 are too short-lived to cache)
      if (cached && cached.startsWith('v1.')) {
        setQrValue(`jitplus://scan/${cached}`);
        setQrLoading(false);
        showedCached = true;
        // Continue to fetch fresh in background (server may have upgraded to v2)
      }
    } catch { /* ignore cache miss */ }

    // Skip fetch when offline
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      setIsOffline(true);
      // Only a cached v1 token is still valid offline; a leftover v2 token is
      // about to expire (or already has), so don't show a code that won't scan.
      if (!showedCached) { setQrValue(null); setQrError('offline'); setQrLoading(false); }
      fetchingQrRef.current = false;
      return;
    }
    setIsOffline(false);
    setQrError(null);
    try {
      const resp = await api.getQrToken();
      const qr_token = resp.qr_token;
      const expiresAt = (resp as { expiresAt?: number }).expiresAt;
      // Only persist v1 permanent tokens; v2 are too short-lived to cache.
      if (Platform.OS !== 'web') {
        if (qr_token.startsWith('v1.')) {
          await SecureStore.setItemAsync(QR_TOKEN_STORAGE_KEY, qr_token);
        } else {
          // Drop any stale v1 cache once backend starts returning v2
          await SecureStore.deleteItemAsync(QR_TOKEN_STORAGE_KEY).catch(() => {});
        }
      }
      setQrValue(`jitplus://scan/${qr_token}`);
      setQrExpiresAt(typeof expiresAt === 'number' ? expiresAt : null);
    } catch (e) {
      if (__DEV__) console.warn('QR token error:', e);
      setQrValue(null);
      setQrError('server');
    } finally {
      setQrLoading(false);
      fetchingQrRef.current = false;
    }
  }, [client?.id]);

  const handleRetry = useCallback(() => {
    haptic(HapticStyle.Light);
    setQrError(null);
    setQrLoading(true);
    fetchQrToken();
  }, [fetchQrToken]);

  // Fetch QR token on focus. For v2 (short-lived), always refresh on focus.
  // For v1 (legacy), re-use cached value.
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      focusedAtRef.current = Date.now();
      setIsFocused(true);
      fetchQrToken();

      // The cached balances may predate this visit: baseline on a fresh fetch
      // so changes made while away aren't replayed as a live scan.
      balancesReadyRef.current = false;
      if (!isGuestRef.current) {
        refetchStampsRef.current()
          .then((res) => { if (res.data) balancesRef.current = toBalanceMap(res.data.cards); })
          .catch(() => {})
          .finally(() => { balancesReadyRef.current = true; });
      }

      // ── Brightness boost ── maximize screen brightness for QR readability
      // (HIG / Material best practice for scannable codes). Restore on blur.
      // We override the WINDOW brightness (not system), then release it on blur
      // via restoreSystemBrightnessAsync so the OS auto-brightness takes over again.
      // A keep-alive re-applies max brightness if Android resets it (some OEMs
      // revert window brightness when a system dialog/notification briefly takes
      // focus). Throttled to every 8s with a concurrency guard to keep the JS↔native
      // bridge idle and avoid frame drops while the user views the QR.
      let brightnessKeepAlive: ReturnType<typeof setInterval> | null = null;
      let brightnessApplying = false;
      const applyBrightness = async () => {
        if (brightnessApplying) return;
        brightnessApplying = true;
        try {
          const current = await Brightness.getBrightnessAsync().catch(() => 0);
          if (current < 0.98) await Brightness.setBrightnessAsync(1);
          setBrightnessBoosted(true);
        } catch { /* non-fatal */ }
        finally { brightnessApplying = false; }
      };
      applyBrightness();
      brightnessKeepAlive = setInterval(applyBrightness, 8000);

      // ── Screen capture protection ── prevent screenshots/recordings of the
      // QR token (anti-exfiltration). User can still share via the in-app
      // button which generates a signed image deliberately.
      ScreenCapture.preventScreenCaptureAsync('jitplus-qr').catch(() => {});

      // Recover automatically when the connection comes back.
      const unsubscribeNet = NetInfo.addEventListener((state) => {
        const offline = state.isConnected === false;
        setIsOffline(offline);
        if (!offline && qrErrorRef.current === 'offline') {
          setQrLoading(true);
          fetchQrToken();
        }
      });

      // Show GUID badge only if new-user flag is set
      AsyncStorage.getItem('showGuidBadge').then((val) => {
        if (val === '1') setShowGuidBadge(true);
      });

      return () => {
        isFocusedRef.current = false;
        setIsFocused(false);
        unsubscribeNet();
        // Stop the brightness keep-alive loop
        if (brightnessKeepAlive) clearInterval(brightnessKeepAlive);
        // Release the window brightness override → the OS auto-brightness /
        // user-set system brightness immediately takes over again. This is
        // more reliable than restoring a captured numeric value (which can
        // fail to read on some Android OEMs).
        Brightness.restoreSystemBrightnessAsync().catch(() => {});
        setBrightnessBoosted(false);
        ScreenCapture.allowScreenCaptureAsync('jitplus-qr').catch(() => {});
      };
    }, [fetchQrToken])
  );

  // Auto-refresh v2 tokens ~10s before expiry while the screen is focused.
  // `qrValue` is a dependency so every new token restarts the countdown bar too.
  const refreshDelayMs = useMemo(
    () => (qrExpiresAt ? getRefreshDelayS(qrExpiresAt) * 1000 : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qrExpiresAt, qrValue],
  );
  useEffect(() => {
    if (!qrExpiresAt) return; // v1 permanent token → no refresh needed
    const timer = setTimeout(() => {
      if (isFocusedRef.current) fetchQrToken();
    }, refreshDelayMs);
    return () => clearTimeout(timer);
  }, [qrExpiresAt, refreshDelayMs, fetchQrToken]);

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

  // ── Real-time scan confirmation ──
  const qrExpiresAtRef = useRef<number | null>(null);
  useEffect(() => { qrExpiresAtRef.current = qrExpiresAt; }, [qrExpiresAt]);
  const recentScansRef = useRef(new Map<string, number>());

  const showScanEvent = useCallback((ev: StampsEvent) => {
    balancesRef.current?.set(ev.merchantId, ev.newBalance);
    const key = `${ev.merchantId}:${ev.type}:${ev.newBalance}`;
    const now = Date.now();
    const seenAt = recentScansRef.current.get(key);
    if (seenAt && now - seenAt < SCAN_DEDUPE_MS) return;
    recentScansRef.current.set(key, now);

    const card = cardsRef.current?.find((c) => c.merchantId === ev.merchantId);
    setShowActionMenu(false);
    setSuccessGoal(card ? getCardProgress(card).goal : null);
    setSuccessEvent({ ...ev, merchantName: ev.merchantName || card?.merchant?.nomBoutique || '' });
    // v2 tokens are single-use: get the next one ready straight away.
    if (qrExpiresAtRef.current) fetchQrToken();
  }, [fetchQrToken]);

  // Source 1: WebSocket / foreground push (both land in the ws store).
  useEffect(() => useWsStore.subscribe((state, prev) => {
    const ev = state.lastStampsEvent;
    if (!ev || ev === prev.lastStampsEvent || !isFocusedRef.current) return;
    if (ev.receivedAt < focusedAtRef.current) return;
    // Manual balance corrections from the merchant back-office aren't a scan.
    if (ev.type === 'ADJUST_STAMPS') return;
    showScanEvent(ev);
  }), [showScanEvent]);

  // Source 2: a card balance changed in the polled overview.
  useEffect(() => {
    const cards = stampsOverview?.cards;
    if (!cards) return;
    const previous = balancesRef.current;
    balancesRef.current = toBalanceMap(cards);
    if (!previous || !balancesReadyRef.current || !isFocusedRef.current) return;
    const changed = cards.find((c) => (c.balance ?? 0) !== (previous.get(c.merchantId) ?? 0));
    if (!changed) return;
    const before = previous.get(changed.merchantId) ?? 0;
    const after = changed.balance ?? 0;
    showScanEvent({
      clientId: changed.clientId,
      merchantId: changed.merchantId,
      merchantName: changed.merchant?.nomBoutique ?? '',
      stamps: Math.abs(after - before),
      newBalance: after,
      type: after > before ? 'EARN_STAMPS' : 'REDEEM_REWARD',
      receivedAt: Date.now(),
    });
  }, [stampsOverview, showScanEvent]);

  const handleDismissSuccess = useCallback(() => setSuccessEvent(null), []);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrolled = e.nativeEvent.contentOffset.y > SCROLLED_THRESHOLD;
    setIsScrolled((prev) => (prev === scrolled ? prev : scrolled));
  }, []);

  /** Capture the loyalty card as a PNG tmpfile via ViewShot. Returns null on failure.
   *  Silent: each caller shows its own message when capture is impossible. */
  const captureCard = useCallback(async (): Promise<string | null> => {
    if (!ViewShot) return null;
    try {
      const uri = await qrViewRef.current?.capture?.();
      if (!uri) { Alert.alert(t('common.error'), t('qr.captureError')); return null; }
      return uri;
    } catch (error) {
      if (__DEV__) console.error('Capture error:', error);
      Alert.alert(t('common.error'), t('qr.captureError'));
      return null;
    }
  }, [t]);

  const handleShareQR = useCallback(async () => {
    setShowActionMenu(false);
    haptic(HapticStyle.Medium);
    if (!ViewShot) {
      Alert.alert(t('qr.sharingUnavailable'), t('qr.sharingUnavailableMsg'));
      return;
    }
    const uri = await captureCard();
    if (!uri) return;
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) { Alert.alert(t('qr.sharingUnavailable'), t('qr.sharingUnavailableMsg')); return; }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('qr.shareDialogTitle'), UTI: 'public.png' });
    } catch (error) {
      if (__DEV__) console.error('Share error:', error);
      Alert.alert(t('common.error'), t('qr.shareError'));
    }
  }, [captureCard, t]);

  /** Save the captured loyalty card to the device photo gallery (Android + iOS).
   *  Uses add-only (writeOnly) permission — the app never reads the library. */
  const handleSaveToGallery = useCallback(async () => {
    setShowActionMenu(false);
    haptic(HapticStyle.Medium);
    if (!MediaLibrary || !ViewShot) {
      Alert.alert(t('qr.saveUnavailable'), t('qr.saveUnavailableMsg'));
      return;
    }
    const uri = await captureCard();
    if (!uri) return;
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        Alert.alert(t('qr.permissionDeniedTitle'), t('qr.permissionDeniedMsg'));
        return;
      }
      // Since expo-media-library 57, the legacy saveToLibraryAsync() exported
      // from the package root always throws; Asset.create() is its replacement.
      // ViewShot returns a bare path on iOS; Photos needs a file:// URL.
      await MediaLibrary.Asset.create(uri.startsWith('/') ? `file://${uri}` : uri);
      hapticSuccess();
      Alert.alert(t('qr.savedTitle'), t('qr.savedMsg'));
    } catch (error) {
      if (__DEV__) console.error('Save to gallery error:', error);
      Alert.alert(t('common.error'), t('qr.saveError'));
    }
  }, [captureCard, t]);

  const handleCloseGuidBadge = useCallback(() => {
    haptic(HapticStyle.Light);
    setShowGuidBadge(false);
    AsyncStorage.setItem('showGuidBadge', '0');
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
          <ActivityIndicator size="large" color={palette.violet} />
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

      {/* Action menu — Share + Save to gallery (bottom sheet) */}
      <Modal
        visible={showActionMenu}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowActionMenu(false)}
      >
        <View style={styles.menuOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowActionMenu(false)} accessibilityRole="button" accessibilityLabel={t('common.close')} />
          <View style={[styles.menuSheet, { backgroundColor: theme.bgCard, paddingBottom: insets.bottom + hp(16) }]}>
            <View style={[styles.menuHandle, { backgroundColor: theme.border }]} />
            <Text style={[styles.menuTitle, { color: theme.text, fontFamily: fonts.bold }]}>{t('qr.actionsTitle')}</Text>

            <TouchableOpacity
              style={[styles.menuRow, { backgroundColor: theme.bgInput }]}
              onPress={handleShareQR}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t('qr.shareAccessibility')}
            >
              <View style={[styles.menuIcon, { backgroundColor: theme.primaryBg }]}>
                <Share2 size={ms(18)} color={theme.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuRowTitle, { color: theme.text, fontFamily: fonts.semibold }]}>{t('qr.shareTitle')}</Text>
                <Text style={[styles.menuRowSub, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('qr.shareSubtitle')}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuRow, { backgroundColor: theme.bgInput }]}
              onPress={handleSaveToGallery}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t('qr.saveAccessibility')}
            >
              <View style={[styles.menuIcon, { backgroundColor: theme.primaryBg }]}>
                <Download size={ms(18)} color={theme.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuRowTitle, { color: theme.text, fontFamily: fonts.semibold }]}>{t('qr.saveTitle')}</Text>
                <Text style={[styles.menuRowSub, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('qr.saveSubtitle')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

  // Action menu (bottom sheet)
  menuOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  menuSheet: {
    borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
    paddingHorizontal: wp(20), paddingTop: hp(10), gap: hp(10),
  },
  menuHandle: { width: wp(40), height: ms(5), borderRadius: 999, alignSelf: 'center', marginBottom: hp(6) },
  menuTitle: { fontSize: fontSize.lg, marginBottom: hp(4), letterSpacing: -0.2 },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', gap: wp(14),
    paddingVertical: hp(12), paddingHorizontal: wp(12), borderRadius: radius.lg,
  },
  menuIcon: { width: ms(42), height: ms(42), borderRadius: ms(13), alignItems: 'center', justifyContent: 'center' },
  menuRowTitle: { fontSize: fontSize.md },
  menuRowSub: { fontSize: fontSize.xs, marginTop: hp(2) },
});
