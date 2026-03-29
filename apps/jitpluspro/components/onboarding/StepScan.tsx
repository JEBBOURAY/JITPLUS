import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { QrCode, Smartphone } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { CheckItem, type ThemeProp } from './shared';

interface Props {
  theme: ThemeProp;
  t: (key: string, params?: Record<string, any>) => string;
  bottomPadding: number;
  onScanNow: () => void;
}

export function StepScan({ theme, t, bottomPadding, onScanNow }: Props) {
  return (
    <ScrollView
      contentContainerStyle={[styles.stepScroll, { paddingBottom: bottomPadding }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.welcomeIconWrap}>
        <LinearGradient
          colors={[palette.violet, palette.charbonDark]}
          style={styles.welcomeIconBg}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <QrCode color={palette.white} size={44} strokeWidth={1.5} />
        </LinearGradient>
      </View>

      <Text style={[styles.stepTitle, { color: theme.text }]}>
        {t('onboarding.scanTitle')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: theme.textMuted }]}>
        {t('onboarding.scanSubtitle')}
      </Text>

      {/* How it works card */}
      <View style={[styles.howCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
        <Text style={[styles.howTitle, { color: theme.text }]}>
          {t('onboarding.scanHowTitle')}
        </Text>
        <CheckItem num={1} text={t('onboarding.scanStep1')} theme={theme} />
        <CheckItem num={2} text={t('onboarding.scanStep2')} theme={theme} />
        <CheckItem num={3} text={t('onboarding.scanStep3')} theme={theme} />
      </View>

      {/* Scanner illustration */}
      <View style={[styles.scanIllustration, { borderColor: '#6B7280' + '40' }]}>
        <View style={[styles.scanCorner, styles.scanCornerTL, { borderColor: '#6B7280' }]} />
        <View style={[styles.scanCorner, styles.scanCornerTR, { borderColor: '#6B7280' }]} />
        <View style={[styles.scanCorner, styles.scanCornerBL, { borderColor: '#6B7280' }]} />
        <View style={[styles.scanCorner, styles.scanCornerBR, { borderColor: '#6B7280' }]} />
        <Smartphone color={'#6B7280'} size={56} strokeWidth={1.5} />
      </View>

      {/* Scan now CTA */}
      <TouchableOpacity
        style={styles.scanNowBtn}
        onPress={onScanNow}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={[palette.violet, palette.charbonDark]}
          style={styles.scanNowGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <QrCode color={palette.white} size={22} strokeWidth={1.5} />
          <Text style={styles.scanNowText}>{t('onboarding.scanNowBtn')}</Text>
        </LinearGradient>
      </TouchableOpacity>
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
  howCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  howTitle: {
    fontSize: 15,
    fontFamily: 'Lexend_600SemiBold',
    marginBottom: 12,
  },
  scanIllustration: {
    width: 140,
    height: 140,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  scanCorner: { position: 'absolute', width: 22, height: 22, borderWidth: 3 },
  scanCornerTL: { top: 6, left: 6, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  scanCornerTR: { top: 6, right: 6, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  scanCornerBL: { bottom: 6, left: 6, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  scanCornerBR: { bottom: 6, right: 6, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  scanNowBtn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  scanNowGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  scanNowText: {
    color: palette.white,
    fontSize: 16,
    fontFamily: 'Lexend_600SemiBold',
  },
});
