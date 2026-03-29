import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, Upload } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { getServerBaseUrl } from '@/services/api';
import type { ThemeProp } from './shared';

interface Props {
  theme: ThemeProp;
  t: (key: string, params?: Record<string, any>) => string;
  bottomPadding: number;
  logoUri: string | null;
  uploadingLogo: boolean;
  onPickLogo: () => void;
}

export function StepLogo({ theme, t, bottomPadding, logoUri, uploadingLogo, onPickLogo }: Props) {
  return (
    <ScrollView
      contentContainerStyle={[styles.stepScroll, { paddingBottom: bottomPadding }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.welcomeIconWrap}>
        <LinearGradient
          colors={[palette.violet, palette.violetLight]}
          style={styles.welcomeIconBg}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Camera color={palette.white} size={44} strokeWidth={1.5} />
        </LinearGradient>
      </View>

      <Text style={[styles.stepTitle, { color: theme.text }]}>
        {t('onboarding.logoTitle')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: theme.textMuted }]}>
        {t('onboarding.logoSubtitle')}
      </Text>

      {/* Logo preview / upload zone */}
      <TouchableOpacity
        style={[
          styles.logoZone,
          {
            borderColor: logoUri ? palette.violet : theme.borderLight,
            backgroundColor: logoUri ? 'transparent' : theme.bgCard,
          },
        ]}
        onPress={!uploadingLogo ? onPickLogo : undefined}
        activeOpacity={0.8}
      >
        {uploadingLogo ? (
          <View style={styles.logoPlaceholder}>
            <ActivityIndicator color={palette.violet} size="large" />
            <Text style={[styles.uploadingText, { color: theme.textMuted }]}>
              {t('onboarding.logoUploading')}
            </Text>
          </View>
        ) : logoUri ? (
          <View style={styles.logoPreviewWrap}>
            <Image
              source={{
                uri: logoUri.startsWith('http')
                  ? logoUri
                  : `${getServerBaseUrl()}${logoUri}`,
              }}
              style={styles.logoPreview}
              resizeMode="cover"
            />
            <View style={[styles.logoChangeBadge, { backgroundColor: palette.violet }]}>
              <Camera color={palette.white} size={14} strokeWidth={1.5} />
            </View>
          </View>
        ) : (
          <View style={styles.logoPlaceholder}>
            <View style={[styles.uploadIconCircle, { backgroundColor: palette.violet + '15' }]}>
              <Upload color={palette.violet} size={32} strokeWidth={1.5} />
            </View>
            <Text style={[styles.uploadBtnText, { color: palette.violet }]}>
              {t('onboarding.logoUploadBtn')}
            </Text>
            <Text style={[styles.uploadHint, { color: theme.textMuted }]}>
              {t('onboardingExtra.logoFileHint')}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {logoUri && !uploadingLogo && (
        <TouchableOpacity onPress={onPickLogo} style={styles.changeLogoBtn}>
          <Text style={[styles.changeLogoBtnText, { color: palette.violet }]}>
            {t('onboarding.logoChangeBtn')}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.skipHint, { color: theme.textMuted }]}>
        {t('onboarding.logoSkipHint')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stepScroll: {
    paddingHorizontal: 24,
    paddingTop: 28,
    alignItems: 'center',
  },
  welcomeIconWrap: { marginBottom: 20 },
  welcomeIconBg: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  stepTitle: {
    fontSize: 26,
    fontFamily: 'Lexend_700Bold',
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 10,
  },
  stepSubtitle: {
    fontSize: 15,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    maxWidth: 320,
  },
  logoZone: {
    width: 200,
    height: 200,
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  logoPlaceholder: { alignItems: 'center', gap: 10 },
  uploadIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtnText: { fontSize: 15, fontFamily: 'Lexend_600SemiBold' },
  uploadHint: { fontSize: 12, fontFamily: 'Lexend_400Regular' },
  uploadingText: { fontSize: 13, fontFamily: 'Lexend_400Regular', marginTop: 8 },
  logoPreviewWrap: { width: 200, height: 200, position: 'relative' },
  logoPreview: { width: 200, height: 200, borderRadius: 22 },
  logoChangeBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeLogoBtn: { marginBottom: 8 },
  changeLogoBtnText: {
    fontSize: 14,
    fontFamily: 'Lexend_500Medium',
    textDecorationLine: 'underline',
  },
  skipHint: {
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
  },
});
