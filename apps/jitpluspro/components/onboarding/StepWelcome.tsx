import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles, Users, QrCode, BarChart3 } from 'lucide-react-native';
import { brandGradient, palette } from '@/contexts/ThemeContext';
import { FeatureRow, type ThemeProp } from './shared';

interface Props {
  theme: ThemeProp;
  t: (key: string, params?: Record<string, any>) => string;
  bottomPadding: number;
}

export function StepWelcome({ theme, t, bottomPadding }: Props) {
  return (
    <ScrollView
      contentContainerStyle={[styles.stepScroll, { paddingBottom: bottomPadding }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.welcomeIconWrap}>
        <LinearGradient
          colors={brandGradient}
          style={styles.welcomeIconBg}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Sparkles color={palette.white} size={44} strokeWidth={1.5} />
        </LinearGradient>
      </View>

      <Text style={[styles.stepTitle, { color: theme.text }]}>
        {t('onboarding.welcomeTitle')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: theme.textMuted }]}>
        {t('onboarding.welcomeSubtitle')}
      </Text>

      <View style={styles.featuresWrap}>
        <FeatureRow
          icon={<Users color={'#6B7280'} size={22} strokeWidth={1.5} />}
          title={t('onboarding.welcomeFeature1Title')}
          desc={t('onboarding.welcomeFeature1Desc')}
          theme={theme}
        />
        <FeatureRow
          icon={<QrCode color={'#6B7280'} size={22} strokeWidth={1.5} />}
          title={t('onboarding.welcomeFeature2Title')}
          desc={t('onboarding.welcomeFeature2Desc')}
          theme={theme}
        />
        <FeatureRow
          icon={<BarChart3 color={'#6B7280'} size={22} strokeWidth={1.5} />}
          title={t('onboarding.welcomeFeature3Title')}
          desc={t('onboarding.welcomeFeature3Desc')}
          theme={theme}
        />
      </View>
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
  featuresWrap: { width: '100%', gap: 12 },
});
