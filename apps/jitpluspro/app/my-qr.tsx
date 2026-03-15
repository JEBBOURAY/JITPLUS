import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  useWindowDimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Sharing from 'expo-sharing';

// react-native-view-shot is NOT available in Expo Go SDK 51+
let ViewShot: any = null;
try {
  ViewShot = require('react-native-view-shot').default;
} catch {
  // Not available in Expo Go — share/download will be disabled
}
import { ArrowLeft, Share2, Download, Crown, Lock } from 'lucide-react-native';
import BrandName from '@/components/BrandName';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { PlanInfo } from '@/types';
import api, { getServerBaseUrl } from '@/services/api';
import MerchantLogo from '@/components/MerchantLogo';
import { resolveImageUrl } from '@/utils/imageUrl';

// ── Utility: resolve logo URL ──
function resolveLogoUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  return resolveImageUrl(url) || undefined;
}

export default function MyQRCodeScreen() {
  const { merchant } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const viewShotRef = useRef<any>(null);
  const { width: SCREEN_W } = useWindowDimensions();
  const QR_SIZE_PREMIUM = Math.min(SCREEN_W - 80, 280);
  const QR_SIZE_FREE = Math.min(SCREEN_W - 120, 200);

  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/merchant/plan');
        setPlanInfo(res.data);
      } catch {
        // fallback — assume FREE
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isPremium = planInfo?.plan === 'PREMIUM';
  const qrSize = isPremium ? QR_SIZE_PREMIUM : QR_SIZE_FREE;
  const primaryColor = theme.primary; // #7C3AED

  // QR data: deep link for client app
  const qrData = merchant?.id
    ? `jitpluspro://merchant/${merchant.id}`
    : '';

  // ── Share / Download ──
  const handleShare = useCallback(async () => {
    if (!ViewShot) {
      Alert.alert('Indisponible', 'Le partage du QR code nécessite un dev build (pas Expo Go).');
      return;
    }
    try {
      const uri = await viewShotRef.current?.capture?.();
      if (!uri) {
        Alert.alert('Erreur', 'Impossible de capturer le QR code.');
        return;
      }
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Partage indisponible', "Le partage n'est pas disponible sur cet appareil.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Partager mon QR Code',
        UTI: 'public.png',
      });
    } catch {
      Alert.alert('Erreur', 'Une erreur est survenue lors du partage.');
    }
  }, []);

  const handleDownload = useCallback(async () => {
    if (!ViewShot) {
      Alert.alert('Indisponible', 'Le téléchargement nécessite un dev build (pas Expo Go).');
      return;
    }
    if (!isPremium) {
      Alert.alert(
        '🔒 Fonctionnalité Premium',
        'Le téléchargement du QR Code personnalisé est réservé au plan Pro.\n\nContactez le support pour passer au plan Pro.\n📧 contact@jitplus.com',
      );
      return;
    }

    try {
      const uri = await viewShotRef.current?.capture?.();
      if (!uri) {
        Alert.alert('Erreur', 'Impossible de capturer le QR code.');
        return;
      }

      if (Platform.OS === 'android') {
        // On Android, use sharing which gives save option
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Enregistrer le QR Code',
        });
      } else {
        // On iOS, share to save
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          UTI: 'public.png',
        });
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de télécharger le QR code.');
    }
  }, [isPremium]);

  if (!merchant) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const logoUrl = resolveLogoUrl(merchant.logoUrl);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('myQr.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <View style={styles.content}>
          {/* Plan badge */}
          <View style={[
            styles.planBadge,
            { backgroundColor: isPremium ? '#37415130' : '#F3F4F6' },
          ]}>
            {isPremium ? (
              <Crown size={14} color="#9CA3AF" />
            ) : (
              <Lock size={14} color="#6B7280" />
            )}
            <Text style={[styles.planBadgeText, { color: isPremium ? '#9CA3AF' : '#6B7280' }]}>
              {isPremium ? t('myQr.premium') : t('myQr.free')}
            </Text>
          </View>

          {/* QR Card */}
          {ViewShot ? (
          <ViewShot
            ref={viewShotRef}
            options={{ format: 'png', quality: 1.0, result: 'tmpfile' }}
          >
            <View style={[
              styles.qrCard,
              {
                backgroundColor: '#FFFFFF',
                borderColor: isPremium ? primaryColor : '#E5E7EB',
                borderWidth: isPremium ? 2 : 1,
              },
            ]}>
              {/* Merchant header inside card (for export) */}
              {isPremium && (
                <View style={styles.cardHeader}>
                  {logoUrl ? (
                    <Image source={{ uri: logoUrl }} style={styles.cardLogo} />
                  ) : (
                    <View style={[styles.cardLogoPlaceholder, { backgroundColor: primaryColor }]}>
                      <Text style={styles.cardLogoLetter}>
                        {merchant.nom?.charAt(0)?.toUpperCase() || 'J'}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.cardMerchantName} numberOfLines={1}>
                    {merchant.nom}
                  </Text>
                </View>
              )}

              {/* QR Code */}
              <View style={styles.qrWrapper}>
                {qrData ? (
                  <QRCode
                    value={qrData}
                    size={qrSize}
                    color={isPremium ? primaryColor : '#0F172A'}
                    backgroundColor="#FFFFFF"
                    logo={isPremium && logoUrl ? { uri: logoUrl } : undefined}
                    logoSize={isPremium ? qrSize * 0.22 : undefined}
                    logoBackgroundColor={isPremium ? '#FFFFFF' : undefined}
                    logoBorderRadius={isPremium ? 8 : undefined}
                    logoMargin={isPremium ? 4 : undefined}
                    quietZone={10}
                    ecl="M"
                  />
                ) : (
                  <Text style={{ color: '#6B7280' }}>{t('myQr.unavailable')}</Text>
                )}
              </View>

              {/* Footer inside card */}
              {isPremium ? (
                <View style={styles.cardFooter}>
                  <Text style={[styles.cardFooterText, { color: primaryColor }]}>
                    {t('myQr.scanHint')}
                  </Text>
                  <BrandName
                    label="JitPlus Pro"
                    fontSize={11}
                    fontFamily="Lexend_600SemiBold"
                    style={{ marginTop: 4 }}
                  />
                </View>
              ) : (
                <View style={styles.cardFooter}>
                  <Text style={[styles.cardFooterText, { color: '#6B7280' }]}>
                    {merchant.nom}
                  </Text>
                </View>
              )}
            </View>
          </ViewShot>
          ) : (
            <View style={[
              styles.qrCard,
              {
                backgroundColor: '#FFFFFF',
                borderColor: isPremium ? primaryColor : '#E5E7EB',
                borderWidth: isPremium ? 2 : 1,
              },
            ]}>
              {isPremium && (
                <View style={styles.cardHeader}>
                  {logoUrl ? (
                    <Image source={{ uri: logoUrl }} style={styles.cardLogo} />
                  ) : (
                    <View style={[styles.cardLogoPlaceholder, { backgroundColor: primaryColor }]}>
                      <Text style={styles.cardLogoLetter}>
                        {merchant.nom?.charAt(0)?.toUpperCase() || 'J'}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.cardMerchantName} numberOfLines={1}>
                    {merchant.nom}
                  </Text>
                </View>
              )}
              <View style={styles.qrWrapper}>
                {qrData ? (
                  <QRCode
                    value={qrData}
                    size={qrSize}
                    color={isPremium ? primaryColor : '#0F172A'}
                    backgroundColor="#FFFFFF"
                    logo={isPremium && logoUrl ? { uri: logoUrl } : undefined}
                    logoSize={isPremium ? qrSize * 0.22 : undefined}
                    logoBackgroundColor={isPremium ? '#FFFFFF' : undefined}
                    logoBorderRadius={isPremium ? 8 : undefined}
                    logoMargin={isPremium ? 4 : undefined}
                    quietZone={10}
                    ecl="M"
                  />
                ) : (
                  <Text style={{ color: '#6B7280' }}>{t('myQr.unavailable')}</Text>
                )}
              </View>
              {isPremium ? (
                <View style={styles.cardFooter}>
                  <Text style={[styles.cardFooterText, { color: primaryColor }]}>
                    {t('myQr.scanHint')}
                  </Text>
                  <BrandName
                    label="JitPlus Pro"
                    fontSize={11}
                    fontFamily="Lexend_600SemiBold"
                    style={{ marginTop: 4 }}
                  />
                </View>
              ) : (
                <View style={styles.cardFooter}>
                  <Text style={[styles.cardFooterText, { color: '#6B7280' }]}>
                    {merchant.nom}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Instructions */}
          <Text style={[styles.instructions, { color: theme.textMuted }]}>
            {isPremium
              ? t('myQr.instructionPremium')
              : t('myQr.instructionFree')}
          </Text>

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.primary }]}
              onPress={handleShare}
            >
              <Share2 size={20} color="#FFFFFF" strokeWidth={1.5} />
              <Text style={styles.actionBtnText}>{t('myQr.share')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: isPremium ? '#6B7280' : '#9CA3AF',
                  opacity: isPremium ? 1 : 0.7,
                },
              ]}
              onPress={handleDownload}
            >
              {isPremium ? (
                <Download size={20} color="#FFFFFF" strokeWidth={1.5} />
              ) : (
                <Lock size={20} color="#FFFFFF" strokeWidth={1.5} />
              )}
              <Text style={styles.actionBtnText}>
                {isPremium ? t('myQr.downloadHD') : t('myQr.premiumRequired')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Premium upsell for FREE */}
          {!isPremium && (
            <View style={[styles.upsellCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <Crown size={24} color="#9CA3AF" />
              <Text style={[styles.upsellTitle, { color: theme.text }]}>
                {t('myQr.upsellTitle')}
              </Text>
              <Text style={[styles.upsellDesc, { color: theme.textMuted }]}>
                {t('myQr.upsellDesc')}
              </Text>
              <Text style={[styles.upsellContact, { color: theme.primary }]}>
                📧 contact@jitplus.com
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 24,
  },
  planBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },
  qrCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  cardLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 8,
  },
  cardLogoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardLogoLetter: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  cardMerchantName: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    color: '#1E1B4B',
  },
  qrWrapper: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFooter: {
    alignItems: 'center',
    marginTop: 16,
  },
  cardFooterText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
    textAlign: 'center',
  },
  cardFooterBrand: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'Lexend_400Regular',
    marginTop: 4,
  },
  instructions: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 16,
    fontFamily: 'Lexend_400Regular',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },
  upsellCard: {
    marginTop: 24,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    width: '100%',
  },
  upsellTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    marginTop: 8,
    marginBottom: 8,
  },
  upsellDesc: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: 'Lexend_400Regular',
  },
  upsellContact: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
    marginTop: 12,
  },
});
