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
  useWindowDimensions,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { logError } from '@/utils/devLogger';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import {
  Search,
  X,
  Zap,
  ZapOff,
  ArrowRight,
  Camera,
  Phone,
  ChevronDown,
  AlertCircle,
  ArrowLeft,
  Check,
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

import { COUNTRIES } from '@/constants/Countries';
import CountryPickerModal from '@/components/CountryPickerModal';
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
const ScanLine = React.memo(function ScanLine({ scanSize }: { scanSize: number }) {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
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
  }, []);

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
const DetectedOverlay = React.memo(function DetectedOverlay({ message }: { message: string }) {
  return (
    <View
      style={styles.detectedOverlay}
    >
      <View style={styles.detectedBadge}>
        <View style={styles.detectedRow}>
          <Check size={16} color="#0F0D1A" strokeWidth={3} />
          <Text style={styles.detectedText}>{message}</Text>
        </View>
      </View>
    </View>
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
  detected: string | null;
  countryIndex: number;
  showCountryPicker: boolean;
  matchedClients: MatchedClient[];
}

const initialScanState: ScanState = {
  phoneInput: '',
  isSearchFocused: false,
  isSearching: false,
  isFlashOn: false,
  isScanning: true,
  detected: null,
  countryIndex: 0,
  showCountryPicker: false,
  matchedClients: [],
};

type ScanAction =
  | { type: 'SET'; payload: Partial<ScanState> }
  | { type: 'TOGGLE_FLASH' }
  | { type: 'RESET_SCAN' }
  | { type: 'OPEN_COUNTRY_PICKER' }
  | { type: 'SELECT_COUNTRY'; index: number };

function scanReducer(state: ScanState, action: ScanAction): ScanState {
  switch (action.type) {
    case 'SET':
      return { ...state, ...action.payload };
    case 'TOGGLE_FLASH':
      return { ...state, isFlashOn: !state.isFlashOn };
    case 'RESET_SCAN':
      return { ...state, isScanning: true, detected: null };
    case 'OPEN_COUNTRY_PICKER':
      return { ...state, showCountryPicker: true };
    case 'SELECT_COUNTRY':
      return { ...state, countryIndex: action.index, showCountryPicker: false };
  }
}

// ── Main Screen ───────────────────────────────────────────
export default function ScanQRScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput | null>(null);
  const { t } = useLanguage();
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const SCAN_SIZE = SCREEN_W * SCAN_AREA_RATIO;

  // State
  const [scan, dispatch] = useReducer(scanReducer, initialScanState);
  const { phoneInput, isSearchFocused, isSearching, isFlashOn, isScanning, detected, countryIndex, showCountryPicker, matchedClients } = scan;
  const set = useCallback((payload: Partial<ScanState>) => dispatch({ type: 'SET', payload }), []);

  // Debounce: prevent re-scanning the same barcode data within a cooldown
  const lastScannedRef = useRef<{ data: string; ts: number } | null>(null);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Navigation mutex: prevents QR scan and phone search from navigating simultaneously
  const isNavigatingRef = useRef(false);

  // ── First-scan guide popup ──
  const [showGuide, setShowGuide] = useState(false);

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

  // Cleanup navigation timeouts on unmount
  useEffect(() => {
    return () => {
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    };
  }, []);

  // Animations — only run when actively scanning to save CPU/battery
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isScanning) {
      pulseScale.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isScanning]);

  const pulseStyle = useMemo(() => ({
    transform: [{ scale: pulseScale }],
  }), [pulseScale]);

  // ── Permission request ──
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

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
    >
      <View style={styles.flexMain}>
        <Text style={[styles.cpCountryName, { color: theme.text }]}>{item.nom}</Text>
        <Text style={[styles.clientSubtitle, { color: theme.textMuted }]}>
          {item.telephone || item.email || ''}
        </Text>
      </View>
      <ArrowRight size={18} color={theme.primary} />
    </TouchableOpacity>
  ), [router, theme]);

  useFocusEffect(
    useCallback(() => {
      dispatch({ type: 'RESET_SCAN' });
      isNavigatingRef.current = false;
      return () => {};
    }, [])
  );

  // ── Navigate to transaction after resolving clientId ──
  const navigateToTransaction = useCallback((clientId: string) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    set({ detected: t('scan.qrDetected') });
    if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    navTimeoutRef.current = setTimeout(() => {
      navTimeoutRef.current = null;
      router.push({
        pathname: '/transaction-amount',
        params: { clientId },
      });
    }, NAVIGATION_DELAY_MS);
  }, [router, set, t]);

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

      // Haptic feedback
      safeNotification(Haptics.NotificationFeedbackType.Success);

      // ── Format 1: jitplus://scan/{JWT_TOKEN} (signed QR from client app)
      if (data.startsWith('jitplus://scan/')) {
        const token = data.replace('jitplus://scan/', '').trim();
        if (!token) {
          safeNotification(Haptics.NotificationFeedbackType.Error);
          Alert.alert(t('scan.qrInvalidTitle'), t('scan.tokenMissing'), [{ text: 'OK', onPress: () => set({ isScanning: true }) }]);
          return;
        }
        try {
          set({ detected: t('scan.verifying') });
          const res = await api.post('/merchant/verify-qr', { token });
          const clientId = res.data?.clientId;
          if (!clientId) throw new Error('no clientId');
          navigateToTransaction(clientId);
        } catch (err: unknown) {
          safeNotification(Haptics.NotificationFeedbackType.Error);
          const msg = getErrorMessage(err, t('scan.qrExpiredFallback'));
          Alert.alert(t('scan.qrInvalidTitle'), msg, [{ text: 'OK', onPress: () => set({ isScanning: true }) }]);
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
            safeNotification(Haptics.NotificationFeedbackType.Error);
            Alert.alert(
              t('scan.qrInvalidTitle'),
              t('scan.invalidQR'),
              [{ text: 'OK', onPress: () => set({ isScanning: true }) }],
            );
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
        safeNotification(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          t('scan.qrInvalidTitle'),
          t('scan.invalidQR'),
          [{ text: 'OK', onPress: () => set({ isScanning: true }) }],
        );
        return;
      }

      // Verify legacy clientId server-side to prevent IDOR
      try {
        set({ detected: t('scan.verifying') });
        const res = await api.post('/merchant/verify-client', { clientId });
        const verifiedClientId = res.data?.clientId;
        if (!verifiedClientId) throw new Error('Client not verified');
        navigateToTransaction(verifiedClientId);
      } catch (err: unknown) {
        safeNotification(Haptics.NotificationFeedbackType.Error);
        const msg = getErrorMessage(err, t('scan.clientNotFoundFallback'));
        Alert.alert(t('scan.clientInvalidTitle'), msg, [{ text: 'OK', onPress: () => set({ isScanning: true }) }]);
      }
    },
    [isScanning, router, navigateToTransaction, set, t],
  );

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
        set({ detected: t('scan.clientFound', { name: [clients[0].prenom, clients[0].nom].filter(Boolean).join(' ') }) });
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
        // No match
        safeNotification(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          t('scan.clientNotFoundTitle'),
          t('scan.noClientForPhone', { phone: normalizedPhone }),
          [{ text: 'OK' }],
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

      {/* ── Camera ── */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={isFlashOn}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={isScanning ? handleBarCodeScanned : undefined}
        onMountError={(error) => {
          logError('CameraView', 'Mount error:', error);
          Alert.alert(
            t('scan.cameraErrorTitle'),
            t('scan.cameraErrorMsg'),
            [{ text: 'OK' }],
          );
        }}
      />

      {/* ── Dark overlay with cutout ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* Top overlay */}
        <View style={[styles.overlayTop, { height: Math.max((SCREEN_H - SCAN_SIZE) / 2 - 40, 100) }]} />

        {/* Middle row */}
        <View style={[styles.overlayMiddle, { height: SCAN_SIZE }]}>
          <View style={styles.overlaySide} />
          {/* Scan area (transparent cutout) */}
          <Animated.View style={[styles.scanArea, { width: SCAN_SIZE, height: SCAN_SIZE }, pulseStyle]}>
            <ViewfinderCorner position="tl" />
            <ViewfinderCorner position="tr" />
            <ViewfinderCorner position="bl" />
            <ViewfinderCorner position="br" />
            <ScanLine scanSize={SCAN_SIZE} />
            {detected && <DetectedOverlay message={detected} />}
          </Animated.View>
          <View style={styles.overlaySide} />
        </View>

        {/* Bottom overlay */}
        <View style={styles.overlayBottom} />
      </View>

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
        onToggleCountry={() => dispatch({ type: 'OPEN_COUNTRY_PICKER' })}
      />

      {/* ── Bottom controls ── */}
      <Animated.View
        style={[styles.bottomControls, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}
      >
        {/* Hint text */}
        <Text style={styles.hintText}>{t('scan.instruction')}</Text>

        {/* Action buttons row */}
        <View style={styles.actionsRow}>
          {/* Flash */}
          <TouchableOpacity
            style={[styles.actionBtn, isFlashOn && styles.actionBtnActive]}
            onPress={() => {
              safeImpact(Haptics.ImpactFeedbackStyle.Light);
              dispatch({ type: 'TOGGLE_FLASH' });
            }}
            activeOpacity={0.7}
          >
            {isFlashOn ? (
              <Zap size={22} color="#A78BFA" strokeWidth={2} fill="#A78BFA" />
            ) : (
              <ZapOff size={22} color="rgba(255,255,255,0.8)" strokeWidth={2} />
            )}
            <Text
              style={[
                styles.actionBtnLabel,
                isFlashOn && { color: '#A78BFA' },
              ]}
            >
              {t('scan.flash')}
            </Text>
          </TouchableOpacity>

          {/* Manual entry shortcut */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              safeImpact(Haptics.ImpactFeedbackStyle.Light);
              inputRef.current?.focus();
            }}
            activeOpacity={0.7}
          >
            <Phone size={22} color="rgba(255,255,255,0.8)" strokeWidth={2} />
            <Text style={styles.actionBtnLabel}>{t('scan.manual')}</Text>
          </TouchableOpacity>

          {/* Close */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <ChevronDown size={22} color="rgba(255,255,255,0.8)" strokeWidth={2} />
            <Text style={styles.actionBtnLabel}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

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
            removeClippedSubviews
            renderItem={renderMatchedClient}
          />
        </View>
      </Modal>

      {/* ── Country Picker Modal ─── */}
      <CountryPickerModal
        visible={showCountryPicker}
        selectedCode={COUNTRIES[countryIndex]?.code ?? ''}
        onSelect={(index) => dispatch({ type: 'SELECT_COUNTRY', index })}
        onClose={() => set({ showCountryPicker: false })}
        topInset={insets.top}
      />

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
  detectedBadge: {
    backgroundColor: 'rgba(34,211,238,0.9)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
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
  hintText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 20,
    fontFamily: 'Lexend_500Medium',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: 'rgba(26,23,38,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.18)',
    gap: 6,
  },
  actionBtnActive: {
    backgroundColor: 'rgba(34,211,238,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.35)',
  },
  actionBtnLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },

  // ── Permission screen ──
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
  cpSearchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  cpSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#231F33',
    paddingHorizontal: 12,
    gap: 8,
  },
  cpSearchInput: { flex: 1, fontSize: 15, paddingVertical: 10, color: '#fff', fontFamily: 'Lexend_400Regular' },
  cpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cpFlag: { fontSize: 24, marginRight: 12 },
  cpCountryName: { fontSize: 15, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  cpDial: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)', fontFamily: 'Lexend_600SemiBold' },
  flexMain: { flex: 1 },
  clientSubtitle: { fontSize: 12, marginTop: 3, fontFamily: 'Lexend_400Regular' },
  checkIcon: { marginLeft: 8 },
  iconPadding: { padding: 4 },
  spacerWidth32: { width: 32 },
  selectClientText: { fontSize: 13, paddingHorizontal: 24, paddingVertical: 12, fontFamily: 'Lexend_400Regular' },
  emptyContainer: { padding: 32, alignItems: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontFamily: 'Lexend_400Regular' },
});
