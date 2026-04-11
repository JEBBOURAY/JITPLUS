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
import {
  Check,
  Coins,
  Stamp,
  ShieldCheck,
  Footprints,
  Hash,
  Settings,
} from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { DEFAULT_CURRENCY } from '@/config/currency';
import type { ThemeProp } from './shared';

interface Props {
  theme: ThemeProp;
  t: (key: string, params?: Record<string, any>) => string;
  bottomPadding: number;
  loyaltyType: 'POINTS' | 'STAMPS';
  isStamps: boolean;
  stampEarningMode: 'PER_VISIT' | 'PER_AMOUNT';
  setStampEarningMode: (m: 'PER_VISIT' | 'PER_AMOUNT') => void;
  pointsRate: string;
  setPointsRate: (v: string) => void;
  hasAccumulationLimit: boolean;
  setHasAccumulationLimit: (v: boolean) => void;
  accumulationLimit: string;
  setAccumulationLimit: (v: string) => void;
  onLoyaltyTypeChange: (type: 'POINTS' | 'STAMPS') => void;
}

export function StepReward({
  theme, t, bottomPadding,
  loyaltyType, isStamps, stampEarningMode, setStampEarningMode,
  pointsRate, setPointsRate,
  hasAccumulationLimit, setHasAccumulationLimit,
  accumulationLimit, setAccumulationLimit,
  onLoyaltyTypeChange,
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
            <Settings color={palette.white} size={44} strokeWidth={1.5} />
          </LinearGradient>
        </View>

        <Text style={[styles.stepTitle, { color: theme.text }]}>
          {t('onboarding.ruleTitle')}
        </Text>
        <Text style={[styles.stepSubtitle, { color: theme.textMuted }]}>
          {t('onboarding.ruleSubtitle')}
        </Text>

        {/* Loyalty type toggle */}
        <Text style={[styles.fieldLabel, { color: theme.textSecondary, textAlign: 'center', marginBottom: 10 }]}>
          {t('onboarding.loyaltyTypeLabel')}
        </Text>
        <View style={styles.loyaltyToggleRow}>
          <LoyaltyToggleBtn
            active={!isStamps}
            icon={<Coins color={!isStamps ? palette.violet : theme.textMuted} size={22} strokeWidth={1.5} />}
            label={t('onboarding.loyaltyPoints')}
            desc={t('onboarding.loyaltyPointsDesc')}
            theme={theme}
            onPress={() => onLoyaltyTypeChange('POINTS')}
          />
          <LoyaltyToggleBtn
            active={isStamps}
            icon={<Stamp color={isStamps ? palette.violet : theme.textMuted} size={22} strokeWidth={1.5} />}
            label={t('onboarding.loyaltyStamps')}
            desc={t('onboarding.loyaltyStampsDesc')}
            theme={theme}
            onPress={() => onLoyaltyTypeChange('STAMPS')}
          />
        </View>

        {/* Stamp earning mode toggle */}
        {isStamps && (
          <View style={[styles.formCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, marginTop: 12, marginBottom: 4 }]}>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary, textAlign: 'center', marginBottom: 8 }]}>
              {t('onboarding.stampEarningModeLabel')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StampModeBtn
                active={stampEarningMode === 'PER_VISIT'}
                icon={<Footprints color={stampEarningMode === 'PER_VISIT' ? palette.violet : theme.textMuted} size={20} strokeWidth={1.5} />}
                label={t('onboarding.stampPerVisit')}
                desc={t('onboarding.stampPerVisitDesc')}
                theme={theme}
                onPress={() => setStampEarningMode('PER_VISIT')}
              />
              <StampModeBtn
                active={stampEarningMode === 'PER_AMOUNT'}
                icon={<Hash color={stampEarningMode === 'PER_AMOUNT' ? palette.violet : theme.textMuted} size={20} strokeWidth={1.5} />}
                label={t('onboarding.stampPerAmount')}
                desc={t('onboarding.stampPerAmountDesc')}
                theme={theme}
                onPress={() => setStampEarningMode('PER_AMOUNT')}
              />
            </View>
          </View>
        )}

        {/* Conversion rate card */}
        {(!isStamps || stampEarningMode === 'PER_AMOUNT') && (
          <View style={[styles.formCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, marginBottom: 16 }]}>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary, textAlign: 'center', marginBottom: 4 }]}>
              {t('onboarding.conversionRateLabel')}
            </Text>
            <Text style={[styles.limitHint, { color: theme.textMuted, textAlign: 'center' }]}>
              {isStamps
                ? t('onboarding.conversionRateHintStamps')
                : t('onboarding.conversionRateHintPoints')}
            </Text>
            <View style={styles.conversionRow}>
              <TextInput
                style={[
                  styles.input,
                  styles.conversionInput,
                  { color: theme.text, backgroundColor: theme.bgInput, borderColor: theme.inputBorder },
                ]}
                value={pointsRate}
                onChangeText={setPointsRate}
                keyboardType="decimal-pad"
                maxLength={6}
                placeholder="10"
                placeholderTextColor={theme.textMuted}
              />
              <Text style={[styles.conversionEqual, { color: theme.textSecondary }]}>
                {DEFAULT_CURRENCY.symbol} = 1 {isStamps ? t('common.stamp') : t('common.point')}
              </Text>
            </View>
            <Text style={[styles.limitHint, { color: palette.violet, textAlign: 'center', marginTop: 6 }]}>
              {isStamps
                ? t('onboarding.conversionRatePreviewStamps', { rate: pointsRate || '10', currency: DEFAULT_CURRENCY.symbol })
                : t('onboarding.conversionRatePreviewPoints', { rate: pointsRate || '10', currency: DEFAULT_CURRENCY.symbol })}
            </Text>
          </View>
        )}

        {/* Accumulation limit */}
        <View style={[styles.formCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, marginBottom: 16 }]}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            {t('onboarding.accumulationLimitLabel')}
          </Text>
          <Text style={[styles.limitHint, { color: theme.textMuted }]}>
            {t('onboarding.accumulationLimitHint', { unit: isStamps ? t('common.stamps') : t('common.points') })}
          </Text>
          <TouchableOpacity
            style={[
              styles.limitToggle,
              {
                backgroundColor: hasAccumulationLimit ? palette.violet + '15' : theme.bgCard,
                borderColor: hasAccumulationLimit ? palette.violet : theme.borderLight,
              },
            ]}
            onPress={() => {
              setHasAccumulationLimit(!hasAccumulationLimit);
              if (hasAccumulationLimit) setAccumulationLimit('');
            }}
            activeOpacity={0.8}
          >
            <ShieldCheck
              size={20}
              color={hasAccumulationLimit ? palette.violet : theme.textMuted}
              strokeWidth={1.5}
            />
            <Text
              style={[
                styles.limitToggleText,
                { color: hasAccumulationLimit ? palette.violet : theme.textMuted },
              ]}
            >
              {hasAccumulationLimit
                ? t('settingsPage.limitEnabled')
                : t('settingsPage.limitDisabled')}
            </Text>
          </TouchableOpacity>

          {hasAccumulationLimit && (
            <View style={[styles.limitInputRow, { marginTop: 10 }]}>
              <TextInput
                style={[styles.input, { color: theme.text, backgroundColor: theme.bgInput, borderColor: theme.inputBorder }]}
                value={accumulationLimit}
                onChangeText={setAccumulationLimit}
                keyboardType="number-pad"
                placeholder={t('settingsPage.limitPlaceholder')}
                placeholderTextColor={theme.textMuted}
              />
              <Text style={[styles.limitSuffix, { color: theme.textSecondary }]}>
                {isStamps ? t('common.stamps') : t('common.points')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Small sub-components ──────────────────────────────────────────

function LoyaltyToggleBtn({ active, icon, label, desc, theme, onPress }: {
  active: boolean; icon: React.ReactNode; label: string; desc: string;
  theme: ThemeProp; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.loyaltyToggleBtn,
        {
          backgroundColor: !active ? theme.bgCard : palette.violet + '18',
          borderColor: !active ? theme.borderLight : palette.violet,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.loyaltyToggleIcon, { backgroundColor: active ? palette.violet + '20' : theme.borderLight + '60' }]}>
        {icon}
      </View>
      <Text style={[styles.loyaltyToggleLabel, { color: active ? palette.violet : theme.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.loyaltyToggleDesc, { color: theme.textMuted }]}>
        {desc}
      </Text>
      {active && (
        <View style={[styles.loyaltyToggleCheck, { backgroundColor: palette.violet }]}>
          <Check color={palette.white} size={12} strokeWidth={1.5} />
        </View>
      )}
    </TouchableOpacity>
  );
}

function StampModeBtn({ active, icon, label, desc, theme, onPress }: {
  active: boolean; icon: React.ReactNode; label: string; desc: string;
  theme: ThemeProp; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.loyaltyToggleBtn,
        {
          flex: 1,
          backgroundColor: active ? palette.violet + '18' : theme.bgCard,
          borderColor: active ? palette.violet : theme.borderLight,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.loyaltyToggleIcon, { backgroundColor: active ? palette.violet + '20' : theme.borderLight + '60' }]}>
        {icon}
      </View>
      <Text style={[styles.loyaltyToggleLabel, { color: active ? palette.violet : theme.textSecondary, fontSize: 13 }]}>
        {label}
      </Text>
      <Text style={[styles.loyaltyToggleDesc, { color: theme.textMuted, fontSize: 11 }]}>
        {desc}
      </Text>
      {active && (
        <View style={[styles.loyaltyToggleCheck, { backgroundColor: palette.violet }]}>
          <Check color={palette.white} size={10} strokeWidth={1.5} />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────
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
  formCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    gap: 4,
  },
  loyaltyToggleRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 18,
  },
  loyaltyToggleBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  loyaltyToggleIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  loyaltyToggleLabel: {
    fontSize: 14,
    fontFamily: 'Lexend_600SemiBold',
    marginBottom: 2,
  },
  loyaltyToggleDesc: {
    fontSize: 11,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    lineHeight: 15,
  },
  loyaltyToggleCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  conversionInput: {
    width: 80,
    textAlign: 'center',
    fontSize: 20,
    fontFamily: 'Lexend_600SemiBold',
    paddingVertical: 10,
  },
  conversionEqual: { fontSize: 16, fontFamily: 'Lexend_500Medium' },
  limitHint: {
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
    lineHeight: 17,
    marginBottom: 10,
  },
  limitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  limitToggleText: { fontSize: 14, fontFamily: 'Lexend_500Medium' },
  limitInputRow: { flexDirection: 'row', alignItems: 'center' },
  limitSuffix: { marginLeft: 10, fontSize: 13, fontFamily: 'Lexend_400Regular' },
});
