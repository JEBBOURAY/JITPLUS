import React, { useReducer, useCallback, useEffect, useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  ViewStyle,
  useWindowDimensions,
  Animated,
  AppState,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { logError } from '@/utils/devLogger';
import { CameraView, useCameraPermissions, type BarcodeSettings } from 'expo-camera';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { safeImpact, safeNotification } from '@/utils/haptics';
import {
  X,
  Flashlight,
  ArrowRight,
  Camera,
  AlertCircle,
  ArrowLeft,
  Check,
  Info,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { prefetchClientStatus, prefetchTillData } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { normalizePhone } from '@/utils/normalizePhone';
import { parseScanPayload } from '@/utils/parseScanPayload';
import { SCAN_AREA_RATIO, NAVIGATION_DELAY_MS, ASYNC_STORAGE_KEYS } from '@/constants/app';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { font, icon as iconTokens } from '@/constants/design';

import { COUNTRIES } from '@/constants/Countries';
import FirstScanGuide from '@/components/FirstScanGuide';
import { ActionButton } from '@/components/ui/ActionButton';
import { AnimatedSearchBar } from '@/components/scan/AnimatedSearchBar';
import { ScanLine } from '@/components/scan/ScanLine';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Cooldown between two identical scans (ms) */
const SCAN_COOLDOWN_MS = 5_000;
/** Show "verifying" only when the server lookup is noticeably slow */
const VERIFYING_OVERLAY_DELAY_MS = 300;
/** Max phone length accepted by the search */
const MAX_PHONE_LENGTH = 15;
/** Stable barcode-scanner settings (kept module-level so the CameraView prop
 * identity never changes — avoids re-configuring the native scanner). */
const BARCODE_SCANNER_SETTINGS: BarcodeSettings = { barcodeTypes: ['qr'] };
// The camera screen stays dark in both themes: these colors sit on the live preview
// or on solid success/danger surfaces.
const CAMERA_BG = '#0B0F14';
const ON_CAMERA = '#FFFFFF';
const OVERLAY_COLOR = 'rgba(0,0,0,0.55)';

// A live blur over the camera preview drops frames (and QR detection speed) on
// mid-range Android devices, so Android gets a flat translucent backdrop instead.
function GlassBackdrop() {
  if (Platform.OS === 'ios') {
    return <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />;
  }
  return <View style={[StyleSheet.absoluteFill, styles.glassFallback]} />;
}

const ViewfinderCorner = React.memo(function ViewfinderCorner({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const borderStyle: ViewStyle = {};
  if (position.includes('t')) borderStyle.top = 0;
  if (position.includes('b')) borderStyle.bottom = 0;
  if (position.includes('l')) borderStyle.left = 0;
  if (position.includes('r')) borderStyle.right = 0;
  if (position.includes('t')) borderStyle.borderTopWidth = 3;
  if (position.includes('b')) borderStyle.borderBottomWidth = 3;
  if (position.includes('l')) borderStyle.borderLeftWidth = 3;
  if (position.includes('r')) borderStyle.borderRightWidth = 3;

  return <View style={[styles.corner, borderStyle]} />;
});

type ScanOverlayState = {
  phase: 'idle' | 'detected' | 'verifying' | 'found' | 'error';
  message: string | null;
  name?: string | null;
};

const DetectedOverlay = React.memo(function DetectedOverlay({ overlayState, onRetry }: { overlayState: ScanOverlayState; onRetry?: () => void }) {
  const { t } = useLanguage();
  const dir = useDir();

  if (overlayState.phase === 'idle') return null;

  const isError = overlayState.phase === 'error';
  const isSuccess = overlayState.phase === 'found';

  return (
    <View style={styles.detectedOverlay} pointerEvents="box-none">
      <View style={[styles.detectedCard, isError ? styles.detectedCardError : isSuccess ? styles.detectedCardSuccess : styles.detectedCardNeutral]}>
        <View style={[styles.detectedRow, { flexDirection: dir.row }]}>
          {overlayState.phase === 'verifying' ? (
            <ActivityIndicator size="small" color="#7C3AED" />
          ) : isError ? (
            <AlertCircle size={18} color={ON_CAMERA} strokeWidth={iconTokens.stroke} />
          ) : (
            <Check size={18} color={isSuccess ? ON_CAMERA : '#7C3AED'} strokeWidth={iconTokens.stroke} />
          )}
          <View style={styles.detectedTextWrap}>
            <Text style={[styles.detectedText, isError && styles.detectedTextError, { textAlign: dir.textAlign }]}>{overlayState.message}</Text>
            {isError && onRetry ? (
              <TouchableOpacity
                style={[styles.detectedRetryBtn, { alignSelf: dir.alignStart }]}
                onPress={onRetry}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.detectedRetryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
});

const HowItWorksBanner = React.memo(function HowItWorksBanner({
  visible,
  onDismiss,
  insetTop,
}: {
  visible: boolean;
  onDismiss: () => void;
  insetTop: number;
}) {
  const { t } = useLanguage();
  const theme = useTheme();
  const dir = useDir();
  const [shouldRender, setShouldRender] = useState(visible);
  const [collapse] = useState(() => new Animated.Value(visible ? 1 : 0));
  if (visible && !shouldRender) setShouldRender(true);

  useEffect(() => {
    if (visible) {
      Animated.timing(collapse, { toValue: 1, duration: 220, useNativeDriver: false }).start();
      return;
    }
    Animated.timing(collapse, { toValue: 0, duration: 220, useNativeDriver: false }).start(({ finished }) => {
      if (finished) setShouldRender(false);
    });
  }, [collapse, visible]);

  const animatedStyle = useMemo(() => ({
    opacity: collapse,
    maxHeight: collapse.interpolate({ inputRange: [0, 1], outputRange: [0, 140] }),
    transform: [{ translateY: collapse.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
  }), [collapse]);

  if (!shouldRender) return null;

  return (
    <Animated.View
      style={[
        styles.infoBanner,
        { top: insetTop + 76, flexDirection: dir.row },
        animatedStyle,
      ]}
    >
      <GlassBackdrop />
      <View style={styles.infoBannerTint} />
      <View style={[styles.infoBannerIcon, { backgroundColor: `${theme.primary}20` }]}>
        <Info size={16} color={theme.primary} strokeWidth={iconTokens.stroke} />
      </View>
      <View style={styles.infoBannerBody}>
        <Text style={[styles.infoBannerTitle, { color: theme.text, textAlign: dir.textAlign }]}>{t('scan.howItWorksTitle')}</Text>
        <Text style={[styles.infoBannerText, { color: theme.textMuted, textAlign: dir.textAlign }]}>{t('scan.howItWorksBody')}</Text>
      </View>
      <TouchableOpacity
        style={styles.infoBannerClose}
        onPress={onDismiss}
        activeOpacity={0.8}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <X size={16} color={theme.textMuted} strokeWidth={iconTokens.stroke} />
      </TouchableOpacity>
    </Animated.View>
  );
});
type MatchedClient = { id: string; nom: string; telephone?: string; email?: string; scanTicket?: string };

/** "Prénom Nom" from a verify-qr / verify-client response; undefined when the client has no last name. */
function verifiedClientName(client: { prenom?: string | null; nom?: string | null } | null | undefined): string | undefined {
  return client?.nom ? [client.prenom, client.nom].filter(Boolean).join(' ') : undefined;
}

/** The scan ticket is only present for non-members; it lets the next screen enroll them. */
function transactionParams(clientId: string, scanTicket?: string) {
  return scanTicket ? { clientId, scanTicket } : { clientId };
}

interface ScanState {
  phoneInput: string;
  isSearchFocused: boolean;
  isSearching: boolean;
  isFlashOn: boolean;
  isScanning: boolean;
  countryIndex: number;
  matchedClients: MatchedClient[];
}

const initialScanState: ScanState = {
  phoneInput: '',
  isSearchFocused: false,
  isSearching: false,
  isFlashOn: false,
  isScanning: true,
  countryIndex: 0,
  matchedClients: [],
};

type ScanAction =
  | { type: 'SET'; payload: Partial<ScanState> }
  | { type: 'TOGGLE_FLASH' }
  | { type: 'RESET_SCAN' };

function scanReducer(state: ScanState, action: ScanAction): ScanState {
  switch (action.type) {
    case 'SET':
      return { ...state, ...action.payload };
    case 'TOGGLE_FLASH':
      return { ...state, isFlashOn: !state.isFlashOn };
    case 'RESET_SCAN':
      return { ...state, isScanning: true };
  }
}

const CameraOverlay = React.memo(function CameraOverlay({
  screenHeight,
  scanSize,
  pulseStyle,
  overlayState,
  isScanning,
  onRetry,
}: {
  screenHeight: number;
  scanSize: number;
  pulseStyle: Record<string, unknown>;
  overlayState: ScanOverlayState;
  isScanning: boolean;
  onRetry?: () => void;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.overlayTop, { height: Math.max((screenHeight - scanSize) / 2 - 40, 100) }]} />
      <View style={[styles.overlayMiddle, { height: scanSize }]}>
        <View style={styles.overlaySide} />
        <Animated.View style={[styles.scanArea, { width: scanSize, height: scanSize }, pulseStyle]}>
          <ViewfinderCorner position="tl" />
          <ViewfinderCorner position="tr" />
          <ViewfinderCorner position="bl" />
          <ViewfinderCorner position="br" />
          <ScanLine scanSize={scanSize} active={isScanning} />
          {overlayState.phase !== 'idle' ? <DetectedOverlay overlayState={overlayState} onRetry={onRetry} /> : null}
        </Animated.View>
        <View style={styles.overlaySide} />
      </View>
      <View style={styles.overlayBottom} />
    </View>
  );
});

const BottomControls = React.memo(function BottomControls({
  insetBottom,
  isFlashOn,
  onToggleFlash,
  onClose,
  t,
}: {
  insetBottom: number;
  isFlashOn: boolean;
  onToggleFlash: () => void;
  onClose: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const dir = useDir();
  return (
    <Animated.View
      style={[styles.bottomControls, { paddingBottom: Math.max(insetBottom, 26) }]}
      pointerEvents="box-none"
    >
      <View style={[styles.actionsRow, { flexDirection: dir.row }]}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onToggleFlash}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityState={{ selected: isFlashOn }}
          accessibilityLabel={isFlashOn ? t('scan.flashDeactivate') : t('scan.flashActivate')}
        >
          {isFlashOn ? (
            <View style={[styles.actionCircle, styles.actionCircleActive]}>
              <Flashlight size={22} color="#1F2937" strokeWidth={iconTokens.stroke} fill="#1F2937" />
            </View>
          ) : (
            <View style={styles.actionCircle}>
              <GlassBackdrop />
              <View style={styles.actionCircleTint} />
              <Flashlight size={22} color={ON_CAMERA} strokeWidth={iconTokens.stroke} />
            </View>
          )}
          <Text style={[styles.actionBtnLabel, isFlashOn && styles.actionBtnLabelActive]}>
            {t('scan.flash')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onClose}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <View style={styles.actionCircle}>
            <GlassBackdrop />
            <View style={styles.actionCircleTint} />
            <X size={22} color={ON_CAMERA} strokeWidth={iconTokens.stroke} />
          </View>
          <Text style={styles.actionBtnLabel}>{t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

export default function ScanQRScreen() {
  const router = useRouter();
  // Opened from the coupon screen (which replaced itself): replace again so the stack stays list → coupon-validate.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const openedFromCoupon = from === 'coupon';
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const SCAN_SIZE = SCREEN_W * SCAN_AREA_RATIO;
  const dir = useDir();

  // State
  const [scan, dispatch] = useReducer(scanReducer, initialScanState);
  const { phoneInput, isSearchFocused, isSearching, isFlashOn, isScanning, countryIndex, matchedClients } = scan;
  const set = useCallback((payload: Partial<ScanState>) => dispatch({ type: 'SET', payload }), []);

  // Debounce: prevent re-scanning the same barcode data within a cooldown
  const lastScannedRef = useRef<{ data: string; ts: number } | null>(null);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Navigation mutex: prevents QR scan and phone search from navigating simultaneously
  const isNavigatingRef = useRef(false);

  const [showGuide, setShowGuide] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showCountrySheet, setShowCountrySheet] = useState(false);
  const [overlayState, setOverlayState] = useState<ScanOverlayState>({ phase: 'idle', message: null });
  const overlayPhaseRef = useRef(overlayState.phase);
  useEffect(() => {
    overlayPhaseRef.current = overlayState.phase;
  }, [overlayState.phase]);

  // The first-scan guide and the "how it works" banner tell the same thing, so
  // a merchant only ever gets one of them: the guide on the first visit, the
  // banner only for installs that saw the guide before it replaced the banner.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.multiGet([ASYNC_STORAGE_KEYS.FIRST_SCAN_GUIDE_DONE, ASYNC_STORAGE_KEYS.SCAN_HOW_IT_WORKS_DISMISSED])
      .then(([[, guideDone], [, howDismissed]]) => {
        if (cancelled) return;
        setShowGuide(!guideDone);
        setShowHowItWorks(!!guideDone && howDismissed !== 'dismissed');
      })
      .catch((e) => logError('scan-guide', 'load', e));
    return () => { cancelled = true; };
  }, []);

  const dismissGuide = useCallback(() => {
    setShowGuide(false);
    AsyncStorage.multiSet([
      [ASYNC_STORAGE_KEYS.FIRST_SCAN_GUIDE_DONE, '1'],
      [ASYNC_STORAGE_KEYS.SCAN_HOW_IT_WORKS_DISMISSED, 'dismissed'],
    ]).catch(() => {});
  }, []);

  const dismissHowItWorks = useCallback(() => {
    setShowHowItWorks(false);
    AsyncStorage.setItem(ASYNC_STORAGE_KEYS.SCAN_HOW_IT_WORKS_DISMISSED, 'dismissed').catch(() => {});
  }, []);

  const resetScanUi = useCallback(() => {
    setOverlayState({ phase: 'idle', message: null });
  }, []);

  // Rewards and wheel info are merchant-wide: load them while the camera warms up.
  useEffect(() => {
    prefetchTillData(queryClient);
  }, [queryClient]);

  // Cleanup navigation timeouts on unmount
  useEffect(() => {
    return () => {
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
      if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
    };
  }, []);

  // Animations — only run when actively scanning to save CPU/battery
  const [pulseScale] = useState(() => new Animated.Value(1));
  const [pulseOpacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!isScanning) {
      pulseScale.setValue(1);
      pulseOpacity.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.01, duration: 1800, useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1, duration: 1800, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0.95, duration: 1800, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 1, duration: 1800, useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isScanning, pulseOpacity, pulseScale]);

  const pulseStyle = useMemo(() => ({
    transform: [{ scale: pulseScale }],
    opacity: pulseOpacity,
  }), [pulseOpacity, pulseScale]);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const renderMatchedClient = useCallback(({ item }: { item: MatchedClient }) => (
    <TouchableOpacity
      style={[styles.cpRow, { flexDirection: dir.row, borderBottomColor: theme.borderLight }]}
      onPress={() => {
        set({ matchedClients: [] });
        router.push({
          pathname: '/transaction-amount',
          params: transactionParams(item.id, item.scanTicket),
        });
      }}
      activeOpacity={0.6}
      delayPressIn={0}
    >
      <View style={styles.flexMain}>
        <Text style={[styles.cpCountryName, { color: theme.text, textAlign: dir.textAlign }]}>{item.nom}</Text>
        <Text style={[styles.clientSubtitle, { color: theme.textMuted, textAlign: dir.textAlign }]}>
          {item.telephone || item.email || ''}
        </Text>
      </View>
      <ArrowRight size={18} color={theme.primary} strokeWidth={iconTokens.stroke} style={dir.flip} />
    </TouchableOpacity>
  ), [router, theme, set, dir]);

  // cameraMounted gates the CameraView's actual mount in the tree. We must
  // fully unmount (not just `active={false}`) to release the Camera2 session;
  // otherwise Android logs `Camera2CameraImpl: Unable to configure camera ...
  // TimeoutException` while the app is backgrounded.
  // Derived from BOTH focus and AppState through a single source-of-truth
  // setter to avoid double mount/unmount when focus and AppState fire in the
  // same frame (cost ~1–2 s on Android Camera2 reconfiguration).
  const [cameraMounted, setCameraMounted] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const isFocusedRef = useRef(false);

  const syncCameraMount = useCallback(() => {
    // iOS 'inactive' (Control Center, notification shade, Face ID) only pauses
    // the preview via `active`; remounting the camera would cost ~1–2 s.
    const next = isFocusedRef.current && appStateRef.current !== 'background';
    setCameraMounted((prev) => (prev === next ? prev : next));
  }, []);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      isNavigatingRef.current = false;
      resetScanUi();
      dispatch({ type: 'SET', payload: { isScanning: true, matchedClients: [] } });
      syncCameraMount();
      return () => {
        isFocusedRef.current = false;
        dispatch({ type: 'SET', payload: { isScanning: false } });
        syncCameraMount();
      };
    }, [resetScanUi, syncCameraMount])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (appStateRef.current === s) return;
      appStateRef.current = s;
      // Do not resume scanning over a verifying/found/error overlay: a second
      // scan would run while the first one is still being processed.
      dispatch({
        type: 'SET',
        payload: { isScanning: s === 'active' && isFocusedRef.current && overlayPhaseRef.current === 'idle' },
      });
      syncCameraMount();
    });
    return () => sub.remove();
  }, [syncCameraMount]);

  const navigateToTransaction = useCallback((clientId: string, clientName?: string, scanTicket?: string) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setOverlayState({
      phase: 'found',
      message: clientName ? t('scan.clientFound', { name: clientName }) : t('scan.clientFoundFallback'),
      name: clientName ?? null,
    });
    prefetchClientStatus(queryClient, clientId, scanTicket).catch(() => {});
    if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    navTimeoutRef.current = setTimeout(() => {
      navTimeoutRef.current = null;
      router.push({
        pathname: '/transaction-amount',
        params: transactionParams(clientId, scanTicket),
      });
    }, NAVIGATION_DELAY_MS);
  }, [router, t, queryClient]);

  const handleBarCodeScanned = useCallback(
    async ({ data }: { type: string; data: string }) => {
      if (!isScanning || isNavigatingRef.current) return;

      // Debounce: skip if the same barcode was scanned within cooldown
      const now = Date.now();
      if (lastScannedRef.current && lastScannedRef.current.data === data && now - lastScannedRef.current.ts < SCAN_COOLDOWN_MS) {
        return;
      }
      lastScannedRef.current = { data, ts: now };

      set({ isScanning: false });
      setOverlayState({ phase: 'detected', message: t('scan.qrDetected') });
      if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
      overlayTimeoutRef.current = setTimeout(() => {
        setOverlayState({ phase: 'verifying', message: t('scan.verifying') });
      }, VERIFYING_OVERLAY_DELAY_MS);

      // Haptic feedback
      safeNotification(Haptics.NotificationFeedbackType.Success);

      const showScanError = (message: string) => {
        if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
        setOverlayState({ phase: 'error', message });
        safeNotification(Haptics.NotificationFeedbackType.Error);
      };

      const payload = parseScanPayload(data);

      if (payload.kind === 'coupon') {
        const couponToken = payload.token;
        if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
        isNavigatingRef.current = true;
        navTimeoutRef.current = setTimeout(() => {
          navTimeoutRef.current = null;
          const target = { pathname: '/coupon-validate', params: { token: couponToken } } as const;
          if (openedFromCoupon) router.replace(target);
          else router.push(target);
        }, NAVIGATION_DELAY_MS);
        return;
      }

      if (payload.kind === 'missingToken') {
        showScanError(t('scan.tokenMissing'));
        return;
      }

      if (payload.kind === 'signed') {
        try {
          const res = await api.post('/merchant/verify-qr', { token: payload.token });
          const clientId = res.data?.clientId;
          if (!clientId) throw new Error('no clientId');
          const scanTicket = typeof res.data?.scanTicket === 'string' ? res.data.scanTicket : undefined;
          navigateToTransaction(clientId, verifiedClientName(res.data?.client), scanTicket);
        } catch (err: unknown) {
          showScanError(getErrorMessage(err, t('scan.qrExpiredFallback')));
        }
        return;
      }

      if (payload.kind === 'invalid') {
        showScanError(t('scan.invalidQR'));
        return;
      }

      // Legacy unsigned client id: verify it server-side to prevent IDOR.
      try {
        const res = await api.post('/merchant/verify-client', { clientId: payload.clientId });
        const verifiedClientId = res.data?.clientId;
        if (!verifiedClientId) throw new Error('Client not verified');
        navigateToTransaction(verifiedClientId, verifiedClientName(res.data?.client));
      } catch (err: unknown) {
        showScanError(getErrorMessage(err, t('scan.clientNotFoundFallback')));
      }
    },
    [isScanning, navigateToTransaction, set, t, router, openedFromCoupon],
  );

  // Gate the scanner handler at the prop level so CameraView sees a stable
  // identity (or `undefined` while paused) without recomputing the callback.
  const scannerHandler = isScanning ? handleBarCodeScanned : undefined;

  const handlePhoneSearch = useCallback(async () => {
    if (phoneInput.length < 6 || isSearching || isNavigatingRef.current) return;

    Keyboard.dismiss();
    set({ isSearching: true });

    const normalizedPhone = normalizePhone(phoneInput, COUNTRIES[countryIndex].dial);

    // Validate phone number length to prevent malformed requests
    if (normalizedPhone.length > MAX_PHONE_LENGTH) {
      Alert.alert(t('common.error'), t('scan.invalidPhoneNumber'));
      set({ isSearching: false });
      return;
    }

    try {
      const res = await api.get('/merchant/clients/scan', {
        params: { search: normalizedPhone },
      });
      const clients: MatchedClient[] = res.data;

      safeImpact(Haptics.ImpactFeedbackStyle.Medium);

      if (clients.length === 1) {
        // Exactly one match → go to transaction
        if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
        isNavigatingRef.current = true;
        prefetchClientStatus(queryClient, clients[0].id, clients[0].scanTicket).catch(() => {});
        navTimeoutRef.current = setTimeout(() => {
          navTimeoutRef.current = null;
          router.push({
            pathname: '/transaction-amount',
            params: transactionParams(clients[0].id, clients[0].scanTicket),
          });
        }, NAVIGATION_DELAY_MS);
      } else if (clients.length > 1) {
        // Multiple matches → show picker for disambiguation
        set({ matchedClients: clients });
      } else {
        // No match — propose Quick-Add (anonymous client + WhatsApp claim link)
        safeNotification(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          t('scan.clientNotFoundTitle'),
          t('scan.noClientForPhone', { phone: normalizedPhone }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('quickAdd.cta'),
              onPress: () => {
                if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
                isNavigatingRef.current = true;
                router.push({
                  pathname: '/quick-add',
                  params: {
                    localPhone: phoneInput.replace(/[^\d]/g, ''),
                    countryCode: COUNTRIES[countryIndex].code,
                  },
                });
              },
            },
          ],
        );
      }
    } catch (err) {
      logError('ScanQR', 'Phone search error:', err);
      Alert.alert(t('common.error'), t('scan.phoneSearchError'));
    } finally {
      set({ isSearching: false });
    }
  }, [phoneInput, isSearching, router, countryIndex, t, set, queryClient]);

  const handleClose = useCallback(() => {
    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [router]);

  const handleRetryScan = useCallback(() => {
    setOverlayState({ phase: 'idle', message: null });
    set({ isScanning: true });
  }, [set]);

  // Stable handlers so the memoised search bar and bottom controls skip re-renders.
  const handlePhoneChange = useCallback((v: string) => set({ phoneInput: v }), [set]);
  const handleSearchFocus = useCallback(() => set({ isSearchFocused: true }), [set]);
  const handleSearchBlur = useCallback(() => set({ isSearchFocused: false }), [set]);
  const openCountrySheet = useCallback(() => setShowCountrySheet(true), []);
  const closeMatchedClients = useCallback(() => set({ matchedClients: [] }), [set]);
  const handleToggleFlash = useCallback(() => {
    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    dispatch({ type: 'TOGGLE_FLASH' });
  }, []);

  const handleCameraMountError = useCallback((error: unknown) => {
    logError('CameraView', 'Mount error:', error);
    Alert.alert(
      t('scan.cameraErrorTitle'),
      t('scan.cameraErrorMsg'),
      [
        { text: t('common.back'), onPress: handleClose, style: 'cancel' },
        { text: t('common.retry'), onPress: () => router.replace('/scan-qr') },
      ],
    );
  }, [t, handleClose, router]);

  if (!permission) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: theme.bg }]}>
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.permissionText, { color: theme.textMuted }]}>{t('scan.cameraInit')}</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: theme.bg }]}>
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
        <Animated.View style={styles.permissionContent}>
          <View style={[styles.permissionIconCircle, { backgroundColor: theme.primaryBg, borderColor: theme.primary + '40' }]}>
            <Camera size={48} color={theme.primary} strokeWidth={iconTokens.stroke} />
          </View>
          <Text style={[styles.permissionTitle, { color: theme.text }]}>{t('scan.cameraPermission')}</Text>
          <Text style={[styles.permissionDesc, { color: theme.textMuted }]}>
            {t('scan.cameraPermissionMsg')}
          </Text>
          {permission.canAskAgain ? (
            <ActionButton
              label={t('scan.allowCamera')}
              size="lg"
              onPress={requestPermission}
              style={styles.permissionBtn}
            />
          ) : (
            <View style={[styles.permissionDenied, { flexDirection: dir.row }]}>
              <AlertCircle size={20} color={theme.danger} strokeWidth={iconTokens.stroke} />
              <Text style={[styles.permissionDeniedText, { color: theme.danger, textAlign: dir.textAlign }]}>
                {t('scan.cameraDenied')}
              </Text>
            </View>
          )}
          <ActionButton label={t('common.back')} variant="ghost" onPress={handleClose} />
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {cameraMounted && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          active={isScanning}
          enableTorch={isFlashOn}
          barcodeScannerSettings={BARCODE_SCANNER_SETTINGS}
          onBarcodeScanned={scannerHandler}
          onMountError={handleCameraMountError}
        />
      )}

      <CameraOverlay
        screenHeight={SCREEN_H}
        scanSize={SCAN_SIZE}
        pulseStyle={pulseStyle}
        overlayState={overlayState}
        isScanning={isScanning}
        onRetry={handleRetryScan}
      />

      <HowItWorksBanner
        visible={showHowItWorks}
        onDismiss={dismissHowItWorks}
        insetTop={insets.top}
      />

      <AnimatedSearchBar
        value={phoneInput}
        onChangeText={handlePhoneChange}
        onSubmit={handlePhoneSearch}
        onFocus={handleSearchFocus}
        onBlur={handleSearchBlur}
        isFocused={isSearchFocused}
        isSearching={isSearching}
        insetTop={insets.top}
        countryIndex={countryIndex}
        onToggleCountry={openCountrySheet}
      />

      <BottomControls
        insetBottom={insets.bottom}
        isFlashOn={isFlashOn}
        onToggleFlash={handleToggleFlash}
        onClose={handleClose}
        t={t}
      />

      <Modal
        visible={matchedClients.length > 0}
        animationType="slide"
        transparent={false}
        onRequestClose={closeMatchedClients}
      >
        <View style={[styles.cpContainer, { paddingTop: insets.top, backgroundColor: theme.bg }]}>
          <View style={[styles.cpHeader, { flexDirection: dir.row, borderBottomColor: theme.borderLight }]}>
            <TouchableOpacity
              onPress={closeMatchedClients}
              style={styles.iconPadding}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
            >
              <ArrowLeft size={24} color={theme.text} strokeWidth={iconTokens.stroke} style={dir.flip} />
            </TouchableOpacity>
            <Text style={[styles.cpTitle, { color: theme.text, textAlign: dir.textAlign }]}>{t('scan.clientsFound', { count: matchedClients.length })}</Text>
            <View style={styles.spacerWidth32} />
          </View>
          <Text style={[styles.selectClientText, { color: theme.textMuted, textAlign: dir.textAlign }]}>
            {t('scan.selectClient')}
          </Text>
          <FlatList
            data={matchedClients}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            getItemLayout={(_, index) => ({ length: 64, offset: 64 * index, index })}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={Platform.OS === 'android'}
            renderItem={renderMatchedClient}
          />
        </View>
      </Modal>

      <Modal visible={showCountrySheet} animationType="slide" transparent>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowCountrySheet(false)}>
          <View style={[styles.sheetCard, { backgroundColor: theme.bgCard, maxHeight: SCREEN_H * 0.7 }]}>
            <View style={[styles.sheetHandle, { backgroundColor: `${theme.textMuted}30` }]} />
            <Text style={[styles.sheetTitle, { color: theme.text, textAlign: dir.textAlign }]}>{t('scan.countryPickerTitle')}</Text>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(item) => item.code}
              contentContainerStyle={styles.countryList}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[styles.countryRow, { flexDirection: dir.row }, countryIndex === index && { backgroundColor: `${theme.primary}16` }]}
                  onPress={() => {
                    set({ countryIndex: index });
                    setShowCountrySheet(false);
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: countryIndex === index }}
                >
                  <Text style={styles.countryRowFlag}>{item.flag}</Text>
                  <Text style={[styles.countryRowText, { color: theme.text, textAlign: dir.textAlign }]}>{item.name} · {item.dial}</Text>
                  {countryIndex === index ? <Check size={18} color={theme.primary} strokeWidth={iconTokens.stroke} /> : null}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <FirstScanGuide visible={showGuide} onClose={dismissGuide} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CAMERA_BG,
  },

  overlayTop: {
    backgroundColor: OVERLAY_COLOR,
  },
  overlayMiddle: {
    flexDirection: 'row',
  },
  overlaySide: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
  },

  scanArea: {
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#A78BFA',
  },

  detectedOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.12)',
  },
  detectedCard: {
    alignSelf: 'center',
    minWidth: 220,
    maxWidth: '84%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  detectedCardNeutral: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  detectedCardSuccess: {
    backgroundColor: 'rgba(34,197,94,0.95)',
  },
  detectedCardError: {
    backgroundColor: 'rgba(239,68,68,0.95)',
  },
  detectedRow: {
    alignItems: 'center',
    gap: 12,
  },
  detectedTextWrap: {
    flex: 1,
  },
  detectedText: {
    color: '#0F0D1A',
    fontSize: 16,
    fontFamily: font.semibold,
  },
  detectedTextError: {
    color: ON_CAMERA,
  },
  detectedRetryBtn: {
    marginTop: 6,
    paddingVertical: 4,
  },
  detectedRetryText: {
    color: ON_CAMERA,
    fontSize: 13,
    fontFamily: font.semibold,
  },

  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  actionsRow: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 48,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    minWidth: 64,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  actionCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  glassFallback: {
    backgroundColor: 'rgba(15,15,20,0.55)',
  },
  actionCircleTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  actionCircleActive: {
    backgroundColor: palette.gold,
    borderColor: palette.gold,
  },
  actionBtnLabel: {
    color: ON_CAMERA,
    fontSize: 12,
    fontFamily: font.semibold,
  },
  actionBtnLabelActive: {
    color: palette.gold,
  },

  infoBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 90,
    alignItems: 'flex-start',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(124,58,237,0.16)',
    overflow: 'hidden',
  },
  infoBannerTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(124,58,237,0.16)',
  },
  infoBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBannerBody: {
    flex: 1,
    marginHorizontal: 10,
  },
  infoBannerTitle: {
    fontSize: 14,
    fontFamily: font.semibold,
  },
  infoBannerText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    fontFamily: font.regular,
  },
  infoBannerClose: {
    padding: 2,
  },

  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: OVERLAY_COLOR,
  },
  sheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 20,
    fontFamily: font.bold,
    marginBottom: 6,
  },
  countryList: {
    paddingBottom: 4,
  },
  countryRow: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  countryRowFlag: {
    fontSize: 18,
  },
  countryRowText: {
    flex: 1,
    fontSize: 14,
    fontFamily: font.regular,
  },

  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  permissionContent: {
    alignItems: 'center',
  },
  permissionIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
  },
  permissionText: {
    fontSize: 15,
    marginTop: 16,
    fontFamily: font.medium,
  },
  permissionTitle: {
    fontSize: 28,
    marginBottom: 10,
    fontFamily: font.bold,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  permissionDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    fontFamily: font.regular,
  },
  permissionBtn: {
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  permissionDenied: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  permissionDeniedText: {
    fontSize: 14,
    flex: 1,
    fontFamily: font.medium,
  },

  cpContainer: { flex: 1 },
  cpHeader: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  cpTitle: { flex: 1, fontSize: 22, fontFamily: font.bold, letterSpacing: -0.3 },
  cpRow: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cpCountryName: { fontSize: 15, fontFamily: font.semibold },
  flexMain: { flex: 1 },
  clientSubtitle: { fontSize: 12, marginTop: 3, fontFamily: font.regular },
  iconPadding: { padding: 4 },
  spacerWidth32: { width: 32 },
  selectClientText: { fontSize: 13, paddingHorizontal: 24, paddingVertical: 12, fontFamily: font.regular },
});
