import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  I18nManager,
  Image as RNImage,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Share2, FileText, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useTheme, brandGradient } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import MerchantLogo from '@/components/MerchantLogo';

const CLIENT_APP_ANDROID = 'https://play.google.com/store/apps/details?id=com.jitplus.client';
const CLIENT_APP_IOS = 'https://apps.apple.com/app/jitplus/id6762307929';

export default function ClientAppQrScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const merchant = useAuthStore((s) => s.merchant);
  const insets = useSafeAreaInsets();
  const posterRef = useRef<View | null>(null);
  const [exporting, setExporting] = useState(false);

  const qrPlatforms = useMemo(() => ([
    {
      key: 'android',
      title: t('home.clientQrAndroidTitle'),
      url: CLIENT_APP_ANDROID,
    },
    {
      key: 'ios',
      title: t('home.clientQrIosTitle'),
      url: CLIENT_APP_IOS,
    },
  ]), [t]);

  const exportPosterImage = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        Alert.alert(t('common.error'), t('home.clientQrShareUnavailable'));
        return;
      }

      if (!posterRef.current) {
        throw new Error('Poster view unavailable');
      }
      const fileUri = await captureRef(posterRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      await Sharing.shareAsync(fileUri, {
        mimeType: 'image/png',
        dialogTitle: t('home.clientQrExportDialog'),
      });
    } catch {
      Alert.alert(t('common.error'), t('home.clientQrExportError'));
    } finally {
      setExporting(false);
    }
  }, [exporting, t]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}> 
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}> 
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft
            size={22}
            color={theme.text}
            strokeWidth={2}
            style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
          {t('home.clientQrHeader')}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 26 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.qrCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}> 
          <View style={[styles.qrIconWrap, { backgroundColor: theme.primaryBg }]}> 
            <FileText size={18} color={theme.primary} strokeWidth={2} />
          </View>
          <Text style={[styles.title, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
            {t('home.clientQrTitle')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
            {t('home.clientQrSubtitle')}
          </Text>

          <View ref={posterRef} collapsable={false} style={styles.poster}>
            <View style={styles.posterBrandRow}>
              <View style={styles.posterLogoBox}>
                <RNImage source={require('@/assets/images/jitpluslogo.png')} style={styles.posterJitLogo} resizeMode="contain" />
              </View>
              <Text style={styles.posterCross}>×</Text>
              <View style={styles.posterLogoBox}>
                <MerchantLogo logoUrl={merchant?.logoUrl} style={styles.posterMerchantLogo} />
              </View>
            </View>

            <Text style={styles.posterMerchantName} numberOfLines={1}>
              {merchant?.nom || 'Commerce'}
            </Text>

            <Text style={styles.posterHeadline}>
              {t('home.clientPlvHeadline')}
            </Text>

            <View style={styles.posterQrRow}>
              {qrPlatforms.map((item) => (
                <View key={item.key} style={styles.posterQrCol}>
                  <Text style={styles.posterQrLabel}>{item.title}</Text>
                  <View style={styles.posterQrFrame}>
                    <QRCode value={item.url} size={110} />
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.posterStepsRow}>
              <Text style={styles.posterStepText}>{t('home.clientPlvStep1')}</Text>
              <Text style={styles.posterArrow}>➜</Text>
              <Text style={styles.posterStepText}>{t('home.clientPlvStep2')}</Text>
              <Text style={styles.posterArrow}>➜</Text>
              <Text style={styles.posterStepText}>{t('home.clientPlvStep3')}</Text>
            </View>
          </View>

          <LinearGradient
            colors={[brandGradient[0], brandGradient[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <TouchableOpacity
              onPress={exportPosterImage}
              activeOpacity={0.85}
              style={[styles.ctaButton, I18nManager.isRTL ? styles.rowRtl : styles.rowLtr]}
              accessibilityRole="button"
              accessibilityLabel={t('home.clientQrExportCta')}
              disabled={exporting}
            >
              <Share2 size={16} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.ctaText} maxFontSizeMultiplier={1.25}>
                {exporting ? t('common.loading') : t('home.clientQrExportCta')}
              </Text>
              <ChevronRight
                size={16}
                color="#FFFFFF"
                strokeWidth={2}
                style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
              />
            </TouchableOpacity>
          </LinearGradient>

          <Text style={[styles.hint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
            {t('home.clientQrHint')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.2,
    flex: 1,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  qrCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  qrIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: 'Lexend_700Bold',
  },
  subtitle: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: 'Lexend_400Regular',
  },
  qrFrame: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
  },
  platformBlock: {
    width: '100%',
    marginTop: 14,
    alignItems: 'center',
  },
  poster: {
    width: '100%',
    marginTop: 14,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  posterBrandRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  posterLogoBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  posterJitLogo: {
    width: 28,
    height: 28,
  },
  posterMerchantLogo: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  posterCross: {
    color: '#64748B',
    fontSize: 14,
    fontFamily: 'Lexend_700Bold',
  },
  posterMerchantName: {
    marginTop: 6,
    textAlign: 'center',
    color: '#1F2937',
    fontSize: 12,
    fontFamily: 'Lexend_700Bold',
  },
  posterHeadline: {
    marginTop: 8,
    textAlign: 'center',
    color: '#0F172A',
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'Lexend_700Bold',
  },
  posterQrRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  posterQrCol: {
    flex: 1,
    alignItems: 'center',
  },
  posterQrLabel: {
    color: '#334155',
    fontSize: 11,
    fontFamily: 'Lexend_600SemiBold',
    marginBottom: 6,
    textAlign: 'center',
  },
  posterQrFrame: {
    padding: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  posterStepsRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  posterStepText: {
    color: '#334155',
    fontSize: 10.5,
    lineHeight: 14,
    fontFamily: 'Lexend_600SemiBold',
    textAlign: 'center',
  },
  posterArrow: {
    color: '#64748B',
    fontSize: 10,
    fontFamily: 'Lexend_700Bold',
  },
  platformTitle: {
    alignSelf: 'flex-start',
    fontSize: 12.5,
    fontFamily: 'Lexend_600SemiBold',
  },
  urlLabel: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    fontFamily: 'Lexend_400Regular',
  },
  ctaGradient: {
    width: '100%',
    marginTop: 14,
    borderRadius: 14,
    overflow: 'hidden',
  },
  ctaButton: {
    width: '100%',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Lexend_700Bold',
    textAlign: 'center',
    flexShrink: 1,
  },
  hint: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    fontFamily: 'Lexend_400Regular',
  },
  rowLtr: { flexDirection: 'row' },
  rowRtl: { flexDirection: 'row-reverse' },
});
