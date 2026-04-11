import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gift, Check } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import type { ThemeProp } from './shared';

interface Props {
  theme: ThemeProp;
  t: (key: string, params?: Record<string, any>) => string;
  bottomPadding: number;
  isStamps: boolean;
  rewardName: string;
  setRewardName: (v: string) => void;
  rewardCost: string;
  setRewardCost: (v: string) => void;
  rewardDesc: string;
  setRewardDesc: (v: string) => void;
  rewardCreated: boolean;
}

export function StepGift({
  theme, t, bottomPadding, isStamps,
  rewardName, setRewardName,
  rewardCost, setRewardCost,
  rewardDesc, setRewardDesc,
  rewardCreated,
}: Props) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.stepScroll, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.welcomeIconWrap}>
          <LinearGradient
            colors={[palette.violet, palette.charbonDark]}
            style={styles.welcomeIconBg}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Gift color={palette.white} size={44} strokeWidth={1.5} />
          </LinearGradient>
        </View>

        <Text style={[styles.stepTitle, { color: theme.text }]}>
          {t('onboarding.giftTitle')}
        </Text>
        <Text style={[styles.stepSubtitle, { color: theme.textMuted }]}>
          {t('onboarding.giftSubtitle')}
        </Text>

        {/* Suggestion chips */}
        <View style={styles.suggestionsRow}>
          {(isStamps
            ? [t('onboarding.suggStamp1'), t('onboarding.suggStamp2'), t('onboarding.suggStamp3')]
            : [t('onboarding.suggPoint1'), t('onboarding.suggPoint2'), t('onboarding.suggPoint3')]
          ).map((sugg) => (
            <TouchableOpacity
              key={sugg}
              style={[styles.suggestionChip, { borderColor: theme.borderLight, backgroundColor: theme.bgCard }]}
              onPress={() => setRewardName(sugg.replace(/^[\u{1F300}-\u{1F9FF}] /u, ''))}
            >
              <Text style={[styles.suggestionText, { color: theme.textSecondary }]}>{sugg}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Reward form */}
        <View style={[styles.formCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            {t('onboarding.rewardNameLabel')} *
          </Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.bgInput, borderColor: theme.inputBorder }]}
            placeholder={t('onboarding.rewardNamePlaceholder')}
            placeholderTextColor={theme.textMuted}
            value={rewardName}
            onChangeText={setRewardName}
            maxLength={80}
          />
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            {isStamps ? t('onboarding.rewardStampsLabel') : t('onboarding.rewardCostLabel')} *
          </Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.bgInput, borderColor: theme.inputBorder }]}
            placeholder={isStamps ? t('onboarding.rewardStampsPlaceholder') : t('onboarding.rewardCostPlaceholder')}
            placeholderTextColor={theme.textMuted}
            value={rewardCost}
            onChangeText={setRewardCost}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            {t('onboarding.rewardDescLabel')}
          </Text>
          <TextInput
            style={[styles.input, styles.inputMultiline, { color: theme.text, backgroundColor: theme.bgInput, borderColor: theme.inputBorder }]}
            placeholder={t('onboarding.rewardDescPlaceholder')}
            placeholderTextColor={theme.textMuted}
            value={rewardDesc}
            onChangeText={setRewardDesc}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            maxLength={200}
          />
        </View>

        <Text style={[styles.skipHint, { color: theme.textMuted }]}>
          {t('onboarding.giftSkipHint')}
        </Text>

        {/* Reward created confirmation */}
        {rewardCreated && (
          <View style={[styles.rewardCreatedBanner, { backgroundColor: palette.violet + '15', borderColor: palette.violet }]}>
            <Check color={palette.violet} size={20} strokeWidth={1.5} />
            <Text style={[styles.rewardCreatedText, { color: palette.violet }]}>{t('onboarding.rewardCreated')}</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  fieldLabel: {
    fontSize: 13,
    fontFamily: 'Lexend_500Medium',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: 'Lexend_400Regular',
  },
  inputMultiline: { minHeight: 72, paddingTop: 11 },
  formCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    gap: 4,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'center',
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggestionText: { fontSize: 13, fontFamily: 'Lexend_400Regular' },
  skipHint: {
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    marginBottom: 16,
  },
  rewardCreatedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '100%',
  },
  rewardCreatedText: { fontSize: 14, fontFamily: 'Lexend_500Medium' },
});
