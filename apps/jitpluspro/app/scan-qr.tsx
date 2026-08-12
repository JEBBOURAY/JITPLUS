import React, { useReducer, useCallback, useEffect, useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  ViewStyle,
  I18nManager,
  useWindowDimensions,
  Animated,
  AppState,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { logError } from '@/utils/devLogger';
import { CameraView, useCameraPermissions, type BarcodeSettings } from 'expo-camera';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  Search,
  X,
  Zap,
  ArrowRight,
  Camera,
  ChevronDown,
  AlertCircle,
  ArrowLeft,
  Check,
  Info,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { normalizePhone } from '@/utils/normalizePhone';
import { isValidUUID } from '@/utils/validation';
import { SCAN_AREA_RATIO, NAVIGATION_DELAY_MS } from '@/constants/app';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/stores/authStore';

import { COUNTRIES } from '@/constants/Countries';
import FirstScanGuide from '@/components/FirstScanGuide';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Safe haptic wrappers — no-op on devices without haptic engine
const safeNotification = (type: Haptics.NotificationFeedbackType) => {
  Haptics.notificationAsync(type).catch(() => {});
};
const safeImpact = (style: Haptics.ImpactFeedbackStyle) => {
  Haptics.impactAsync(style).catch(() => {});
};

// ── Module constants ─────────────────────────────────────
/** Cooldown between two identical scans (ms) */
const SCAN_COOLDOWN_MS = 5_000;
/** Max phone length accepted by the search */
const MAX_PHONE_LENGTH = 15;
/** Allow-list of hostnames accepted when the QR encodes an http(s) URL.
 * Any other host is rejected to block QR-phishing. Lowercase compare. */
const QR_ALLOWED_HOSTS = new Set<string>([
  'jitplus.com',
  'www.jitplus.com',
  'jitplus.app',
  'yams.app',
  'www.yams.app',
]);
/** Stable barcode-scanner settings (kept module-level so the CameraView prop
 * identity never changes — avoids re-configuring the native scanner). */
const BARCODE_SCANNER_SETTINGS: BarcodeSettings = { barcodeTypes: ['qr'] };

// ── Animated Search Bar ───────────────────────────────────
const FloatingSearchBar = React.memo(function FloatingSearchBar({
  value,
  onChangeText,
  onSubmit,
  onFocus,
  onBlur,
  isFocused,
  isSearching,
  inputRef,
  insetTop,
  countryIndex,
  onToggleCountry,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  onFocus: () => void;
  onBlur: () => void;
  isFocused: boolean;
  isSearching: boolean;
  inputRef: React.RefObject<TextInput | null>;
  insetTop: number;
  countryIndex: number;
  onToggleCountry: () => void;
}) {
  const { t } = useLanguage();
  const barScale = useRef(new Animated.Value(1)).current;
  const country = COUNTRIES[countryIndex];

  const animatedBar = useMemo(() => ({
    transform: [{ scale: barScale }],
  }), [barScale]);

  const handleFocus = () => {
    Animated.spring(barScale, { toValue: 1.02, useNativeDriver: true, speed: 25, bounciness: 4 }).start();
    onFocus();
  };

  const handleBlur = () => {
    Animated.spring(barScale, { toValue: 1, useNativeDriver: true, speed: 25, bounciness: 4 }).start();
    onBlur();
  };

  return (
    <Animated.View
      style={[
        styles.searchContainer,
        { top: insetTop + 12 },
        animatedBar,
      ]}
    >
      <View style={[styles.searchBar, isFocused && styles.searchBarFocused]}>
        <Search size={18} color="rgba(255,255,255,0.6)" strokeWidth={2} />
        <TouchableOpacity style={styles.prefixContainer} onPress={onToggleCountry} activeOpacity={0.7}>
          <Text style={styles.prefixText}>{country.flag} {country.dial}</Text>
          <ChevronDown size={12} color="#C4B5FD" strokeWidth={2} style={{ marginLeft: 2 }} />
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={t('scan.phonePlaceholder')}
          placeholderTextColor="rgba(255,255,255,0.45)"
          keyboardType="phone-pad"
          returnKeyType="search"
          selectionColor="#A78BFA"
          autoCorrect={false}
        />
        {value.length > 0 && (
          <TouchableOpacity
            onPress={() => onChangeText('')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={18} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        )}
        {value.length >= 6 && (
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={onSubmit}
            activeOpacity={0.7}
          >
            {isSearching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ArrowRight size={18} color="#fff" strokeWidth={2} />
            )}
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
});

// ── Animated Scan Line ────────────────────────────────────
const ScanLine = React.memo(function ScanLine({ scanSize, active }: { scanSize: number; active: boolean }) {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      translateY.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: scanSize - 4,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 2200,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [active, scanSize, translateY]);

  const lineStyle = {
    transform: [{ translateY }],
  };

  return (
    <Animated.View style={[styles.scanLine, lineStyle]}>
      <View style={styles.scanLineGradient} />
    </Animated.View>
  );
});

// ── Corner Component ──────────────────────────────────────
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

  return (
    <View
      style={[
        styles.corner,
        borderStyle,
        { borderColor: '#A78BFA' },
      ]}
    />
  );
});

// ── Detection Feedback Overlay ────────────────────────────
type ScanOverlayState = {
  phase: 'idle' | 'detected' | 'verifying' | 'found' | 'error';
  message: string | null;
  name?: string | null;
};

const DetectedOverlay = React.memo(function DetectedOverlay({ overlayState, onRetry }: { overlayState: ScanOverlayState; onRetry?: () => void }) {
  const { t } = useLanguage();

  if (overlayState.phase === 'idle') return null;

  const isError = overlayState.phase === 'error';
  const isSuccess = overlayState.phase === 'found';

  return (
    <View style={styles.detectedOverlay} pointerEvents="box-none">
      <View style={[styles.detectedCard, isError ? styles.detectedCardError : isSuccess ? styles.detectedCardSuccess : styles.detectedCardNeutral]}>
        <View style={styles.detectedRow}>
          {overlayState.phase === 'verifying' ? (
            <ActivityIndicator size="small" color={isError ? '#fff' : '#7C3AED'} />
          ) : isError ? (
            <AlertCircle size={18} color="#fff" strokeWidth={2.2} />
          ) : (
            <Check size={18} color={isSuccess ? '#ffffff' : '#7C3AED'} strokeWidth={2.6} />
          )}
          <View style={styles.detectedTextWrap}>
            <Text style={[styles.detectedText, isError && styles.detectedTextError]}>{overlayState.message}</Text>
            {isError && onRetry ? (
              <TouchableOpacity style={styles.detectedRetryBtn} onPress={onRetry} activeOpacity={0.8}>
                <Text style={styles.detectedRetryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
});

// Versioned key: bump the suffix to re-show the banner after copy/design changes.
const HOW_IT_WORKS_STORAGE_KEY = '@jitpluspro_scan_how_it_works_v2';

const HowItWorksBanner = React.memo(function HowItWorksBanner({
  visible,
  onDismiss,
  theme,
  t,
  isRTL,
  insetTop,
}: {
  visible: boolean;
  onDismiss: () => void;
  theme: ReturnType<typeof useTheme>;
  t: (key: string, params?: Record<string, unknown>) => string;
  isRTL: boolean;
  insetTop: number;
}) {
  const [shouldRender, setShouldRender] = useState(visible);
  const collapse = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      Animated.timing(collapse, { toValue: 1, duration: 220, useNativeDriver: false }).start();
      return;
    }
    Animated.timing(collapse, { toValue: 0, duration: 220, useNativeDriver: false }).start(({ finished }) => {
      if (finished) setShouldRender(false);
    });
  }, [collapse, visible]);

  if (!shouldRender) return null;

  const animatedStyle = {
    opacity: collapse,
    maxHeight: collapse.interpolate({ inputRange: [0, 1], outputRange: [0, 140] }),
    transform: [{ translateY: collapse.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
  };

  return (
    <Animated.View
      style={[styles.infoBanner, { top: insetTop + 76 }, animatedStyle, isRTL && styles.infoBannerRTL]}
    >
      <BlurView
        intensity={18}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.infoBannerTint} />
      <View style={[styles.infoBannerIcon, { backgroundColor: `${theme.primary}20` }]}>
        <Info size={16} color={theme.primary} strokeWidth={2.2} />
      </View>
      <View style={styles.infoBannerBody}>
        <Text style={[styles.infoBannerTitle, { color: theme.text }]}>{t('scan.howItWorksTitle')}</Text>
        <Text style={[styles.infoBannerText, { color: theme.textMuted }]}>{t('scan.howItWorksBody')}</Text>
      </View>
      <TouchableOpacity
        style={styles.infoBannerClose}
        onPress={onDismiss}
        activeOpacity={0.8}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <X size={16} color={theme.textMuted} strokeWidth={2.2} />
      </TouchableOpacity>
    </Animated.View>
  );
});

// ── Scan state reducer ────────────────────────────────────
type MatchedClient = { id: string; nom: string; telephone?: string; email?: string };

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

// ── Memoized UI blocks ───────────────────────────────────
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
  theme,
  t,
}: {
  insetBottom: number;
  isFlashOn: boolean;
  onToggleFlash: () => void;
  onClose: () => void;
  theme: ReturnType<typeof useTheme>;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  return (
    <Animated.View
      style={[styles.bottomControls, { paddingBottom: Math.max(insetBottom, 26) }]}
      pointerEvents="box-none"
    >
      <View style={styles.actionsRow}>
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
              <Zap size={22} color="#1F2937" strokeWidth={2.2} fill="#1F2937" />
            </View>
          ) : (
            <View style={styles.actionCircle}>
              <BlurView
                intensity={18}
                tint="dark"
                experimentalBlurMethod="dimezisBlurView"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.actionCircleTint} />
              <Zap size={22} color="#FFFFFF" strokeWidth={2} />
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
            <BlurView
              intensity={18}
              tint="dark"
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.actionCircleTint} />
            <X size={22} color="#FFFFFF" strokeWidth={2} />
          </View>
          <Text style={styles.actionBtnLabel}>{t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

// ── Main Screen ───────────────────────────────────────────
export default function ScanQRScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput | null>(null);
  const { t } = useLanguage();
  const theme = useTheme();
  const loyaltyType = useAuthStore((s) => s.merchant?.loyaltyType);
  const [permission, requestPermission] = useCameraPermissions();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const SCAN_SIZE = SCREEN_W * SCAN_AREA_RATIO;
  const isRTL = I18nManager.isRTL;

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

  // ── First-scan guide popup ──
  const [showGuide, setShowGuide] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showCountrySheet, setShowCountrySheet] = useState(false);
  const [overlayState, setOverlayState] = useState<ScanOverlayState>({ phase: 'idle', message: null });

  useEffect(() => {
    (async () => {
      try {
        const done = await AsyncStorage.getItem('@jitpluspro_first_scan_guide');
        if (!done) setShowGuide(true);
      } catch (e) { logError('scan-guide', 'load', e); }
    })();
  }, []);

  const dismissGuide = useCallback(() => {
    setShowGuide(false);
    AsyncStorage.setItem('@jitpluspro_first_scan_guide', '1').catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dismissed = await AsyncStorage.getItem(HOW_IT_WORKS_STORAGE_KEY);
        if (!cancelled) setShowHowItWorks(dismissed !== 'dismissed');
      } catch (e) {
        logError('scan-how-it-works', 'load', e);
        if (!cancelled) setShowHowItWorks(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dismissHowItWorks = useCallback(() => {
    setShowHowItWorks(false);
    AsyncStorage.setItem(HOW_IT_WORKS_STORAGE_KEY, 'dismissed').catch(() => {});
  }, []);

  const resetScanUi = useCallback(() => {
    setOverlayState({ phase: 'idle', message: null });
  }, []);

  // Cleanup navigation timeouts on unmount
  useEffect(() => {
    return () => {
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
      if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
    };
  }, []);

  // Animations — only run when actively scanning to save CPU/battery
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;

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

  // ── Permission request ──
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const renderMatchedClient = useCallback(({ item }: { item: MatchedClient }) => (
    <TouchableOpacity
      style={[styles.cpRow, { borderBottomColor: theme.borderLight }]}
      onPress={() => {
        set({ matchedClients: [] });
        router.push({
          pathname: '/transaction-amount',
          params: { clientId: item.id },
        });
      }}
      activeOpacity={0.6}
      delayPressIn={0}
    >
      <View style={styles.flexMain}>
        <Text style={[styles.cpCountryName, { color: theme.text }]}>{item.nom}</Text>
        <Text style={[styles.clientSubtitle, { color: theme.textMuted }]}>
          {item.telephone || item.email || ''}
        </Text>
      </View>
      <ArrowRight size={18} color={theme.primary} />
    </TouchableOpacity>
  ), [router, theme, set]);

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
    const next = isFocusedRef.current && appStateRef.current === 'active' && !!loyaltyType;
    setCameraMounted((prev) => (prev === next ? prev : next));
  }, [loyaltyType]);

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
      dispatch({ type: 'SET', payload: { isScanning: s === 'active' && isFocusedRef.current } });
      syncCameraMount();
    });
    return () => sub.remove();
  }, [syncCameraMount]);

  // ── Loyalty program guard ──
  // A merchant must pick a loyalty program (points/stamps) before scanning:
  // POST /merchant/verify-qr cannot resolve without it. If none is set we never
  // mount the camera (see syncCameraMount) and redirect immediately to the
  // loyalty settings, which surfaces a clear warning banner.
  const loyaltyPromptRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (loyaltyType) {
        loyaltyPromptRef.current = false;
        return;
      }
      if (loyaltyPromptRef.current) return;
      loyaltyPromptRef.current = true;
      router.replace({ pathname: '/settings', params: { loyaltySetup: '1' } });
    }, [loyaltyType, router])
  );

  // ── Navigate to transaction after resolving clientId ──
  const navigateToTransaction = useCallback((clientId: string, clientName?: string) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setOverlayState({
      phase: 'found',
      message: clientName ? t('scan.clientFound', { name: clientName }) : t('scan.clientFoundFallback'),
      name: clientName ?? null,
    });
    if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    navTimeoutRef.current = setTimeout(() => {
      navTimeoutRef.current = null;
      router.push({
        pathname: '/transaction-amount',
        params: { clientId },
      });
    }, NAVIGATION_DELAY_MS);
  }, [router, t]);

  // ── QR Code handler ──
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
      }, 1100);

      // Haptic feedback
      safeNotification(Haptics.NotificationFeedbackType.Success);

      // ── Format 1: jitplus://scan/{JWT_TOKEN} (signed QR from client app)
      if (data.startsWith('jitplus://scan/')) {
        const token = data.replace('jitplus://scan/', '').trim();
        if (!token) {
          if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
          setOverlayState({ phase: 'error', message: t('scan.tokenMissing') });
          safeNotification(Haptics.NotificationFeedbackType.Error);
          return;
        }
        try {
          const res = await api.post('/merchant/verify-qr', { token });
          const clientId = res.data?.clientId;
          const clientName = res.data?.client?.nom ? [res.data.client.prenom, res.data.client.nom].filter(Boolean).join(' ') : undefined;
          if (!clientId) throw new Error('no clientId');
          navigateToTransaction(clientId, clientName);
        } catch (err: unknown) {
          if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
          setOverlayState({ phase: 'error', message: getErrorMessage(err, t('scan.qrExpiredFallback')) });
          safeNotification(Haptics.NotificationFeedbackType.Error);
        }
        return;
      }

      // ── Format 2: jitplus://client/{UUID} (legacy — DEPRECATED, must verify server-side)
      let clientId: string | undefined;
      if (data.startsWith('jitplus://client/')) {
        clientId = data.replace('jitplus://client/', '').trim();
      } else if (data.startsWith('http://') || data.startsWith('https://')) {
        // Restrict http(s) QR payloads to an allow-list of trusted hosts to block QR-phishing.
        try {
          const url = new URL(data);
          if (!QR_ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
            if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
            setOverlayState({ phase: 'error', message: t('scan.invalidQR') });
            safeNotification(Haptics.NotificationFeedbackType.Error);
            return;
          }
          clientId = (url.searchParams.get('clientId') || url.pathname.split('/').pop() || '').trim();
        } catch {
          // invalid URL — fall through to UUID validation (which will reject)
        }
      } else if (data.includes('clientId=')) {
        const match = data.match(/clientId=([^&]+)/);
        clientId = match?.[1]?.trim();
      } else {
        clientId = data.trim();
      }

      // Validate that extracted value is a proper UUID
      if (!clientId || !isValidUUID(clientId)) {
        if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
        setOverlayState({ phase: 'error', message: t('scan.invalidQR') });
        safeNotification(Haptics.NotificationFeedbackType.Error);
        return;
      }

      // Verify legacy clientId server-side to prevent IDOR
      try {
        const res = await api.post('/merchant/verify-client', { clientId });
        const verifiedClientId = res.data?.clientId;
        const clientName = res.data?.client?.nom ? [res.data.client.prenom, res.data.client.nom].filter(Boolean).join(' ') : undefined;
        if (!verifiedClientId) throw new Error('Client not verified');
        navigateToTransaction(verifiedClientId, clientName);
      } catch (err: unknown) {
        if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
        setOverlayState({ phase: 'error', message: getErrorMessage(err, t('scan.clientNotFoundFallback')) });
        safeNotification(Haptics.NotificationFeedbackType.Error);
      }
    },
    [isScanning, navigateToTransaction, set, t],
  );

  // Gate the scanner handler at the prop level so CameraView sees a stable
  // identity (or `undefined` while paused) without recomputing the callback.
  const scannerHandler = isScanning ? handleBarCodeScanned : undefined;

  // ── Phone search handler ──
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
      const clients = res.data;

      safeImpact(Haptics.ImpactFeedbackStyle.Medium);

      if (clients.length === 1) {
        // Exactly one match → go to transaction
        if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
        isNavigatingRef.current = true;
        navTimeoutRef.current = setTimeout(() => {
          navTimeoutRef.current = null;
          router.push({
            pathname: '/transaction-amount',
            params: { clientId: clients[0].id },
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
  }, [phoneInput, isSearching, router, countryIndex, t, set]);

  // ── Close handler ──
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

  // ── Permission states ──
  if (!permission) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: theme.bg }]}>
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} translucent />
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.permissionText, { color: theme.textMuted }]}>{t('scan.cameraInit')}</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: theme.bg }]}>
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} translucent />
        <Animated.View style={styles.permissionContent}>
          <View style={[styles.permissionIconCircle, { backgroundColor: theme.primaryBg, borderColor: theme.primary + '40' }]}>
            <Camera size={48} color={theme.primary} strokeWidth={2} />
          </View>
          <Text style={[styles.permissionTitle, { color: theme.text }]}>{t('scan.cameraPermission')}</Text>
          <Text style={[styles.permissionDesc, { color: theme.textMuted }]}>
            {t('scan.cameraPermissionMsg')}
          </Text>
          {permission.canAskAgain ? (
            <TouchableOpacity
              style={[styles.permissionBtn, { backgroundColor: theme.primary }]}
              onPress={requestPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.permissionBtnText}>{t('scan.allowCamera')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.permissionDenied}>
              <AlertCircle size={20} color={theme.danger} />
              <Text style={[styles.permissionDeniedText, { color: theme.danger }]}>
                {t('scan.cameraDenied')}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.permissionBack}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <Text style={[styles.permissionBackText, { color: theme.primary }]}>{t('common.back')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent />

      {/* ── Camera (conditionally mounted to release Camera2 on blur/background) ── */}
      {cameraMounted && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          active={isScanning}
          enableTorch={isFlashOn}
          barcodeScannerSettings={BARCODE_SCANNER_SETTINGS}
          onBarcodeScanned={scannerHandler}
          onMountError={(error) => {
            logError('CameraView', 'Mount error:', error);
            Alert.alert(
              t('scan.cameraErrorTitle'),
              t('scan.cameraErrorMsg'),
              [
                { text: t('common.back'), onPress: handleClose, style: 'cancel' },
                { text: t('common.retry'), onPress: () => router.replace('/scan-qr') },
              ],
            );
          }}
        />
      )}

      {/* ── Dark overlay with cutout ── */}
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
        theme={theme}
        t={t}
        isRTL={isRTL}
        insetTop={insets.top}
      />

      {/* ── Floating search bar ── */}
      <FloatingSearchBar
        value={phoneInput}
        onChangeText={(v) => set({ phoneInput: v })}
        onSubmit={handlePhoneSearch}
        onFocus={() => set({ isSearchFocused: true })}
        onBlur={() => set({ isSearchFocused: false })}
        isFocused={isSearchFocused}
        isSearching={isSearching}
        inputRef={inputRef}
        insetTop={insets.top}
        countryIndex={countryIndex}
        onToggleCountry={() => setShowCountrySheet(true)}
      />

      {/* ── Bottom controls ── */}
      <BottomControls
        insetBottom={insets.bottom}
        isFlashOn={isFlashOn}
        onToggleFlash={() => {
          safeImpact(Haptics.ImpactFeedbackStyle.Light);
          dispatch({ type: 'TOGGLE_FLASH' });
        }}
        onClose={handleClose}
        theme={theme}
        t={t}
      />

      {/* ── Client Picker Modal (multiple matches) ─── */}
      <Modal
        visible={matchedClients.length > 0}
        animationType="slide"
        transparent={false}
        onRequestClose={() => set({ matchedClients: [] })}
      >
        <View style={[styles.cpContainer, { paddingTop: insets.top, backgroundColor: theme.bg }]}>
          <View style={[styles.cpHeader, { borderBottomColor: theme.borderLight }]}>
            <TouchableOpacity onPress={() => set({ matchedClients: [] })} style={styles.iconPadding}>
              <ArrowLeft size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.cpTitle, { color: theme.text }]}>{t('scan.clientsFound', { count: matchedClients.length })}</Text>
            <View style={styles.spacerWidth32} />
          </View>
          <Text style={[styles.selectClientText, { color: theme.textMuted }]}>
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
            <Text style={[styles.sheetTitle, { color: theme.text }]}>{t('scan.countryPickerTitle')}</Text>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(item) => item.code}
              contentContainerStyle={styles.countryList}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[styles.countryRow, countryIndex === index && { backgroundColor: `${theme.primary}16` }]}
                  onPress={() => {
                    set({ countryIndex: index });
                    setShowCountrySheet(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.countryRowFlag}>{item.flag}</Text>
                  <Text style={[styles.countryRowText, { color: theme.text }]}>{item.name} · {item.dial}</Text>
                  {countryIndex === index ? <Check size={18} color={theme.primary} strokeWidth={2.5} /> : null}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── First scan guide ─── */}
      <FirstScanGuide visible={showGuide} onClose={dismissGuide} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────
const OVERLAY_COLOR = 'rgba(0,0,0,0.55)';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F14',
  },

  // ── Search bar ──
  searchContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26,23,38,0.7)',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#1F2937',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  searchBarFocused: {
    borderColor: '#A78BFA',
    backgroundColor: 'rgba(26,23,38,0.85)',
  },
  prefixContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139,92,246,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  prefixText: {
    color: '#C4B5FD',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: 'Lexend_600SemiBold',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 0,
    letterSpacing: 0.3,
    fontFamily: 'Lexend_500Medium',
  },
  submitBtn: {
    backgroundColor: '#7C3AED',
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },

  // ── Overlay ──
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

  // ── Scan area ──
  scanArea: {
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 2,
  },
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 3,
    top: 0,
  },
  scanLineGradient: {
    flex: 1,
    borderRadius: 2,
    backgroundColor: '#A78BFA',
    opacity: 0.7,
    ...Platform.select({
      ios: {
        shadowColor: '#1F2937',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
    }),
  },

  // ── Detected overlay ──
  detectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.12)',
    borderRadius: 4,
  },
  detectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detectedText: {
    color: '#0F0D1A',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Lexend_600SemiBold',
  },

  // ── Bottom controls ──
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 48,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 7,
    minWidth: 64,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  actionCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  actionCircleTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  actionCircleActive: {
    backgroundColor: '#FCD34D',
    borderColor: '#FCD34D',
  },
  actionBtnLabel: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  actionBtnLabelActive: {
    color: '#FCD34D',
  },

  // ── Permission screen ──
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // ── Scan feedback / sheet UI ──
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
  detectedTextWrap: {
    flex: 1,
    marginLeft: 8,
  },
  detectedTextError: {
    color: '#fff',
  },
  detectedRetryBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  detectedRetryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Lexend_600SemiBold',
  },
  infoBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 90,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(124,58,237,0.16)',
    overflow: 'hidden',
  },
  infoBannerRTL: {
    flexDirection: 'row-reverse',
  },
  infoBannerTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(124,58,237,0.16)',
  },
  infoBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBannerBody: {
    flex: 1,
    marginHorizontal: 10,
  },
  infoBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Lexend_600SemiBold',
  },
  infoBannerText: {
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
    fontFamily: 'Lexend_400Regular',
  },
  infoBannerClose: {
    padding: 2,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
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
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    marginBottom: 6,
  },
  countryList: {
    paddingBottom: 4,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  countryRowFlag: {
    fontSize: 18,
    marginRight: 10,
  },
  countryRowText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Lexend_400Regular',
  },
  permissionContent: {
    alignItems: 'center',
  },
  permissionIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
  },
  permissionText: {
    fontSize: 15,
    marginTop: 16,
    fontFamily: 'Lexend_500Medium',
  },
  permissionTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 10,
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
  },
  permissionDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    fontFamily: 'Lexend_400Regular',
    letterSpacing: 0.1,
  },
  permissionBtn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Lexend_600SemiBold',
  },
  permissionDenied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  permissionDeniedText: {
    fontSize: 14,
    flex: 1,
    fontFamily: 'Lexend_500Medium',
  },
  permissionBack: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  permissionBackText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },

  // ── Country Picker Modal ──
  cpContainer: { flex: 1 },
  cpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  cpTitle: { flex: 1, fontSize: 22, fontWeight: '700', marginLeft: 12, fontFamily: 'Lexend_700Bold', letterSpacing: -0.3 },
  cpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cpCountryName: { fontSize: 15, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  flexMain: { flex: 1 },
  clientSubtitle: { fontSize: 12, marginTop: 3, fontFamily: 'Lexend_400Regular' },
  iconPadding: { padding: 4 },
  spacerWidth32: { width: 32 },
  selectClientText: { fontSize: 13, paddingHorizontal: 24, paddingVertical: 12, fontFamily: 'Lexend_400Regular' },
});
