import { useRef, useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, Platform, TouchableOpacity, Alert, ScrollView, Image,
  ActivityIndicator,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { Share2, X } from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { haptic, HapticStyle } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/services/api';
import NetInfo from '@react-native-community/netinfo';
import FadeInView from '@/components/FadeInView';
import GuestGuard from '@/components/GuestGuard';
import { usePointsOverview } from '@/hooks/useQueryHooks';
import { wp, hp, ms, fontSize, radius, SCREEN } from '@/utils/responsive';

// react-native-view-shot is NOT available in Expo Go SDK 51+
import type ViewShotType from 'react-native-view-shot';
let ViewShot: typeof ViewShotType | null = null;
try {
  ViewShot = require('react-native-view-shot').default as typeof ViewShotType;
} catch {
  // Not available in Expo Go — share QR will be disabled
}

const QR_SIZE = Math.min(SCREEN.width - wp(100), wp(280));
const QR_TOKEN_STORAGE_KEY = 'qr_permanent_token';

export default function QRScreen() {
  const theme = useTheme();
  const { client, isGuest } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const qrViewRef = useRef<ViewShotType | null>(null);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(true);

  const [qrError, setQrError] = useState(false);
  const [showGuidBadge, setShowGuidBadge] = useState(false);
  const { data: pointsOverview } = usePointsOverview();

  /** Fetch (or load cached) permanent QR token */
  const fetchQrToken = useCallback(async () => {
    if (!client?.id) return;

    // Try cached token first (SecureStore — encrypted on-device)
    try {
      const cached = Platform.OS === 'web'
        ? null // Web has no SecureStore — always fetch fresh
        : await SecureStore.getItemAsync(QR_TOKEN_STORAGE_KEY);
      // Accept only versioned tokens (v1.xxx); invalidate legacy unversioned cache
      if (cached && cached.startsWith('v1.')) {
        setQrValue(`jitplus://scan/${cached}`);
        setQrLoading(false);
        return;
      }
    } catch { /* ignore cache miss */ }

    // Skip fetch when offline
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      if (!qrValue) { setQrError(true); setQrLoading(false); }
      return;
    }
    setQrError(false);
    try {
      const { qr_token } = await api.getQrToken();
      if (Platform.OS !== 'web') {
        await SecureStore.setItemAsync(QR_TOKEN_STORAGE_KEY, qr_token);
      }
      setQrValue(`jitplus://scan/${qr_token}`);
    } catch (e) {
      if (__DEV__) console.warn('QR token error:', e);
      setQrValue(null);
      setQrError(true);
    } finally {
      setQrLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id]);

  // Fetch QR token only once — subsequent focuses skip if already loaded.
  // The token is permanent and cached in SecureStore, no need to re-fetch on every focus.
  useFocusEffect(
    useCallback(() => {
      if (!qrValue) {
        fetchQrToken();
      }

      // Show GUID badge only if new-user flag is set
      AsyncStorage.getItem('showGuidBadge').then((val) => {
        if (val === '1') setShowGuidBadge(true);
      });
    }, [fetchQrToken, qrValue])
  );

  const handleShareQR = useCallback(async () => {
    if (!ViewShot) {
      Alert.alert(t('common.error'), t('qr.sharingUnavailableMsg'));
      return;
    }
    haptic(HapticStyle.Medium);
    try {
      const uri = await qrViewRef.current?.capture?.();
      if (!uri) { Alert.alert(t('common.error'), t('qr.captureError')); return; }
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) { Alert.alert(t('qr.sharingUnavailable'), t('qr.sharingUnavailableMsg')); return; }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('qr.shareDialogTitle'), UTI: 'public.png' });
    } catch (error) {
      if (__DEV__) console.error('Share error:', error);
      Alert.alert(t('common.error'), t('qr.shareError'));
    }
  }, [t]);

  if (isGuest) return <GuestGuard />;

  const fullName = client ? `${client.prenom || ''} ${client.nom || ''}`.trim() : t('qr.client');

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <FadeInView delay={100}>
          {(() => {
            const qrCard = (
              <View style={[styles.qrCard, { backgroundColor: theme.bgCard }]}>
                {/* Card header */}
                <View style={styles.qrCardHeader}>
                  <Image
                    source={require('@/assets/images/jitpluslogo.png')}
                    style={styles.qrCardLogo}
                    resizeMode="contain"
                  />
                  <View>
                    <Text style={[styles.qrCardTitle, { color: theme.text }]}>{t('qr.loyaltyCard')}</Text>
                    <Text style={[styles.qrCardName, { color: theme.textSecondary }]}>{fullName}</Text>
                  </View>
                </View>

                {/* QR container */}
                <View style={styles.qrWrapper}>
                  <View style={styles.qrInner}>
                    {qrLoading ? (
                      <View style={styles.qrLoadingState}>
                        <ActivityIndicator size="large" color={palette.violet} />
                        <Text style={[styles.qrGeneratingText, { color: theme.textMuted }]}>
                          {t('qr.generating')}
                        </Text>
                      </View>
                    ) : qrValue ? (
                      <QRCode
                        value={qrValue}
                        size={QR_SIZE}
                        backgroundColor="#ffffff"
                        color={palette.violetDark}
                        quietZone={wp(14)}
                      />
                    ) : qrError ? (
                      <View style={styles.qrErrorState}>
                        <Text style={[styles.qrErrorText, { color: theme.danger }]}>
                          {t('qr.generateError')}
                        </Text>
                        <TouchableOpacity
                          onPress={() => { setQrLoading(true); fetchQrToken(); }}
                          activeOpacity={0.7}
                          style={styles.retryBtn}
                        >
                          <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Footer */}
                <View style={styles.qrFooter}>
                  <Text style={[styles.qrHint, { color: theme.textMuted }]}>
                    {t('qr.scanHint')}
                  </Text>
                  {showGuidBadge && (
                    <View style={[styles.idBadge, { backgroundColor: theme.primaryBg, flexDirection: 'row', alignItems: 'center', gap: wp(6) }]}>
                      <Text style={[styles.qrId, { color: theme.primary }]}>
                        {client?.id?.slice(0, 8)}···{client?.id?.slice(-4)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          haptic(HapticStyle.Light);
                          setShowGuidBadge(false);
                          AsyncStorage.setItem('showGuidBadge', '0');
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <X size={ms(12)} color={theme.primary} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );

            return ViewShot ? (
              <ViewShot ref={qrViewRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
                {qrCard}
              </ViewShot>
            ) : qrCard;
          })()}
        </FadeInView>

        {/* Action buttons */}
        <FadeInView delay={250}>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.bgCard }]}
              onPress={handleShareQR}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('qr.shareAccessibility')}
            >
              <View style={[styles.actionIconBg, { backgroundColor: theme.primaryBg }]}>
                <Share2 size={ms(18)} color={theme.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionTitle, { color: theme.text }]}>{t('qr.shareTitle')}</Text>
                <Text style={[styles.actionSub, { color: theme.textMuted }]}>{t('qr.shareSubtitle')}</Text>
              </View>
            </TouchableOpacity>


          </View>
        </FadeInView>

        <View style={{ height: hp(120) }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  qrLoadingState: { width: QR_SIZE, height: QR_SIZE, justifyContent: 'center', alignItems: 'center' },
  qrErrorState: { width: QR_SIZE, height: QR_SIZE, justifyContent: 'center', alignItems: 'center', paddingHorizontal: wp(20) },
  qrGeneratingText: { fontSize: fontSize.xs, marginTop: hp(8) },
  qrErrorText: { fontSize: fontSize.sm, fontWeight: '600', textAlign: 'center', marginBottom: hp(12) },
  retryBtn: { backgroundColor: palette.violet, paddingHorizontal: wp(20), paddingVertical: hp(10), borderRadius: radius.md },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: wp(20), paddingTop: hp(20), flexGrow: 1, justifyContent: 'center' },

  // QR Card
  qrCard: {
    borderRadius: radius['2xl'], padding: wp(24), alignItems: 'center',
    shadowColor: palette.violetDark, shadowOffset: { width: 0, height: hp(4) },
    shadowOpacity: 0.06, shadowRadius: 20, elevation: 4,
  },
  qrCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12),
    width: '100%', marginBottom: hp(24),
  },
  qrCardLogo: {
    width: ms(44), height: ms(44), borderRadius: ms(14),
  },
  qrCardTitle: { fontSize: fontSize.lg, fontWeight: '700', letterSpacing: -0.2 },
  qrCardName: { fontSize: fontSize.sm, marginTop: hp(2) },
  qrWrapper: { alignItems: 'center', marginBottom: hp(20) },
  qrInner: {
    padding: wp(16), borderRadius: radius.xl, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: hp(4) },
    shadowOpacity: 0.06, shadowRadius: 16, elevation: 4,
  },
  qrFooter: { alignItems: 'center', gap: hp(10) },
  qrHint: { fontSize: fontSize.sm, textAlign: 'center' },
  idBadge: {
    paddingHorizontal: wp(16), paddingVertical: hp(6),
    borderRadius: radius.md,
  },
  qrId: { fontSize: fontSize.sm, fontFamily: 'SpaceMono', letterSpacing: 1, fontWeight: '600' },

  // Actions
  actions: { marginTop: hp(20), gap: hp(12) },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: wp(14),
    padding: wp(16), borderRadius: radius.xl,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 12, elevation: 3,
  },
  actionIconBg: {
    width: ms(44), height: ms(44), borderRadius: ms(14),
    alignItems: 'center', justifyContent: 'center',
  },
  actionTitle: { fontSize: fontSize.md, fontWeight: '600' },
  actionSub: { fontSize: fontSize.xs, marginTop: hp(2) },
});
