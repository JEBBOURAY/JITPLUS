import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Gift, QrCode, Trophy, Zap, ArrowRight } from 'lucide-react-native';
import { brandGradient, brandGradientFull, palette } from '@/contexts/ThemeContext';
import { getServerBaseUrl } from '@/services/api';
import { StatBadge, type ThemeProp } from './shared';

interface Props {
  theme: ThemeProp;
  t: (key: string, params?: Record<string, any>) => string;
  bottomPadding: number;
  merchant: { nom?: string; logoUrl?: string } | null;
  logoUri: string | null;
  onFinish: () => void;
}

export function StepDone({ theme, t, bottomPadding, merchant, logoUri, onFinish }: Props) {
  return (
    <ScrollView
      contentContainerStyle={[styles.stepScroll, styles.doneScroll, { paddingBottom: bottomPadding }]}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={brandGradientFull}
        style={styles.doneBigIcon}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Trophy color={palette.white} size={56} strokeWidth={1.5} />
      </LinearGradient>

      <Text style={[styles.doneTitleText, { color: theme.text }]}>
        {t('onboarding.doneTitle')}
      </Text>
      <Text style={[styles.doneSubtitleText, { color: theme.textMuted }]}>
        {t('onboarding.doneSubtitle')}
      </Text>

      {/* Merchant name badge */}
      {merchant?.nom && (
        <View style={[styles.merchantNameBadge, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
          {logoUri ? (
            <Image
              source={{ uri: logoUri.startsWith('http') ? logoUri : `${getServerBaseUrl()}${logoUri}` }}
              style={styles.doneMerchantLogo}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.doneMerchantAvatar, { backgroundColor: palette.violet + '20' }]}>
              <Text style={[styles.doneMerchantInitial, { color: palette.violet }]}>
                {merchant.nom.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.doneMerchantName, { color: theme.text }]}>{merchant.nom}</Text>
        </View>
      )}

      {/* Completed stats */}
      <View style={styles.statsRow}>
        <StatBadge
          icon={<Check color={palette.violet} size={20} strokeWidth={1.5} />}
          label={t('onboarding.doneStat1')}
          theme={theme}
        />
        <StatBadge
          icon={<Gift color={palette.violet} size={20} strokeWidth={1.5} />}
          label={t('onboarding.doneStat2')}
          theme={theme}
        />
        <StatBadge
          icon={<QrCode color={palette.violet} size={20} strokeWidth={1.5} />}
          label={t('onboarding.doneStat3')}
          theme={theme}
        />
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={styles.doneBtn}
        onPress={onFinish}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={brandGradient}
          style={styles.doneBtnGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Zap color={palette.white} size={20} strokeWidth={1.5} />
          <Text style={styles.doneBtnText}>{t('onboarding.doneBtn')}</Text>
          <ArrowRight color={palette.white} size={20} strokeWidth={1.5} />
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
  doneScroll: { flexGrow: 1, justifyContent: 'center' },
  doneBigIcon: {
    width: 120,
    height: 120,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    alignSelf: 'center',
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  doneTitleText: {
    fontSize: 28,
    fontFamily: 'Lexend_700Bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  doneSubtitleText: {
    fontSize: 15,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 300,
  },
  merchantNameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 40,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 24,
  },
  doneMerchantLogo: { width: 32, height: 32, borderRadius: 8 },
  doneMerchantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneMerchantInitial: { fontSize: 16, fontFamily: 'Lexend_700Bold' },
  doneMerchantName: { fontSize: 15, fontFamily: 'Lexend_600SemiBold' },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 32,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  doneBtn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  doneBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    gap: 10,
  },
  doneBtnText: {
    color: palette.white,
    fontSize: 16,
    fontFamily: 'Lexend_700Bold',
  },
});
